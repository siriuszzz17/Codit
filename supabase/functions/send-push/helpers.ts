export const CALL_RINGING_TIMEOUT_SECONDS = 60;
export const CALL_RINGING_TIMEOUT_MS = CALL_RINGING_TIMEOUT_SECONDS * 1000;
export const MAX_QUICK_REPLY_LENGTH = 2000;

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PushNotificationCategory =
  | "message"
  | "voice_call"
  | "voice_call_cancel"
  | "project_like"
  | "project_comment"
  | "friend_request"
  | "friend_accepted"
  | "group_invite";

export interface PushMessageSpec {
  title: string;
  body: string;
  linkHref: string;
  category: PushNotificationCategory;
  conversationId: string | null;
  conversationTitle?: string | null;
  isGroup?: boolean;
  tag: string;
  ttl: string;
  actorId?: string | null;
  actorName?: string | null;
  actorUsername?: string | null;
  actorAvatarUrl?: string | null;
  callId?: string | null;
  hasVideo?: boolean;
  timeoutSeconds?: number | null;
  supportsReply?: boolean;
}

export interface FcmDataOnlyMessagePayload {
  message: {
    token: string;
    data: Record<string, string>;
    android: {
      priority: "HIGH";
      ttl: string;
      collapse_key: string;
    };
  };
}

export function sanitizeAvatarUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== "string") {
    return "";
  }
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) {
    return "";
  }
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * Monta payload FCM HTTP v1 data-only para que `CoditFirebaseMessagingService.onMessageReceived`
 * seja sempre invocado no Android (inclusive em segundo plano/Doze), permitindo renderizar
 * `largeIcon` circular com avatar e ação `RemoteInput` ("Responder").
 */
export function buildFcmDataOnlyMessage(
  deviceToken: string,
  spec: PushMessageSpec,
): FcmDataOnlyMessagePayload {
  const safeAvatarUrl = sanitizeAvatarUrl(spec.actorAvatarUrl);
  const safeConversationTitle = (spec.conversationTitle ?? spec.title).trim();
  const safeActorName = (spec.actorName ?? spec.title).trim();
  const supportsReply =
    spec.supportsReply ??
    (spec.category === "message" && Boolean(spec.conversationId));

  return {
    message: {
      token: deviceToken,
      data: {
        title: spec.title,
        body: spec.body,
        linkHref: spec.linkHref,
        category: spec.category,
        conversationId: spec.conversationId ?? "",
        conversationTitle: safeConversationTitle,
        isGroup: spec.isGroup ? "true" : "false",
        tag: spec.tag,
        actorId: spec.actorId ?? "",
        actorName: safeActorName,
        actorUsername: spec.actorUsername ?? "",
        actorAvatarUrl: safeAvatarUrl,
        avatarUrl: safeAvatarUrl,
        largeIcon: safeAvatarUrl,
        callId: spec.callId ?? "",
        hasVideo: spec.hasVideo ? "true" : "false",
        timeoutSeconds:
          typeof spec.timeoutSeconds === "number" && spec.timeoutSeconds > 0
            ? String(spec.timeoutSeconds)
            : "",
        supportsReply: supportsReply ? "true" : "false",
      },
      android: {
        priority: "HIGH",
        ttl: spec.ttl,
        collapse_key: spec.tag.slice(0, 64),
      },
    },
  };
}

export type QuickReplyValidationResult =
  | { ok: true; conversationId: string; content: string }
  | { ok: false; error: string };

export function validateQuickReplyInput(
  body: Record<string, unknown>,
): QuickReplyValidationResult {
  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  if (!UUID_REGEX.test(conversationId)) {
    return { ok: false, error: "Identificador de conversa inválido." };
  }

  const rawContent =
    typeof body.content === "string"
      ? body.content
      : typeof body.replyText === "string"
        ? body.replyText
        : typeof body.reply === "string"
          ? body.reply
          : "";

  const content = rawContent.trim();
  if (!content) {
    return { ok: false, error: "Escreva uma resposta antes de enviar." };
  }
  if (content.length > MAX_QUICK_REPLY_LENGTH) {
    return {
      ok: false,
      error: `A resposta pode ter no máximo ${MAX_QUICK_REPLY_LENGTH} caracteres.`,
    };
  }

  return { ok: true, conversationId, content };
}

export type CallSessionStatus =
  | "ringing"
  | "active"
  | "missed"
  | "cancelled"
  | "ended";

export interface RingingCallSession {
  callId: string;
  conversationId: string;
  callerId: string;
  recipientIds: string[];
  hasVideo: boolean;
  status: CallSessionStatus;
  startedAtMs: number;
  expiresAtMs: number;
}

interface InternalRingingEntry {
  session: RingingCallSession;
  timerId: ReturnType<typeof setTimeout> | null;
  resolveWait: (() => void) | null;
}

/**
 * Gerenciador determinístico de estado `ringing` com timeout automático de 60s.
 * Ao expirar sem atendimento, transita para `missed` e aciona `onTimeout` uma única vez.
 */
export class CallRingingRegistry {
  private readonly entriesByCallId = new Map<string, InternalRingingEntry>();
  private readonly activeCallIdByConversation = new Map<string, string>();
  private readonly defaultTimeoutMs: number;

  constructor(defaultTimeoutMs = CALL_RINGING_TIMEOUT_MS) {
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  registerRinging(
    input: {
      callId: string;
      conversationId: string;
      callerId: string;
      recipientIds: string[];
      hasVideo?: boolean;
      timeoutMs?: number;
    },
    onTimeout: (session: RingingCallSession) => Promise<void> | void,
  ): { session: RingingCallSession; waitPromise: Promise<void> } {
    const existingCallId = this.activeCallIdByConversation.get(
      input.conversationId,
    );
    if (existingCallId && existingCallId !== input.callId) {
      this.cancelTimerOnly(existingCallId);
    }

    const now = Date.now();
    const timeoutMs = input.timeoutMs ?? this.defaultTimeoutMs;
    const session: RingingCallSession = {
      callId: input.callId,
      conversationId: input.conversationId,
      callerId: input.callerId,
      recipientIds: [...input.recipientIds],
      hasVideo: Boolean(input.hasVideo),
      status: "ringing",
      startedAtMs: now,
      expiresAtMs: now + timeoutMs,
    };

    let resolveWait: (() => void) | null = null;
    const waitPromise = new Promise<void>((resolve) => {
      resolveWait = resolve;
    });

    const entry: InternalRingingEntry = {
      session,
      timerId: null,
      resolveWait,
    };

    entry.timerId = setTimeout(() => {
      entry.timerId = null;
      if (entry.session.status !== "ringing") {
        entry.resolveWait?.();
        entry.resolveWait = null;
        return;
      }

      entry.session.status = "missed";
      if (
        this.activeCallIdByConversation.get(entry.session.conversationId) ===
        entry.session.callId
      ) {
        this.activeCallIdByConversation.delete(entry.session.conversationId);
      }

      Promise.resolve(onTimeout({ ...entry.session }))
        .catch(() => undefined)
        .finally(() => {
          entry.resolveWait?.();
          entry.resolveWait = null;
        });
    }, timeoutMs);

    this.entriesByCallId.set(input.callId, entry);
    this.activeCallIdByConversation.set(input.conversationId, input.callId);

    return { session: { ...session }, waitPromise };
  }

  markAnswered(
    conversationId: string,
    callId?: string | null,
  ): RingingCallSession | null {
    const entry = this.findEntry(conversationId, callId);
    if (!entry) {
      return null;
    }
    if (entry.session.status === "ringing") {
      entry.session.status = "active";
    }
    this.clearEntryTimer(entry);
    return { ...entry.session };
  }

  markCancelled(
    conversationId: string,
    callId?: string | null,
  ): RingingCallSession | null {
    const entry = this.findEntry(conversationId, callId);
    if (!entry) {
      return null;
    }
    if (entry.session.status === "ringing") {
      entry.session.status = "cancelled";
    }
    this.clearEntryTimer(entry);
    if (
      this.activeCallIdByConversation.get(entry.session.conversationId) ===
      entry.session.callId
    ) {
      this.activeCallIdByConversation.delete(entry.session.conversationId);
    }
    return { ...entry.session };
  }

  getSession(
    conversationId: string,
    callId?: string | null,
  ): RingingCallSession | null {
    const entry = this.findEntry(conversationId, callId);
    return entry ? { ...entry.session } : null;
  }

  clearAll(): void {
    for (const entry of this.entriesByCallId.values()) {
      this.clearEntryTimer(entry);
    }
    this.entriesByCallId.clear();
    this.activeCallIdByConversation.clear();
  }

  private findEntry(
    conversationId: string,
    callId?: string | null,
  ): InternalRingingEntry | null {
    if (callId) {
      return this.entriesByCallId.get(callId) ?? null;
    }
    const activeId = this.activeCallIdByConversation.get(conversationId);
    if (!activeId) {
      return null;
    }
    return this.entriesByCallId.get(activeId) ?? null;
  }

  private cancelTimerOnly(callId: string): void {
    const entry = this.entriesByCallId.get(callId);
    if (entry) {
      this.clearEntryTimer(entry);
    }
  }

  private clearEntryTimer(entry: InternalRingingEntry): void {
    if (entry.timerId !== null) {
      clearTimeout(entry.timerId);
      entry.timerId = null;
    }
    if (entry.resolveWait) {
      entry.resolveWait();
      entry.resolveWait = null;
    }
  }
}
