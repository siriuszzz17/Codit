import { describe, expect, it, vi } from "vitest";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import {
  isPolitePeer,
  VoiceCallSessionManager,
} from "@/modules/messaging/voice-call-manager";
import {
  acquireScreenShareStream,
  acquireVoiceMicrophoneStream,
  isAuthorizedScreenShareTrack,
  stopMediaStream,
} from "@/modules/messaging/webrtc-media";

function createFakeTrack(kind: "audio" | "video"): MediaStreamTrack {
  return {
    kind,
    readyState: "live",
    enabled: true,
    stop: vi.fn(),
    onended: null,
  } as unknown as MediaStreamTrack;
}

function createFakeStream(tracks: MediaStreamTrack[]): MediaStream {
  const internalTracks = [...tracks];
  return {
    getTracks: () => [...internalTracks],
    getAudioTracks: () => internalTracks.filter((t) => t.kind === "audio"),
    getVideoTracks: () => internalTracks.filter((t) => t.kind === "video"),
    removeTrack: vi.fn((target: MediaStreamTrack) => {
      const idx = internalTracks.indexOf(target);
      if (idx >= 0) {
        internalTracks.splice(idx, 1);
      }
    }),
  } as unknown as MediaStream;
}

describe("webrtc-media & voice-call-manager", () => {
  it("requests audio only (video: false) and strips any unauthorized video track (RN-504)", async () => {
    const audioTrack = createFakeTrack("audio");
    const unexpectedVideoTrack = createFakeTrack("video");
    const stream = createFakeStream([audioTrack, unexpectedVideoTrack]);

    const getUserMedia = vi.fn().mockResolvedValue(stream);

    const acquired = await acquireVoiceMicrophoneStream({ getUserMedia });
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    expect(unexpectedVideoTrack.stop).toHaveBeenCalledTimes(1);
    expect(acquired.getVideoTracks()).toHaveLength(0);
    expect(acquired.getAudioTracks()).toHaveLength(1);
    expect(isAuthorizedScreenShareTrack(unexpectedVideoTrack)).toBe(false);
  });

  it("captures screen share via getDisplayMedia without audio and marks track authorized (RN-505)", async () => {
    const screenTrack = createFakeTrack("video");
    const extraAudio = createFakeTrack("audio");
    const stream = createFakeStream([screenTrack, extraAudio]);

    const getDisplayMedia = vi.fn().mockResolvedValue(stream);

    const acquired = await acquireScreenShareStream({ getDisplayMedia });
    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 15, max: 24 },
      },
      audio: false,
    });

    expect(extraAudio.stop).toHaveBeenCalledTimes(1);
    expect(acquired.getAudioTracks()).toHaveLength(0);
    expect(isAuthorizedScreenShareTrack(screenTrack)).toBe(true);

    stopMediaStream(acquired);
    expect(screenTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("deterministically resolves polite peer polarity", () => {
    const aPolite = isPolitePeer("user-a:1", "user-b:1");
    const bPolite = isPolitePeer("user-b:1", "user-a:1");
    expect(aPolite).toBe(true);
    expect(bPolite).toBe(false);
  });

  it("ignores WebRTC signaling from unauthorized non-members (RN-501 / RN-503)", async () => {
    const peerCtor = vi.fn();
    vi.stubGlobal("RTCPeerConnection", peerCtor);

    try {
      const convId = "11111111-1111-4111-8111-111111111111";
      const userA = "22222222-2222-4222-8222-222222222222";
      const userB = "33333333-3333-4333-8333-333333333333";
      const intruder = "44444444-4444-4444-8444-444444444444";

      const manager = new VoiceCallSessionManager({
        client: {} as CoditSupabaseClient,
        conversationId: convId,
        conversationTitle: "Estudo",
        isGroup: true,
        localUser: {
          userId: userA,
          username: "ana",
          fullName: "Ana",
          avatarUrl: null,
        },
        allowedMemberIds: [userA, userB],
        onStateChange: vi.fn(),
      });

      await manager.handleIncomingSignalPayload({
        conversationId: convId,
        fromUserId: intruder,
        toUserId: userA,
        fromSessionId: "evil-session",
        kind: "offer",
        sdp: { type: "offer", sdp: "v=0..." },
      });

      expect(peerCtor).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
