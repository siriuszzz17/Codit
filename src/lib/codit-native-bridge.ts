import type { Session } from "@supabase/supabase-js";
import { getRuntimeSupabaseConfig } from "@/lib/supabase/config";

export interface NativeRichNotificationPayload {
  title: string;
  body?: string | null;
  category?: string;
  linkHref?: string | null;
  conversationId?: string | null;
  conversationTitle?: string | null;
  isGroup?: boolean;
  tag?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorUsername?: string | null;
  actorAvatarUrl?: string | null;
}

export interface NativeOngoingCallPayload {
  conversationId: string;
  conversationTitle: string;
  isGroup: boolean;
  isMuted: boolean;
  cameraEnabled?: boolean;
  participantCount: number;
  startedAtMs: number;
  avatarUrl?: string | null;
  username?: string | null;
}

export interface NativeCallActionDetail {
  action?: "toggle-mute" | "hangup" | "return";
  conversationId?: string;
  linkHref?: string;
}

export interface NativeReplyEventDetail {
  conversationId?: string;
  content?: string;
  sentViaRest?: boolean;
}

export interface CoditNativeBridge {
  getInsets(): string;
  isScreenCaptureSupported?: () => boolean;
  startScreenCapture?: () => void;
  stopScreenCapture?: () => void;
  getScreenFrameSeq?: () => number;
  getScreenFrameDataUrl?: () => string;
  getScreenDimensions?: () => string;
  syncAuthSession?: (sessionJson: string) => void;
  clearAuthSession?: () => void;
  showRichNotification?: (payloadJson: string) => void;
  dismissNotificationTag?: (tag: string) => void;
  startOrUpdateCallNotification?: (callJson: string) => void;
  stopCallNotification?: () => void;
  consumePendingNavigationHref?: () => string;
}

declare global {
  interface Window {
    /** Injetado por `MainActivity` (Android/Capacitor). Ausente na Web, PWA e Tauri. */
    CoditNative?: CoditNativeBridge;
  }
}

export function syncNativeAuthSession(session: Session | null): void {
  if (typeof window === "undefined") {
    return;
  }
  const bridge = window.CoditNative;
  if (!bridge) {
    return;
  }

  if (!session?.access_token || !session.user?.id) {
    try {
      bridge.clearAuthSession?.();
    } catch {
      // noop
    }
    return;
  }

  const config = getRuntimeSupabaseConfig();
  if (!config) {
    return;
  }

  try {
    bridge.syncAuthSession?.(
      JSON.stringify({
        supabaseUrl: config.url,
        anonKey: config.anonKey,
        userId: session.user.id,
        accessToken: session.access_token,
        refreshToken: session.refresh_token ?? "",
        expiresAtSec: session.expires_at ?? 0,
      }),
    );
  } catch {
    // noop
  }
}

export function clearNativeAuthSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.CoditNative?.clearAuthSession?.();
  } catch {
    // noop
  }
}

export function showNativeRichNotification(
  payload: NativeRichNotificationPayload,
): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.CoditNative?.showRichNotification !== "function"
  ) {
    return false;
  }
  try {
    window.CoditNative.showRichNotification(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function dismissNativeNotificationTag(
  tag: string | null | undefined,
): void {
  if (!tag || typeof window === "undefined") {
    return;
  }
  try {
    window.CoditNative?.dismissNotificationTag?.(tag);
  } catch {
    // noop
  }
}

export function startOrUpdateNativeCallNotification(
  payload: NativeOngoingCallPayload,
): void {
  if (
    typeof window === "undefined" ||
    typeof window.CoditNative?.startOrUpdateCallNotification !== "function"
  ) {
    return;
  }
  try {
    window.CoditNative.startOrUpdateCallNotification(JSON.stringify(payload));
  } catch {
    // noop
  }
}

export function stopNativeCallNotification(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.CoditNative?.stopCallNotification?.();
  } catch {
    // noop
  }
}

export function consumeNativePendingNavigationHref(): string | null {
  if (
    typeof window === "undefined" ||
    typeof window.CoditNative?.consumePendingNavigationHref !== "function"
  ) {
    return null;
  }
  try {
    const href = window.CoditNative.consumePendingNavigationHref();
    return typeof href === "string" && href.trim().length > 0
      ? href.trim()
      : null;
  } catch {
    return null;
  }
}
