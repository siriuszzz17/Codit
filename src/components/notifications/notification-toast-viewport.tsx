"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/social/user-avatar";
import {
  dismissAppToast,
  getAppToastsSnapshot,
  subscribeAppToasts,
  type AppToastTone,
} from "@/lib/app-toast";
import type { NotificationCategory } from "@/lib/supabase/database.types";
import { mapRowCategoryToPrefKey } from "@/modules/notifications/notification-schemas";
import {
  useNotificationsOptional,
  type ActiveNotificationToast,
} from "@/modules/notifications/notifications-provider";

const EMPTY_APP_TOASTS: ReturnType<typeof getAppToastsSnapshot> = [];

const TOAST_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  message: "Nova mensagem",
  voice_call: "Ligação de voz",
  project_like: "Projeto curtido",
  project_comment: "Novo comentário",
  friend_request: "Pedido de amizade",
  friend_accepted: "Amizade aceita",
  group_invite: "Convite de grupo",
};

const APP_TOAST_TONE_STYLES: Record<
  AppToastTone,
  { badge: string; label: string; border: string }
> = {
  error: {
    badge: "bg-red-500/15 text-red-700 dark:text-red-300",
    label: "Erro",
    border: "border-red-500/35",
  },
  warning: {
    badge: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    label: "Atenção",
    border: "border-amber-500/35",
  },
  info: {
    badge: "bg-accent-soft text-accent-strong",
    label: "Aviso",
    border: "border-border",
  },
  success: {
    badge: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
    label: "Concluído",
    border: "border-emerald-500/35",
  },
};

export function NotificationToastViewport() {
  const router = useRouter();
  const notifications = useNotificationsOptional();
  const appToasts = useSyncExternalStore(
    subscribeAppToasts,
    getAppToastsSnapshot,
    () => EMPTY_APP_TOASTS,
  );

  const notificationToasts = notifications?.toasts ?? [];

  if (notificationToasts.length === 0 && appToasts.length === 0) {
    return null;
  }

  function handleOpenToast(toast: ActiveNotificationToast) {
    notifications?.dismissToast(toast.id);
    if (toast.linkHref) {
      router.push(toast.linkHref);
    }
  }

  function handleMuteToastSource(toast: ActiveNotificationToast) {
    if (!notifications) {
      return;
    }
    if (
      toast.conversationId &&
      (toast.category === "message" || toast.category === "voice_call")
    ) {
      notifications.toggleConversationMute(toast.conversationId);
    } else {
      notifications.setCategoryEnabled(
        mapRowCategoryToPrefKey(toast.category),
        false,
      );
    }
    notifications.dismissToast(toast.id);
  }

  return (
    <div
      aria-live="polite"
      aria-label="Notificações e avisos do sistema"
      className="pointer-events-none fixed inset-x-0 top-[calc(4rem+var(--codit-safe-top))] z-50 flex flex-col items-end gap-2 pl-[calc(0.75rem+var(--codit-safe-left))] pr-[calc(0.75rem+var(--codit-safe-right))] sm:left-auto sm:right-5 sm:w-96 sm:pl-0 sm:pr-0"
    >
      {appToasts.map((toast) => {
        const toneStyle = APP_TOAST_TONE_STYLES[toast.tone];
        const isAlert = toast.tone === "error" || toast.tone === "warning";

        return (
          <div
            key={toast.id}
            role={isAlert ? "alert" : "status"}
            aria-live={isAlert ? "assertive" : "polite"}
            className={`pointer-events-auto w-full rounded-2xl border ${toneStyle.border} bg-surface-elevated/95 p-3.5 shadow-xl backdrop-blur-md transition-opacity motion-reduce:transition-none`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${toneStyle.badge}`}
                >
                  {toneStyle.label}
                </span>
                <button
                  type="button"
                  onClick={() => dismissAppToast(toast.id)}
                  aria-label="Fechar aviso"
                  className="rounded px-1 text-[11px] font-medium text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Fechar
                </button>
              </div>
              <p className="text-xs font-bold text-foreground">{toast.title}</p>
              <p className="text-[11px] leading-relaxed text-muted">
                {toast.detail}
              </p>
            </div>
          </div>
        );
      })}

      {notificationToasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto w-full rounded-2xl border border-border bg-surface-elevated/95 p-3.5 shadow-xl backdrop-blur-md transition-opacity motion-reduce:transition-none"
        >
          <div className="flex items-start gap-2.5">
            {toast.actor ? (
              <UserAvatar
                name={toast.actor.fullName}
                username={toast.actor.username}
                avatarUrl={toast.actor.avatarUrl}
                size="sm"
              />
            ) : null}

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-strong">
                  {TOAST_CATEGORY_LABELS[toast.category]}
                </span>
                <button
                  type="button"
                  onClick={() => notifications?.dismissToast(toast.id)}
                  aria-label="Fechar notificação"
                  className="rounded px-1 text-[11px] font-medium text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Fechar
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleOpenToast(toast)}
                className="block w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <p className="truncate text-xs font-bold text-foreground">
                  {toast.title}
                </p>
                {toast.body ? (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">
                    {toast.body}
                  </p>
                ) : null}
              </button>

              <div className="flex items-center justify-between gap-2 pt-1">
                {toast.linkHref ? (
                  <button
                    type="button"
                    onClick={() => handleOpenToast(toast)}
                    className="rounded text-[11px] font-semibold text-accent-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Abrir
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => handleMuteToastSource(toast)}
                  className="rounded text-[11px] font-medium text-muted hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {toast.conversationId && toast.category === "message"
                    ? "Mutar conversa"
                    : "Mutar tipo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
