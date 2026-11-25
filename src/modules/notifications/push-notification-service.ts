import type { CoditSupabaseClient } from "@/lib/supabase/client";
import { uuidSchema } from "@/modules/social/social-schemas";

export const ANDROID_HIGH_PRIORITY_CHANNEL_ID = "codit_alerts_high_v1";

const ANDROID_PUSH_TOKEN_STORAGE_KEY = "codit:android-push-token";
const MIN_PUSH_TOKEN_LENGTH = 20;
const MAX_PUSH_TOKEN_LENGTH = 4096;

let activeAndroidFcmSession = false;

function normalizeToken(rawToken: unknown): string | null {
  if (typeof rawToken !== "string") {
    return null;
  }

  const token = rawToken.trim();
  return token.length >= MIN_PUSH_TOKEN_LENGTH && token.length <= MAX_PUSH_TOKEN_LENGTH
    ? token
    : null;
}

function readStoredAndroidPushToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return normalizeToken(
      window.localStorage.getItem(ANDROID_PUSH_TOKEN_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

function writeStoredAndroidPushToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(ANDROID_PUSH_TOKEN_STORAGE_KEY, token);
  } catch {
    // O token ainda fica registrado no servidor para esta sessão do app.
  }
}

function clearStoredAndroidPushToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(ANDROID_PUSH_TOKEN_STORAGE_KEY);
  } catch {
    // Falha de armazenamento local não impede o logout.
  }
}

export function hasActiveAndroidPushRegistration(): boolean {
  return activeAndroidFcmSession || Boolean(readStoredAndroidPushToken());
}

export async function persistAndroidPushToken(
  userId: string,
  rawToken: unknown,
  client: CoditSupabaseClient,
): Promise<boolean> {
  const parsedUserId = uuidSchema.safeParse(userId);
  const token = normalizeToken(rawToken);
  if (!parsedUserId.success || !token) {
    return false;
  }

  const { error } = await client.rpc("register_push_device", {
    p_token: token,
  });
  if (error) {
    return false;
  }

  activeAndroidFcmSession = true;
  writeStoredAndroidPushToken(token);
  return true;
}

export async function unregisterCurrentAndroidPushDevice(
  client: CoditSupabaseClient,
): Promise<void> {
  activeAndroidFcmSession = false;
  const token = readStoredAndroidPushToken();
  if (token) {
    try {
      await client.rpc("unregister_push_device", { p_token: token });
    } catch {
      // Remoção local prossegue mesmo com falha transitória de rede.
    }
  }
  clearStoredAndroidPushToken();

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (
      !Capacitor.isNativePlatform() ||
      Capacitor.getPlatform() !== "android"
    ) {
      return;
    }
    const { PushNotifications } = await import(
      "@capacitor/push-notifications"
    );
    await PushNotifications.unregister();
  } catch {
    // Remoção local é complementar; a linha remota já foi revogada acima.
  }
}

export async function dispatchVoiceCallPush(
  conversationId: string,
  client: CoditSupabaseClient,
  options?: { callId?: string; hasVideo?: boolean },
): Promise<void> {
  const parsed = uuidSchema.safeParse(conversationId);
  if (!parsed.success || typeof client.functions?.invoke !== "function") {
    return;
  }

  const parsedCallId = options?.callId
    ? uuidSchema.safeParse(options.callId)
    : null;

  try {
    await client.functions.invoke("send-push", {
      body: {
        kind: "voice_call",
        conversationId: parsed.data,
        ...(parsedCallId?.success ? { callId: parsedCallId.data } : {}),
        ...(options?.hasVideo ? { hasVideo: true } : {}),
      },
    });
  } catch {
    // Chamada em tempo real via WebSocket continua funcionando mesmo sem push.
  }
}

export async function dispatchVoiceCallAnswer(
  conversationId: string,
  callId: string | null | undefined,
  client: CoditSupabaseClient,
): Promise<void> {
  const parsedConv = uuidSchema.safeParse(conversationId);
  if (!parsedConv.success || typeof client.functions?.invoke !== "function") {
    return;
  }
  const parsedCallId = callId ? uuidSchema.safeParse(callId) : null;

  try {
    await client.functions.invoke("send-push", {
      body: {
        kind: "voice_call_answer",
        conversationId: parsedConv.data,
        ...(parsedCallId?.success ? { callId: parsedCallId.data } : {}),
      },
    });
  } catch {
    // noop
  }
}

export async function dispatchVoiceCallCancel(
  conversationId: string,
  callId: string | null | undefined,
  client: CoditSupabaseClient,
): Promise<void> {
  const parsedConv = uuidSchema.safeParse(conversationId);
  if (!parsedConv.success || typeof client.functions?.invoke !== "function") {
    return;
  }
  const parsedCallId = callId ? uuidSchema.safeParse(callId) : null;

  try {
    await client.functions.invoke("send-push", {
      body: {
        kind: "voice_call_cancel",
        conversationId: parsedConv.data,
        ...(parsedCallId?.success ? { callId: parsedCallId.data } : {}),
      },
    });
  } catch {
    // noop
  }
}

export async function dispatchNotificationQuickReply(
  conversationId: string,
  content: string,
  client: CoditSupabaseClient,
): Promise<boolean> {
  const parsedConv = uuidSchema.safeParse(conversationId);
  const trimmed = content.trim();
  if (
    !parsedConv.success ||
    !trimmed ||
    trimmed.length > 2000 ||
    typeof client.functions?.invoke !== "function"
  ) {
    return false;
  }

  try {
    const { error } = await client.functions.invoke("send-push", {
      body: {
        kind: "notification_reply",
        conversationId: parsedConv.data,
        content: trimmed,
      },
    });
    return !error;
  } catch {
    return false;
  }
}
