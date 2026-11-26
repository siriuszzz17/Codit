import { describe, expect, it } from "vitest";
import {
  CALL_RINGING_TIMEOUT_MS,
  CALL_RINGING_TIMEOUT_SECONDS,
  callSignalEnvelopeSchema,
  callTimeoutNoticeSchema,
  createGroupConversationSchema,
  DEFAULT_WEBRTC_ICE_SERVERS,
  MAX_GROUP_INVITEES,
  MAX_GROUP_MEMBERS,
  resolveWebRtcIceServers,
  sendChatMessageSchema,
  validateGroupMemberAddition,
} from "@/modules/messaging/messaging-schemas";

function makeUuid(index: number): string {
  const hex = String(index).padStart(12, "0");
  return `11111111-1111-4111-8111-${hex}`;
}

describe("messaging-schemas", () => {
  it("validates chat message trimming and max length", () => {
    expect(sendChatMessageSchema.safeParse({ content: "   " }).success).toBe(
      false,
    );

    const ok = sendChatMessageSchema.safeParse({ content: "  Olá amigo!  " });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.content).toBe("Olá amigo!");
    }

    expect(
      sendChatMessageSchema.safeParse({ content: "a".repeat(2001) }).success,
    ).toBe(false);
  });

  it("enforces group creation size bounds up to 10 total members (RN-502)", () => {
    expect(MAX_GROUP_MEMBERS).toBe(10);
    expect(MAX_GROUP_INVITEES).toBe(9);

    expect(
      createGroupConversationSchema.safeParse({
        title: "Grupo TCC",
        memberIds: [],
      }).success,
    ).toBe(false);

    const nineUnique = Array.from({ length: 9 }, (_, i) => makeUuid(i + 1));
    const atLimit = createGroupConversationSchema.safeParse({
      title: "  Grupo TCC  ",
      memberIds: [...nineUnique, nineUnique[0]],
    });
    expect(atLimit.success).toBe(true);
    if (atLimit.success) {
      expect(atLimit.data.title).toBe("Grupo TCC");
      expect(atLimit.data.memberIds).toHaveLength(9);
    }

    const tenInvitees = Array.from({ length: 10 }, (_, i) => makeUuid(i + 1));
    const overLimit = createGroupConversationSchema.safeParse({
      title: "Grupo Lotado",
      memberIds: tenInvitees,
    });
    expect(overLimit.success).toBe(false);
  });

  it("validates incremental group member additions against the 10-person ceiling (RN-502)", () => {
    const existing = Array.from({ length: 8 }, (_, i) => makeUuid(i + 1));

    const validAdd = validateGroupMemberAddition(8, existing, [
      makeUuid(9),
      makeUuid(10),
      makeUuid(1),
    ]);
    expect(validAdd).toEqual({
      ok: true,
      newMemberIds: [makeUuid(9), makeUuid(10)],
    });

    const exceedAdd = validateGroupMemberAddition(9, existing, [
      makeUuid(9),
      makeUuid(10),
    ]);
    expect(exceedAdd.ok).toBe(false);

    const fullGroup = validateGroupMemberAddition(10, existing, [makeUuid(9)]);
    expect(fullGroup.ok).toBe(false);

    const onlyExisting = validateGroupMemberAddition(8, existing, [makeUuid(1)]);
    expect(onlyExisting.ok).toBe(false);
  });

  it("validates WebRTC signaling envelopes and resolves ICE server overrides safely", () => {
    const validSignal = callSignalEnvelopeSchema.safeParse({
      conversationId: makeUuid(1),
      fromUserId: makeUuid(2),
      toUserId: makeUuid(3),
      fromSessionId: "sess-1",
      kind: "offer",
      sdp: { type: "offer", sdp: "v=0..." },
    });
    expect(validSignal.success).toBe(true);

    const invalidSignal = callSignalEnvelopeSchema.safeParse({
      conversationId: "not-a-uuid",
      fromUserId: makeUuid(2),
      toUserId: makeUuid(3),
      fromSessionId: "sess-1",
      kind: "hangup",
    });
    expect(invalidSignal.success).toBe(false);

    expect(resolveWebRtcIceServers("")).toEqual(DEFAULT_WEBRTC_ICE_SERVERS);
    expect(resolveWebRtcIceServers("invalid-json")).toEqual(
      DEFAULT_WEBRTC_ICE_SERVERS,
    );
    expect(
      resolveWebRtcIceServers(
        JSON.stringify([{ urls: "https://not-ice.example" }]),
      ),
    ).toEqual(DEFAULT_WEBRTC_ICE_SERVERS);

    const customTurn = [
      {
        urls: ["stun:stun.example.org:3478", "turn:turn.example.org:3478"],
        username: "codit",
        credential: "secret",
      },
    ];
    expect(resolveWebRtcIceServers(JSON.stringify(customTurn))).toEqual(
      customTurn,
    );

    expect(CALL_RINGING_TIMEOUT_SECONDS).toBe(60);
    expect(CALL_RINGING_TIMEOUT_MS).toBe(60_000);

    expect(
      callSignalEnvelopeSchema.safeParse({
        conversationId: makeUuid(1),
        fromUserId: makeUuid(2),
        toUserId: makeUuid(3),
        fromSessionId: "sess-1",
        kind: "video-track-state",
        trackKind: "camera",
        active: true,
        streamId: "cam-stream-1",
      }).success,
    ).toBe(true);

    expect(
      callSignalEnvelopeSchema.safeParse({
        conversationId: makeUuid(1),
        fromUserId: makeUuid(2),
        toUserId: makeUuid(3),
        fromSessionId: "sess-1",
        kind: "call-timeout",
        reason: "missed",
        timedOutAt: new Date().toISOString(),
      }).success,
    ).toBe(false);

    expect(
      callTimeoutNoticeSchema.safeParse({
        callId: makeUuid(4),
        conversationId: makeUuid(1),
        callerId: makeUuid(2),
        reason: "missed",
        timedOutAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });
});
