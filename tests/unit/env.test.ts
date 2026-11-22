import { describe, expect, it } from "vitest";
import {
  EnvValidationError,
  getBaseEnv,
  requireAuthEnv,
  requireDatabaseEnv,
} from "@/lib/env";

describe("env validation", () => {
  it("provides safe defaults for base environment when variables are omitted", () => {
    const env = getBaseEnv({});

    expect(env.NODE_ENV).toBe("development");
    expect(env.APP_BASE_URL).toBe("http://localhost:3000");
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
});
