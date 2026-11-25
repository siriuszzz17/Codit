import { describe, expect, it, vi } from "vitest";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import {
  isPolitePeer,
  VoiceCallSessionManager,
  type VoiceCallSnapshot,
} from "@/modules/messaging/voice-call-manager";
import {
  acquireCameraVideoStream,
  acquireScreenShareStream,
  acquireVoiceMicrophoneStream,
  canShareScreen,
  isAuthorizedCameraTrack,
  isAuthorizedScreenShareTrack,
  startOutgoingCallRingback,
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

  it("detects Android native screen capture bridge when getDisplayMedia is absent (RN-505)", () => {
    vi.stubGlobal("RTCPeerConnection", vi.fn());
    vi.stubGlobal("navigator", { mediaDevices: {} });
    vi.stubGlobal("window", {
      CoditNative: {
        getInsets: () => "0,0,0,0",
        isScreenCaptureSupported: () => true,
      },
    });

    try {
      expect(canShareScreen()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("prioritizes Android native MediaProjection bridge over WebView getDisplayMedia stub", async () => {
    const getDisplayMedia = vi
      .fn()
      .mockRejectedValue(new DOMException("Not supported", "NotReadableError"));

    let startedHandler: ((evt: Event) => void) | undefined;
    const startScreenCapture = vi.fn(() => {
      startedHandler?.({
        detail: { width: 540, height: 960 },
      } as unknown as Event);
    });
    const stopScreenCapture = vi.fn();

    vi.stubGlobal("RTCPeerConnection", vi.fn());
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia } });
    vi.stubGlobal("Image", class {});
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setInterval: vi.fn().mockReturnValue(99),
      clearInterval: vi.fn(),
      addEventListener: vi.fn((name: string, cb: (evt: Event) => void) => {
        if (name === "codit:native-screen-started") {
          startedHandler = cb;
        }
      }),
      removeEventListener: vi.fn(),
      CoditNative: {
        getInsets: () => "0,0,0,0",
        isScreenCaptureSupported: () => true,
        startScreenCapture,
        stopScreenCapture,
        getScreenFrameSeq: () => 0,
        getScreenFrameDataUrl: () => "",
      },
    });

    const fakeVideoTrack = createFakeTrack("video");
    const fakeStream = createFakeStream([fakeVideoTrack]);
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: "",
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        }),
        captureStream: () => fakeStream,
      })),
    });

    try {
      const acquired = await acquireScreenShareStream({ getDisplayMedia });
      expect(startScreenCapture).toHaveBeenCalledTimes(1);
      expect(getDisplayMedia).not.toHaveBeenCalled();
      expect(isAuthorizedScreenShareTrack(acquired.getVideoTracks()[0])).toBe(
        true,
      );
      stopMediaStream(acquired);
      expect(stopScreenCapture).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps call active in listen-only mode when microphone is missing/denied and recovers via retryMicrophone", async () => {
    const convId = "11111111-1111-4111-8111-111111111111";
    const userA = "22222222-2222-4222-8222-222222222222";
    const userB = "33333333-3333-4333-8333-333333333333";

    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("No mic", "NotFoundError"))
      .mockResolvedValueOnce(createFakeStream([createFakeTrack("audio")]));

    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("RTCPeerConnection", vi.fn());

    const channelStub = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((cb?: (status: string) => void) => {
        cb?.("SUBSCRIBED");
        return channelStub;
      }),
      track: vi.fn().mockResolvedValue("ok"),
      untrack: vi.fn().mockResolvedValue("ok"),
      presenceState: vi.fn().mockReturnValue({}),
      send: vi.fn().mockResolvedValue("ok"),
    };

    const client = {
      channel: vi.fn().mockReturnValue(channelStub),
      removeChannel: vi.fn().mockResolvedValue("ok"),
    } as unknown as CoditSupabaseClient;

    try {
      const snapshots: VoiceCallSnapshot[] = [];
      const manager = new VoiceCallSessionManager({
        client,
        conversationId: convId,
        conversationTitle: "Bruno",
        isGroup: false,
        localUser: {
          userId: userA,
          username: "ana",
          fullName: "Ana",
          avatarUrl: null,
        },
        allowedMemberIds: [userA, userB],
        onStateChange: (snapshot) => snapshots.push(snapshot),
      });

      await manager.start();

      const afterStart = snapshots[snapshots.length - 1];
      expect(afterStart?.status).toBe("connected");
      expect(afterStart?.hasMicrophone).toBe(false);
      expect(afterStart?.isMuted).toBe(true);
      expect(afterStart?.micWarning).toContain("Nenhum microfone conectado");
      expect(client.channel).toHaveBeenCalledWith(
        `codit:call:${convId}`,
        expect.any(Object),
      );

      const retried = await manager.retryMicrophone();
      expect(retried).toBe(true);

      const afterRetry = snapshots[snapshots.length - 1];
      expect(afterRetry?.hasMicrophone).toBe(true);
      expect(afterRetry?.isMuted).toBe(false);
      expect(afterRetry?.micWarning).toBeNull();

      await manager.leaveCall();
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("captures optional camera video track without audio and signals video-track-state & call-timeout", async () => {
    const camTrack = createFakeTrack("video");
    const extraAudio = createFakeTrack("audio");
    const camStream = createFakeStream([camTrack, extraAudio]);
    const getUserMedia = vi.fn().mockResolvedValue(camStream);

    const acquired = await acquireCameraVideoStream({ getUserMedia }, "user");
    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: "user",
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    });
    expect(extraAudio.stop).toHaveBeenCalledTimes(1);
    expect(acquired.getAudioTracks()).toHaveLength(0);
    expect(isAuthorizedCameraTrack(camTrack)).toBe(true);
    expect(isAuthorizedScreenShareTrack(camTrack)).toBe(false);

    const convId = "11111111-1111-4111-8111-111111111111";
    const userA = "22222222-2222-4222-8222-222222222222";
    const userB = "33333333-3333-4333-8333-333333333333";
    const onCallTimeout = vi.fn();

    const manager = new VoiceCallSessionManager({
      client: {} as CoditSupabaseClient,
      conversationId: convId,
      conversationTitle: "Bruno",
      isGroup: false,
      localUser: {
        userId: userA,
        username: "ana",
        fullName: "Ana",
        avatarUrl: null,
      },
      allowedMemberIds: [userA, userB],
      onStateChange: vi.fn(),
      onCallTimeout,
    });

    await manager.handleIncomingSignalPayload({
      conversationId: convId,
      fromUserId: userB,
      toUserId: userA,
      fromSessionId: "server-timeout",
      kind: "call-timeout",
      reason: "missed",
      timedOutAt: new Date().toISOString(),
    });

    expect(onCallTimeout).toHaveBeenCalledWith("missed");
  });

  it("switches camera facingMode (user <-> environment) and stops outgoing ringback cleanly", async () => {
    const frontTrack = createFakeTrack("video");
    const rearTrack = createFakeTrack("video");
    const frontStream = createFakeStream([frontTrack]);
    const rearStream = createFakeStream([rearTrack]);

    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(frontStream)
      .mockResolvedValueOnce(rearStream);

    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("RTCPeerConnection", vi.fn());

    const clearIntervalSpy = vi.fn();
    vi.stubGlobal("window", {
      setInterval: vi.fn().mockReturnValue(77),
      clearInterval: clearIntervalSpy,
    });

    const convId = "11111111-1111-4111-8111-111111111111";
    const userA = "22222222-2222-4222-8222-222222222222";
    const userB = "33333333-3333-4333-8333-333333333333";

    try {
      const stopRingback = startOutgoingCallRingback(3200);
      stopRingback();
      expect(clearIntervalSpy).toHaveBeenCalledWith(77);

      const snapshots: VoiceCallSnapshot[] = [];
      const manager = new VoiceCallSessionManager({
        client: {} as CoditSupabaseClient,
        conversationId: convId,
        conversationTitle: "Bruno",
        isGroup: false,
        localUser: {
          userId: userA,
          username: "ana",
          fullName: "Ana",
          avatarUrl: null,
        },
        allowedMemberIds: [userA, userB],
        onStateChange: (snapshot) => snapshots.push(snapshot),
      });

      const started = await manager.startCamera("user");
      expect(started).toBe(true);
      expect(snapshots[snapshots.length - 1]?.cameraFacingMode).toBe("user");
      expect(snapshots[snapshots.length - 1]?.isCameraEnabled).toBe(true);

      const switched = await manager.switchCamera();
      expect(switched).toBe(true);
      expect(frontTrack.stop).toHaveBeenCalledTimes(1);
      expect(snapshots[snapshots.length - 1]?.cameraFacingMode).toBe(
        "environment",
      );
      expect(snapshots[snapshots.length - 1]?.localCameraStream).toBe(
        rearStream,
      );

      await manager.leaveCall();
      expect(rearTrack.stop).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
