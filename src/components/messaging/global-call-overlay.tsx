"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/social/user-avatar";
import { normalizePathname } from "@/lib/navigation";
import { CALL_RINGING_TIMEOUT_SECONDS } from "@/modules/messaging/messaging-schemas";
import { useVoiceCall } from "@/modules/messaging/voice-call-provider";

function RemoteAudioPlayer({
  stream,
  deafened,
}: {
  stream: MediaStream;
  deafened: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) {
      return;
    }
    element.srcObject = stream;
    void element.play().catch(() => undefined);

    return () => {
      element.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = deafened;
    }
  }, [deafened]);

  return <audio ref={audioRef} autoPlay playsInline muted={deafened} />;
}

function formatCallDuration(startedAt: number, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function GlobalCallOverlay() {
  const pathname = usePathname();
  const {
    activeCall,
    incomingCall,
    isOutgoingRinging,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    leaveVoiceCall,
    acceptIncomingCall,
    dismissIncomingCall,
  } = useVoiceCall();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const isMessagesRoute = normalizePathname(pathname) === "/mensagens";

  useEffect(() => {
    if (!activeCall && !incomingCall) {
      return;
    }
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [activeCall, incomingCall]);

  const showFloatingBar = Boolean(activeCall && !isMessagesRoute);
  const showIncomingBanner = Boolean(
    incomingCall && activeCall?.conversationId !== incomingCall.conversationId,
  );

  const incomingRemainingSeconds = (() => {
    if (!incomingCall) {
      return null;
    }
    const sentAtMs = Date.parse(incomingCall.sentAt);
    if (Number.isNaN(sentAtMs)) {
      return null;
    }
    const timeoutSec =
      incomingCall.timeoutSeconds ?? CALL_RINGING_TIMEOUT_SECONDS;
    const remaining = Math.ceil((sentAtMs + timeoutSec * 1000 - nowMs) / 1000);
    return Math.max(0, Math.min(timeoutSec, remaining));
  })();

  const activeCallModeLabel = activeCall
    ? isOutgoingRinging
      ? "Chamando"
      : activeCall.isScreenSharing || activeCall.remoteScreenStreams.size > 0
        ? "Tela"
        : activeCall.isCameraEnabled || activeCall.remoteCameraStreams.size > 0
          ? "Vídeo"
          : "Voz"
    : "Voz";

  return (
    <>
      {/* Áudio WebRTC persistente entre rotas */}
      {activeCall ? (
        <div className="sr-only" aria-hidden="true">
          {Array.from(activeCall.remoteAudioStreams.entries()).map(
            ([peerId, stream]) => (
              <RemoteAudioPlayer
                key={peerId}
                stream={stream}
                deafened={activeCall.isDeafened}
              />
            ),
          )}
        </div>
      ) : null}

      {/* Modal/alerta modernizado de chamada recebida */}
      {showIncomingBanner && incomingCall ? (
        <div
          role="alertdialog"
          aria-labelledby="codit-incoming-call-title"
          aria-describedby="codit-incoming-call-desc"
          className="fixed inset-x-0 top-16 z-50 mx-auto w-full max-w-md pl-[calc(0.75rem+var(--codit-safe-left))] pr-[calc(0.75rem+var(--codit-safe-right))] sm:left-auto sm:right-4 sm:top-20"
        >
          <div className="overflow-hidden rounded-3xl border border-white/15 bg-[#121024]/95 p-4 text-white shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3.5">
              <div className="relative shrink-0">
                <span
                  aria-hidden="true"
                  className="absolute -inset-1 rounded-full border border-emerald-400/50 motion-safe:animate-ping"
                />
                <UserAvatar
                  name={incomingCall.callerName}
                  username={incomingCall.callerUsername}
                  avatarUrl={incomingCall.callerAvatarUrl}
                  size="md"
                  className="relative rounded-full ring-2 ring-emerald-400/70"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    id="codit-incoming-call-title"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300"
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
                    {incomingCall.hasVideo
                      ? "Chamada de vídeo recebida"
                      : "Chamada de voz recebida"}
                  </span>
                  {incomingRemainingSeconds !== null ? (
                    <span className="font-mono text-[11px] text-slate-300">
                      00:{String(incomingRemainingSeconds).padStart(2, "0")}
                    </span>
                  ) : null}
                </div>

                <p className="mt-0.5 truncate text-base font-bold text-white">
                  {incomingCall.isGroup
                    ? incomingCall.conversationTitle
                    : incomingCall.callerName}
                </p>

                <p
                  id="codit-incoming-call-desc"
                  className="truncate font-mono text-xs text-slate-300"
                >
                  @{incomingCall.callerUsername}
                  {incomingCall.isGroup ? " · chamada em grupo" : ""}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={dismissIncomingCall}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-600/90 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-500"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                  <line x1="22" x2="2" y1="2" y2="22" />
                </svg>
                <span>Recusar</span>
              </button>

              <button
                type="button"
                onClick={() => void acceptIncomingCall({ withVideo: false })}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span>Atender</span>
              </button>

              <button
                type="button"
                onClick={() => void acceptIncomingCall({ withVideo: true })}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-violet-400/50 bg-violet-600/90 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
                  <rect x="2" y="6" width="14" height="12" rx="2" />
                </svg>
                <span>Vídeo</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Barra flutuante quando a chamada segue ativa fora de /mensagens */}
      {showFloatingBar && activeCall ? (
        <aside
          aria-label="Chamada em andamento"
          className="fixed bottom-[calc(4.75rem+var(--codit-safe-bottom))] right-3 left-3 z-40 mx-auto max-w-lg md:bottom-4 md:left-auto md:right-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/45 bg-surface/95 px-3.5 py-2.5 shadow-xl backdrop-blur-md">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-xs font-bold text-foreground">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full motion-safe:animate-pulse ${
                    isOutgoingRinging ? "bg-amber-400" : "bg-emerald-500"
                  }`}
                />
                <span className="truncate">{activeCall.conversationTitle}</span>
              </p>
              <p className="font-mono text-[11px] text-muted">
                {activeCallModeLabel} ·{" "}
                {formatCallDuration(activeCall.startedAt, nowMs)} ·{" "}
                {activeCall.participants.length} na sala
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                className={`inline-flex min-h-9 items-center justify-center rounded-xl border px-2.5 text-[11px] font-semibold transition-colors ${
                  activeCall.isMuted
                    ? "border-amber-500/50 bg-amber-500/15 text-foreground"
                    : "border-border bg-surface-muted text-foreground hover:border-accent"
                }`}
              >
                {activeCall.isMuted ? "Desmutar" : "Mudo"}
              </button>
              <button
                type="button"
                onClick={() => void toggleCamera()}
                className={`inline-flex min-h-9 items-center justify-center rounded-xl border px-2.5 text-[11px] font-semibold transition-colors ${
                  activeCall.isCameraEnabled
                    ? "border-emerald-500/60 bg-emerald-600 text-white"
                    : "border-border bg-surface-muted text-foreground hover:border-accent"
                }`}
              >
                {activeCall.isCameraEnabled ? "Vídeo on" : "Vídeo"}
              </button>
              {activeCall.isScreenSharing ? (
                <button
                  type="button"
                  onClick={() => void toggleScreenShare()}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl border border-accent bg-accent-soft px-2.5 text-[11px] font-semibold text-accent-strong"
                >
                  Parar tela
                </button>
              ) : null}
              <Link
                href={`/mensagens?c=${encodeURIComponent(activeCall.conversationId)}`}
                className="inline-flex min-h-9 items-center justify-center rounded-xl bg-accent px-2.5 text-[11px] font-semibold text-accent-foreground hover:opacity-90"
              >
                Voltar
              </Link>
              <button
                type="button"
                onClick={() => void leaveVoiceCall()}
                className="inline-flex min-h-9 items-center justify-center rounded-xl bg-rose-600 px-2.5 text-[11px] font-semibold text-white hover:bg-rose-500"
              >
                Sair
              </button>
            </div>
          </div>
        </aside>
      ) : null}
    </>
  );
}
