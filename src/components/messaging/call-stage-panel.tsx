"use client";

import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/social/user-avatar";
import type { VoiceCallSnapshot } from "@/modules/messaging/voice-call-manager";

function formatElapsedTime(startedAt: number, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function ScreenVideoStage({
  stream,
  label,
}: {
  stream: MediaStream;
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }
    element.srcObject = stream;
    void element.play().catch(() => undefined);

    return () => {
      element.srcObject = null;
    };
  }, [stream]);

  function handleFullscreen() {
    const element = videoRef.current;
    if (element && typeof element.requestFullscreen === "function") {
      void element.requestFullscreen().catch(() => undefined);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-black shadow-inner">
      <div className="flex items-center justify-between border-b border-white/10 bg-black/50 px-3 py-1.5 text-[11px] text-slate-200">
        <span className="flex items-center gap-1.5 truncate font-semibold">
          <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
          <span className="truncate">{label}</span>
        </span>
        <button
          type="button"
          onClick={handleFullscreen}
          className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-white/20"
        >
          Tela cheia
        </button>
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="max-h-60 w-full bg-black object-contain sm:max-h-80"
      />
    </div>
  );
}

export interface CallStagePanelProps {
  activeCall: VoiceCallSnapshot;
  currentUserId: string;
  callError: string | null;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleScreenShare: () => Promise<void>;
  onRetryMicrophone: () => Promise<void>;
  onLeaveCall: () => Promise<void>;
  onDismissError: () => void;
}

export function CallStagePanel({
  activeCall,
  currentUserId,
  callError,
  onToggleMute,
  onToggleDeafen,
  onToggleScreenShare,
  onRetryMicrophone,
  onLeaveCall,
  onDismissError,
}: CallStagePanelProps) {
  const [nowMs, setNowMs] = useState(() => activeCall.startedAt);
  const [selectedScreenKey, setSelectedScreenKey] = useState<string | null>(
    null,
  );
  const [screenCollapsed, setScreenCollapsed] = useState(false);
  const [retryingMic, setRetryingMic] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const speakingSet = new Set(activeCall.speakingUserIds);
  const screenEntries: Array<{
    key: string;
    label: string;
    stream: MediaStream;
  }> = [];

  for (const [remoteUserId, stream] of activeCall.remoteScreenStreams.entries()) {
    const participant = activeCall.participants.find(
      (item) => item.userId === remoteUserId,
    );
    screenEntries.push({
      key: remoteUserId,
      label: participant
        ? `Tela de ${participant.fullName} (@${participant.username})`
        : "Tela compartilhada",
      stream,
    });
  }

  if (activeCall.localScreenStream) {
    screenEntries.push({
      key: "local",
      label: "Sua tela (transmitindo ao vivo)",
      stream: activeCall.localScreenStream,
    });
  }

  const activeScreen =
    screenEntries.find((entry) => entry.key === selectedScreenKey) ??
    screenEntries[0] ??
    null;

  const isWaitingForPeers = activeCall.participants.length <= 1;

  async function handleRetryMicClick() {
    setRetryingMic(true);
    try {
      await onRetryMicrophone();
    } finally {
      setRetryingMic(false);
    }
  }

  return (
    <section
      aria-label="Chamada de voz e compartilhamento de tela"
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
              className={`h-2 w-2 animate-pulse rounded-full ${
                isWaitingForPeers ? "bg-amber-400" : "bg-emerald-400"
              }`}
            />
            {activeCall.status !== "connected"
              ? "Conectando sala de voz..."
              : isWaitingForPeers
                ? "Chamando · aguardando amigo"
                : "Em chamada de voz"}
          </span>

          <span className="font-mono text-xs font-semibold text-white/90">
            {formatElapsedTime(activeCall.startedAt, nowMs)}
          </span>

          <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300">
            Sem câmera · Voz + Tela
          </span>
        </div>

        <div className="flex items-center gap-2">
          {activeScreen ? (
            <button
              type="button"
              onClick={() => setScreenCollapsed((prev) => !prev)}
              className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/20"
            >
              {screenCollapsed ? "Mostrar tela" : "Minimizar tela"}
            </button>
          ) : null}
          <span className="text-[11px] font-medium text-slate-300">
            {activeCall.participants.length}{" "}
            {activeCall.participants.length === 1 ? "pessoa" : "pessoas"}
          </span>
        </div>
      </div>

      {/* Aviso não-bloqueante de modo escuta (microfone ausente/negado) */}
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

      {/* Erros (ex.: compartilhamento de tela em navegador móvel sem APK) */}
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

      {/* Palco de tela compartilhada */}
      {activeScreen && !screenCollapsed ? (
        <div className="space-y-2">
          {screenEntries.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {screenEntries.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setSelectedScreenKey(entry.key)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    activeScreen.key === entry.key
                      ? "border-violet-400 bg-violet-500 text-white"
                      : "border-white/15 bg-white/10 text-slate-200 hover:bg-white/20"
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          ) : null}
          <ScreenVideoStage
            stream={activeScreen.stream}
            label={activeScreen.label}
          />
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

      {/* Controles estilo app de chamada */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onToggleMute}
          className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            !activeCall.hasMicrophone
              ? "border-amber-400/40 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"
              : activeCall.isMuted
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
