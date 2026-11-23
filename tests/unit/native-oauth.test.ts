import { describe, expect, it, vi } from "vitest";
import {
  buildNativeAppCallbackUrls,
  completeOAuthCallbackUrl,
  isAndroidUserAgent,
  isNativeHandoffPath,
  isSupportedNativeCallbackUrl,
  NATIVE_MOBILE_AUTH_BRIDGE_URL,
  NATIVE_MOBILE_AUTH_CALLBACK_URL,
  parseOAuthCallbackUrl,
  resetProcessedOAuthCodesForTests,
} from "@/lib/native-oauth";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import {
  resolveEmailConfirmationRedirectUrl,
  resolveNativeMobileRedirectUrl,
} from "@/modules/auth/auth-schemas";

describe("native-oauth helpers", () => {
  it("validates supported native callback URLs and rejects untrusted schemes/hosts", () => {
    expect(isSupportedNativeCallbackUrl("com.codit.app://auth/callback?code=abc")).toBe(true);
    expect(isSupportedNativeCallbackUrl("http://127.0.0.1:43823/auth/callback?code=abc")).toBe(true);
    expect(isSupportedNativeCallbackUrl("http://localhost:43823/auth/callback?code=abc")).toBe(true);

    expect(isSupportedNativeCallbackUrl("https://codit.app/auth/callback")).toBe(false);
    expect(isSupportedNativeCallbackUrl("com.codit.app://evil/callback")).toBe(false);
    expect(isSupportedNativeCallbackUrl("http://127.0.0.1:43823/other")).toBe(false);
    expect(isSupportedNativeCallbackUrl("javascript:alert(1)")).toBe(false);
  });

  it("parses PKCE codes, implicit hash tokens, and OAuth provider errors", () => {
    expect(
      parseOAuthCallbackUrl("com.codit.app://auth/callback?code=pkce-123"),
    ).toEqual({ kind: "code", code: "pkce-123" });

    expect(
      parseOAuthCallbackUrl(
        "http://127.0.0.1:43823/auth/callback#access_token=atk&refresh_token=rtk",
      ),
    ).toEqual({ kind: "tokens", accessToken: "atk", refreshToken: "rtk" });

    const errorParsed = parseOAuthCallbackUrl(
      "com.codit.app://auth/callback?error=access_denied&error_description=invalid+flow+state",
    );
    expect(errorParsed.kind).toBe("error");
    if (errorParsed.kind === "error") {
      expect(errorParsed.message).toContain("expirou");
    }

    const otpExpiredParsed = parseOAuthCallbackUrl(
      "https://codit.app/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    expect(otpExpiredParsed.kind).toBe("error");
    if (otpExpiredParsed.kind === "error") {
      expect(otpExpiredParsed.code).toBe("otp_expired");
      expect(otpExpiredParsed.message).toContain("link de confirmação expirou");
    }

    expect(
      parseOAuthCallbackUrl(
        "https://codit.app/auth/callback?token_hash=th_abc123&type=signup",
      ),
    ).toEqual({
      kind: "token_hash",
      tokenHash: "th_abc123",
      type: "signup",
    });

    expect(
      parseOAuthCallbackUrl(
        "https://codit.app/auth/callback?token_hash=th_abc456&type=email",
      ),
    ).toEqual({
      kind: "token_hash",
      tokenHash: "th_abc456",
      type: "email",
    });
  });

  it("verifies token_hash confirmation links once via verifyOtp with deduplication", async () => {
    resetProcessedOAuthCodesForTests();

    const fakeSession = {
      access_token: "token-otp",
      user: { id: "user-otp", email: "confirmado@codit.dev" },
    };

    const verifyOtp = vi.fn().mockResolvedValue({
      data: { session: fakeSession, user: fakeSession.user },
      error: null,
    });
    const getSession = vi.fn().mockResolvedValue({
      data: { session: fakeSession },
      error: null,
    });

    const mockClient = {
      auth: { verifyOtp, getSession },
    } as unknown as CoditSupabaseClient;

    const first = await completeOAuthCallbackUrl(
      "https://codit.app/auth/callback?token_hash=th_once&type=signup",
      mockClient,
    );
    const second = await completeOAuthCallbackUrl(
      "https://codit.app/auth/callback?token_hash=th_once&type=signup",
      mockClient,
    );

    expect(verifyOtp).toHaveBeenCalledTimes(1);
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "th_once",
      type: "signup",
    });
    expect(first.user?.id).toBe("user-otp");
    expect(second.user?.id).toBe("user-otp");
  });

  it("exchanges PKCE code once and deduplicates repeated callback deliveries", async () => {
    resetProcessedOAuthCodesForTests();

    const fakeSession = {
      access_token: "token",
      user: { id: "user-1", email: "aluno@codit.dev" },
    };

    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { session: fakeSession, user: fakeSession.user },
      error: null,
    });
    const getSession = vi.fn().mockResolvedValue({
      data: { session: fakeSession },
      error: null,
    });

    const mockClient = {
      auth: {
        exchangeCodeForSession,
        getSession,
      },
    } as unknown as CoditSupabaseClient;

    const first = await completeOAuthCallbackUrl(
      "http://127.0.0.1:43823/auth/callback?code=once-code",
      mockClient,
    );
    const second = await completeOAuthCallbackUrl(
      "http://127.0.0.1:43823/auth/callback?code=once-code",
      mockClient,
    );

    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(exchangeCodeForSession).toHaveBeenCalledWith("once-code");
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(first.user?.id).toBe("user-1");
    expect(second.user?.id).toBe("user-1");
  });

  it("supports implicit hash token completion via setSession", async () => {
    const fakeSession = {
      access_token: "atk",
      user: { id: "user-2", email: "mobile@codit.dev" },
    };
    const setSession = vi.fn().mockResolvedValue({
      data: { session: fakeSession, user: fakeSession.user },
      error: null,
    });

    const mockClient = {
      auth: { setSession },
    } as unknown as CoditSupabaseClient;

    const result = await completeOAuthCallbackUrl(
      "com.codit.app://auth/callback#access_token=atk&refresh_token=rtk",
      mockClient,
    );

    expect(setSession).toHaveBeenCalledWith({
      access_token: "atk",
      refresh_token: "rtk",
    });
    expect(result.user?.id).toBe("user-2");
  });

  it("resolves email confirmation redirects per platform without leaking native localhost origins", () => {
    expect(resolveNativeMobileRedirectUrl()).toBe(
      NATIVE_MOBILE_AUTH_BRIDGE_URL,
    );
    expect(
      resolveNativeMobileRedirectUrl(NATIVE_MOBILE_AUTH_CALLBACK_URL),
    ).toBe(NATIVE_MOBILE_AUTH_CALLBACK_URL);

    expect(
      resolveEmailConfirmationRedirectUrl({
        platform: "capacitor",
      }),
    ).toBe(NATIVE_MOBILE_AUTH_BRIDGE_URL);

    expect(
      resolveEmailConfirmationRedirectUrl({
        platform: "capacitor",
        nativeRedirectUrl: "com.codit.app://auth/callback/",
      }),
    ).toBe("com.codit.app://auth/callback");

    expect(
      resolveEmailConfirmationRedirectUrl({
        platform: "tauri",
        origin: "http://tauri.localhost",
      }),
    ).toBeUndefined();

    expect(
      resolveEmailConfirmationRedirectUrl({
        platform: "tauri",
        configuredRedirectUrl: "https://codit.app/auth/callback/",
      }),
    ).toBe("https://codit.app/auth/callback");

    expect(
      resolveEmailConfirmationRedirectUrl({
        platform: "web",
        origin: "https://codit.app/",
      }),
    ).toBe("https://codit.app/auth/callback");
  });

  it("identifies the native handoff route and builds safe Android intent and custom scheme callback URLs", () => {
    expect(isNativeHandoffPath("/auth/native-callback")).toBe(true);
    expect(isNativeHandoffPath("/auth/native-callback/")).toBe(true);
    expect(isNativeHandoffPath("/auth/callback")).toBe(false);
    expect(isAndroidUserAgent("Mozilla/5.0 (Linux; Android 14)")).toBe(true);
    expect(isAndroidUserAgent("Mozilla/5.0 (Windows NT 10.0)")).toBe(false);

    const pkceHandoff = buildNativeAppCallbackUrls(
      "https://codit-omega.vercel.app/auth/native-callback?code=pkce-xyz&ignored=attacker",
    );
    expect(pkceHandoff.hasAuthPayload).toBe(true);
    expect(pkceHandoff.errorMessage).toBeNull();
    expect(pkceHandoff.customSchemeUrl).toBe(
      "com.codit.app://auth/callback?code=pkce-xyz",
    );
    expect(pkceHandoff.androidIntentUrl).toBe(
      "intent://auth/callback?code=pkce-xyz#Intent;scheme=com.codit.app;package=com.codit.app;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end",
    );

    const errorHandoff = buildNativeAppCallbackUrls(
      "https://codit-omega.vercel.app/auth/native-callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    expect(errorHandoff.hasAuthPayload).toBe(true);
    expect(errorHandoff.errorMessage).toContain("link de confirmação expirou");
    expect(errorHandoff.customSchemeUrl).toContain("error_code=otp_expired");

    const hashHandoff = buildNativeAppCallbackUrls(
      "https://codit-omega.vercel.app/auth/native-callback#access_token=atk&refresh_token=rtk",
    );
    expect(hashHandoff.hasAuthPayload).toBe(true);
    expect(hashHandoff.customSchemeUrl).toBe(
      "com.codit.app://auth/callback#access_token=atk&refresh_token=rtk",
    );
    expect(hashHandoff.androidIntentUrl).toBe(hashHandoff.customSchemeUrl);
  });
});
