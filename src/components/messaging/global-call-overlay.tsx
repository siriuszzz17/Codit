"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/social/user-avatar";
import { normalizePathname } from "@/lib/navigation";
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
    toggleMute,
    toggleScreenShare,
    leaveVoiceCall,
    acceptIncomingCall,
    dismissIncomingCall,
  } = useVoiceCall();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const isMessagesRoute = normalizePathname(pathname) === "/mensagens";

  useEffect(() => {
    if (!activeCall) {
      return;
    }
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [activeCall]);

  const showFloatingBar = Boolean(activeCall && !isMessagesRoute);
  const showIncomingBanner = Boolean(
    incomingCall && activeCall?.conversationId !== incomingCall.conversationId,
  );

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

      {/* Alerta de chamada de voz recebida */}
      {showIncomingBanner && incomingCall ? (
        <div
          role="alertdialog"
          aria-labelledby="codit-incoming-call-title"
          className="fixed inset-x-0 top-16 z-50 mx-auto w-full max-w-md pl-[calc(0.75rem+var(--codit-safe-left))] pr-[calc(0.75rem+var(--codit-safe-right))] sm:left-auto sm:right-4 sm:top-20"
        >
          <div className="space-y-3 rounded-2xl border border-accent/60 bg-surface p-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <UserAvatar
                name={incomingCall.callerName}
                username={incomingCall.callerUsername}
                avatarUrl={incomingCall.callerAvatarUrl}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p
                  id="codit-incoming-call-title"
                  className="text-xs font-bold text-accent-strong uppercase"
                >
                  Chamada de voz recebida
                </p>
                <p className="truncate text-sm font-bold text-foreground">
                  {incomingCall.isGroup
                    ? incomingCall.conversationTitle
                    : incomingCall.callerName}
                </p>
                <p className="truncate font-mono text-xs text-muted">
                  por @{incomingCall.callerUsername} · apenas voz e tela
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void acceptIncomingCall()}
                className="inline-flex min-h-9 flex-1 items-center justify-center rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Entrar por voz
              </button>
              <button
                type="button"
                onClick={dismissIncomingCall}
                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent"
              >
                Recusar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Barra flutuante quando a chamada segue ativa fora de /mensagens */}
      {showFloatingBar && activeCall ? (
        <aside
          aria-label="Chamada de voz em andamento"
          className="fixed bottom-[calc(4.75rem+var(--codit-safe-bottom))] right-3 left-3 z-40 mx-auto max-w-md md:bottom-4 md:left-auto md:right-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/45 bg-surface/95 px-3.5 py-2.5 shadow-xl backdrop-blur-md">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-xs font-bold text-foreground">
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                <span className="truncate">{activeCall.conversationTitle}</span>
              </p>
              <p className="text-[11px] text-muted">
                Voz · {formatCallDuration(activeCall.startedAt, nowMs)} ·{" "}
                {activeCall.participants.length} na sala
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                className="inline-flex min-h-8 items-center justify-center rounded-xl border border-border bg-surface-muted px-2.5 text-[11px] font-semibold text-foreground hover:border-accent"
              >
                {activeCall.isMuted ? "Desmutar" : "Mudo"}
              </button>
              {activeCall.isScreenSharing ? (
                <button
                  type="button"
                  onClick={() => void toggleScreenShare()}
                  className="inline-flex min-h-8 items-center justify-center rounded-xl border border-accent bg-accent-soft px-2.5 text-[11px] font-semibold text-accent-strong"
                >
                  Parar tela
                </button>
              ) : null}
              <Link
                href={`/mensagens?c=${encodeURIComponent(activeCall.conversationId)}`}
                className="inline-flex min-h-8 items-center justify-center rounded-xl bg-accent px-2.5 text-[11px] font-semibold text-accent-foreground hover:opacity-90"
              >
                Chat
              </Link>
              <button
                type="button"
                onClick={() => void leaveVoiceCall()}
                className="inline-flex min-h-8 items-center justify-center rounded-xl bg-red-600 px-2.5 text-[11px] font-semibold text-white hover:bg-red-700"
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
