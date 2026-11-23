import type { Session, User } from "@supabase/supabase-js";
import {
  cancelDesktopOAuth,
  getAuthPlatform,
  openCapacitorOAuthBrowser,
  openDesktopOAuthUrl,
  prepareDesktopOAuth,
} from "@/lib/native-oauth";
import { requireSupabaseClient, type CoditSupabaseClient } from "@/lib/supabase/client";
import { getRuntimeSupabaseConfig } from "@/lib/supabase/config";
import {
  extractSupabaseErrorMeta,
  mapSupabaseAuthError,
} from "@/lib/supabase/errors";
import {
  emailFieldSchema,
  loginSchema,
  resolveEmailConfirmationRedirectUrl,
  resolveNativeMobileRedirectUrl,
  resolveOAuthRedirectUrl,
  signUpSchema,
  type LoginInput,
  type SignUpInput,
} from "@/modules/auth/auth-schemas";

export const EMAIL_RESEND_COOLDOWN_SECONDS = 60;
export const EMAIL_RESEND_MAX_ATTEMPTS = 3;
export const EMAIL_RESEND_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_RESEND_STORAGE_PREFIX = "codit:email-resend:";

const inMemoryResendHistory = new Map<string, number[]>();

export interface EmailResendStatus {
  allowed: boolean;
  retryAfterSeconds: number;
  attemptsUsed: number;
  remainingAttempts: number;
  reason: "ok" | "cooldown" | "max_attempts";
}

export interface AuthActionResult {
  user: User | null;
  session: Session | null;
  needsEmailConfirmation: boolean;
  alreadyRegistered: boolean;
  emailRedirectTo?: string | undefined;
}

export interface GoogleSignInResult {
  mode: "redirect" | "external_desktop" | "external_mobile";
  url: string | null;
}

export interface AuthServiceErrorDetails {
  code?: string | undefined;
  status?: number | null | undefined;
}

export class AuthValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthValidationError";
  }
}

export class AuthServiceError extends Error {
  readonly code?: string | undefined;
  readonly status?: number | null | undefined;

  constructor(message: string, details?: AuthServiceErrorDetails) {
    super(message);
    this.name = "AuthServiceError";
    this.code = details?.code;
    this.status = details?.status ?? null;
  }
}

function toAuthServiceError(
  error: unknown,
  operation: string,
): AuthServiceError {
  const meta = extractSupabaseErrorMeta(error);
  return new AuthServiceError(mapSupabaseAuthError(error, { operation }), {
    code: meta.code || undefined,
    status: meta.status,
  });
}

function readResendTimestamps(emailKey: string, nowMs: number): number[] {
  const cutoff = nowMs - EMAIL_RESEND_WINDOW_MS;
  let stored: number[] = inMemoryResendHistory.get(emailKey) ?? [];

  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage?.getItem(
        `${EMAIL_RESEND_STORAGE_PREFIX}${emailKey}`,
      );
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          stored = parsed.filter((item): item is number => typeof item === "number");
        }
      }
    } catch {
      // Ignora indisponibilidade de sessionStorage
    }
  }

  return stored.filter((ts) => ts > cutoff).sort((a, b) => a - b);
}

function writeResendTimestamps(emailKey: string, timestamps: number[]): void {
  inMemoryResendHistory.set(emailKey, timestamps);

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage?.setItem(
        `${EMAIL_RESEND_STORAGE_PREFIX}${emailKey}`,
        JSON.stringify(timestamps),
      );
    } catch {
      // Ignora falha de cota ou modo privado
    }
  }
}

export function getEmailResendStatus(
  rawEmail: string,
  nowMs: number = Date.now(),
): EmailResendStatus {
  const emailKey = rawEmail.trim().toLowerCase();
  if (!emailKey) {
    return {
      allowed: false,
      retryAfterSeconds: 0,
      attemptsUsed: 0,
      remainingAttempts: EMAIL_RESEND_MAX_ATTEMPTS,
      reason: "ok",
    };
  }

  const recent = readResendTimestamps(emailKey, nowMs);
  if (recent.length >= EMAIL_RESEND_MAX_ATTEMPTS) {
    const oldest = recent[0] ?? nowMs;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + EMAIL_RESEND_WINDOW_MS - nowMs) / 1000),
    );
    return {
      allowed: false,
      retryAfterSeconds,
      attemptsUsed: recent.length,
      remainingAttempts: 0,
      reason: "max_attempts",
    };
  }

  const lastAttempt = recent[recent.length - 1];
  if (lastAttempt !== undefined) {
    const cooldownEndsAt = lastAttempt + EMAIL_RESEND_COOLDOWN_SECONDS * 1000;
    if (cooldownEndsAt > nowMs) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((cooldownEndsAt - nowMs) / 1000)),
        attemptsUsed: recent.length,
        remainingAttempts: EMAIL_RESEND_MAX_ATTEMPTS - recent.length,
        reason: "cooldown",
      };
    }
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    attemptsUsed: recent.length,
    remainingAttempts: EMAIL_RESEND_MAX_ATTEMPTS - recent.length,
    reason: "ok",
  };
}

export function resetEmailResendTrackerForTests(): void {
  inMemoryResendHistory.clear();
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      for (let idx = window.sessionStorage.length - 1; idx >= 0; idx -= 1) {
        const key = window.sessionStorage.key(idx);
        if (key?.startsWith(EMAIL_RESEND_STORAGE_PREFIX)) {
          window.sessionStorage.removeItem(key);
        }
      }
    } catch {
      // Ignora em ambiente restrito
    }
  }
}

export async function signInWithEmail(
  input: LoginInput,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new AuthValidationError(
      firstIssue?.message ?? "Verifique os dados de login informados.",
    );
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    throw toAuthServiceError(error, "signInWithEmail");
  }

  return {
    user: data.user,
    session: data.session,
    needsEmailConfirmation: false,
    alreadyRegistered: false,
  };
}

export async function signUpWithEmail(
  input: SignUpInput,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new AuthValidationError(
      firstIssue?.message ?? "Verifique os dados de cadastro informados.",
    );
  }

  const runtimeConfig = getRuntimeSupabaseConfig();
  const emailRedirectTo = resolveEmailConfirmationRedirectUrl({
    platform: getAuthPlatform(),
    configuredRedirectUrl: runtimeConfig?.authRedirectUrl,
    nativeRedirectUrl: runtimeConfig?.nativeRedirectUrl,
  });

  const { data, error } = await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
      data: {
        full_name: parsed.data.fullName,
        ...(parsed.data.username ? { username: parsed.data.username } : {}),
      },
    },
  });

  if (error) {
    throw toAuthServiceError(error, "signUpWithEmail");
  }

  // GoTrue retorna `identities: []` quando o e-mail já existe (login anterior ou Google)
  // mantendo HTTP 200 sem disparar novo e-mail de confirmação.
  const alreadyRegistered = Boolean(
    data.user &&
      !data.session &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0,
  );

  return {
    user: data.user,
    session: data.session,
    needsEmailConfirmation: Boolean(
      data.user && !data.session && !alreadyRegistered,
    ),
    alreadyRegistered,
    emailRedirectTo,
  };
}

export async function resendSignUpConfirmationEmail(
  rawEmail: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
  nowMs: number = Date.now(),
): Promise<{ cooldownSeconds: number; remainingAttempts: number }> {
  const parsedEmail = emailFieldSchema.safeParse(rawEmail);
  if (!parsedEmail.success) {
    const firstIssue = parsedEmail.error.issues[0];
    throw new AuthValidationError(
      firstIssue?.message ?? "Informe um endereço de e-mail válido.",
    );
  }

  const email = parsedEmail.data;
  const currentStatus = getEmailResendStatus(email, nowMs);
  if (!currentStatus.allowed) {
    if (currentStatus.reason === "max_attempts") {
      const minutes = Math.max(
        1,
        Math.ceil(currentStatus.retryAfterSeconds / 60),
      );
      throw new AuthServiceError(
        `Limite de ${EMAIL_RESEND_MAX_ATTEMPTS} reenvios atingido. Aguarde cerca de ${minutes} min antes de solicitar outro e-mail.`,
        { code: "resend_rate_limited", status: 429 },
      );
    }

    throw new AuthServiceError(
      `Aguarde ${currentStatus.retryAfterSeconds}s antes de reenviar o e-mail de confirmação.`,
      { code: "resend_rate_limited", status: 429 },
    );
  }

  const runtimeConfig = getRuntimeSupabaseConfig();
  const emailRedirectTo = resolveEmailConfirmationRedirectUrl({
    platform: getAuthPlatform(),
    configuredRedirectUrl: runtimeConfig?.authRedirectUrl,
    nativeRedirectUrl: runtimeConfig?.nativeRedirectUrl,
  });

  const { error } = await client.auth.resend({
    type: "signup",
    email,
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
    },
  });

  if (error) {
    throw toAuthServiceError(error, "resendSignUpConfirmationEmail");
  }

  const nextTimestamps = [...readResendTimestamps(email, nowMs), nowMs];
  writeResendTimestamps(email, nextTimestamps);

  return {
    cooldownSeconds: EMAIL_RESEND_COOLDOWN_SECONDS,
    remainingAttempts: Math.max(
      0,
      EMAIL_RESEND_MAX_ATTEMPTS - nextTimestamps.length,
    ),
  };
}

export async function signInWithGoogle(
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<GoogleSignInResult> {
  const runtimeConfig = getRuntimeSupabaseConfig();
  const platform = getAuthPlatform();

  if (platform === "tauri") {
    const prepared = await prepareDesktopOAuth();
    try {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: prepared.redirectUrl,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (error) {
        throw toAuthServiceError(error, "signInWithGoogle.tauri");
      }

      if (!data.url) {
        throw new AuthServiceError(
          "Não foi possível iniciar o login com o Google.",
        );
      }

      await openDesktopOAuthUrl(data.url);
      return { mode: "external_desktop", url: data.url };
    } catch (error) {
      await cancelDesktopOAuth();
      if (error instanceof AuthServiceError) {
        throw error;
      }
      throw new AuthServiceError(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir o navegador para entrar com o Google.",
      );
    }
  }

  if (platform === "capacitor") {
    const redirectTo = resolveNativeMobileRedirectUrl(
      runtimeConfig?.nativeRedirectUrl,
    );

    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      throw toAuthServiceError(error, "signInWithGoogle.capacitor");
    }

    if (!data.url) {
      throw new AuthServiceError(
        "Não foi possível iniciar o login com o Google.",
      );
    }

    try {
      await openCapacitorOAuthBrowser(data.url);
    } catch {
      throw new AuthServiceError(
        "Não foi possível abrir o navegador seguro para login com o Google.",
      );
    }

    return { mode: "external_mobile", url: data.url };
  }

  const redirectTo = resolveOAuthRedirectUrl({
    configuredRedirectUrl: runtimeConfig?.authRedirectUrl,
  });

  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error) {
    throw toAuthServiceError(error, "signInWithGoogle.web");
  }

  return { mode: "redirect", url: data.url ?? null };
}

export async function signOutUser(
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) {
    throw toAuthServiceError(error, "signOutUser");
  }
}
