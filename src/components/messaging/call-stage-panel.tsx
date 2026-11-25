"use client";

import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/social/user-avatar";
import type { VoiceCallSnapshot } from "@/modules/messaging/voice-call-manager";

type PipCorner = "br" | "bl" | "tr";

interface VideoFeedItem {
  key: string;
  kind: "screen" | "camera";
  isLocal: boolean;
  userId: string;
  label: string;
  stream: MediaStream;
  mirror: boolean;
}

function formatElapsedTime(startedAt: number, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatRemainingSeconds(deadlineMs: number, nowMs: number): string {
  const remaining = Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function StreamVideoElement({
  stream,
  mirror,
  objectFit,
  className,
  videoRefExternal,
}: {
  stream: MediaStream;
  mirror?: boolean;
  objectFit: "cover" | "contain";
  className?: string;
  videoRefExternal?: React.RefObject<HTMLVideoElement | null>;
}) {
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const targetRef = videoRefExternal ?? internalRef;

  useEffect(() => {
    const element = targetRef.current;
    if (!element) {
      return;
    }
    element.srcObject = stream;
    void element.play().catch(() => undefined);

    return () => {
      element.srcObject = null;
    };
  }, [stream, targetRef]);

  return (
    <video
      ref={targetRef}
      autoPlay
      playsInline
      muted
      className={`h-full w-full bg-black ${
        objectFit === "contain" ? "object-contain" : "object-cover"
      } ${mirror ? "-scale-x-100" : ""} ${className ?? ""}`}
    />
  );
}

function PrimaryVideoCard({
  feed,
  speaking,
  compact,
  onPin,
}: {
  feed: VideoFeedItem;
  speaking: boolean;
  compact?: boolean;
  onPin?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  function handleFullscreen() {
    const element = videoRef.current;
    if (element && typeof element.requestFullscreen === "function") {
      void element.requestFullscreen().catch(() => undefined);
    }
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-black shadow-inner transition-colors ${
        speaking
          ? "border-emerald-400/80 ring-2 ring-emerald-400/30"
          : "border-white/15"
      }`}
    >
      <div
        className={`relative w-full bg-black ${
          compact
            ? "aspect-video max-h-56"
            : feed.kind === "screen"
              ? "aspect-video max-h-80 sm:max-h-96"
              : "aspect-video max-h-72 sm:max-h-88"
        }`}
      >
        <StreamVideoElement
          stream={feed.stream}
          mirror={feed.mirror}
          objectFit={feed.kind === "screen" ? "contain" : "cover"}
          videoRefExternal={videoRef}
        />

        {/* Barra superior translúcida */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/75 via-black/35 to-transparent px-3 py-2 text-[11px] text-white">
          <span className="flex min-w-0 items-center gap-1.5 font-semibold">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                feed.kind === "screen" ? "bg-rose-500" : "bg-emerald-400"
              }`}
            />
            <span className="truncate">{feed.label}</span>
          </span>

          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
            {onPin ? (
              <button
                type="button"
                onClick={onPin}
                className="rounded-lg border border-white/15 bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs transition-colors hover:bg-white/20"
              >
                Destacar
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleFullscreen}
              className="rounded-lg border border-white/15 bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs transition-colors hover:bg-white/20"
            >
              Tela cheia
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface CallStagePanelProps {
  activeCall: VoiceCallSnapshot;
  currentUserId: string;
  callError: string | null;
  isOutgoingRinging?: boolean;
  ringingDeadlineMs?: number | null;
  targetPeer?: {
    fullName: string;
    username?: string | null;
    avatarUrl?: string | null;
  } | null;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleCamera: () => Promise<void>;
  onSwitchCamera: () => Promise<void>;
  onToggleScreenShare: () => Promise<void>;
  onRetryMicrophone: () => Promise<void>;
  onLeaveCall: () => Promise<void>;
  onDismissError: () => void;
}

export function CallStagePanel({
  activeCall,
  currentUserId,
  callError,
  isOutgoingRinging = false,
  ringingDeadlineMs = null,
  targetPeer = null,
  onToggleMute,
  onToggleDeafen,
  onToggleCamera,
  onSwitchCamera,
  onToggleScreenShare,
  onRetryMicrophone,
  onLeaveCall,
  onDismissError,
}: CallStagePanelProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pinnedFeedKey, setPinnedFeedKey] = useState<string | null>(null);
  const [stageCollapsed, setStageCollapsed] = useState(false);
  const [pipCorner, setPipCorner] = useState<PipCorner>("br");
  const [pipExpanded, setPipExpanded] = useState(false);
  const [retryingMic, setRetryingMic] = useState(false);
  const [togglingCamera, setTogglingCamera] = useState(false);
  const [switchingCamera, setSwitchingCamera] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const speakingSet = new Set(activeCall.speakingUserIds);
  const videoFeeds: VideoFeedItem[] = [];

  for (const [remoteUserId, stream] of activeCall.remoteScreenStreams.entries()) {
    const participant = activeCall.participants.find(
      (item) => item.userId === remoteUserId,
    );
    videoFeeds.push({
      key: `screen:${remoteUserId}`,
      kind: "screen",
      isLocal: false,
      userId: remoteUserId,
      label: participant
        ? `Tela de ${participant.fullName}`
        : "Tela compartilhada",
      stream,
      mirror: false,
    });
  }

  if (activeCall.localScreenStream) {
    videoFeeds.push({
      key: "screen:local",
      kind: "screen",
      isLocal: true,
      userId: currentUserId,
      label: "Sua tela",
      stream: activeCall.localScreenStream,
      mirror: false,
    });
  }

  for (const [remoteUserId, stream] of activeCall.remoteCameraStreams.entries()) {
    const participant = activeCall.participants.find(
      (item) => item.userId === remoteUserId,
    );
    videoFeeds.push({
      key: `camera:${remoteUserId}`,
      kind: "camera",
      isLocal: false,
      userId: remoteUserId,
      label: participant ? participant.fullName : "Câmera remota",
      stream,
      mirror: false,
    });
  }

  const localCameraFeed: VideoFeedItem | null = activeCall.localCameraStream
    ? {
        key: "camera:local",
        kind: "camera",
        isLocal: true,
        userId: currentUserId,
        label: "Sua câmera",
        stream: activeCall.localCameraStream,
        mirror: activeCall.cameraFacingMode === "user",
      }
    : null;

  if (localCameraFeed) {
    videoFeeds.push(localCameraFeed);
  }

  const nonLocalCameraFeeds = videoFeeds.filter(
    (feed) => feed.key !== "camera:local",
  );
  const showLocalAsPip = Boolean(
    localCameraFeed &&
      nonLocalCameraFeeds.length > 0 &&
      pinnedFeedKey !== "camera:local",
  );

  const stageFeeds = showLocalAsPip ? nonLocalCameraFeeds : videoFeeds;
  const pinnedFeed =
    stageFeeds.find((feed) => feed.key === pinnedFeedKey) ?? null;

  const hasScreenFeed = stageFeeds.some((feed) => feed.kind === "screen");
  const primaryFeed =
    pinnedFeed ??
    (hasScreenFeed
      ? stageFeeds.find((feed) => feed.kind === "screen") ?? stageFeeds[0]
      : stageFeeds.length === 1
        ? stageFeeds[0]
        : null);

  const isMultiCameraGrid = !primaryFeed && stageFeeds.length > 1;
  const isWaitingForPeers = activeCall.participants.length <= 1;
  const hasAnyVideo = videoFeeds.length > 0;

  const callModeLabel =
    activeCall.isScreenSharing || activeCall.remoteScreenStreams.size > 0
      ? "Tela ativa"
      : activeCall.isCameraEnabled || activeCall.remoteCameraStreams.size > 0
        ? "Chamada de vídeo"
        : "Chamada de voz";

  function cyclePipCorner() {
    setPipCorner((current) =>
      current === "br" ? "bl" : current === "bl" ? "tr" : "br",
    );
  }

  async function handleRetryMicClick() {
    setRetryingMic(true);
    try {
      await onRetryMicrophone();
    } finally {
      setRetryingMic(false);
    }
  }

  async function handleCameraClick() {
    setTogglingCamera(true);
    try {
      await onToggleCamera();
    } finally {
      setTogglingCamera(false);
    }
  }

  async function handleSwitchCameraClick() {
    setSwitchingCamera(true);
    try {
      await onSwitchCamera();
    } finally {
      setSwitchingCamera(false);
    }
  }

  const pipPositionClass =
    pipCorner === "br"
      ? "bottom-2.5 right-2.5"
      : pipCorner === "bl"
        ? "bottom-2.5 left-2.5"
        : "top-10 right-2.5";

  return (
    <section
      aria-label="Painel de chamada de voz, vídeo e tela"
      className="mx-3 mt-2.5 space-y-3 rounded-2xl border border-white/10 bg-[#121024] p-3 text-white shadow-lg sm:mx-4 sm:p-3.5"
    >
      {/* Topo da chamada */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
              isWaitingForPeers
                ? "bg-amber-400/15 text-amber-200"
                : "bg-emerald-400/15 text-emerald-300"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full motion-safe:animate-pulse ${
                isWaitingForPeers ? "bg-amber-400" : "bg-emerald-400"
              }`}
            />
            {activeCall.status !== "connected"
              ? "Conectando sala..."
              : isWaitingForPeers
                ? isOutgoingRinging
                  ? "Chamando..."
                  : "Aguardando participante"
                : callModeLabel}
          </span>

          <span className="font-mono text-xs font-semibold text-white/90">
            {formatElapsedTime(activeCall.startedAt, nowMs)}
          </span>

          {isWaitingForPeers && isOutgoingRinging && ringingDeadlineMs ? (
            <span className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-200">
              Limite {formatRemainingSeconds(ringingDeadlineMs, nowMs)}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {hasAnyVideo ? (
            <button
              type="button"
              onClick={() => setStageCollapsed((prev) => !prev)}
              className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-white/20"
            >
              {stageCollapsed ? "Mostrar vídeo" : "Minimizar vídeo"}
            </button>
          ) : null}
          <span className="text-[11px] font-medium text-slate-300">
            {activeCall.participants.length}{" "}
            {activeCall.participants.length === 1 ? "pessoa" : "pessoas"}
          </span>
        </div>
      </div>

      {/* Estado visual de chamada efetuada aguardando atendimento */}
      {isWaitingForPeers && isOutgoingRinging ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <span
                aria-hidden="true"
                className="absolute -inset-1 rounded-full border border-emerald-400/45 motion-safe:animate-ping"
              />
              {activeCall.isGroup ? (
                <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-violet-500/30 text-sm font-extrabold text-white">
                  G
                </span>
              ) : (
                <UserAvatar
                  name={targetPeer?.fullName ?? activeCall.conversationTitle}
                  username={targetPeer?.username ?? undefined}
                  avatarUrl={targetPeer?.avatarUrl ?? null}
                  size="sm"
                  className="relative rounded-full ring-2 ring-emerald-400/50"
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">
                {activeCall.conversationTitle}
              </p>
              <p className="truncate text-xs text-slate-300">
                {activeCall.isCameraEnabled
                  ? "Chamando com vídeo..."
                  : "Chamando... toque ativo"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onLeaveCall()}
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-full border border-rose-400/40 bg-rose-500/20 px-3.5 py-1.5 text-xs font-semibold text-rose-100 transition-colors hover:bg-rose-500/35"
          >
            Cancelar chamada
          </button>
        </div>
      ) : null}

      {/* Aviso não-bloqueante de modo escuta */}
      {!activeCall.hasMicrophone && activeCall.micWarning ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/35 bg-amber-500/15 px-3 py-2 text-xs text-amber-100"
        >
          <span className="min-w-0 flex-1">
            <strong>Modo escuta:</strong> {activeCall.micWarning}
          </span>
          <button
            type="button"
            disabled={retryingMic}
            onClick={() => void handleRetryMicClick()}
            className="shrink-0 rounded-lg bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60"
          >
            {retryingMic ? "Verificando..." : "Ativar microfone"}
          </button>
        </div>
      ) : null}

      {/* Erros de mídia ou sinalização */}
      {callError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-100"
        >
          <span>{callError}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="shrink-0 font-semibold text-white underline-offset-2 hover:underline"
          >
            Ocultar
          </button>
        </div>
      ) : null}

      {/* Palco responsivo de vídeo e tela com PiP local flutuante */}
      {hasAnyVideo && !stageCollapsed ? (
        <div className="space-y-2">
          {videoFeeds.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {isMultiCameraGrid ? null : (
                <button
                  type="button"
                  onClick={() => setPinnedFeedKey(null)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    pinnedFeedKey === null
                      ? "border-violet-400 bg-violet-500 text-white"
                      : "border-white/15 bg-white/10 text-slate-200 hover:bg-white/20"
                  }`}
                >
                  Automático
                </button>
              )}
              {videoFeeds.map((feed) => (
                <button
                  key={feed.key}
                  type="button"
                  onClick={() =>
                    setPinnedFeedKey((prev) =>
                      prev === feed.key ? null : feed.key,
                    )
                  }
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    pinnedFeedKey === feed.key ||
                    (pinnedFeedKey === null && primaryFeed?.key === feed.key)
                      ? "border-violet-400 bg-violet-500 text-white"
                      : "border-white/15 bg-white/10 text-slate-200 hover:bg-white/20"
                  }`}
                >
                  {feed.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="relative">
            {isMultiCameraGrid ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {stageFeeds.map((feed) => (
                  <PrimaryVideoCard
                    key={feed.key}
                    feed={feed}
                    compact
                    speaking={speakingSet.has(feed.userId)}
                    onPin={() => setPinnedFeedKey(feed.key)}
                  />
                ))}
              </div>
            ) : primaryFeed ? (
              <PrimaryVideoCard
                feed={primaryFeed}
                speaking={speakingSet.has(primaryFeed.userId)}
              />
            ) : null}

            {/* PiP local flutuante e ajustável */}
            {showLocalAsPip && localCameraFeed ? (
              <div
                className={`absolute z-10 overflow-hidden rounded-xl border border-white/25 bg-black shadow-2xl transition-all ${pipPositionClass} ${
                  pipExpanded
                    ? "w-40 sm:w-52"
                    : "w-28 sm:w-36"
                }`}
              >
                <div className="relative aspect-video w-full">
                  <StreamVideoElement
                    stream={localCameraFeed.stream}
                    mirror={localCameraFeed.mirror}
                    objectFit="cover"
                  />

                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-1.5 py-1">
                    <span className="truncate text-[10px] font-semibold text-white">
                      Você
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={cyclePipCorner}
                        title="Mover posição da câmera"
                        aria-label="Mover posição da câmera"
                        className="rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-white hover:bg-white/25"
                      >
                        Pos
                      </button>
                      <button
                        type="button"
                        onClick={() => setPipExpanded((prev) => !prev)}
                        title={pipExpanded ? "Reduzir PiP" : "Ampliar PiP"}
                        aria-label={pipExpanded ? "Reduzir PiP" : "Ampliar PiP"}
                        className="rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-white hover:bg-white/25"
                      >
                        {pipExpanded ? "-" : "+"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPinnedFeedKey("camera:local")}
                        title="Ampliar sua câmera no palco principal"
                        aria-label="Ampliar sua câmera no palco principal"
                        className="rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-white hover:bg-white/25"
                      >
                        Foco
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Participantes na sala */}
      <ul className="flex gap-2 overflow-x-auto pb-0.5 codit-no-scrollbar">
        {activeCall.participants.map((participant) => {
          const speaking = speakingSet.has(participant.userId);
          const isLocal = participant.userId === currentUserId;
          return (
            <li
              key={participant.userId}
              className={`flex min-w-[148px] shrink-0 items-center gap-2 rounded-xl border bg-white/5 px-2.5 py-1.5 transition-all ${
                speaking
                  ? "border-emerald-400 ring-2 ring-emerald-400/35"
                  : "border-white/10"
              }`}
            >
              <UserAvatar
                name={participant.fullName}
                username={participant.username}
                avatarUrl={participant.avatarUrl}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-white">
                  {isLocal ? "Você" : participant.fullName}
                </p>
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-300">
                  <span className="truncate font-mono">
                    @{participant.username}
                  </span>
                  {participant.muted ? (
                    <span className="rounded bg-white/10 px-1 text-[9px] font-semibold text-amber-200">
                      Mudo
                    </span>
                  ) : null}
                  {participant.cameraEnabled ? (
                    <span className="rounded bg-emerald-500/30 px-1 text-[9px] font-semibold text-emerald-200">
                      Vídeo
                    </span>
                  ) : null}
                  {participant.screenSharing ? (
                    <span className="rounded bg-violet-500/35 px-1 text-[9px] font-semibold text-violet-200">
                      Tela
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Controles limpos da chamada */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onToggleMute}
          className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            !activeCall.hasMicrophone || activeCall.isMuted
              ? "border-amber-400/40 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"
              : "border-white/15 bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
          <span>
            {!activeCall.hasMicrophone
              ? "Sem mic"
              : activeCall.isMuted
                ? "Ativar mic"
                : "Microfone"}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleDeafen}
          className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeCall.isDeafened
              ? "border-amber-400/40 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"
              : "border-white/15 bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
          </svg>
          <span>{activeCall.isDeafened ? "Áudio mudo" : "Ouvindo"}</span>
        </button>

        <button
          type="button"
          disabled={togglingCamera}
          onClick={() => void handleCameraClick()}
          className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
            activeCall.isCameraEnabled
              ? "border-emerald-400/60 bg-emerald-600 text-white hover:bg-emerald-500"
              : "border-white/15 bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
            <rect x="2" y="6" width="14" height="12" rx="2" />
          </svg>
          <span>
            {activeCall.isCameraEnabled ? "Desligar vídeo" : "Ligar vídeo"}
          </span>
        </button>

        {activeCall.isCameraEnabled ? (
          <button
            type="button"
            disabled={switchingCamera}
            onClick={() => void handleSwitchCameraClick()}
            title="Alternar entre câmera frontal e traseira"
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 disabled:opacity-60"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            <span>Virar câmera</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => void onToggleScreenShare()}
          className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeCall.isScreenSharing
              ? "border-violet-400 bg-violet-600 text-white hover:bg-violet-500"
              : "border-white/15 bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect width="20" height="14" x="2" y="3" rx="2" />
            <line x1="8" x2="16" y1="21" y2="21" />
            <line x1="12" x2="12" y1="17" y2="21" />
          </svg>
          <span>
            {activeCall.isScreenSharing ? "Parar tela" : "Compartilhar tela"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => void onLeaveCall()}
          className="ml-auto inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-rose-500"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="22" x2="2" y1="2" y2="22" />
          </svg>
          <span>Encerrar</span>
        </button>
      </div>
    </section>
  );
}
