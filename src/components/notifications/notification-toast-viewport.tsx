"use client";

import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/social/user-avatar";
import type { NotificationCategory } from "@/lib/supabase/database.types";
import { mapRowCategoryToPrefKey } from "@/modules/notifications/notification-schemas";
import {
  useNotificationsOptional,
  type ActiveNotificationToast,
} from "@/modules/notifications/notifications-provider";

const TOAST_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  message: "Nova mensagem",
  voice_call: "Ligação de voz",
  project_like: "Projeto curtido",
  project_comment: "Novo comentário",
  friend_request: "Pedido de amizade",
  friend_accepted: "Amizade aceita",
  group_invite: "Convite de grupo",
};

export function NotificationToastViewport() {
  const router = useRouter();
  const notifications = useNotificationsOptional();

  if (!notifications || notifications.toasts.length === 0) {
    return null;
  }

  const { toasts, dismissToast, setCategoryEnabled, toggleConversationMute } =
    notifications;

  function handleOpenToast(toast: ActiveNotificationToast) {
    dismissToast(toast.id);
    if (toast.linkHref) {
      router.push(toast.linkHref);
    }
  }

  function handleMuteToastSource(toast: ActiveNotificationToast) {
    if (
      toast.conversationId &&
      (toast.category === "message" || toast.category === "voice_call")
    ) {
      toggleConversationMute(toast.conversationId);
    } else {
      setCategoryEnabled(mapRowCategoryToPrefKey(toast.category), false);
    }
    dismissToast(toast.id);
  }

  return (
    <div
      aria-live="polite"
      aria-label="Notificações em tempo real"
      className="pointer-events-none fixed inset-x-0 top-[calc(4rem+var(--codit-safe-top))] z-50 flex flex-col items-end gap-2 pl-[calc(0.75rem+var(--codit-safe-left))] pr-[calc(0.75rem+var(--codit-safe-right))] sm:left-auto sm:right-5 sm:w-96 sm:pl-0 sm:pr-0"
    >
      {toasts.map((toast) => (
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
                  onClick={() => dismissToast(toast.id)}
                  className="text-[11px] font-medium text-muted hover:text-foreground"
                >
                  Fechar
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleOpenToast(toast)}
                className="block w-full text-left focus:outline-none"
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
                    className="text-[11px] font-semibold text-accent-strong hover:underline"
                  >
                    Abrir
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => handleMuteToastSource(toast)}
                  className="text-[11px] font-medium text-muted hover:text-foreground hover:underline"
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
