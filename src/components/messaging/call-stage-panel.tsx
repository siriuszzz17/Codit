"use client";

import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/social/user-avatar";
import type { VoiceCallSnapshot } from "@/modules/messaging/voice-call-manager";
import { canShareScreen } from "@/modules/messaging/webrtc-media";

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
    <div className="relative overflow-hidden rounded-2xl border border-border bg-[#0b0a16]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[11px] text-slate-200">
        <span className="truncate font-semibold">{label}</span>
        <button
          type="button"
          onClick={handleFullscreen}
          className="rounded-lg border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/20"
        >
          Tela cheia
        </button>
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="max-h-72 w-full bg-black object-contain sm:max-h-96"
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
  onLeaveCall,
  onDismissError,
}: CallStagePanelProps) {
  const [nowMs, setNowMs] = useState(() => activeCall.startedAt);
  const [selectedScreenKey, setSelectedScreenKey] = useState<string | null>(
    null,
  );
  const [screenSupported] = useState(() => canShareScreen());

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
      label: "Sua tela compartilhada (prévia)",
      stream: activeCall.localScreenStream,
    });
  }

  const activeScreen =
    screenEntries.find((entry) => entry.key === selectedScreenKey) ??
    screenEntries[0] ??
    null;

  return (
    <section
      aria-label="Chamada de voz e compartilhamento de tela"
      className="space-y-3 border-b border-border bg-surface-muted/45 p-3.5 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            {activeCall.status === "connected"
              ? "Voz conectada"
              : "Conectando voz..."}
          </span>
          <span className="font-mono text-xs font-semibold text-foreground">
            {formatElapsedTime(activeCall.startedAt, nowMs)}
          </span>
          <span className="rounded-lg border border-border bg-surface px-2 py-0.5 text-[11px] text-muted">
            Sem câmera · Voz + Tela
          </span>
        </div>

        <span className="text-xs font-medium text-muted">
          {activeCall.participants.length}{" "}
          {activeCall.participants.length === 1
            ? "participante na chamada"
            : "participantes na chamada"}
        </span>
      </div>

      {callError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground"
        >
          <span>{callError}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="shrink-0 font-semibold text-accent-strong hover:underline"
          >
            Ocultar
          </button>
        </div>
      ) : null}

      {activeScreen ? (
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
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-surface text-foreground hover:border-accent"
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

      {/* Participantes em chamada de voz (nunca vídeo de câmera) */}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {activeCall.participants.map((participant) => {
          const speaking = speakingSet.has(participant.userId);
          const isLocal = participant.userId === currentUserId;
          return (
            <li
              key={participant.userId}
              className={`flex items-center gap-2 rounded-2xl border bg-surface p-2 transition-all ${
                speaking
                  ? "border-emerald-500 ring-2 ring-emerald-500/35"
                  : "border-border"
              }`}
            >
              <UserAvatar
                name={participant.fullName}
                username={participant.username}
                avatarUrl={participant.avatarUrl}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-foreground">
                  {isLocal ? "Você" : participant.fullName}
                </p>
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted">
                  <span className="truncate font-mono">
                    @{participant.username}
                  </span>
                  {participant.muted ? (
                    <span className="rounded bg-surface-muted px-1 text-[10px] font-semibold">
                      Mudo
                    </span>
                  ) : null}
                  {participant.deafened ? (
                    <span className="rounded bg-surface-muted px-1 text-[10px] font-semibold">
                      Surdo
                    </span>
                  ) : null}
                  {participant.screenSharing ? (
                    <span className="rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent-strong">
                      Tela
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Controles de voz e tela */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleMute}
          className={`inline-flex min-h-9 items-center justify-center rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeCall.isMuted
              ? "border-amber-500/50 bg-amber-500/15 text-foreground"
              : "border-border bg-surface text-foreground hover:border-accent"
          }`}
        >
          {activeCall.isMuted ? "Ativar mic" : "Silenciar mic"}
        </button>

        <button
          type="button"
          onClick={onToggleDeafen}
          className={`inline-flex min-h-9 items-center justify-center rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeCall.isDeafened
              ? "border-amber-500/50 bg-amber-500/15 text-foreground"
              : "border-border bg-surface text-foreground hover:border-accent"
          }`}
        >
          {activeCall.isDeafened ? "Ouvir áudio" : "Silenciar áudio"}
        </button>

        <button
          type="button"
          disabled={!screenSupported && !activeCall.isScreenSharing}
          title={
            screenSupported
              ? "Compartilhar tela ou janela sem ativar câmera"
              : "Seu navegador ou dispositivo não suporta captura de tela; você ainda pode assistir às telas compartilhadas."
          }
          onClick={() => void onToggleScreenShare()}
          className={`inline-flex min-h-9 items-center justify-center rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
            activeCall.isScreenSharing
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border bg-surface text-foreground hover:border-accent"
          }`}
        >
          {activeCall.isScreenSharing
            ? "Parar tela"
            : "Compartilhar tela"}
        </button>

        <button
          type="button"
          onClick={() => void onLeaveCall()}
          className="ml-auto inline-flex min-h-9 items-center justify-center rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
        >
          Sair da chamada
        </button>
      </div>
    </section>
  );
}
