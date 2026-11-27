import { describe, expect, it } from "vitest";
import {
  parseSupabaseConfig,
  validateSupabaseConfig,
} from "@/lib/supabase/config";
import {
  detectMissingMigrationName,
  isMissingDatabaseSchemaError,
  isTablePrivilegeError,
  isUsernameCooldownError,
  mapSupabaseAuthError,
  mapSupabaseDatabaseError,
} from "@/lib/supabase/errors";

describe("supabase client configuration", () => {
  it("returns null safely when NEXT_PUBLIC_SUPABASE_* variables are absent", () => {
    expect(parseSupabaseConfig({})).toBeNull();
    expect(
      parseSupabaseConfig({ url: "", anonKey: "" }),
    ).toBeNull();
  });

  it("validates HTTPS root URLs, rejects extra path segments like /rest/v1, and strips trailing slashes", () => {
    const result = validateSupabaseConfig({
      url: "https://example-project.supabase.co///",
      anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example",
      authRedirectUrl: "https://codit.app/auth/callback/",
      nativeRedirectUrl: "com.codit.app://auth/callback/",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.url).toBe("https://example-project.supabase.co");
      expect(result.data.authRedirectUrl).toBe(
        "https://codit.app/auth/callback",
      );
      expect(result.data.nativeRedirectUrl).toBe(
        "com.codit.app://auth/callback",
      );
    }

    const withRestPath = validateSupabaseConfig({
      url: "https://example-project.supabase.co/rest/v1/",
      anonKey: "anon-key",
    });
    expect(withRestPath.ok).toBe(false);
  });

  it("allows http only for localhost and rejects insecure remote http URLs", () => {
    const localResult = parseSupabaseConfig({
      url: "http://127.0.0.1:54321",
      anonKey: "local-anon-key",
    });
    expect(localResult?.url).toBe("http://127.0.0.1:54321");

    const remoteHttpResult = validateSupabaseConfig({
      url: "http://remote-supabase.example.com",
      anonKey: "anon-key",
    });
    expect(remoteHttpResult.ok).toBe(false);
  });
});

describe("supabase error mappers", () => {
  it("translates known Supabase Auth errors including SMTP, rate limits, and OTP expiry", () => {
    expect(
      mapSupabaseAuthError({ message: "Invalid login credentials" }),
    ).toContain("E-mail ou senha incorretos");

    expect(
      mapSupabaseAuthError({
        code: "email_not_confirmed",
        message: "Email not confirmed",
      }),
    ).toContain("ainda não foi confirmado");

    expect(
      mapSupabaseAuthError({
        code: "user_already_exists",
        message: "User already registered",
      }),
    ).toContain("Já existe uma conta");

    expect(
      mapSupabaseAuthError({ status: 429, message: "Rate limit exceeded" }),
    ).toContain("Muitas tentativas");

    expect(
      mapSupabaseAuthError({
        code: "over_email_send_rate_limit",
        message: "Email rate limit exceeded",
      }),
    ).toContain("SMTP personalizado");

    expect(
      mapSupabaseAuthError({
        code: "email_address_not_authorized",
        message: "Email address not authorized",
      }),
    ).toContain("Custom SMTP");

    expect(
      mapSupabaseAuthError({
        code: "otp_expired",
        message: "Email link is invalid or has expired",
      }),
    ).toContain("link de confirmação expirou");

    expect(
      mapSupabaseAuthError({
        code: "signup_disabled",
        message: "Signups not allowed for this instance",
      }),
    ).toContain("cadastros estão desativados");

    const smtpFailure = mapSupabaseAuthError({
      status: 500,
      message: "Error sending confirmation email",
    });
    expect(smtpFailure).toContain("HTTP 500");
    expect(smtpFailure).toContain("SMTP");
  });

  it("distinguishes 42501 table grant errors from RLS violations and detects missing migrations", () => {
    const tableGrantError = {
      code: "42501",
      message: "permission denied for table public_profiles",
      hint: "Grant the required privileges to the current role with: GRANT SELECT ON public.public_profiles TO anon;",
    };
    expect(isTablePrivilegeError(tableGrantError)).toBe(true);
    expect(detectMissingMigrationName(tableGrantError)).toBe(
      "20261123000003_fix_grants_rls_and_username_cooldown.sql",
    );
    expect(mapSupabaseDatabaseError(tableGrantError)).toContain(
      "20261123000003_fix_grants_rls_and_username_cooldown.sql",
    );

    const rlsError = {
      code: "42501",
      message: "new row violates row-level security policy",
    };
    expect(isTablePrivilegeError(rlsError)).toBe(false);
    expect(mapSupabaseDatabaseError(rlsError)).toContain("não possui permissão");
    expect(mapSupabaseDatabaseError(rlsError)).toContain("RLS");

    const phase3ColumnError = {
      code: "42703",
      message: "column sandbox_projects.is_pinned does not exist",
    };
    expect(detectMissingMigrationName(phase3ColumnError)).toBe(
      "20261123000001_enhance_profiles_and_projects.sql",
    );
    expect(mapSupabaseDatabaseError(phase3ColumnError)).toContain(
      "20261123000001_enhance_profiles_and_projects.sql",
    );

    const phase4TableError = {
      code: "PGRST205",
      message: "Could not find the table 'public.public_profiles' in the schema cache",
    };
    expect(isMissingDatabaseSchemaError(phase4TableError)).toBe(true);
    expect(detectMissingMigrationName(phase4TableError)).toBe(
      "20261123000002_add_social_network.sql",
    );
    expect(mapSupabaseDatabaseError(phase4TableError)).toContain(
      "20261123000002_add_social_network.sql",
    );

    const analyticsRpcError = {
      code: "PGRST202",
      message: "Could not find the function public.get_learning_retention_analytics in the schema cache",
    };
    expect(detectMissingMigrationName(analyticsRpcError)).toBe(
      "20261126000004_add_python_track_and_telemetry.sql",
    );
    expect(mapSupabaseDatabaseError(analyticsRpcError)).toContain(
      "20261126000004_add_python_track_and_telemetry.sql",
    );

    const incomingCallRpcError = {
      code: "PGRST202",
      message: "Could not find the function public.notify_incoming_call in the schema cache",
    };
    expect(detectMissingMigrationName(incomingCallRpcError)).toBe(
      "20261126000002_harden_realtime_rls_and_security_definers.sql",
    );
  });

  it("maps username cooldown, expired JWT, PostgreSQL constraints, and safe diagnostic fallback", () => {
    const cooldownErr = {
      code: "P0001",
      message: "USERNAME_COOLDOWN_ACTIVE:2026-12-23T12:00:00Z",
    };
    expect(isUsernameCooldownError(cooldownErr)).toEqual({
      active: true,
      nextAllowedIso: "2026-12-23T12:00:00Z",
    });
    expect(mapSupabaseDatabaseError(cooldownErr)).toContain(
      "Próxima alteração liberada em",
    );

    expect(
      mapSupabaseDatabaseError({
        code: "PGRST301",
        message: "JWT expired",
      }),
    ).toContain("sessão expirou");

    expect(
      mapSupabaseDatabaseError({ code: "23502", message: "null value in column" }),
    ).toContain("código 23502");

    expect(
      mapSupabaseDatabaseError({ code: "22001", message: "value too long" }),
    ).toContain("código 22001");

    expect(
      mapSupabaseDatabaseError({ code: "23503", message: "foreign key violation" }),
    ).toContain("código 23503");

    expect(
      mapSupabaseDatabaseError({ code: "42P17", message: "infinite recursion" }),
    ).toContain("código 42P17");

    expect(
      mapSupabaseDatabaseError({ code: "57014", message: "statement timeout" }),
    ).toContain("código 57014");

    expect(
      mapSupabaseDatabaseError({
        code: "23514",
        message: 'violates check constraint "chk_sandbox_projects_language"',
      }),
    ).toContain("20261123000001_enhance_profiles_and_projects.sql");

    expect(
      mapSupabaseDatabaseError({
        code: "23514",
        message: 'violates check constraint "chk_sandbox_projects_visibility"',
      }),
    ).toContain("20261123000002_add_social_network.sql");

    expect(
      mapSupabaseDatabaseError({
        code: "23505",
        message: "duplicate key value violates unique constraint uq_profiles_username_lower",
      }),
    ).toContain("@usuário");

    expect(
      mapSupabaseDatabaseError({
        code: "23505",
        message: "duplicate key value violates unique constraint uq_friendships_user_pair",
      }),
    ).toContain("solicitação ou amizade");

    const unknownMapped = mapSupabaseDatabaseError(
      { code: "XYZ99", message: "SELECT * FROM internal_secret_table" },
      { status: 502 },
    );
    expect(unknownMapped).toContain("HTTP 502");
    expect(unknownMapped).toContain("código XYZ99");
    expect(unknownMapped).not.toContain("internal_secret_table");
  });
});
