import { describe, expect, it } from "vitest";
import {
  parseSupabaseConfig,
  validateSupabaseConfig,
} from "@/lib/supabase/config";
import {
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
  it("translates known Supabase Auth errors into user-friendly pt-BR messages", () => {
    expect(
      mapSupabaseAuthError({ message: "Invalid login credentials" }),
    ).toContain("E-mail ou senha incorretos");

    expect(
      mapSupabaseAuthError({ code: "email_not_confirmed", message: "Email not confirmed" }),
    ).toContain("ainda não foi confirmado");

    expect(
      mapSupabaseAuthError({ code: "user_already_exists", message: "User already registered" }),
    ).toContain("Já existe uma conta");

    expect(
      mapSupabaseAuthError({ status: 429, message: "Rate limit exceeded" }),
    ).toContain("Muitas tentativas");
  });

  it("translates PostgreSQL/RLS database errors without leaking raw internals", () => {
    expect(
      mapSupabaseDatabaseError({ code: "42501", message: "new row violates row-level security policy" }),
    ).toContain("não possui permissão");

    expect(
      mapSupabaseDatabaseError({ code: "23505", message: "duplicate key value" }),
    ).toContain("dados únicos");

    expect(
      mapSupabaseDatabaseError({ message: "TypeError: Failed to fetch" }),
    ).toContain("Sem comunicação com o banco de dados");
  });
});
