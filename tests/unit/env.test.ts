import { describe, expect, it } from "vitest";
import {
  EnvValidationError,
  getBaseEnv,
  requireAuthEnv,
  requireDatabaseEnv,
  requireOctopyEnv,
  requireRemoteSandboxEnv,
} from "@/lib/env";

describe("env validation", () => {
  it("provides safe defaults for base environment when variables are omitted", () => {
    const env = getBaseEnv({});

    expect(env.NODE_ENV).toBe("development");
    expect(env.APP_BASE_URL).toBe("http://localhost:3000");
  });

  it("requires https APP_BASE_URL when NODE_ENV is production", () => {
    expect(() =>
      getBaseEnv({ NODE_ENV: "production" }),
    ).toThrowError(EnvValidationError);

    expect(() =>
      getBaseEnv({
        NODE_ENV: "production",
        APP_BASE_URL: "http://codit.app",
      }),
    ).toThrowError(EnvValidationError);

    const prod = getBaseEnv({
      NODE_ENV: "production",
      APP_BASE_URL: "https://codit.app",
    });

    expect(prod.NODE_ENV).toBe("production");
    expect(prod.APP_BASE_URL).toBe("https://codit.app");
  });

  it("validates DATABASE_URL fail-fast and accepts postgresql URLs", () => {
    expect(() => requireDatabaseEnv({})).toThrowError(EnvValidationError);

    const valid = requireDatabaseEnv({
      DATABASE_URL: "postgresql://codit:codit@localhost:5432/codit_dev",
    });

    expect(valid.DATABASE_URL).toBe(
      "postgresql://codit:codit@localhost:5432/codit_dev",
    );
  });

  it("requires TLS sslmode in DATABASE_URL when NODE_ENV is production", () => {
    expect(() =>
      requireDatabaseEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://codit:codit@db.internal:5432/codit_prod",
      }),
    ).toThrowError(EnvValidationError);

    expect(() =>
      requireDatabaseEnv({
        NODE_ENV: "production",
        DATABASE_URL:
          "postgresql://codit:codit@db.internal:5432/codit_prod?sslmode=disable",
      }),
    ).toThrowError(EnvValidationError);

    const validProd = requireDatabaseEnv({
      NODE_ENV: "production",
      DATABASE_URL:
        "postgresql://codit:codit@db.internal:5432/codit_prod?sslmode=require",
    });

    expect(validProd.DATABASE_URL).toContain("sslmode=require");
  });

  it("rejects short AUTH_SECRET without leaking its raw value in error messages", () => {
    const shortSecret = "super-sensitive-short-secret";

    let caughtError: unknown;
    try {
      requireAuthEnv({ AUTH_SECRET: shortSecret });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(EnvValidationError);
    const envError = caughtError as EnvValidationError;
    expect(envError.message).not.toContain(shortSecret);
    expect(envError.issues[0]?.path).toBe("AUTH_SECRET");
  });

  it("requires both Google OAuth variables when only one is configured", () => {
    expect(() =>
      requireAuthEnv({
        AUTH_SECRET: "a".repeat(32),
        GOOGLE_CLIENT_ID: "google-client-id-example",
      }),
    ).toThrowError(EnvValidationError);
  });

  it("requires AI fallback provider and key to be configured as a pair", () => {
    expect(() =>
      requireOctopyEnv({
        AI_PROVIDER: "gemini",
        AI_PROVIDER_API_KEY: "primary-key-example",
        AI_FALLBACK_PROVIDER: "openai",
      }),
    ).toThrowError(EnvValidationError);

    expect(() =>
      requireOctopyEnv({
        AI_PROVIDER: "gemini",
        AI_PROVIDER_API_KEY: "primary-key-example",
        AI_FALLBACK_API_KEY: "fallback-key-example",
      }),
    ).toThrowError(EnvValidationError);

    const withoutFallback = requireOctopyEnv({
      AI_PROVIDER: "gemini",
      AI_PROVIDER_API_KEY: "primary-key-example",
    });
    expect(withoutFallback.AI_FALLBACK_PROVIDER).toBeUndefined();

    const withFallback = requireOctopyEnv({
      AI_PROVIDER: "gemini",
      AI_PROVIDER_API_KEY: "primary-key-example",
      AI_FALLBACK_PROVIDER: "openai",
      AI_FALLBACK_API_KEY: "fallback-key-example",
    });
    expect(withFallback.AI_FALLBACK_PROVIDER).toBe("openai");
    expect(withFallback.AI_FALLBACK_API_KEY).toBe("fallback-key-example");
  });

  it("requires https SANDBOX_API_URL in production", () => {
    expect(() =>
      requireRemoteSandboxEnv({
        NODE_ENV: "production",
        SANDBOX_API_URL: "http://sandbox.internal:2358",
      }),
    ).toThrowError(EnvValidationError);

    const devSandbox = requireRemoteSandboxEnv({
      NODE_ENV: "development",
      SANDBOX_API_URL: "http://localhost:2358",
    });
    expect(devSandbox.SANDBOX_API_URL).toBe("http://localhost:2358");

    const prodSandbox = requireRemoteSandboxEnv({
      NODE_ENV: "production",
      SANDBOX_API_URL: "https://sandbox.codit.app",
    });
    expect(prodSandbox.SANDBOX_API_URL).toBe("https://sandbox.codit.app");
  });
});
