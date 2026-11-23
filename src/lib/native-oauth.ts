import type { EmailOtpType, Session, User } from "@supabase/supabase-js";
import { isTauriDesktop } from "@/lib/desktop-updater";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import {
  extractSupabaseErrorMeta,
  mapSupabaseAuthError,
} from "@/lib/supabase/errors";

export const NATIVE_MOBILE_AUTH_CALLBACK_URL = "com.codit.app://auth/callback";
export const DESKTOP_OAUTH_CALLBACK_EVENT = "codit://oauth-callback";

export type AuthPlatform = "tauri" | "capacitor" | "web";

export interface DesktopOAuthPrepared {
  port: number;
  redirectUrl: string;
}

export type ParsedOAuthCallback =
  | { kind: "error"; code?: string | undefined; message: string }
  | { kind: "code"; code: string }
  | { kind: "token_hash"; tokenHash: string; type: EmailOtpType }
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "empty" };

interface CapacitorWindow extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
}

const SUPPORTED_EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "email",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
]);

const processedAuthCodes = new Set<string>();
const processedTokenHashes = new Set<string>();

export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const capacitor = (window as CapacitorWindow).Capacitor;
  return capacitor?.isNativePlatform?.() === true;
}

export function getAuthPlatform(): AuthPlatform {
  if (isTauriDesktop()) {
    return "tauri";
  }
  if (isCapacitorNative()) {
    return "capacitor";
  }
  return "web";
}

export function isSupportedNativeCallbackUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);

    if (
      parsed.protocol === "com.codit.app:" &&
      parsed.hostname === "auth" &&
      parsed.pathname === "/callback"
    ) {
      return true;
    }

    if (
      parsed.protocol === "http:" &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
      parsed.pathname === "/auth/callback"
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function isPkceVerifierMissingError(error: unknown): boolean {
  const candidate = error as { isPkceVerifierMissing?: unknown } | null;
  if (candidate && candidate.isPkceVerifierMissing === true) {
    return true;
  }

  const { code, message } = extractSupabaseErrorMeta(error);
  const combinedLower = `${code} ${message}`.toLowerCase();
  return (
    combinedLower.includes("code verifier") ||
    combinedLower.includes("pkce") ||
    combinedLower.includes("outro navegador")
  );
}

export function parseOAuthCallbackUrl(rawUrl: string): ParsedOAuthCallback {
  try {
    const parsed = new URL(rawUrl);
    const searchParams = parsed.searchParams;
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));

    const errorCode =
      searchParams.get("error_code")?.trim() ||
      hashParams.get("error_code")?.trim() ||
      "";
    const rawError =
      searchParams.get("error_description") ||
      hashParams.get("error_description") ||
      searchParams.get("error") ||
      hashParams.get("error");
    if ((rawError && rawError.trim()) || errorCode) {
      return {
        kind: "error",
        ...(errorCode ? { code: errorCode } : {}),
        message: mapSupabaseAuthError(
          {
            code: errorCode || undefined,
            message: rawError?.trim() ?? "",
          },
          { operation: "parseOAuthCallbackUrl" },
        ),
      };
    }

    const code = searchParams.get("code")?.trim();
    if (code) {
      return { kind: "code", code };
    }

    const tokenHash = searchParams.get("token_hash")?.trim();
    const otpType = searchParams.get("type")?.trim();
    if (
      tokenHash &&
      otpType &&
      SUPPORTED_EMAIL_OTP_TYPES.has(otpType as EmailOtpType)
    ) {
      return {
        kind: "token_hash",
        tokenHash,
        type: otpType as EmailOtpType,
      };
    }

    const accessToken = hashParams.get("access_token")?.trim();
    const refreshToken = hashParams.get("refresh_token")?.trim();
    if (accessToken && refreshToken) {
      return { kind: "tokens", accessToken, refreshToken };
    }

    return { kind: "empty" };
  } catch {
    return { kind: "empty" };
  }
}

export async function completeOAuthCallbackUrl(
  rawUrl: string,
  client: CoditSupabaseClient,
): Promise<{ session: Session | null; user: User | null }> {
  const parsed = parseOAuthCallbackUrl(rawUrl);

  if (parsed.kind === "error") {
    throw new Error(parsed.message);
  }

  if (parsed.kind === "code") {
    if (processedAuthCodes.has(parsed.code)) {
      const { data } = await client.auth.getSession();
      return {
        session: data.session,
        user: data.session?.user ?? null,
      };
    }

    processedAuthCodes.add(parsed.code);
    const { data, error } = await client.auth.exchangeCodeForSession(
      parsed.code,
    );
    if (error) {
      processedAuthCodes.delete(parsed.code);
      const mapped = new Error(
        mapSupabaseAuthError(error, { operation: "exchangeCodeForSession" }),
      ) as Error & { code?: string; isPkceVerifierMissing?: boolean };
      mapped.code = error.code;
      mapped.isPkceVerifierMissing = isPkceVerifierMissingError(error);
      throw mapped;
    }

    return {
      session: data.session,
      user: data.user ?? data.session?.user ?? null,
    };
  }

  if (parsed.kind === "token_hash") {
    const cacheKey = `${parsed.type}:${parsed.tokenHash}`;
    if (processedTokenHashes.has(cacheKey)) {
      const { data } = await client.auth.getSession();
      return {
        session: data.session,
        user: data.session?.user ?? null,
      };
    }

    processedTokenHashes.add(cacheKey);
    const { data, error } = await client.auth.verifyOtp({
      token_hash: parsed.tokenHash,
      type: parsed.type,
    });
    if (error) {
      processedTokenHashes.delete(cacheKey);
      const mapped = new Error(
        mapSupabaseAuthError(error, { operation: "verifyOtp" }),
      ) as Error & { code?: string };
      mapped.code = error.code;
      throw mapped;
    }

    return {
      session: data.session,
      user: data.user ?? data.session?.user ?? null,
    };
  }

  if (parsed.kind === "tokens") {
    const { data, error } = await client.auth.setSession({
      access_token: parsed.accessToken,
      refresh_token: parsed.refreshToken,
    });
    if (error) {
      throw new Error(mapSupabaseAuthError(error, { operation: "setSession" }));
    }

    return {
      session: data.session,
      user: data.user ?? data.session?.user ?? null,
    };
  }

  const { data } = await client.auth.getSession();
  return {
    session: data.session,
    user: data.session?.user ?? null,
  };
}

export async function prepareDesktopOAuth(): Promise<DesktopOAuthPrepared> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DesktopOAuthPrepared>("prepare_desktop_oauth");
}

export async function openDesktopOAuthUrl(authUrl: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_desktop_oauth_url", { authUrl });
}

export async function cancelDesktopOAuth(): Promise<void> {
  if (!isTauriDesktop()) {
    return;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("cancel_desktop_oauth");
  } catch {
    // Ignora caso o listener já tenha sido encerrado.
  }
}

export async function subscribeDesktopOAuthCallback(
  onCallbackUrl: (callbackUrl: string) => void,
): Promise<() => void> {
  if (!isTauriDesktop()) {
    return () => {};
  }

  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<{ callbackUrl?: string }>(
    DESKTOP_OAUTH_CALLBACK_EVENT,
    (event) => {
      const callbackUrl = event.payload?.callbackUrl;
      if (callbackUrl) {
        onCallbackUrl(callbackUrl);
      }
    },
  );

  return () => {
    unlisten();
  };
}

export async function openCapacitorOAuthBrowser(authUrl: string): Promise<void> {
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({
    url: authUrl,
    toolbarColor: "#0b0a16",
  });
}

export async function closeCapacitorOAuthBrowser(): Promise<void> {
  if (!isCapacitorNative()) {
    return;
  }

  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch {
    // No Android a Chrome Custom Tab pode já ter fechado pelo usuário/deep link.
  }
}

export async function subscribeCapacitorOAuthCallback(
  onCallbackUrl: (callbackUrl: string) => void,
): Promise<() => void> {
  if (!isCapacitorNative()) {
    return () => {};
  }

  const { App } = await import("@capacitor/app");
  let active = true;

  const handle = await App.addListener("appUrlOpen", (event) => {
    if (active && event.url) {
      onCallbackUrl(event.url);
    }
  });

  try {
    const launch = await App.getLaunchUrl();
    if (active && launch?.url) {
      onCallbackUrl(launch.url);
    }
  } catch {
    // Ignora caso não haja URL inicial.
  }

  return () => {
    active = false;
    void handle.remove();
  };
}

export async function subscribeCapacitorBrowserFinished(
  onFinished: () => void,
): Promise<() => void> {
  if (!isCapacitorNative()) {
    return () => {};
  }

  const { Browser } = await import("@capacitor/browser");
  const handle = await Browser.addListener("browserFinished", () => {
    onFinished();
  });

  return () => {
    void handle.remove();
  };
}

export function resetProcessedOAuthCodesForTests(): void {
  processedAuthCodes.clear();
  processedTokenHashes.clear();
}
