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
import { mapSupabaseAuthError } from "@/lib/supabase/errors";
import {
  loginSchema,
  resolveEmailConfirmationRedirectUrl,
  resolveNativeMobileRedirectUrl,
  resolveOAuthRedirectUrl,
  signUpSchema,
  type LoginInput,
  type SignUpInput,
} from "@/modules/auth/auth-schemas";

export interface AuthActionResult {
  user: User | null;
  session: Session | null;
  needsEmailConfirmation: boolean;
}

export interface GoogleSignInResult {
  mode: "redirect" | "external_desktop" | "external_mobile";
  url: string | null;
}

export class AuthValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthValidationError";
  }
}

export class AuthServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthServiceError";
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
    throw new AuthServiceError(mapSupabaseAuthError(error));
  }

  return {
    user: data.user,
    session: data.session,
    needsEmailConfirmation: false,
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
      },
    },
  });

  if (error) {
    throw new AuthServiceError(mapSupabaseAuthError(error));
  }

  return {
    user: data.user,
    session: data.session,
    needsEmailConfirmation: Boolean(data.user && !data.session),
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
        throw new AuthServiceError(mapSupabaseAuthError(error));
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
      throw new AuthServiceError(mapSupabaseAuthError(error));
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
    throw new AuthServiceError(mapSupabaseAuthError(error));
  }

  return { mode: "redirect", url: data.url ?? null };
}

export async function signOutUser(
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) {
    throw new AuthServiceError(mapSupabaseAuthError(error));
  }
}
