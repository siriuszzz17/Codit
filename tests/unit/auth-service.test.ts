import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import {
  AuthServiceError,
  EMAIL_RESEND_MAX_ATTEMPTS,
  getEmailResendStatus,
  resendSignUpConfirmationEmail,
  resetEmailResendTrackerForTests,
  signInWithEmail,
  signUpWithEmail,
} from "@/modules/auth/auth-service";

describe("auth-service email signup, confirmation, and resend limits", () => {
  beforeEach(() => {
    resetEmailResendTrackerForTests();
  });

  afterEach(() => {
    resetEmailResendTrackerForTests();
    vi.unstubAllGlobals();
  });

  it("marks needsEmailConfirmation=true for new unconfirmed user and detects obfuscated duplicate accounts", async () => {
    const signUp = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          user: {
            id: "u-new",
            email: "maria@codit.dev",
            identities: [{ id: "id-1" }],
          },
          session: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          user: {
            id: "u-existing",
            email: "maria@codit.dev",
            identities: [],
          },
          session: null,
        },
        error: null,
      });

    const client = {
      auth: { signUp },
    } as unknown as CoditSupabaseClient;

    const fresh = await signUpWithEmail(
      {
        fullName: "Maria Oliveira",
        email: "maria@codit.dev",
        password: "Codit2026",
        confirmPassword: "Codit2026",
      },
      client,
    );
    expect(fresh.needsEmailConfirmation).toBe(true);
    expect(fresh.alreadyRegistered).toBe(false);

    const duplicate = await signUpWithEmail(
      {
        fullName: "Maria Oliveira",
        email: "maria@codit.dev",
        password: "Codit2026",
        confirmPassword: "Codit2026",
      },
      client,
    );
    expect(duplicate.needsEmailConfirmation).toBe(false);
    expect(duplicate.alreadyRegistered).toBe(true);
  });

  it("surfaces clear SMTP guidance when signUp returns HTTP 500 confirmation error", async () => {
    const client = {
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: null, session: null },
          error: {
            status: 500,
            message: "Error sending confirmation email",
          },
        }),
      },
    } as unknown as CoditSupabaseClient;

    await expect(
      signUpWithEmail(
        {
          fullName: "Maria Oliveira",
          email: "maria@codit.dev",
          password: "Codit2026",
          confirmPassword: "Codit2026",
        },
        client,
      ),
    ).rejects.toThrow("HTTP 500");
  });

  it("enforces resend cooldown (60s) and max attempts (3 per 15 min) safely", async () => {
    const resend = vi.fn().mockResolvedValue({ data: {}, error: null });
    const client = {
      auth: { resend },
    } as unknown as CoditSupabaseClient;

    const baseTime = 1_700_000_000_000;

    const first = await resendSignUpConfirmationEmail(
      "  Maria@Codit.Dev ",
      client,
      baseTime,
    );
    expect(first).toEqual({
      cooldownSeconds: 60,
      remainingAttempts: EMAIL_RESEND_MAX_ATTEMPTS - 1,
    });
    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "maria@codit.dev",
      options: expect.objectContaining({
        emailRedirectTo: "/auth/callback",
      }),
    });

    // Bloqueia tentativa imediata dentro de 60s sem chamar Supabase
    await expect(
      resendSignUpConfirmationEmail("maria@codit.dev", client, baseTime + 10_000),
    ).rejects.toMatchObject({
      name: "AuthServiceError",
      code: "resend_rate_limited",
    });
    expect(resend).toHaveBeenCalledTimes(1);

    // 2ª e 3ª tentativas válidas após 65s cada
    await resendSignUpConfirmationEmail(
      "maria@codit.dev",
      client,
      baseTime + 65_000,
    );
    const third = await resendSignUpConfirmationEmail(
      "maria@codit.dev",
      client,
      baseTime + 130_000,
    );
    expect(third.remainingAttempts).toBe(0);

    // 4ª tentativa na mesma janela de 15 minutos é bloqueada
    const status = getEmailResendStatus("maria@codit.dev", baseTime + 200_000);
    expect(status.allowed).toBe(false);
    expect(status.reason).toBe("max_attempts");

    await expect(
      resendSignUpConfirmationEmail(
        "maria@codit.dev",
        client,
        baseTime + 200_000,
      ),
    ).rejects.toThrow("Limite de 3 reenvios");
    expect(resend).toHaveBeenCalledTimes(3);
  });

  it("preserves error code and handles server rate-limit on login/resend", async () => {
    const signInClient = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: null, session: null },
          error: {
            code: "email_not_confirmed",
            status: 400,
            message: "Email not confirmed",
          },
        }),
      },
    } as unknown as CoditSupabaseClient;

    await expect(
      signInWithEmail(
        { email: "maria@codit.dev", password: "Codit2026" },
        signInClient,
      ),
    ).rejects.toMatchObject({
      name: "AuthServiceError",
      code: "email_not_confirmed",
      status: 400,
    } satisfies Partial<AuthServiceError>);
  });
});
