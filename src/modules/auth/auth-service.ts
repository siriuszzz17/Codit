import type { Session, User } from "@supabase/supabase-js";
import { requireSupabaseClient, type CoditSupabaseClient } from "@/lib/supabase/client";
import { getRuntimeSupabaseConfig } from "@/lib/supabase/config";
import { mapSupabaseAuthError } from "@/lib/supabase/errors";
import {
  loginSchema,
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
  const emailRedirectTo = resolveOAuthRedirectUrl({
    configuredRedirectUrl: runtimeConfig?.authRedirectUrl,
  });

  const { data, error } = await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo,
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
): Promise<{ url: string | null }> {
  const runtimeConfig = getRuntimeSupabaseConfig();
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

  return { url: data.url ?? null };
}

export async function signOutUser(
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) {
    throw new AuthServiceError(mapSupabaseAuthError(error));
  }
}
