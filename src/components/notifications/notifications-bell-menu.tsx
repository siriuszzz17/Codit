"use client";

import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { NotificationPreferencesPanel } from "@/components/notifications/notification-preferences-panel";
import { UserAvatar } from "@/components/social/user-avatar";
import { emitOpenFriendshipsDrawer } from "@/lib/social-events";
import type { NotificationCategory } from "@/lib/supabase/database.types";
import { useAuth } from "@/modules/auth/auth-provider";
import { mapRowCategoryToPrefKey } from "@/modules/notifications/notification-schemas";
import {
  useNotifications,
  type FeedNotificationItem,
} from "@/modules/notifications/notifications-provider";

type BellTab = "activity" | "preferences";
type ActivityFilter = "all" | "unread";

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  message: "Mensagem",
  voice_call: "Ligação de voz",
  project_like: "Curtida",
  project_comment: "Comentário",
  friend_request: "Amizade",
  friend_accepted: "Novo amigo",
  group_invite: "Grupo",
};

function formatNotificationTime(iso: string): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return "";
  }
  const diffMs = Date.now() - timestamp;
  if (diffMs >= 0 && diffMs < 60_000) {
    return "agora";
  }
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin > 0 && diffMin < 60) {
    return `${diffMin} min`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours > 0 && diffHours < 24) {
    return `${diffHours} h`;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(timestamp);
}

function CategoryMiniIcon({ category }: { category: NotificationCategory }) {
  switch (category) {
    case "message":
      return (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "voice_call":
      return (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      );
    case "project_like":
      return (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      );
    case "project_comment":
      return (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
      );
    case "friend_request":
    case "friend_accepted":
    case "group_invite":
      return (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
  }
}

export function NotificationsNavbarControl() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const {
    prefs,
    browserPermission,
    visibleItems,
    unreadBadgeCount,
    isLoading,
    migrationMissing,
    refreshNotifications,
    markItemAsRead,
    markAllAsRead,
    removeNotificationItem,
    clearRead,
    setCategoryEnabled,
    toggleConversationMute,
    requestBrowserPermission,
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BellTab>("activity");
  const [filter, setFilter] = useState<ActivityFilter>("all");

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const filteredItems = useMemo(() => {
    if (filter === "unread") {
      return visibleItems.filter((item) => item.isUnread);
    }
    return visibleItems;
  }, [filter, visibleItems]);

  if (!userId) {
    return null;
  }

  function handleOpenModal() {
    setOpen((current) => {
      const next = !current;
      if (next) {
        void refreshNotifications();
      }
      return next;
    });
  }

  async function handleSelectNotification(item: FeedNotificationItem) {
    await markItemAsRead(item);
    setOpen(false);

    if (item.category === "friend_request" && !item.linkHref) {
      emitOpenFriendshipsDrawer("requests");
      return;
    }

    if (item.linkHref) {
      router.push(item.linkHref);
    }
  }

  const hasReadItems = visibleItems.some(
    (item) => !item.isUnread && item.source !== "unread_conversation",
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleOpenModal}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          prefs.muteAll
            ? "Notificações silenciadas"
            : unreadBadgeCount > 0
              ? `Notificações (${unreadBadgeCount} não lidas)`
              : "Notificações"
        }
        title={prefs.muteAll ? "Notificações silenciadas" : "Notificações"}
        className={`relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border px-2.5 text-xs font-semibold transition-colors ${
          open
            ? "border-accent bg-accent-soft text-accent-strong"
            : "border-border bg-surface-muted/70 text-foreground hover:border-accent hover:text-accent-strong"
        }`}
      >
        {prefs.muteAll ? (
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="text-muted"
          >
            <path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" />
            <path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            <line x1="2" x2="22" y1="2" y2="22" />
          </svg>
        ) : (
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        )}

        {!prefs.muteAll && unreadBadgeCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
            {unreadBadgeCount > 9 ? "9+" : unreadBadgeCount}
          </span>
        ) : null}
      </button>

      {open && typeof document !== "undefined" ? createPortal((
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Central de notificações"
          className="codit-safe-modal fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs md:items-start md:justify-end md:bg-transparent md:backdrop-blur-none"
        >
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="absolute inset-0"
          />

          <div className="relative z-10 flex max-h-[calc(100dvh-var(--codit-safe-top)-var(--codit-safe-bottom)-1.5rem)] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-surface-elevated shadow-2xl md:mt-16 md:mr-6 md:max-h-[calc(100dvh-5.5rem)] md:w-[420px] md:rounded-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 pb-3 pt-4">
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  Notificações
                </h2>
                <p className="text-xs text-muted">
                  {prefs.muteAll
                    ? "Modo silencioso ativo no momento."
                    : unreadBadgeCount > 0
                      ? `${unreadBadgeCount} alerta(s) pendente(s).`
                      : "Tudo em dia por aqui."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border bg-surface-muted px-2.5 text-xs font-semibold text-foreground hover:border-accent"
              >
                Fechar
              </button>
            </div>

            {/* Abas Atividade / Preferências */}
            <div className="flex items-center gap-1 border-b border-border px-4 py-2">
              <button
                type="button"
                onClick={() => setActiveTab("activity")}
                className={`min-h-8 rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  activeTab === "activity"
                    ? "bg-accent text-accent-foreground"
                    : "text-muted hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                Atividade
                {unreadBadgeCount > 0 && !prefs.muteAll
                  ? ` (${unreadBadgeCount})`
                  : ""}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("preferences")}
                className={`min-h-8 rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  activeTab === "preferences"
                    ? "bg-accent text-accent-foreground"
                    : "text-muted hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                Preferências e mudo
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1.25rem+var(--codit-safe-bottom))] md:pb-4">
              {activeTab === "activity" && browserPermission === "default" ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/35 bg-accent-soft/40 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">
                      Receba alertas fora do Codit
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                      O sistema pode avisar quando o app estiver em segundo plano.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void requestBrowserPermission()}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90"
                  >
                    Ativar alertas
                  </button>
                </div>
              ) : browserPermission === "denied" && activeTab === "activity" ? (
                <p
                  role="status"
                  className="mb-3 rounded-xl border border-border bg-surface-muted/60 p-3 text-[11px] leading-relaxed text-muted"
                >
                  Alertas bloqueados nas configurações do sistema. Reative as notificações do Codit para receber avisos fora do app.
                </p>
              ) : null}

              {activeTab === "preferences" ? (
                <NotificationPreferencesPanel compact />
              ) : (
                <div className="space-y-3">
                  {migrationMissing ? (
                    <div
                      role="status"
                      className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-foreground"
                    >
                      <p className="font-semibold">
                        Histórico de notificações no banco ainda pendente
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        Alertas de mensagens e ligações já funcionam ao vivo.
                        Para receber curtidas, comentários e pedidos de amizade
                        salvos, execute{" "}
                        <code className="font-mono text-foreground">
                          20261124000004_add_notifications_system.sql
                        </code>{" "}
                        no Supabase.
                      </p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {(
                        [
                          { id: "all", label: "Todas" },
                          { id: "unread", label: "Não lidas" },
                        ] as const
                      ).map((tab) => {
                        const selected = filter === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setFilter(tab.id)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                              selected
                                ? "bg-foreground text-background"
                                : "bg-surface-muted text-muted hover:text-foreground"
                            }`}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2">
                      {unreadBadgeCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => void markAllAsRead()}
                          className="text-xs font-semibold text-accent-strong hover:underline"
                        >
                          Marcar lidas
                        </button>
                      ) : null}
                      {hasReadItems ? (
                        <button
                          type="button"
                          onClick={() => void clearRead()}
                          className="text-xs font-semibold text-muted hover:text-foreground hover:underline"
                        >
                          Limpar lidas
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {isLoading && filteredItems.length === 0 ? (
                    <div className="py-10 text-center text-xs text-muted">
                      Carregando notificações...
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-surface-muted/35 p-6 text-center">
                      <p className="text-sm font-semibold text-foreground">
                        {prefs.muteAll
                          ? "Notificações silenciadas"
                          : filter === "unread"
                            ? "Nenhuma notificação pendente"
                            : "Nenhuma atividade por aqui ainda"}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {prefs.muteAll
                          ? "Desative o modo silencioso na aba Preferências e mudo quando quiser voltar a ver alertas."
                          : "Mensagens, ligações de voz, curtidas, comentários e amizades aparecerão aqui."}
                      </p>
                      {prefs.muteAll ? (
                        <button
                          type="button"
                          onClick={() => setActiveTab("preferences")}
                          className="mt-3 inline-flex min-h-8 items-center justify-center rounded-lg border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground hover:border-accent"
                        >
                          Ajustar preferências
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {filteredItems.map((item) => {
                        const prefKey = mapRowCategoryToPrefKey(item.category);
                        return (
                          <li
                            key={item.id}
                            className={`rounded-2xl border p-3 transition-colors ${
                              item.isUnread
                                ? "border-accent/45 bg-accent-soft/35"
                                : "border-border bg-surface/80"
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="shrink-0 pt-0.5">
                                {item.actor ? (
                                  <UserAvatar
                                    name={item.actor.fullName}
                                    username={item.actor.username}
                                    avatarUrl={item.actor.avatarUrl}
                                    size="sm"
                                  />
                                ) : (
                                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-muted text-accent-strong">
                                    <CategoryMiniIcon
                                      category={item.category}
                                    />
                                  </span>
                                )}
                              </div>

                              <div className="min-w-0 flex-1 space-y-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleSelectNotification(item)
                                  }
                                  className="block w-full text-left focus:outline-none"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                                      <CategoryMiniIcon
                                        category={item.category}
                                      />
                                      <span>
                                        {CATEGORY_LABELS[item.category]}
                                      </span>
                                    </span>
                                    <span className="flex items-center gap-1.5 text-[11px] text-muted">
                                      <span>
                                        {formatNotificationTime(item.createdAt)}
                                      </span>
                                      {item.isUnread ? (
                                        <span
                                          aria-label="Não lida"
                                          className="h-2 w-2 rounded-full bg-accent"
                                        />
                                      ) : null}
                                    </span>
                                  </div>

                                  <p className="mt-1 text-xs font-semibold leading-snug text-foreground">
                                    {item.title}
                                  </p>
                                  {item.body ? (
                                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted">
                                      {item.body}
                                    </p>
                                  ) : null}
                                </button>

                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  {item.category === "friend_request" ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void markItemAsRead(item);
                                        setOpen(false);
                                        emitOpenFriendshipsDrawer("requests");
                                      }}
                                      className="text-[11px] font-semibold text-accent-strong hover:underline"
                                    >
                                      Ver pedidos
                                    </button>
                                  ) : null}

                                  {item.conversationId &&
                                  (item.category === "message" ||
                                    item.category === "voice_call") ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleConversationMute(
                                          item.conversationId!,
                                        )
                                      }
                                      className="text-[11px] font-medium text-muted hover:text-foreground hover:underline"
                                    >
                                      Silenciar conversa
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCategoryEnabled(prefKey, false)
                                      }
                                      className="text-[11px] font-medium text-muted hover:text-foreground hover:underline"
                                    >
                                      Silenciar categoria
                                    </button>
                                  )}

                                  {item.source !== "unread_conversation" ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void removeNotificationItem(item)
                                      }
                                      className="ml-auto text-[11px] font-medium text-muted hover:text-foreground"
                                    >
                                      Remover
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ), document.body) : null}
    </div>
  );
}
