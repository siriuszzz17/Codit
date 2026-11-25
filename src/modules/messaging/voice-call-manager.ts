import type { RealtimeChannel } from "@supabase/supabase-js";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import {
  callSignalEnvelopeSchema,
  MAX_GROUP_MEMBERS,
  resolveWebRtcIceServers,
  type CallSignalEnvelope,
} from "@/modules/messaging/messaging-schemas";
import {
  acquireCameraVideoStream,
  acquireScreenShareStream,
  acquireVoiceMicrophoneStream,
  applyCameraVideoBitrateCap,
  applyScreenShareBitrateCap,
  createVoiceActivityMonitor,
  isAuthorizedCameraTrack,
  isAuthorizedScreenShareTrack,
  MediaCaptureCancelledError,
  stopMediaStream,
} from "@/modules/messaging/webrtc-media";

export interface CallUserIdentity {
  userId: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface CallParticipantPresence extends CallUserIdentity {
  sessionId: string;
  muted: boolean;
  deafened: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  cameraStreamId?: string | null;
  screenStreamId?: string | null;
  joinedAt: string;
}

export interface VoiceCallSnapshot {
  callId: string;
  conversationId: string;
  conversationTitle: string;
  isGroup: boolean;
  status: "connecting" | "connected";
  participants: CallParticipantPresence[];
  speakingUserIds: string[];
  remoteAudioStreams: Map<string, MediaStream>;
  remoteCameraStreams: Map<string, MediaStream>;
  remoteScreenStreams: Map<string, MediaStream>;
  localCameraStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  hasMicrophone: boolean;
  micWarning: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraEnabled: boolean;
  cameraFacingMode: "user" | "environment";
  isScreenSharing: boolean;
  startedAt: number;
  error: string | null;
}

interface PeerConnectionEntry {
  remoteUserId: string;
  remoteSessionId: string;
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  audioSender: RTCRtpSender | null;
  audioTransceiver: RTCRtpTransceiver | null;
  cameraSender: RTCRtpSender | null;
  screenSender: RTCRtpSender | null;
  remoteAudioStream: MediaStream | null;
  remoteCameraStream: MediaStream | null;
  remoteScreenStream: MediaStream | null;
  expectedCameraStreamId: string | null;
  expectedScreenStreamId: string | null;
}

export function isPolitePeer(
  localSessionKey: string,
  remoteSessionKey: string,
): boolean {
  return localSessionKey < remoteSessionKey;
}

function createSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface VoiceCallManagerOptions {
  client: CoditSupabaseClient;
  callId?: string;
  conversationId: string;
  conversationTitle: string;
  isGroup: boolean;
  localUser: CallUserIdentity;
  allowedMemberIds: ReadonlyArray<string>;
  onStateChange: (snapshot: VoiceCallSnapshot) => void;
  onCallTimeout?: (reason: "missed" | "timeout") => void;
}

export class VoiceCallSessionManager {
  private readonly client: CoditSupabaseClient;
  readonly callId: string;
  private readonly conversationId: string;
  private readonly conversationTitle: string;
  private readonly isGroup: boolean;
  private readonly localUser: CallUserIdentity;
  private readonly localSessionId: string;
  private readonly onStateChange: (snapshot: VoiceCallSnapshot) => void;
  private readonly onCallTimeout?: (reason: "missed" | "timeout") => void;
  private readonly iceServers: RTCIceServer[];

  private allowedMemberIds: Set<string>;
  private channel: RealtimeChannel | null = null;
  private localAudioStream: MediaStream | null = null;
  private localCameraStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private stopVoiceMonitor: () => void = () => {};
  private status: "connecting" | "connected" = "connecting";
  private hasMicrophone = false;
  private micWarning: string | null = null;
  private isMuted = false;
  private isDeafened = false;
  private isCameraEnabled = false;
  private cameraFacingMode: "user" | "environment" = "user";
  private isScreenSharing = false;
  private disposed = false;
  private error: string | null = null;
  private readonly startedAt = Date.now();
  private readonly joinedAt = new Date().toISOString();

  private readonly participants = new Map<string, CallParticipantPresence>();
  private readonly peers = new Map<string, PeerConnectionEntry>();
  private readonly speakingUserIds = new Set<string>();
  private readonly audioMonitors = new Map<string, () => void>();

  constructor(options: VoiceCallManagerOptions) {
    this.client = options.client;
    this.callId = options.callId ?? createSessionId();
    this.conversationId = options.conversationId;
    this.conversationTitle = options.conversationTitle;
    this.isGroup = options.isGroup;
    this.localUser = options.localUser;
    this.allowedMemberIds = new Set(options.allowedMemberIds);
    this.onStateChange = options.onStateChange;
    this.onCallTimeout = options.onCallTimeout;
    this.localSessionId = createSessionId();
    this.iceServers = resolveWebRtcIceServers();

    this.participants.set(this.localUser.userId, {
      ...this.localUser,
      sessionId: this.localSessionId,
      muted: false,
      deafened: false,
      cameraEnabled: false,
      screenSharing: false,
      cameraStreamId: null,
      screenStreamId: null,
      joinedAt: this.joinedAt,
    });
  }

  private getLocalVideoTrackMeta(): {
    cameraStreamId: string | null;
    screenStreamId: string | null;
  } {
    return {
      cameraStreamId: this.localCameraStream?.id ?? null,
      screenStreamId: this.localScreenStream?.id ?? null,
    };
  }

  getSnapshot(): VoiceCallSnapshot {
    const remoteAudioStreams = new Map<string, MediaStream>();
    const remoteCameraStreams = new Map<string, MediaStream>();
    const remoteScreenStreams = new Map<string, MediaStream>();

    for (const [remoteUserId, entry] of this.peers.entries()) {
      if (!this.allowedMemberIds.has(remoteUserId)) {
        continue;
      }

      if (entry.remoteAudioStream) {
        remoteAudioStreams.set(remoteUserId, entry.remoteAudioStream);
      }

      const presence = this.participants.get(remoteUserId);
      if (entry.remoteCameraStream && presence?.cameraEnabled) {
        remoteCameraStreams.set(remoteUserId, entry.remoteCameraStream);
      }

      if (entry.remoteScreenStream && presence?.screenSharing) {
        remoteScreenStreams.set(remoteUserId, entry.remoteScreenStream);
      }
    }

    const orderedParticipants = Array.from(this.participants.values())
      .filter((participant) => this.allowedMemberIds.has(participant.userId))
      .slice(0, MAX_GROUP_MEMBERS)
      .sort((a, b) => {
        if (a.userId === this.localUser.userId) {
          return -1;
        }
        if (b.userId === this.localUser.userId) {
          return 1;
        }
        return a.joinedAt.localeCompare(b.joinedAt);
      });

    return {
      callId: this.callId,
      conversationId: this.conversationId,
      conversationTitle: this.conversationTitle,
      isGroup: this.isGroup,
      status: this.status,
      participants: orderedParticipants,
      speakingUserIds: Array.from(this.speakingUserIds),
      remoteAudioStreams,
      remoteCameraStreams,
      remoteScreenStreams,
      localCameraStream: this.localCameraStream,
      localScreenStream: this.localScreenStream,
      hasMicrophone: this.hasMicrophone,
      micWarning: this.micWarning,
      isMuted: this.isMuted,
      isDeafened: this.isDeafened,
      isCameraEnabled: this.isCameraEnabled,
      cameraFacingMode: this.cameraFacingMode,
      isScreenSharing: this.isScreenSharing,
      startedAt: this.startedAt,
      error: this.error,
    };
  }

  private emit(): void {
    if (!this.disposed) {
      this.onStateChange(this.getSnapshot());
    }
  }

  async start(): Promise<void> {
    this.emit();

    // Capturar microfone sem derrubar a chamada caso falhe (ex.: desktop sem microfone ou permissão negada -> modo escuta).
    try {
      const micStream = await acquireVoiceMicrophoneStream();
      if (this.disposed) {
        stopMediaStream(micStream);
        return;
      }

      this.localAudioStream = micStream;
      this.hasMicrophone = true;
      this.micWarning = null;
      this.isMuted = false;
      this.stopVoiceMonitor = createVoiceActivityMonitor(
        micStream,
        (speaking) => {
          if (speaking && !this.isMuted) {
            this.speakingUserIds.add(this.localUser.userId);
          } else {
            this.speakingUserIds.delete(this.localUser.userId);
          }
          this.emit();
        },
      );
    } catch (micErr) {
      if (this.disposed) {
        return;
      }
      this.localAudioStream = null;
      this.hasMicrophone = false;
      this.isMuted = true;
      this.micWarning =
        micErr instanceof Error
          ? micErr.message
          : "Microfone indisponível. Você entrou em modo escuta.";
    }

    this.emit();

    const channel = this.client.channel(`codit:call:${this.conversationId}`, {
      config: {
        broadcast: { self: false, ack: false },
        presence: { key: this.localUser.userId, enabled: true },
      },
    });
    this.channel = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        this.handlePresenceSync();
      })
      .on("broadcast", { event: "webrtc:signal" }, (event) => {
        const rawPayload =
          event && typeof event === "object" && "payload" in event
            ? event.payload
            : event;
        void this.handleIncomingSignalPayload(rawPayload);
      })
      .subscribe((status) => {
        if (this.disposed) {
          return;
        }
        if (status === "SUBSCRIBED") {
          this.status = "connected";
          this.error = null;
          void this.publishPresence();
          this.handlePresenceSync();
          this.emit();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this.error =
            "Conexão de sinalização instável. Tentando restabelecer a chamada...";
          this.emit();
        }
      });
  }

  async retryMicrophone(): Promise<boolean> {
    if (this.disposed) {
      return false;
    }

    try {
      const micStream = await acquireVoiceMicrophoneStream();
      if (this.disposed) {
        stopMediaStream(micStream);
        return false;
      }

      this.stopVoiceMonitor();
      stopMediaStream(this.localAudioStream);

      this.localAudioStream = micStream;
      this.hasMicrophone = true;
      this.micWarning = null;
      this.isMuted = false;
      this.stopVoiceMonitor = createVoiceActivityMonitor(
        micStream,
        (speaking) => {
          if (speaking && !this.isMuted) {
            this.speakingUserIds.add(this.localUser.userId);
          } else {
            this.speakingUserIds.delete(this.localUser.userId);
          }
          this.emit();
        },
      );

      const audioTrack = micStream.getAudioTracks()[0];
      if (audioTrack) {
        for (const entry of this.peers.values()) {
          try {
            if (entry.audioSender) {
              await entry.audioSender.replaceTrack(audioTrack);
            } else if (entry.audioTransceiver) {
              entry.audioTransceiver.direction = "sendrecv";
              await entry.audioTransceiver.sender.replaceTrack(audioTrack);
              entry.audioSender = entry.audioTransceiver.sender;
              await this.renegotiatePeer(entry);
            } else {
              entry.audioSender = entry.pc.addTrack(audioTrack, micStream);
              await this.renegotiatePeer(entry);
            }
          } catch {
            // Segue para os demais participantes.
          }
        }
      }

      await this.publishPresence();
      this.emit();
      return true;
    } catch (err) {
      this.micWarning =
        err instanceof Error
          ? err.message
          : "Não foi possível ativar o microfone.";
      this.emit();
      return false;
    }
  }

  private async publishPresence(): Promise<void> {
    if (!this.channel || this.disposed) {
      return;
    }

    const localPresence: CallParticipantPresence = {
      ...this.localUser,
      sessionId: this.localSessionId,
      muted: this.isMuted,
      deafened: this.isDeafened,
      cameraEnabled: this.isCameraEnabled,
      screenSharing: this.isScreenSharing,
      cameraStreamId: this.localCameraStream?.id ?? null,
      screenStreamId: this.localScreenStream?.id ?? null,
      joinedAt: this.joinedAt,
    };
    this.participants.set(this.localUser.userId, localPresence);

    try {
      await this.channel.track(localPresence);
    } catch {
      // Falhas transitórias de presence não encerram a chamada ativa.
    }
  }

  updateAllowedMembers(memberIds: ReadonlyArray<string>): void {
    this.allowedMemberIds = new Set(memberIds);

    for (const remoteUserId of Array.from(this.peers.keys())) {
      if (!this.allowedMemberIds.has(remoteUserId)) {
        this.teardownPeer(remoteUserId);
      }
    }

    for (const userId of Array.from(this.participants.keys())) {
      if (userId !== this.localUser.userId && !this.allowedMemberIds.has(userId)) {
        this.participants.delete(userId);
      }
    }

    this.emit();
  }

  private handlePresenceSync(): void {
    if (!this.channel || this.disposed) {
      return;
    }

    const rawState = this.channel.presenceState<CallParticipantPresence>();
    const activeRemoteIds = new Set<string>();

    const localEntry: CallParticipantPresence = {
      ...this.localUser,
      sessionId: this.localSessionId,
      muted: this.isMuted,
      deafened: this.isDeafened,
      cameraEnabled: this.isCameraEnabled,
      screenSharing: this.isScreenSharing,
      cameraStreamId: this.localCameraStream?.id ?? null,
      screenStreamId: this.localScreenStream?.id ?? null,
      joinedAt: this.joinedAt,
    };

    const nextParticipants = new Map<string, CallParticipantPresence>();
    nextParticipants.set(this.localUser.userId, localEntry);

    for (const [key, presences] of Object.entries(rawState)) {
      const latest = presences[presences.length - 1];
      if (!latest) {
        continue;
      }

      const candidateUserId = latest.userId || key;
      if (
        candidateUserId === this.localUser.userId ||
        !this.allowedMemberIds.has(candidateUserId)
      ) {
        continue;
      }

      if (nextParticipants.size >= MAX_GROUP_MEMBERS) {
        break;
      }

      const normalized: CallParticipantPresence = {
        userId: candidateUserId,
        username: latest.username || "codit",
        fullName: latest.fullName || "Amigo no Codit",
        avatarUrl: latest.avatarUrl ?? null,
        sessionId: latest.sessionId || candidateUserId,
        muted: Boolean(latest.muted),
        deafened: Boolean(latest.deafened),
        cameraEnabled: Boolean(latest.cameraEnabled),
        screenSharing: Boolean(latest.screenSharing),
        cameraStreamId: latest.cameraStreamId ?? null,
        screenStreamId: latest.screenStreamId ?? null,
        joinedAt: latest.joinedAt || new Date().toISOString(),
      };

      nextParticipants.set(candidateUserId, normalized);
      activeRemoteIds.add(candidateUserId);

      const existingPeer = this.peers.get(candidateUserId);
      if (
        !existingPeer ||
        existingPeer.remoteSessionId !== normalized.sessionId
      ) {
        const created = this.ensurePeerConnection(
          candidateUserId,
          normalized.sessionId,
        );
        if (created) {
          created.expectedCameraStreamId = normalized.cameraStreamId ?? null;
          created.expectedScreenStreamId = normalized.screenStreamId ?? null;
        }
      } else {
        if (normalized.cameraStreamId) {
          existingPeer.expectedCameraStreamId = normalized.cameraStreamId;
        }
        if (normalized.screenStreamId) {
          existingPeer.expectedScreenStreamId = normalized.screenStreamId;
        }
        if (!normalized.cameraEnabled && existingPeer.remoteCameraStream) {
          existingPeer.remoteCameraStream = null;
          existingPeer.expectedCameraStreamId = null;
        }
        if (!normalized.screenSharing && existingPeer.remoteScreenStream) {
          existingPeer.remoteScreenStream = null;
          existingPeer.expectedScreenStreamId = null;
        }
      }
    }

    for (const remoteUserId of Array.from(this.peers.keys())) {
      if (!activeRemoteIds.has(remoteUserId)) {
        this.teardownPeer(remoteUserId);
      }
    }

    this.participants.clear();
    for (const [id, entry] of nextParticipants.entries()) {
      this.participants.set(id, entry);
    }

    this.emit();
  }

  private ensurePeerConnection(
    remoteUserId: string,
    remoteSessionId: string,
  ): PeerConnectionEntry | null {
    if (
      this.disposed ||
      remoteUserId === this.localUser.userId ||
      !this.allowedMemberIds.has(remoteUserId)
    ) {
      return null;
    }

    const existing = this.peers.get(remoteUserId);
    if (existing && existing.remoteSessionId === remoteSessionId) {
      return existing;
    }

    if (existing) {
      this.teardownPeer(remoteUserId);
    }

    if (this.peers.size >= MAX_GROUP_MEMBERS - 1) {
      return null;
    }

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const entry: PeerConnectionEntry = {
      remoteUserId,
      remoteSessionId,
      pc,
      makingOffer: false,
      ignoreOffer: false,
      polite: isPolitePeer(
        `${this.localUser.userId}:${this.localSessionId}`,
        `${remoteUserId}:${remoteSessionId}`,
      ),
      pendingCandidates: [],
      audioSender: null,
      audioTransceiver: null,
      cameraSender: null,
      screenSender: null,
      remoteAudioStream: null,
      remoteCameraStream: null,
      remoteScreenStream: null,
      expectedCameraStreamId: null,
      expectedScreenStreamId: null,
    };

    this.peers.set(remoteUserId, entry);

    const localAudioTrack = this.localAudioStream?.getAudioTracks()[0];
    if (localAudioTrack && this.localAudioStream) {
      entry.audioSender = pc.addTrack(localAudioTrack, this.localAudioStream);
    } else if (typeof pc.addTransceiver === "function") {
      // Modo escuta sem microfone: negocia recebimento de áudio dos amigos.
      entry.audioTransceiver = pc.addTransceiver("audio", {
        direction: "recvonly",
      });
    }

    const localCameraTrack = this.localCameraStream?.getVideoTracks()[0];
    if (
      localCameraTrack &&
      this.localCameraStream &&
      isAuthorizedCameraTrack(localCameraTrack)
    ) {
      entry.cameraSender = pc.addTrack(
        localCameraTrack,
        this.localCameraStream,
      );
      void applyCameraVideoBitrateCap(entry.cameraSender);
    }

    const localScreenTrack = this.localScreenStream?.getVideoTracks()[0];
    if (
      localScreenTrack &&
      this.localScreenStream &&
      isAuthorizedScreenShareTrack(localScreenTrack)
    ) {
      entry.screenSender = pc.addTrack(
        localScreenTrack,
        this.localScreenStream,
      );
      void applyScreenShareBitrateCap(entry.screenSender);
    }

    pc.onnegotiationneeded = async () => {
      await this.renegotiatePeer(entry);
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate || this.disposed) {
        return;
      }

      const init = event.candidate.toJSON();
      void this.sendSignal({
        conversationId: this.conversationId,
        fromUserId: this.localUser.userId,
        toUserId: remoteUserId,
        fromSessionId: this.localSessionId,
        toSessionId: remoteSessionId,
        kind: "ice-candidate",
        candidate: {
          candidate: init.candidate ?? "",
          sdpMid: init.sdpMid ?? null,
          sdpMLineIndex: init.sdpMLineIndex ?? null,
          usernameFragment: init.usernameFragment ?? null,
        },
      });
    };

    pc.onconnectionstatechange = () => {
      if (this.disposed) {
        return;
      }
      if (pc.connectionState === "failed") {
        try {
          pc.restartIce();
        } catch {
          // noop
        }
      }
    };

    pc.ontrack = (event) => {
      if (this.disposed) {
        return;
      }

      const stream = event.streams[0] ?? new MediaStream([event.track]);

      if (event.track.kind === "audio") {
        entry.remoteAudioStream = stream;
        this.audioMonitors.get(remoteUserId)?.();
        const stopMonitor = createVoiceActivityMonitor(stream, (speaking) => {
          if (speaking) {
            this.speakingUserIds.add(remoteUserId);
          } else {
            this.speakingUserIds.delete(remoteUserId);
          }
          this.emit();
        });
        this.audioMonitors.set(remoteUserId, stopMonitor);
        this.emit();
        return;
      }

      if (event.track.kind === "video") {
        const presence = this.participants.get(remoteUserId);
        const streamId = stream.id ?? "";
        const expectedScreenId =
          entry.expectedScreenStreamId ?? presence?.screenStreamId ?? null;
        const expectedCameraId =
          entry.expectedCameraStreamId ?? presence?.cameraStreamId ?? null;

        const isCameraTrack =
          (expectedCameraId !== null && streamId === expectedCameraId) ||
          (expectedScreenId !== null && streamId !== expectedScreenId && Boolean(presence?.cameraEnabled)) ||
          (Boolean(presence?.cameraEnabled) && !presence?.screenSharing);

        if (isCameraTrack) {
          entry.remoteCameraStream = stream;
          event.track.onended = () => {
            if (entry.remoteCameraStream === stream) {
              entry.remoteCameraStream = null;
              this.emit();
            }
          };
        } else {
          entry.remoteScreenStream = stream;
          event.track.onended = () => {
            if (entry.remoteScreenStream === stream) {
              entry.remoteScreenStream = null;
              this.emit();
            }
          };
        }
        this.emit();
      }
    };

    return entry;
  }

  async handleIncomingSignalPayload(rawPayload: unknown): Promise<void> {
    if (this.disposed) {
      return;
    }

    const parsed = callSignalEnvelopeSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return;
    }

    const signal = parsed.data;
    if (
      signal.conversationId !== this.conversationId ||
      signal.toUserId !== this.localUser.userId ||
      signal.fromUserId === this.localUser.userId ||
      !this.allowedMemberIds.has(signal.fromUserId)
    ) {
      return;
    }

    if (
      signal.toSessionId &&
      signal.toSessionId !== this.localSessionId
    ) {
      return;
    }

    if (signal.kind === "hangup") {
      this.teardownPeer(signal.fromUserId);
      this.participants.delete(signal.fromUserId);
      this.emit();
      return;
    }

    if (signal.kind === "call-timeout") {
      this.onCallTimeout?.(signal.reason);
      return;
    }

    if (signal.kind === "video-track-state") {
      const existing = this.peers.get(signal.fromUserId);
      const participant = this.participants.get(signal.fromUserId);
      if (signal.trackKind === "camera") {
        if (existing) {
          existing.expectedCameraStreamId = signal.active
            ? (signal.streamId ?? existing.expectedCameraStreamId)
            : null;
          if (!signal.active) {
            existing.remoteCameraStream = null;
          }
        }
        if (participant) {
          this.participants.set(signal.fromUserId, {
            ...participant,
            cameraEnabled: signal.active,
            cameraStreamId: signal.active ? (signal.streamId ?? null) : null,
          });
        }
      } else {
        if (existing) {
          existing.expectedScreenStreamId = signal.active
            ? (signal.streamId ?? existing.expectedScreenStreamId)
            : null;
          if (!signal.active) {
            existing.remoteScreenStream = null;
          }
        }
        if (participant) {
          this.participants.set(signal.fromUserId, {
            ...participant,
            screenSharing: signal.active,
            screenStreamId: signal.active ? (signal.streamId ?? null) : null,
          });
        }
      }
      this.emit();
      return;
    }

    if (signal.kind === "camera-stopped") {
      const existing = this.peers.get(signal.fromUserId);
      if (existing) {
        existing.remoteCameraStream = null;
        existing.expectedCameraStreamId = null;
      }
      const participant = this.participants.get(signal.fromUserId);
      if (participant) {
        this.participants.set(signal.fromUserId, {
          ...participant,
          cameraEnabled: false,
          cameraStreamId: null,
        });
      }
      this.emit();
      return;
    }

    if (signal.kind === "screen-share-stopped") {
      const existing = this.peers.get(signal.fromUserId);
      if (existing) {
        existing.remoteScreenStream = null;
        existing.expectedScreenStreamId = null;
      }
      const participant = this.participants.get(signal.fromUserId);
      if (participant) {
        this.participants.set(signal.fromUserId, {
          ...participant,
          screenSharing: false,
          screenStreamId: null,
        });
      }
      this.emit();
      return;
    }

    const entry = this.ensurePeerConnection(
      signal.fromUserId,
      signal.fromSessionId,
    );
    if (!entry) {
      return;
    }

    const { pc } = entry;

    if (signal.kind === "ice-candidate") {
      if (!pc.remoteDescription) {
        entry.pendingCandidates.push(signal.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(signal.candidate);
      } catch {
        // Ignorar candidatos atrasados após troca de descrição.
      }
      return;
    }

    const offerCollision =
      signal.kind === "offer" &&
      (entry.makingOffer || pc.signalingState !== "stable");

    entry.ignoreOffer = !entry.polite && offerCollision;
    if (entry.ignoreOffer) {
      return;
    }

    if (signal.videoTrackMeta) {
      if (signal.videoTrackMeta.cameraStreamId !== undefined) {
        entry.expectedCameraStreamId = signal.videoTrackMeta.cameraStreamId ?? null;
      }
      if (signal.videoTrackMeta.screenStreamId !== undefined) {
        entry.expectedScreenStreamId = signal.videoTrackMeta.screenStreamId ?? null;
      }
    }

    try {
      await pc.setRemoteDescription(signal.sdp);

      while (entry.pendingCandidates.length > 0) {
        const candidate = entry.pendingCandidates.shift();
        if (candidate) {
          await pc.addIceCandidate(candidate).catch(() => undefined);
        }
      }

      if (signal.kind === "offer") {
        await pc.setLocalDescription();
        if (pc.localDescription && pc.localDescription.type === "answer") {
          await this.sendSignal({
            conversationId: this.conversationId,
            fromUserId: this.localUser.userId,
            toUserId: signal.fromUserId,
            fromSessionId: this.localSessionId,
            toSessionId: signal.fromSessionId,
            kind: "answer",
            sdp: {
              type: "answer",
              sdp: pc.localDescription.sdp,
            },
            videoTrackMeta: this.getLocalVideoTrackMeta(),
          });
        }
      }
    } catch {
      // Colisões ou estados encerrados podem falhar de forma segura.
    }
  }

  private async renegotiatePeer(entry: PeerConnectionEntry): Promise<void> {
    const { pc, remoteUserId, remoteSessionId } = entry;
    if (
      this.disposed ||
      pc.signalingState === "closed" ||
      pc.signalingState !== "stable" ||
      entry.makingOffer
    ) {
      return;
    }

    try {
      entry.makingOffer = true;
      await pc.setLocalDescription();
      if (pc.localDescription && pc.localDescription.type === "offer") {
        await this.sendSignal({
          conversationId: this.conversationId,
          fromUserId: this.localUser.userId,
          toUserId: remoteUserId,
          fromSessionId: this.localSessionId,
          toSessionId: remoteSessionId,
          kind: "offer",
          sdp: {
            type: "offer",
            sdp: pc.localDescription.sdp,
          },
          videoTrackMeta: this.getLocalVideoTrackMeta(),
        });
      }
    } catch {
      // Erros transitórios de negociação são reavaliados no próximo ciclo.
    } finally {
      entry.makingOffer = false;
    }
  }

  private async sendSignal(signal: CallSignalEnvelope): Promise<void> {
    if (!this.channel || this.disposed) {
      return;
    }

    try {
      await this.channel.send({
        type: "broadcast",
        event: "webrtc:signal",
        payload: signal,
      });
    } catch {
      // noop
    }
  }

  toggleMute(): boolean {
    if (!this.hasMicrophone) {
      this.isMuted = true;
      void this.retryMicrophone();
      return true;
    }

    this.isMuted = !this.isMuted;
    if (this.localAudioStream) {
      for (const track of this.localAudioStream.getAudioTracks()) {
        track.enabled = !this.isMuted;
      }
    }
    if (this.isMuted) {
      this.speakingUserIds.delete(this.localUser.userId);
    }
    void this.publishPresence();
    this.emit();
    return this.isMuted;
  }

  toggleDeafen(): boolean {
    this.isDeafened = !this.isDeafened;
    if (this.isDeafened && !this.isMuted) {
      this.isMuted = true;
      if (this.localAudioStream) {
        for (const track of this.localAudioStream.getAudioTracks()) {
          track.enabled = false;
        }
      }
      this.speakingUserIds.delete(this.localUser.userId);
    }
    void this.publishPresence();
    this.emit();
    return this.isDeafened;
  }

  async startCamera(
    facingMode: "user" | "environment" = this.cameraFacingMode,
  ): Promise<boolean> {
    if (this.disposed) {
      return false;
    }

    if (this.isCameraEnabled && this.localCameraStream) {
      return true;
    }

    try {
      const cameraStream = await acquireCameraVideoStream(undefined, facingMode);
      if (this.disposed) {
        stopMediaStream(cameraStream);
        return false;
      }

      const cameraTrack = cameraStream.getVideoTracks()[0];
      if (!cameraTrack || !isAuthorizedCameraTrack(cameraTrack)) {
        stopMediaStream(cameraStream);
        return false;
      }

      this.localCameraStream = cameraStream;
      this.cameraFacingMode = facingMode;
      this.isCameraEnabled = true;
      this.error = null;

      cameraTrack.onended = () => {
        if (this.localCameraStream === cameraStream) {
          void this.stopCamera();
        }
      };

      for (const entry of this.peers.values()) {
        try {
          void this.sendSignal({
            conversationId: this.conversationId,
            fromUserId: this.localUser.userId,
            toUserId: entry.remoteUserId,
            fromSessionId: this.localSessionId,
            toSessionId: entry.remoteSessionId,
            kind: "video-track-state",
            trackKind: "camera",
            active: true,
            streamId: cameraStream.id ?? null,
            trackId: cameraTrack.id ?? null,
          });
          if (entry.cameraSender) {
            await entry.cameraSender.replaceTrack(cameraTrack);
          } else {
            entry.cameraSender = entry.pc.addTrack(cameraTrack, cameraStream);
            await this.renegotiatePeer(entry);
          }
          await applyCameraVideoBitrateCap(entry.cameraSender);
        } catch {
          // Segue para os demais participantes.
        }
      }

      await this.publishPresence();
      this.emit();
      return true;
    } catch (err) {
      this.error =
        err instanceof Error
          ? err.message
          : "Não foi possível ativar sua câmera.";
      this.emit();
      throw err;
    }
  }

  async switchCamera(): Promise<boolean> {
    if (this.disposed || !this.isCameraEnabled) {
      return false;
    }

    const nextFacingMode: "user" | "environment" =
      this.cameraFacingMode === "user" ? "environment" : "user";
    const previousStream = this.localCameraStream;

    try {
      const nextStream = await acquireCameraVideoStream(
        undefined,
        nextFacingMode,
      );
      if (this.disposed) {
        stopMediaStream(nextStream);
        return false;
      }

      const nextTrack = nextStream.getVideoTracks()[0];
      if (!nextTrack || !isAuthorizedCameraTrack(nextTrack)) {
        stopMediaStream(nextStream);
        return false;
      }

      this.localCameraStream = nextStream;
      this.cameraFacingMode = nextFacingMode;
      this.error = null;

      nextTrack.onended = () => {
        if (this.localCameraStream === nextStream) {
          void this.stopCamera();
        }
      };

      for (const entry of this.peers.values()) {
        try {
          void this.sendSignal({
            conversationId: this.conversationId,
            fromUserId: this.localUser.userId,
            toUserId: entry.remoteUserId,
            fromSessionId: this.localSessionId,
            toSessionId: entry.remoteSessionId,
            kind: "video-track-state",
            trackKind: "camera",
            active: true,
            streamId: nextStream.id ?? null,
            trackId: nextTrack.id ?? null,
          });
          if (entry.cameraSender) {
            await entry.cameraSender.replaceTrack(nextTrack);
          } else {
            entry.cameraSender = entry.pc.addTrack(nextTrack, nextStream);
            await this.renegotiatePeer(entry);
          }
          await applyCameraVideoBitrateCap(entry.cameraSender);
        } catch {
          // Segue para os demais participantes.
        }
      }

      stopMediaStream(previousStream);
      await this.publishPresence();
      this.emit();
      return true;
    } catch (err) {
      this.error =
        err instanceof Error
          ? err.message
          : "Não foi possível alternar a câmera neste dispositivo.";
      this.emit();
      return false;
    }
  }

  async stopCamera(): Promise<void> {
    if (!this.isCameraEnabled && !this.localCameraStream) {
      return;
    }

    const currentStream = this.localCameraStream;
    this.localCameraStream = null;
    this.isCameraEnabled = false;
    stopMediaStream(currentStream);

    for (const entry of this.peers.values()) {
      if (entry.cameraSender) {
        try {
          entry.pc.removeTrack(entry.cameraSender);
          await this.renegotiatePeer(entry);
        } catch {
          // noop
        }
        entry.cameraSender = null;
      }

      void this.sendSignal({
        conversationId: this.conversationId,
        fromUserId: this.localUser.userId,
        toUserId: entry.remoteUserId,
        fromSessionId: this.localSessionId,
        toSessionId: entry.remoteSessionId,
        kind: "camera-stopped",
      });
    }

    await this.publishPresence();
    this.emit();
  }

  async startScreenShare(): Promise<boolean> {
    if (this.disposed) {
      return false;
    }

    if (this.isScreenSharing && this.localScreenStream) {
      return true;
    }

    try {
      const screenStream = await acquireScreenShareStream();
      if (this.disposed) {
        stopMediaStream(screenStream);
        return false;
      }

      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack || !isAuthorizedScreenShareTrack(screenTrack)) {
        stopMediaStream(screenStream);
        return false;
      }

      this.localScreenStream = screenStream;
      this.isScreenSharing = true;
      this.error = null;

      screenTrack.onended = () => {
        void this.stopScreenShare();
      };

      for (const entry of this.peers.values()) {
        try {
          void this.sendSignal({
            conversationId: this.conversationId,
            fromUserId: this.localUser.userId,
            toUserId: entry.remoteUserId,
            fromSessionId: this.localSessionId,
            toSessionId: entry.remoteSessionId,
            kind: "video-track-state",
            trackKind: "screen",
            active: true,
            streamId: screenStream.id ?? null,
            trackId: screenTrack.id ?? null,
          });
          if (entry.screenSender) {
            await entry.screenSender.replaceTrack(screenTrack);
          } else {
            entry.screenSender = entry.pc.addTrack(screenTrack, screenStream);
            await this.renegotiatePeer(entry);
          }
          await applyScreenShareBitrateCap(entry.screenSender);
        } catch {
          // Segue para os demais participantes.
        }
      }

      await this.publishPresence();
      this.emit();
      return true;
    } catch (err) {
      if (err instanceof MediaCaptureCancelledError) {
        return false;
      }
      this.error =
        err instanceof Error
          ? err.message
          : "Não foi possível compartilhar sua tela.";
      this.emit();
      throw err;
    }
  }

  async stopScreenShare(): Promise<void> {
    if (!this.isScreenSharing && !this.localScreenStream) {
      return;
    }

    const currentStream = this.localScreenStream;
    this.localScreenStream = null;
    this.isScreenSharing = false;
    stopMediaStream(currentStream);

    for (const entry of this.peers.values()) {
      if (entry.screenSender) {
        try {
          entry.pc.removeTrack(entry.screenSender);
          await this.renegotiatePeer(entry);
        } catch {
          // noop
        }
        entry.screenSender = null;
      }

      void this.sendSignal({
        conversationId: this.conversationId,
        fromUserId: this.localUser.userId,
        toUserId: entry.remoteUserId,
        fromSessionId: this.localSessionId,
        toSessionId: entry.remoteSessionId,
        kind: "screen-share-stopped",
      });
    }

    await this.publishPresence();
    this.emit();
  }

  private teardownPeer(remoteUserId: string): void {
    const entry = this.peers.get(remoteUserId);
    if (!entry) {
      return;
    }

    this.audioMonitors.get(remoteUserId)?.();
    this.audioMonitors.delete(remoteUserId);
    this.speakingUserIds.delete(remoteUserId);

    try {
      entry.pc.onnegotiationneeded = null;
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.onconnectionstatechange = null;
      entry.pc.close();
    } catch {
      // noop
    }

    this.peers.delete(remoteUserId);
  }

  async leaveCall(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    for (const entry of this.peers.values()) {
      void this.sendSignal({
        conversationId: this.conversationId,
        fromUserId: this.localUser.userId,
        toUserId: entry.remoteUserId,
        fromSessionId: this.localSessionId,
        toSessionId: entry.remoteSessionId,
        kind: "hangup",
      });
    }

    for (const remoteUserId of Array.from(this.peers.keys())) {
      this.teardownPeer(remoteUserId);
    }

    this.stopVoiceMonitor();
    stopMediaStream(this.localAudioStream);
    stopMediaStream(this.localCameraStream);
    stopMediaStream(this.localScreenStream);
    this.localAudioStream = null;
    this.localCameraStream = null;
    this.localScreenStream = null;

    if (this.channel) {
      const ch = this.channel;
      this.channel = null;
      try {
        await ch.untrack();
      } catch {
        // noop
      }
      try {
        await this.client.removeChannel(ch);
      } catch {
        // noop
      }
    }
  }
}
