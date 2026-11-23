import { describe, expect, it } from "vitest";
import {
  loginSchema,
  resolveOAuthRedirectUrl,
  signUpSchema,
} from "@/modules/auth/auth-schemas";

describe("auth schemas and redirect helpers", () => {
  it("normalizes email casing and validates login credentials", () => {
    const parsed = loginSchema.safeParse({
      email: "  Aluno@Codit.Dev ",
      password: "segredo123",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("aluno@codit.dev");
    }

    const emptyPassword = loginSchema.safeParse({
      email: "aluno@codit.dev",
      password: "",
    });
    expect(emptyPassword.success).toBe(false);
  });

  it("enforces password strength and matching confirmation on sign up", () => {
    const weakPassword = signUpSchema.safeParse({
      fullName: "Ana Silva",
      email: "ana@codit.dev",
      password: "onlyletters",
      confirmPassword: "onlyletters",
    });
    expect(weakPassword.success).toBe(false);

    const mismatch = signUpSchema.safeParse({
      fullName: "Ana Silva",
      email: "ana@codit.dev",
      password: "Codit2026",
      confirmPassword: "Codit2027",
    });
    expect(mismatch.success).toBe(false);

    const valid = signUpSchema.safeParse({
      fullName: "  Ana Silva ",
      email: "ANA@CODIT.DEV",
      password: "Codit2026",
      confirmPassword: "Codit2026",
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.fullName).toBe("Ana Silva");
      expect(valid.data.email).toBe("ana@codit.dev");
    }
  });

  it("resolves OAuth redirect URL prioritizing explicit config over runtime origin", () => {
    expect(
      resolveOAuthRedirectUrl({
        origin: "https://codit.app/",
        configuredRedirectUrl: "https://auth.codit.app/auth/callback/",
      }),
    ).toBe("https://auth.codit.app/auth/callback");

    expect(
      resolveOAuthRedirectUrl({
        origin: "https://codit.app/",
      }),
    ).toBe("https://codit.app/auth/callback");
  });
});
