import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFcmDataOnlyMessage,
  buildRealtimeBroadcastBody,
  CALL_RINGING_TIMEOUT_MS,
  CALL_RINGING_TIMEOUT_SECONDS,
  CallRingingRegistry,
  sanitizeAvatarUrl,
  validateQuickReplyInput,
} from "../../supabase/functions/send-push/helpers";

const CONV_ID = "11111111-1111-4111-8111-111111111111";
const CALL_ID = "22222222-2222-4222-8222-222222222222";
const CALLER_ID = "33333333-3333-4333-8333-333333333333";
const PEER_ID = "44444444-4444-4444-8444-444444444444";

describe("send-push backend helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds FCM data-only payload with avatar metadata for largeIcon and quick-reply flag", () => {
    const msgPayload = buildFcmDataOnlyMessage("fcm_token_device_1234567890", {
      title: "Ana Silva",
      body: "Vamos estudar hoje?",
      linkHref: `/mensagens?c=${CONV_ID}`,
      category: "message",
      conversationId: CONV_ID,
      conversationTitle: "Ana Silva",
      isGroup: false,
      tag: `conv:${CONV_ID}`,
      ttl: "86400s",
      actorId: CALLER_ID,
      actorName: "Ana Silva",
      actorUsername: "ana.dev",
      actorAvatarUrl: "https://cdn.example.com/avatars/ana.png",
    });

    // Data-only: sem bloco `notification` para Android invocar CoditFirebaseMessagingService
    expect("notification" in msgPayload.message).toBe(false);
    expect(msgPayload.message.android.priority).toBe("HIGH");
    expect(msgPayload.message.data).toMatchObject({
      title: "Ana Silva",
      body: "Vamos estudar hoje?",
      category: "message",
      conversationId: CONV_ID,
      actorId: CALLER_ID,
      actorName: "Ana Silva",
      actorUsername: "ana.dev",
      actorAvatarUrl: "https://cdn.example.com/avatars/ana.png",
      avatarUrl: "https://cdn.example.com/avatars/ana.png",
      largeIcon: "https://cdn.example.com/avatars/ana.png",
      supportsReply: "true",
    });

    const callPayload = buildFcmDataOnlyMessage("fcm_token_device_1234567890", {
      title: "Ana Silva está chamando com vídeo",
      body: "Toque para entrar na chamada no Codit.",
      linkHref: `/mensagens?c=${CONV_ID}`,
      category: "voice_call",
      conversationId: CONV_ID,
      conversationTitle: "Ana Silva",
      isGroup: false,
      tag: `call:${CONV_ID}`,
      ttl: `${CALL_RINGING_TIMEOUT_SECONDS}s`,
      actorId: CALLER_ID,
      actorName: "Ana Silva",
      actorUsername: "ana.dev",
      actorAvatarUrl: "/icons/octopy-coding.png",
      callId: CALL_ID,
      hasVideo: true,
      timeoutSeconds: CALL_RINGING_TIMEOUT_SECONDS,
      supportsReply: false,
    });

    expect(callPayload.message.data).toMatchObject({
      category: "voice_call",
      callId: CALL_ID,
      hasVideo: "true",
      timeoutSeconds: "60",
      actorAvatarUrl: "/icons/octopy-coding.png",
      largeIcon: "/icons/octopy-coding.png",
      supportsReply: "false",
    });
  });

  it("sanitizes unsafe avatar URLs", () => {
    expect(sanitizeAvatarUrl("https://cdn.codit.app/a.png")).toBe(
      "https://cdn.codit.app/a.png",
    );
    expect(sanitizeAvatarUrl("/icons/octopy.png")).toBe("/icons/octopy.png");
    expect(sanitizeAvatarUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeAvatarUrl("//evil.example/a.png")).toBe("");
    expect(sanitizeAvatarUrl("data:image/png;base64,AAA")).toBe("");
  });

  it("validates notification quick-reply payloads strictly", () => {
    expect(
      validateQuickReplyInput({
        conversationId: CONV_ID,
        replyText: "  Chegando em 5 min!  ",
      }),
    ).toEqual({
      ok: true,
      conversationId: CONV_ID,
      content: "Chegando em 5 min!",
    });

    expect(
      validateQuickReplyInput({
        conversationId: "invalid-uuid",
        content: "Oi",
      }).ok,
    ).toBe(false);

    expect(
      validateQuickReplyInput({
        conversationId: CONV_ID,
        content: "   ",
      }).ok,
    ).toBe(false);

    expect(
      validateQuickReplyInput({
        conversationId: CONV_ID,
        content: "a".repeat(2001),
      }).ok,
    ).toBe(false);
  });

  it("times out ringing calls automatically after 60 seconds and marks them missed", async () => {
    vi.useFakeTimers();
    const registry = new CallRingingRegistry(CALL_RINGING_TIMEOUT_MS);
    const onTimeout = vi.fn();

    const { session, waitPromise } = registry.registerRinging(
      {
        callId: CALL_ID,
        conversationId: CONV_ID,
        callerId: CALLER_ID,
        recipientIds: [PEER_ID],
        hasVideo: true,
      },
      onTimeout,
    );

    expect(session.status).toBe("ringing");
    expect(session.expiresAtMs - session.startedAtMs).toBe(60_000);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(onTimeout).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await waitPromise;

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: CALL_ID,
        conversationId: CONV_ID,
        callerId: CALLER_ID,
        recipientIds: [PEER_ID],
        status: "missed",
      }),
    );
    expect(registry.getSession(CONV_ID, CALL_ID)?.status).toBe("missed");
  });

  it("cancels the 60s timeout when call is answered or cancelled before expiration", async () => {
    vi.useFakeTimers();
    const registry = new CallRingingRegistry(CALL_RINGING_TIMEOUT_MS);
    const onTimeout = vi.fn();

    const { waitPromise } = registry.registerRinging(
      {
        callId: CALL_ID,
        conversationId: CONV_ID,
        callerId: CALLER_ID,
        recipientIds: [PEER_ID],
      },
      onTimeout,
    );

    await vi.advanceTimersByTimeAsync(15_000);
    const answered = registry.markAnswered(CONV_ID, CALL_ID);
    await waitPromise;

    expect(answered?.status).toBe("active");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("marks all Realtime REST broadcast events as private: true", () => {
    const body = buildRealtimeBroadcastBody([
      {
        topic: `codit:user-inbox:${PEER_ID}`,
        event: "call:timeout",
        payload: { conversationId: CONV_ID, callId: CALL_ID },
      },
    ]);

    expect(body).toEqual({
      messages: [
        {
          topic: `codit:user-inbox:${PEER_ID}`,
          event: "call:timeout",
          payload: { conversationId: CONV_ID, callId: CALL_ID },
          private: true,
        },
      ],
    });
  });
});
