import type { RealtimeChannel } from "@supabase/supabase-js";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import {
  callSignalEnvelopeSchema,
  MAX_GROUP_MEMBERS,
  resolveWebRtcIceServers,
  type CallSignalEnvelope,
} from "@/modules/messaging/messaging-schemas";
import {
  acquireScreenShareStream,
  acquireVoiceMicrophoneStream,
  applyScreenShareBitrateCap,
  createVoiceActivityMonitor,
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
  screenSharing: boolean;
  joinedAt: string;
}

export interface VoiceCallSnapshot {
  conversationId: string;
  conversationTitle: string;
  isGroup: boolean;
  status: "connecting" | "connected";
  participants: CallParticipantPresence[];
  speakingUserIds: string[];
  remoteAudioStreams: Map<string, MediaStream>;
  remoteScreenStreams: Map<string, MediaStream>;
  localScreenStream: MediaStream | null;
  isMuted: boolean;
  isDeafened: boolean;
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
  screenSender: RTCRtpSender | null;
  remoteAudioStream: MediaStream | null;
  remoteVideoStream: MediaStream | null;
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
  conversationId: string;
  conversationTitle: string;
  isGroup: boolean;
  localUser: CallUserIdentity;
  allowedMemberIds: ReadonlyArray<string>;
  onStateChange: (snapshot: VoiceCallSnapshot) => void;
}

export class VoiceCallSessionManager {
  private readonly client: CoditSupabaseClient;
  private readonly conversationId: string;
  private readonly conversationTitle: string;
  private readonly isGroup: boolean;
  private readonly localUser: CallUserIdentity;
  private readonly localSessionId: string;
  private readonly onStateChange: (snapshot: VoiceCallSnapshot) => void;
  private readonly iceServers: RTCIceServer[];

  private allowedMemberIds: Set<string>;
  private channel: RealtimeChannel | null = null;
  private localAudioStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private stopVoiceMonitor: () => void = () => {};
  private status: "connecting" | "connected" = "connecting";
  private isMuted = false;
  private isDeafened = false;
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
    this.conversationId = options.conversationId;
    this.conversationTitle = options.conversationTitle;
    this.isGroup = options.isGroup;
    this.localUser = options.localUser;
    this.allowedMemberIds = new Set(options.allowedMemberIds);
    this.onStateChange = options.onStateChange;
    this.localSessionId = createSessionId();
    this.iceServers = resolveWebRtcIceServers();

    this.participants.set(this.localUser.userId, {
      ...this.localUser,
      sessionId: this.localSessionId,
      muted: false,
      deafened: false,
      screenSharing: false,
      joinedAt: this.joinedAt,
    });
  }

  getSnapshot(): VoiceCallSnapshot {
    const remoteAudioStreams = new Map<string, MediaStream>();
    const remoteScreenStreams = new Map<string, MediaStream>();

    for (const [remoteUserId, entry] of this.peers.entries()) {
      if (!this.allowedMemberIds.has(remoteUserId)) {
        continue;
      }

      if (entry.remoteAudioStream) {
        remoteAudioStreams.set(remoteUserId, entry.remoteAudioStream);
      }

      const presence = this.participants.get(remoteUserId);
      // RN-504: só expor fluxo de vídeo remoto quando o participante declarou
      // compartilhamento de tela ativo (nunca vídeo de câmera).
      if (entry.remoteVideoStream && presence?.screenSharing) {
        remoteScreenStreams.set(remoteUserId, entry.remoteVideoStream);
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
      conversationId: this.conversationId,
      conversationTitle: this.conversationTitle,
      isGroup: this.isGroup,
      status: this.status,
      participants: orderedParticipants,
      speakingUserIds: Array.from(this.speakingUserIds),
      remoteAudioStreams,
      remoteScreenStreams,
      localScreenStream: this.localScreenStream,
      isMuted: this.isMuted,
      isDeafened: this.isDeafened,
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

    const micStream = await acquireVoiceMicrophoneStream();
    if (this.disposed) {
      stopMediaStream(micStream);
      return;
    }

    this.localAudioStream = micStream;
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

  private async publishPresence(): Promise<void> {
    if (!this.channel || this.disposed) {
      return;
    }

    const localPresence: CallParticipantPresence = {
      ...this.localUser,
      sessionId: this.localSessionId,
      muted: this.isMuted,
      deafened: this.isDeafened,
      screenSharing: this.isScreenSharing,
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
      screenSharing: this.isScreenSharing,
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
        screenSharing: Boolean(latest.screenSharing),
        joinedAt: latest.joinedAt || new Date().toISOString(),
      };

      nextParticipants.set(candidateUserId, normalized);
      activeRemoteIds.add(candidateUserId);

      const existingPeer = this.peers.get(candidateUserId);
      if (
        !existingPeer ||
        existingPeer.remoteSessionId !== normalized.sessionId
      ) {
        this.ensurePeerConnection(
          candidateUserId,
          normalized.sessionId,
        );
      } else if (!normalized.screenSharing && existingPeer.remoteVideoStream) {
        existingPeer.remoteVideoStream = null;
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
      screenSender: null,
      remoteAudioStream: null,
      remoteVideoStream: null,
    };

    this.peers.set(remoteUserId, entry);

    const localAudioTrack = this.localAudioStream?.getAudioTracks()[0];
    if (localAudioTrack && this.localAudioStream) {
      entry.audioSender = pc.addTrack(localAudioTrack, this.localAudioStream);
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
      if (this.disposed || pc.signalingState === "closed") {
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
          });
        }
      } catch {
        // Erros transitórios de negociação são reavaliados no próximo ciclo.
      } finally {
        entry.makingOffer = false;
      }
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
        // Apenas exibido quando presence.screenSharing === true (RN-504).
        entry.remoteVideoStream = stream;
        event.track.onended = () => {
          if (entry.remoteVideoStream === stream) {
            entry.remoteVideoStream = null;
            this.emit();
          }
        };
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

    if (signal.kind === "screen-share-stopped") {
      const existing = this.peers.get(signal.fromUserId);
      if (existing) {
        existing.remoteVideoStream = null;
      }
      const participant = this.participants.get(signal.fromUserId);
      if (participant) {
        this.participants.set(signal.fromUserId, {
          ...participant,
          screenSharing: false,
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
          });
        }
      }
    } catch {
      // Colisões ou estados encerrados podem falhar de forma segura.
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
          if (entry.screenSender) {
            await entry.screenSender.replaceTrack(screenTrack);
          } else {
            entry.screenSender = entry.pc.addTrack(screenTrack, screenStream);
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
    stopMediaStream(this.localScreenStream);
    this.localAudioStream = null;
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
