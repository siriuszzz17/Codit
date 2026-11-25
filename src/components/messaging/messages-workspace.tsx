"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { CallStagePanel } from "@/components/messaging/call-stage-panel";
import { CreateGroupModal } from "@/components/messaging/create-group-modal";
import { GroupMembersModal } from "@/components/messaging/group-members-modal";
import { UserAvatar } from "@/components/social/user-avatar";
import {
  emitMessagesChanged,
  emitOpenFriendshipsDrawer,
  subscribeFriendshipsChanged,
  subscribeMessagesChanged,
} from "@/lib/social-events";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useIsOnline } from "@/lib/use-is-online";
import { useAuth } from "@/modules/auth/auth-provider";
import {
  MAX_GROUP_MEMBERS,
  MAX_MESSAGE_LENGTH,
} from "@/modules/messaging/messaging-schemas";
import {
  addGroupMembers,
  createGroupConversation,
  getOrCreateDirectConversation,
  leaveOrRemoveGroupMember,
  listConversationMessages,
  listUserConversations,
  markConversationRead,
  MessagingServiceError,
  renameGroupConversation,
  sendConversationMessage,
  softDeleteConversationMessage,
  type ChatMessageItem,
  type ConversationSummary,
} from "@/modules/messaging/messaging-service";
import { useVoiceCall } from "@/modules/messaging/voice-call-provider";
import { useNotificationsOptional } from "@/modules/notifications/notifications-provider";
import {
  listUserFriendships,
  type FriendshipListItem,
} from "@/modules/social/social-service";

type InboxFilter = "all" | "unread" | "groups";

const QUICK_EMOJIS = ["❤️", "🔥", "👏", "😂", "🚀", "👀", "💜", "✅"] as const;

function formatShortTime(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return "";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function formatInboxTimestamp(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const now = new Date();
  const target = new Date(timestamp);
  const diffMs = now.getTime() - timestamp;

  if (diffMs >= 0 && diffMs < 60_000) {
    return "agora";
  }

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  ).getTime();

  if (startOfTarget === startOfToday) {
    return formatShortTime(iso);
  }
  if (startOfToday - startOfTarget === 86_400_000) {
    return "ontem";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(target);
}

function formatDateSeparatorLabel(iso: string): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const now = new Date();
  const target = new Date(timestamp);
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  ).getTime();

  if (startOfTarget === startOfToday) {
    return "Hoje";
  }
  if (startOfToday - startOfTarget === 86_400_000) {
    return "Ontem";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: target.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(target);
}

function getDayKey(iso: string): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return "";
  }
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getFirstName(fullName: string | null | undefined, username?: string): string {
  const cleaned = fullName?.trim();
  if (cleaned) {
    return cleaned.split(/\s+/)[0] ?? cleaned;
  }
  return username ? `@${username}` : "Amigo";
}

export function MessagesWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedConversationId = searchParams.get("c");
  const requestedDirectFriendId = searchParams.get("dm");

  const isOnline = useIsOnline();
  const {
    user,
    profile,
    isLoading: isAuthLoading,
    isConfigured,
  } = useAuth();
  const userId = user?.id ?? null;

  const {
    activeCall,
    callError,
    isJoiningCall,
    isOutgoingRinging,
    ringingDeadlineMs,
    joinVoiceCall,
    leaveVoiceCall,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    switchCamera,
    toggleScreenShare,
    retryMicrophone,
    notifyConversationParticipants,
    clearCallError,
  } = useVoiceCall();
  const notifications = useNotificationsOptional();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [friends, setFriends] = useState<FriendshipListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    requestedConversationId,
  );
  const [mobileView, setMobileView] = useState<"list" | "thread">(
    requestedConversationId || requestedDirectFriendId ? "thread" : "list",
  );

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [conversationFilter, setConversationFilter] = useState("");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [messageInput, setMessageInput] = useState("");
  const [showEmojiTray, setShowEmojiTray] = useState(false);
  const [typingLabel, setTypingLabel] = useState<string | null>(null);

  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(isConfigured);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [creatingDirect, setCreatingDirect] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [newDirectModalOpen, setNewDirectModalOpen] = useState(false);
  const [newDirectSearch, setNewDirectSearch] = useState("");
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);

  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [permissionGrantMissing, setPermissionGrantMissing] = useState(false);

  const handledDmRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const convChannelRef = useRef<ReturnType<
    NonNullable<ReturnType<typeof getSupabaseClient>>["channel"]
  > | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef(0);

  const refreshWorkspace = useCallback(async () => {
    if (!userId || !isConfigured) {
      setConversations([]);
      setFriends([]);
      setIsInitialLoading(false);
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setIsInitialLoading(false);
      return;
    }

    try {
      const [conversationsData, friendshipsBundle] = await Promise.all([
        listUserConversations(userId, client),
        listUserFriendships(userId, client),
      ]);

      setConversations(conversationsData);
      setFriends(friendshipsBundle.friends);
      setWorkspaceError(null);
      setMigrationMissing(false);
      setPermissionGrantMissing(false);
    } catch (error) {
      if (error instanceof MessagingServiceError) {
        setPermissionGrantMissing(error.isPermissionGrantMissing);
        setMigrationMissing(
          error.isMigrationMissing && !error.isPermissionGrantMissing,
        );
      }
      setWorkspaceError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar suas mensagens.",
      );
    } finally {
      setIsInitialLoading(false);
    }
  }, [isConfigured, userId]);

  useEffect(() => {
    if (!isConfigured || isAuthLoading) {
      return;
    }

    void Promise.resolve().then(() => refreshWorkspace());
    const unsubFriends = subscribeFriendshipsChanged(() => {
      void refreshWorkspace();
    });
    const unsubMessages = subscribeMessagesChanged(() => {
      void refreshWorkspace();
    });

    return () => {
      unsubFriends();
      unsubMessages();
    };
  }, [isAuthLoading, isConfigured, refreshWorkspace]);

  useEffect(() => {
    if (requestedConversationId) {
      void Promise.resolve().then(() => {
        setSelectedId(requestedConversationId);
        setMobileView("thread");
      });
    }
  }, [requestedConversationId]);

  useEffect(() => {
    if (
      !requestedDirectFriendId ||
      !userId ||
      !isConfigured ||
      isAuthLoading ||
      handledDmRef.current === requestedDirectFriendId
    ) {
      return;
    }

    handledDmRef.current = requestedDirectFriendId;
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    void getOrCreateDirectConversation(userId, requestedDirectFriendId, client)
      .then(async (conversationId) => {
        await refreshWorkspace();
        setSelectedId(conversationId);
        setMobileView("thread");
        router.replace(`/mensagens?c=${encodeURIComponent(conversationId)}`);
      })
      .catch((error) => {
        setWorkspaceError(
          error instanceof Error
            ? error.message
            : "Não foi possível abrir a conversa com este amigo.",
        );
      });
  }, [
    isAuthLoading,
    isConfigured,
    refreshWorkspace,
    requestedDirectFriendId,
    router,
    userId,
  ]);

  const selectedSummary = useMemo(
    () =>
      conversations.find((item) => item.conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  useEffect(() => {
    notifications?.setActiveViewedConversationId(
      selectedSummary?.conversation.id ?? null,
    );
    return () => {
      notifications?.setActiveViewedConversationId(null);
    };
  }, [notifications, selectedSummary?.conversation.id]);

  const loadSelectedMessages = useCallback(
    async (conversationId: string) => {
      if (!userId || !isConfigured) {
        return;
      }
      const client = getSupabaseClient();
      if (!client) {
        return;
      }

      setLoadingMessages(true);
      try {
        const items = await listConversationMessages(
          userId,
          conversationId,
          { limit: 100 },
          client,
        );
        setMessages(items);
        await markConversationRead(userId, conversationId, client).catch(
          () => false,
        );
        setConversations((current) =>
          current.map((item) =>
            item.conversation.id === conversationId
              ? { ...item, unreadCount: 0 }
              : item,
          ),
        );
      } catch (error) {
        setWorkspaceError(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as mensagens desta conversa.",
        );
      } finally {
        setLoadingMessages(false);
      }
    },
    [isConfigured, userId],
  );

  useEffect(() => {
    if (!selectedId || !userId || !isConfigured) {
      void Promise.resolve().then(() => {
        setMessages([]);
        setTypingLabel(null);
      });
      return;
    }

    void Promise.resolve().then(() => loadSelectedMessages(selectedId));

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    const channel = client
      .channel(`codit:conv:${selectedId}`, {
        config: { broadcast: { self: false, ack: false } },
      })
      .on("broadcast", { event: "chat:message" }, () => {
        void loadSelectedMessages(selectedId);
        void refreshWorkspace();
      })
      .on("broadcast", { event: "chat:typing" }, (event) => {
        const raw =
          event && typeof event === "object" && "payload" in event
            ? (event.payload as { userId?: string; username?: string } | null)
            : null;
        if (!raw || raw.userId === userId || !raw.username) {
          return;
        }
        setTypingLabel(`@${raw.username} está digitando...`);
        if (typingTimeoutRef.current !== null) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
          setTypingLabel(null);
        }, 2500);
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        () => {
          void loadSelectedMessages(selectedId);
          void refreshWorkspace();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_conversation_members",
          filter: `conversation_id=eq.${selectedId}`,
        },
        () => {
          void refreshWorkspace();
        },
      )
      .subscribe();

    convChannelRef.current = channel;

    const onNativeReplySync = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      if (!detail?.conversationId || detail.conversationId === selectedId) {
        void loadSelectedMessages(selectedId);
        void refreshWorkspace();
      }
    };
    window.addEventListener("codit:native-reply-sent", onNativeReplySync);

    return () => {
      window.removeEventListener("codit:native-reply-sent", onNativeReplySync);
      convChannelRef.current = null;
      if (typingTimeoutRef.current !== null) {
        clearTimeout(typingTimeoutRef.current);
      }
      void client.removeChannel(channel);
    };
  }, [isConfigured, loadSelectedMessages, refreshWorkspace, selectedId, userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedId]);

  const totalUnreadCount = useMemo(
    () => conversations.reduce((sum, item) => sum + item.unreadCount, 0),
    [conversations],
  );

  const filteredConversations = useMemo(() => {
    const query = conversationFilter.trim().toLowerCase().replace(/^@+/, "");

    return conversations.filter((item) => {
      if (inboxFilter === "unread" && item.unreadCount === 0) {
        return false;
      }
      if (inboxFilter === "groups" && item.conversation.kind !== "group") {
        return false;
      }
      if (!query) {
        return true;
      }
      if (item.displayTitle.toLowerCase().includes(query)) {
        return true;
      }
      return item.members.some(
        ({ profile: memberProfile }) =>
          memberProfile.username.toLowerCase().includes(query) ||
          memberProfile.full_name.toLowerCase().includes(query),
      );
    });
  }, [conversationFilter, conversations, inboxFilter]);

  const filteredDirectFriends = useMemo(() => {
    const query = newDirectSearch.trim().toLowerCase().replace(/^@+/, "");
    if (!query) {
      return friends;
    }
    return friends.filter(
      ({ profile: friendProfile }) =>
        friendProfile.username.toLowerCase().includes(query) ||
        friendProfile.full_name.toLowerCase().includes(query),
    );
  }, [friends, newDirectSearch]);

  async function handleStartDirectConversation(friendId: string) {
    if (!userId || !isOnline) {
      setWorkspaceError("Conecte-se à internet para iniciar uma conversa.");
      return;
    }

    // Se já existe uma DM carregada com esse amigo, abrir instantaneamente.
    const existingDm = conversations.find(
      (item) =>
        item.conversation.kind === "direct" &&
        item.directPeer?.id === friendId,
    );
    if (existingDm) {
      setNewDirectModalOpen(false);
      setSelectedId(existingDm.conversation.id);
      setMobileView("thread");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    setCreatingDirect(true);
    setWorkspaceError(null);
    try {
      const conversationId = await getOrCreateDirectConversation(
        userId,
        friendId,
        client,
      );
      setNewDirectModalOpen(false);
      await refreshWorkspace();
      setSelectedId(conversationId);
      setMobileView("thread");
    } catch (error) {
      setWorkspaceError(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir a conversa com este amigo.",
      );
    } finally {
      setCreatingDirect(false);
    }
  }

  async function handleCreateGroup(title: string, memberIds: string[]) {
    if (!userId || !isOnline) {
      setWorkspaceError("Conecte-se à internet para criar um grupo.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    setCreatingGroup(true);
    setWorkspaceError(null);
    try {
      const groupId = await createGroupConversation(
        userId,
        { title, memberIds },
        client,
      );
      setCreateGroupModalOpen(false);
      await refreshWorkspace();
      setSelectedId(groupId);
      setMobileView("thread");
      emitMessagesChanged();
    } catch (error) {
      setWorkspaceError(
        error instanceof Error ? error.message : "Não foi possível criar o grupo.",
      );
    } finally {
      setCreatingGroup(false);
    }
  }

  function handleMessageInputChange(nextValue: string) {
    setMessageInput(nextValue);

    const now = Date.now();
    if (
      convChannelRef.current &&
      userId &&
      profile?.username &&
      nextValue.trim() &&
      now - lastTypingSentAtRef.current > 1800
    ) {
      lastTypingSentAtRef.current = now;
      void convChannelRef.current.send({
        type: "broadcast",
        event: "chat:typing",
        payload: {
          userId,
          username: profile.username,
        },
      });
    }
  }

  async function sendTextPayload(rawContent: string, clearComposer: boolean) {
    if (!userId || !selectedSummary || !isOnline || sendingMessage) {
      return;
    }

    const trimmed = rawContent.trim();
    if (!trimmed) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    setSendingMessage(true);
    setWorkspaceError(null);
    try {
      const created = await sendConversationMessage(
        userId,
        selectedSummary.conversation.id,
        trimmed,
        client,
      );
      if (clearComposer) {
        setMessageInput("");
        setShowEmojiTray(false);
      }
      setMessages((current) => [...current, created]);

      if (convChannelRef.current) {
        void convChannelRef.current.send({
          type: "broadcast",
          event: "chat:message",
          payload: {
            messageId: created.message.id,
            senderId: userId,
          },
        });
      }

      const recipientIds = selectedSummary.members
        .map((item) => item.member.user_id)
        .filter((id) => id !== userId);
      const localSenderName =
        profile?.full_name?.trim() ||
        (typeof user?.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : "") ||
        "Estudante Codit";
      void notifyConversationParticipants(recipientIds, "message:notify", {
        conversationId: selectedSummary.conversation.id,
        conversationTitle: selectedSummary.displayTitle,
        isGroup: selectedSummary.conversation.kind === "group",
        senderId: userId,
        senderName: localSenderName,
        senderUsername: profile?.username ?? undefined,
        senderAvatarUrl: profile?.avatar_url ?? null,
        preview: trimmed.slice(0, 140),
        sentAt: created.message.created_at,
      });

      await refreshWorkspace();
      emitMessagesChanged();
    } catch (error) {
      setWorkspaceError(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a mensagem.",
      );
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleSendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await sendTextPayload(messageInput, true);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
    }
  }

  function handleInsertEmoji(emoji: string) {
    setMessageInput((current) => `${current}${emoji}`);
    setShowEmojiTray(false);
    composerRef.current?.focus();
  }

  async function handleDeleteMessage(messageId: string) {
    if (!userId || !isOnline) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    try {
      const deleted = await softDeleteConversationMessage(
        userId,
        messageId,
        client,
      );
      if (deleted) {
        setMessages((current) =>
          current.filter((item) => item.message.id !== messageId),
        );
        await refreshWorkspace();
      }
    } catch (error) {
      setWorkspaceError(
        error instanceof Error
          ? error.message
          : "Não foi possível apagar esta mensagem.",
      );
    }
  }

  if (!isConfigured) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-foreground">
          <h1 className="text-lg font-bold">Mensagens indisponíveis</h1>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            Configure <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            e <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> no{" "}
            <code className="font-mono">.env.local</code> para habilitar o chat
            entre amigos, grupos e chamadas de voz.
          </p>
        </div>
      </main>
    );
  }

  if (isAuthLoading || isInitialLoading) {
    return (
      <main className="mx-auto flex w-full max-w-5xl items-center justify-center px-4 py-16">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm text-muted">Carregando suas mensagens...</p>
        </div>
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <section className="space-y-4 rounded-3xl border border-border bg-surface p-7 text-center shadow-xs">
          <div className="flex justify-center">
            <OctopyBadge
              size={64}
              variant="headphones"
              decorative={false}
              className="rounded-2xl shadow-sm"
            />
          </div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">
            Mensagens, Grupos e Voz no Codit
          </h1>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted">
            Entre na sua conta para conversar com seus amigos aceitos, criar
            grupos de até {MAX_GROUP_MEMBERS} pessoas e fazer chamadas de voz
            com compartilhamento de tela.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/auth"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:opacity-90"
            >
              Entrar / Criar conta
            </Link>
            <Link
              href="/comunidade"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm font-semibold text-foreground hover:border-accent"
            >
              Explorar Comunidade
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const activeCallInSelected =
    selectedSummary &&
    activeCall?.conversationId === selectedSummary.conversation.id
      ? activeCall
      : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col px-0 py-0 sm:px-4 sm:py-3 md:px-6">
      {(permissionGrantMissing || migrationMissing) && (
        <div
          role="alert"
          className="mx-3 my-2 space-y-1 rounded-2xl border border-amber-500/45 bg-amber-500/10 p-3.5 text-xs text-foreground sm:mx-0"
        >
          <p className="font-bold">
            {permissionGrantMissing
              ? "Permissões SQL pendentes no Supabase (código 42501)"
              : "Migração do sistema de mensagens pendente no Supabase"}
          </p>
          <p className="text-muted">
            Execute{" "}
            <code className="font-mono text-foreground">
              supabase/migrations/20261124000002_add_embedded_messaging.sql
            </code>{" "}
            no SQL Editor do Supabase e atualize a página.
          </p>
        </div>
      )}

      {workspaceError && !migrationMissing && !permissionGrantMissing ? (
        <div
          role="alert"
          className="mx-3 my-2 flex items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs font-medium text-foreground sm:mx-0"
        >
          <span>{workspaceError}</span>
          <button
            type="button"
            onClick={() => setWorkspaceError(null)}
            className="shrink-0 font-semibold text-accent-strong hover:underline"
          >
            Fechar
          </button>
        </div>
      ) : null}

      {/* Erro de chamada de voz visível mesmo se a chamada não tiver permanecido aberta */}
      {callError && !activeCallInSelected ? (
        <div
          role="alert"
          className="mx-3 my-2 flex items-center justify-between gap-3 rounded-2xl border border-amber-500/45 bg-amber-500/10 px-4 py-2.5 text-xs font-medium text-foreground sm:mx-0"
        >
          <span>{callError}</span>
          <button
            type="button"
            onClick={clearCallError}
            className="shrink-0 font-semibold text-accent-strong hover:underline"
          >
            Fechar
          </button>
        </div>
      ) : null}

      {/* Container estilo Instagram Direct */}
      <section className="flex h-[calc(100dvh-3.5rem-4.25rem-var(--codit-safe-top)-var(--codit-safe-bottom))] min-h-[460px] flex-col overflow-hidden bg-surface sm:rounded-3xl sm:border sm:border-border sm:shadow-sm md:grid md:h-[calc(100dvh-5.5rem)] md:grid-cols-[340px_1fr]">
        {/* Coluna Esquerda: Inbox & Conexões Rápidas */}
        <aside
          className={`flex min-h-0 flex-1 flex-col border-border md:border-r ${
            mobileView === "thread" && selectedSummary ? "hidden md:flex" : "flex"
          }`}
        >
          {/* Topo do Inbox */}
          <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-base font-extrabold tracking-tight text-foreground sm:text-lg">
                {profile?.username ? `@${profile.username}` : "Mensagens"}
              </h1>
              {totalUnreadCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-foreground">
                  {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => emitOpenFriendshipsDrawer("friends")}
                title="Gerenciar amigos"
                className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-surface-muted/70 px-3 text-xs font-semibold text-foreground transition-colors hover:border-accent"
              >
                Amigos ({friends.length})
              </button>
              <button
                type="button"
                onClick={() => setCreateGroupModalOpen(true)}
                title={`Criar grupo (até ${MAX_GROUP_MEMBERS} pessoas)`}
                aria-label="Criar grupo"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-muted/70 text-foreground transition-colors hover:border-accent hover:text-accent-strong"
              >
                <svg
                  width="16"
                  height="16"
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
                  <line x1="19" x2="19" y1="8" y2="14" />
                  <line x1="22" x2="16" y1="11" y2="11" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setNewDirectModalOpen(true)}
                title="Nova conversa com amigo"
                aria-label="Nova conversa"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity hover:opacity-90"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Busca estilo pill */}
          <div className="px-4 py-1.5">
            <div className="relative flex items-center">
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
                className="pointer-events-none absolute left-3.5 text-muted"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={conversationFilter}
                onChange={(event) => setConversationFilter(event.target.value)}
                placeholder="Pesquisar conversas ou @amigos..."
                aria-label="Pesquisar conversas"
                className="min-h-9 w-full rounded-full border border-border/80 bg-surface-muted/65 py-1.5 pl-9 pr-3.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:bg-background focus:outline-none"
              />
            </div>
          </div>

          {/* Faixa horizontal estilo Instagram Direct: iniciar conversa em 1 toque */}
          <div className="border-b border-border/70 px-4 py-2.5">
            {friends.length === 0 ? (
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface-muted/60 px-3 py-2">
                <p className="text-[11px] text-muted">
                  Adicione amigos por <code className="font-mono">@</code> para
                  conversar aqui.
                </p>
                <button
                  type="button"
                  onClick={() => emitOpenFriendshipsDrawer("find")}
                  className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground hover:opacity-90"
                >
                  Buscar @
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-3 overflow-x-auto pb-0.5 codit-no-scrollbar">
                <button
                  type="button"
                  onClick={() => setCreateGroupModalOpen(true)}
                  className="flex w-14 shrink-0 flex-col items-center gap-1 text-center"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-accent/60 bg-accent-soft/50 text-sm font-bold text-accent-strong transition-transform hover:scale-105">
                    +G
                  </span>
                  <span className="w-full truncate text-[11px] font-medium text-muted">
                    Grupo
                  </span>
                </button>

                {friends.map(({ profile: friend }) => (
                  <button
                    key={friend.id}
                    type="button"
                    disabled={creatingDirect || !isOnline}
                    onClick={() => void handleStartDirectConversation(friend.id)}
                    className="flex w-14 shrink-0 flex-col items-center gap-1 text-center disabled:opacity-60"
                  >
                    <span className="rounded-full p-0.5 ring-2 ring-accent/40 transition-transform hover:scale-105">
                      <UserAvatar
                        name={friend.full_name}
                        username={friend.username}
                        avatarUrl={friend.avatar_url}
                        size="md"
                        className="rounded-full"
                      />
                    </span>
                    <span className="w-full truncate text-[11px] font-medium text-foreground">
                      {getFirstName(friend.full_name, friend.username)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Abas de filtro (Tudo / Não lidas / Grupos) */}
          <div className="flex items-center gap-1.5 border-b border-border/60 px-4 py-2">
            {(
              [
                { id: "all", label: "Tudo" },
                {
                  id: "unread",
                  label:
                    totalUnreadCount > 0
                      ? `Não lidas (${totalUnreadCount})`
                      : "Não lidas",
                },
                { id: "groups", label: "Grupos" },
              ] as const
            ).map((tab) => {
              const active = inboxFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setInboxFilter(tab.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-foreground text-background"
                      : "bg-surface-muted/70 text-muted hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Lista de conversas */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {filteredConversations.length === 0 ? (
              <div className="m-2 space-y-3 rounded-2xl border border-dashed border-border bg-surface-muted/30 p-6 text-center">
                <p className="text-sm font-semibold text-foreground">
                  {inboxFilter === "unread"
                    ? "Nenhuma mensagem não lida"
                    : inboxFilter === "groups"
                      ? "Você ainda não está em nenhum grupo"
                      : "Sua caixa de entrada está vazia"}
                </p>
                <p className="text-xs text-muted">
                  Toque em um amigo acima ou crie um grupo com até{" "}
                  {MAX_GROUP_MEMBERS} pessoas.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNewDirectModalOpen(true)}
                    className="inline-flex min-h-9 items-center justify-center rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
                  >
                    Nova mensagem
                  </button>
                </div>
              </div>
            ) : (
              <ul className="space-y-1">
                {filteredConversations.map((item) => {
                  const isSelected = item.conversation.id === selectedId;
                  const isCallHere =
                    activeCall?.conversationId === item.conversation.id;
                  const peer = item.directPeer;
                  const hasUnread = item.unreadCount > 0;
                  const isMutedConv =
                    notifications?.isConversationMuted(item.conversation.id) ??
                    false;

                  return (
                    <li key={item.conversation.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(item.conversation.id);
                          setMobileView("thread");
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                          isSelected
                            ? "bg-accent-soft/65"
                            : "hover:bg-surface-muted/60"
                        }`}
                      >
                        <div className="relative shrink-0">
                          {item.conversation.kind === "group" ? (
                            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-gradient-to-br from-accent-soft to-surface-muted text-sm font-extrabold text-accent-strong">
                              G{item.activeMemberCount}
                            </span>
                          ) : (
                            <UserAvatar
                              name={peer?.full_name ?? item.displayTitle}
                              username={peer?.username}
                              avatarUrl={peer?.avatar_url}
                              size="md"
                              className="rounded-full"
                            />
                          )}
                          {isCallHere ? (
                            <span
                              aria-label="Chamada de voz ativa"
                              className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-surface bg-emerald-500"
                            />
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className={`flex items-center gap-1.5 truncate text-sm ${
                                hasUnread
                                  ? "font-extrabold text-foreground"
                                  : "font-semibold text-foreground"
                              }`}
                            >
                              <span className="truncate">
                                {item.displayTitle}
                              </span>
                              {isMutedConv ? (
                                <span
                                  aria-label="Conversa silenciada"
                                  title="Notificações silenciadas"
                                  className="inline-flex shrink-0 text-muted"
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" />
                                    <path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" />
                                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                                    <line x1="2" x2="22" y1="2" y2="22" />
                                  </svg>
                                </span>
                              ) : null}
                            </p>
                            <span
                              className={`shrink-0 text-[11px] ${
                                hasUnread
                                  ? "font-bold text-accent-strong"
                                  : "text-muted"
                              }`}
                            >
                              {formatInboxTimestamp(
                                item.conversation.last_message_at ??
                                  item.conversation.updated_at,
                              )}
                            </span>
                          </div>

                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <p
                              className={`truncate text-xs ${
                                hasUnread
                                  ? "font-semibold text-foreground"
                                  : "text-muted"
                              }`}
                            >
                              {isCallHere
                                ? "Chamada de voz em andamento..."
                                : item.conversation.last_message_preview ||
                                  (item.conversation.kind === "group"
                                    ? `${item.activeMemberCount}/${MAX_GROUP_MEMBERS} participantes`
                                    : peer
                                      ? `@${peer.username} · toque para conversar`
                                      : "Conversa direta")}
                            </p>

                            {hasUnread ? (
                              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
                                {item.unreadCount > 9 ? "9+" : item.unreadCount}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Coluna Direita: Thread estilo Instagram Direct */}
        <div
          className={`flex min-h-0 flex-1 flex-col ${
            mobileView === "list" || !selectedSummary ? "hidden md:flex" : "flex"
          }`}
        >
          {!selectedSummary ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3.5 p-8 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-border bg-surface-muted/60">
                <OctopyBadge
                  size={52}
                  variant="happy"
                  decorative={false}
                  className="rounded-full"
                />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-foreground">
                  Suas mensagens no Codit
                </h2>
                <p className="max-w-sm text-xs leading-relaxed text-muted sm:text-sm">
                  Envie mensagens diretas aos seus amigos, crie grupos de até{" "}
                  {MAX_GROUP_MEMBERS} pessoas e faça chamadas de voz com
                  compartilhamento de tela.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setNewDirectModalOpen(true)}
                  className="inline-flex min-h-10 items-center justify-center rounded-full bg-accent px-5 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90"
                >
                  Enviar mensagem
                </button>
                <button
                  type="button"
                  onClick={() => setCreateGroupModalOpen(true)}
                  className="inline-flex min-h-10 items-center justify-center rounded-full border border-border bg-surface-muted px-5 py-2 text-xs font-semibold text-foreground hover:border-accent"
                >
                  Criar grupo
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Topbar da conversa */}
              <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setMobileView("list")}
                    aria-label="Voltar para conversas"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-surface-muted md:hidden"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>

                  {selectedSummary.conversation.kind === "group" ? (
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-accent-soft text-xs font-extrabold text-accent-strong">
                      G{selectedSummary.activeMemberCount}
                    </span>
                  ) : (
                    <UserAvatar
                      name={
                        selectedSummary.directPeer?.full_name ??
                        selectedSummary.displayTitle
                      }
                      username={selectedSummary.directPeer?.username}
                      avatarUrl={selectedSummary.directPeer?.avatar_url}
                      size="sm"
                      className="rounded-full"
                    />
                  )}

                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold text-foreground sm:text-base">
                      {selectedSummary.displayTitle}
                    </h2>
                    <p className="truncate text-[11px] text-muted">
                      {selectedSummary.conversation.kind === "group"
                        ? `${selectedSummary.activeMemberCount}/${MAX_GROUP_MEMBERS} participantes · voz, vídeo e tela`
                        : selectedSummary.directPeer
                          ? `@${selectedSummary.directPeer.username} · ${
                              selectedSummary.isDirectFriendActive
                                ? "Amigo no Codit"
                                : "Amizade encerrada"
                            }`
                          : "Conversa direta"}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {notifications ? (
                    <button
                      type="button"
                      onClick={() =>
                        notifications.toggleConversationMute(
                          selectedSummary.conversation.id,
                        )
                      }
                      title={
                        notifications.isConversationMuted(
                          selectedSummary.conversation.id,
                        )
                          ? "Reativar notificações desta conversa"
                          : "Silenciar notificações desta conversa"
                      }
                      aria-label={
                        notifications.isConversationMuted(
                          selectedSummary.conversation.id,
                        )
                          ? "Reativar notificações desta conversa"
                          : "Silenciar notificações desta conversa"
                      }
                      className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border px-2.5 text-xs font-semibold transition-colors ${
                        notifications.isConversationMuted(
                          selectedSummary.conversation.id,
                        )
                          ? "border-amber-500/50 bg-amber-500/15 text-foreground"
                          : "border-border bg-surface-muted text-muted hover:border-accent hover:text-foreground"
                      }`}
                    >
                      {notifications.isConversationMuted(
                        selectedSummary.conversation.id,
                      ) ? (
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
                          <path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" />
                          <path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" />
                          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                          <line x1="2" x2="22" y1="2" y2="22" />
                        </svg>
                      ) : (
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
                          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                        </svg>
                      )}
                    </button>
                  ) : null}

                  {activeCallInSelected ? (
                    <button
                      type="button"
                      onClick={() => void leaveVoiceCall()}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
                    >
                      Sair da chamada
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={
                          isJoiningCall ||
                          !selectedSummary.canSendMessages ||
                          !isOnline
                        }
                        onClick={() => void joinVoiceCall(selectedSummary)}
                        title="Iniciar chamada de voz"
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-55"
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
                        <span>{isJoiningCall ? "Conectando..." : "Voz"}</span>
                      </button>

                      <button
                        type="button"
                        disabled={
                          isJoiningCall ||
                          !selectedSummary.canSendMessages ||
                          !isOnline
                        }
                        onClick={() =>
                          void joinVoiceCall(selectedSummary, {
                            withVideo: true,
                          })
                        }
                        title="Iniciar chamada de vídeo"
                        aria-label="Iniciar chamada de vídeo"
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-55"
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
                        <span className="hidden sm:inline">Vídeo</span>
                      </button>
                    </>
                  )}

                  {selectedSummary.conversation.kind === "group" ? (
                    <button
                      type="button"
                      onClick={() => setMembersModalOpen(true)}
                      aria-label="Gerenciar membros do grupo"
                      className="inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent"
                    >
                      Membros ({selectedSummary.activeMemberCount}/
                      {MAX_GROUP_MEMBERS})
                    </button>
                  ) : selectedSummary.directPeer ? (
                    <Link
                      href={`/comunidade/perfil?u=${encodeURIComponent(selectedSummary.directPeer.username)}`}
                      className="inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent"
                    >
                      Perfil
                    </Link>
                  ) : null}
                </div>
              </header>

              {/* Painel de chamada de voz, vídeo e compartilhamento de tela */}
              {activeCallInSelected ? (
                <CallStagePanel
                  activeCall={activeCallInSelected}
                  currentUserId={userId}
                  callError={callError}
                  isOutgoingRinging={isOutgoingRinging}
                  ringingDeadlineMs={ringingDeadlineMs}
                  targetPeer={
                    selectedSummary.directPeer
                      ? {
                          fullName: selectedSummary.directPeer.full_name,
                          username: selectedSummary.directPeer.username,
                          avatarUrl: selectedSummary.directPeer.avatar_url,
                        }
                      : null
                  }
                  onToggleMute={toggleMute}
                  onToggleDeafen={toggleDeafen}
                  onToggleCamera={toggleCamera}
                  onSwitchCamera={switchCamera}
                  onToggleScreenShare={toggleScreenShare}
                  onRetryMicrophone={retryMicrophone}
                  onLeaveCall={leaveVoiceCall}
                  onDismissError={clearCallError}
                />
              ) : null}

              {/* Histórico de mensagens com agrupamento estilo Instagram Direct */}
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-4 sm:px-5">
                {/* Cartão de introdução no topo da conversa */}
                <div className="mb-6 flex flex-col items-center space-y-2 border-b border-border/50 pb-5 text-center">
                  {selectedSummary.conversation.kind === "group" ? (
                    <>
                      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-border bg-accent-soft text-lg font-extrabold text-accent-strong">
                        G{selectedSummary.activeMemberCount}
                      </span>
                      <div>
                        <p className="text-base font-bold text-foreground">
                          {selectedSummary.displayTitle}
                        </p>
                        <p className="text-xs text-muted">
                          Grupo Codit · {selectedSummary.activeMemberCount} de{" "}
                          {MAX_GROUP_MEMBERS} pessoas · Voz e compartilhamento de
                          tela
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMembersModalOpen(true)}
                        className="rounded-full border border-border bg-surface-muted px-3.5 py-1 text-xs font-semibold text-foreground hover:border-accent"
                      >
                        Ver participantes
                      </button>
                    </>
                  ) : (
                    <>
                      <UserAvatar
                        name={
                          selectedSummary.directPeer?.full_name ??
                          selectedSummary.displayTitle
                        }
                        username={selectedSummary.directPeer?.username}
                        avatarUrl={selectedSummary.directPeer?.avatar_url}
                        size="lg"
                        className="rounded-full"
                      />
                      <div>
                        <p className="text-base font-bold text-foreground">
                          {selectedSummary.displayTitle}
                        </p>
                        {selectedSummary.directPeer ? (
                          <p className="font-mono text-xs text-accent-strong">
                            @{selectedSummary.directPeer.username} · Codit
                          </p>
                        ) : null}
                      </div>
                      {selectedSummary.directPeer ? (
                        <Link
                          href={`/comunidade/perfil?u=${encodeURIComponent(selectedSummary.directPeer.username)}`}
                          className="rounded-full border border-border bg-surface-muted px-3.5 py-1 text-xs font-semibold text-foreground hover:border-accent"
                        >
                          Ver perfil
                        </Link>
                      ) : null}
                    </>
                  )}
                </div>

                {loadingMessages && messages.length === 0 ? (
                  <div className="py-10 text-center text-xs text-muted">
                    Carregando mensagens...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted">
                    Envie um oi ou comece uma chamada de voz acima!
                  </div>
                ) : (
                  messages.map(({ message, sender }, index) => {
                    const prev = messages[index - 1]?.message;
                    const next = messages[index + 1]?.message;
                    const showDateDivider =
                      !prev ||
                      getDayKey(prev.created_at) !==
                        getDayKey(message.created_at);

                    if (message.message_type === "system") {
                      return (
                        <div key={message.id} className="space-y-2 py-1">
                          {showDateDivider ? (
                            <div className="flex justify-center py-2">
                              <span className="text-[11px] font-semibold text-muted">
                                {formatDateSeparatorLabel(message.created_at)}
                              </span>
                            </div>
                          ) : null}
                          <div className="flex justify-center">
                            <span className="rounded-full border border-border bg-surface-muted px-3 py-1 text-[11px] text-muted">
                              {message.content}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    const isOwn = message.sender_id === userId;
                    const prevSameSender =
                      Boolean(prev) &&
                      prev?.message_type === "text" &&
                      prev?.sender_id === message.sender_id &&
                      !showDateDivider &&
                      Math.abs(
                        Date.parse(message.created_at) -
                          Date.parse(prev.created_at),
                      ) < 180_000;

                    const nextSameSender =
                      Boolean(next) &&
                      next?.message_type === "text" &&
                      next?.sender_id === message.sender_id &&
                      getDayKey(next.created_at) ===
                        getDayKey(message.created_at) &&
                      Math.abs(
                        Date.parse(next.created_at) -
                          Date.parse(message.created_at),
                      ) < 180_000;

                    const bubbleRadius = isOwn
                      ? `${prevSameSender ? "rounded-tr-md" : "rounded-tr-2xl"} ${
                          nextSameSender ? "rounded-br-md" : "rounded-br-2xl"
                        } rounded-l-2xl`
                      : `${prevSameSender ? "rounded-tl-md" : "rounded-tl-2xl"} ${
                          nextSameSender ? "rounded-bl-md" : "rounded-bl-2xl"
                        } rounded-r-2xl`;

                    return (
                      <div key={message.id} className="space-y-1">
                        {showDateDivider ? (
                          <div className="flex justify-center py-2.5">
                            <span className="rounded-full bg-surface-muted/75 px-3 py-0.5 text-[11px] font-semibold text-muted">
                              {formatDateSeparatorLabel(message.created_at)}
                            </span>
                          </div>
                        ) : null}

                        <div
                          className={`group flex items-end gap-2 ${
                            isOwn ? "justify-end" : "justify-start"
                          } ${prevSameSender ? "mt-0.5" : "mt-2.5"}`}
                        >
                          {!isOwn ? (
                            <div className="w-7 shrink-0">
                              {!nextSameSender ? (
                                <UserAvatar
                                  name={sender?.full_name ?? "Amigo"}
                                  username={sender?.username}
                                  avatarUrl={sender?.avatar_url}
                                  size="sm"
                                  className="h-7 w-7 rounded-full"
                                />
                              ) : null}
                            </div>
                          ) : null}

                          <div
                            className={`max-w-[78%] space-y-0.5 sm:max-w-[66%] ${
                              isOwn ? "items-end" : "items-start"
                            } flex flex-col`}
                          >
                            {!isOwn &&
                            !prevSameSender &&
                            selectedSummary.conversation.kind === "group" ? (
                              <p className="px-2 text-[11px] font-semibold text-muted">
                                {sender?.full_name ?? "Participante"}{" "}
                                {sender?.username ? (
                                  <span className="font-mono opacity-80">
                                    @{sender.username}
                                  </span>
                                ) : null}
                              </p>
                            ) : null}

                            <div
                              className={`px-3.5 py-2 ${bubbleRadius} ${
                                isOwn
                                  ? "bg-accent text-accent-foreground"
                                  : "bg-surface-muted text-foreground"
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                {message.content}
                              </p>
                            </div>

                            {!nextSameSender || isOwn ? (
                              <div
                                className={`flex items-center gap-2 px-1.5 text-[10px] text-muted ${
                                  nextSameSender
                                    ? "opacity-0 transition-opacity group-hover:opacity-100"
                                    : ""
                                }`}
                              >
                                <span>
                                  {formatShortTime(message.created_at)}
                                </span>
                                {isOwn ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleDeleteMessage(message.id)
                                    }
                                    className="font-medium hover:text-foreground hover:underline"
                                  >
                                    Apagar
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {typingLabel ? (
                  <div className="flex items-center gap-2 pl-9 pt-1">
                    <span className="inline-flex items-center gap-1 rounded-2xl bg-surface-muted px-3 py-1.5 text-[11px] font-medium text-muted">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
                      <span>{typingLabel}</span>
                    </span>
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer estilo Instagram Direct */}
              <footer className="border-t border-border bg-surface px-3 py-2.5 sm:px-4 sm:py-3">
                {!selectedSummary.canSendMessages ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-foreground">
                    <p>
                      Apenas <strong>amigos aceitos</strong> podem enviar
                      mensagens ou iniciar chamadas de voz entre si.
                    </p>
                    {selectedSummary.directPeer ? (
                      <Link
                        href={`/comunidade/perfil?u=${encodeURIComponent(selectedSummary.directPeer.username)}`}
                        className="inline-flex min-h-8 items-center justify-center rounded-full border border-border bg-surface px-3 py-1 font-semibold text-accent-strong hover:border-accent"
                      >
                        Abrir perfil de @{selectedSummary.directPeer.username}
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {showEmojiTray ? (
                      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-surface-muted/75 px-2.5 py-1.5">
                        {QUICK_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleInsertEmoji(emoji)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-base transition-transform hover:scale-110 hover:bg-surface"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <form
                      onSubmit={(event) => void handleSendMessage(event)}
                      className="flex items-end gap-2 rounded-3xl border border-border bg-surface-muted/65 px-2.5 py-1.5 focus-within:border-accent"
                    >
                      <button
                        type="button"
                        onClick={() => setShowEmojiTray((prev) => !prev)}
                        aria-label="Inserir emoji"
                        title="Emojis rápidos"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                          <line x1="9" x2="9.01" y1="9" y2="9" />
                          <line x1="15" x2="15.01" y1="9" y2="9" />
                        </svg>
                      </button>

                      <label htmlFor="codit-message-composer" className="sr-only">
                        Escrever mensagem
                      </label>
                      <textarea
                        ref={composerRef}
                        id="codit-message-composer"
                        rows={1}
                        maxLength={MAX_MESSAGE_LENGTH}
                        value={messageInput}
                        onChange={(event) =>
                          handleMessageInputChange(event.target.value)
                        }
                        onKeyDown={handleComposerKeyDown}
                        disabled={!isOnline || sendingMessage}
                        placeholder={
                          isOnline ? "Mensagem..." : "Sem conexão com a internet..."
                        }
                        className="max-h-28 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-2 text-base text-foreground placeholder:text-muted focus:outline-none sm:text-sm"
                      />

                      {messageInput.trim() ? (
                        <button
                          type="submit"
                          disabled={!isOnline || sendingMessage}
                          className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-accent px-4 text-xs font-bold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                          {sendingMessage ? "..." : "Enviar"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!isOnline || sendingMessage}
                          onClick={() => void sendTextPayload("❤️", false)}
                          title="Enviar curtida rápida"
                          aria-label="Enviar coração"
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base transition-transform hover:scale-110 hover:bg-surface disabled:opacity-55"
                        >
                          ❤️
                        </button>
                      )}
                    </form>
                  </div>
                )}
              </footer>
            </>
          )}
        </div>
      </section>

      {/* Modal: Nova conversa direta (exclusiva para amigos aceitos) */}
      {newDirectModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="codit-new-direct-title"
          className="codit-safe-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs"
        >
          <div
            aria-hidden="true"
            onClick={() => setNewDirectModalOpen(false)}
            className="fixed inset-0"
          />

          <div className="relative z-10 flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-border bg-surface-elevated shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2
                  id="codit-new-direct-title"
                  className="text-base font-bold text-foreground"
                >
                  Nova mensagem
                </h2>
                <p className="text-xs text-muted">
                  Somente amigos aceitos podem trocar mensagens diretas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewDirectModalOpen(false)}
                className="inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-surface-muted px-3 text-xs font-semibold text-foreground"
              >
                Fechar
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {friends.length === 0 ? (
                <div className="space-y-3 rounded-2xl border border-dashed border-border bg-surface-muted/35 p-5 text-center">
                  <p className="text-sm font-semibold text-foreground">
                    Você ainda não possui amigos aceitos.
                  </p>
                  <p className="text-xs text-muted">
                    Adicione pessoas por <code className="font-mono">@usuário</code>{" "}
                    para liberar mensagens e chamadas de voz.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setNewDirectModalOpen(false);
                      emitOpenFriendshipsDrawer("find");
                    }}
                    className="inline-flex min-h-10 items-center justify-center rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90"
                  >
                    Buscar pessoas por @
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="search"
                    value={newDirectSearch}
                    onChange={(event) => setNewDirectSearch(event.target.value)}
                    placeholder="Filtrar amigos por @usuário ou nome..."
                    aria-label="Filtrar amigos"
                    className="min-h-9 w-full rounded-full border border-border bg-background px-3.5 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <ul className="space-y-2">
                    {filteredDirectFriends.map(({ profile: friend }) => (
                      <li key={friend.id}>
                        <button
                          type="button"
                          disabled={creatingDirect || !isOnline}
                          onClick={() =>
                            void handleStartDirectConversation(friend.id)
                          }
                          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface-muted/35 p-2.5 text-left transition-colors hover:border-accent disabled:opacity-60"
                        >
                          <UserAvatar
                            name={friend.full_name}
                            username={friend.username}
                            avatarUrl={friend.avatar_url}
                            size="sm"
                            className="rounded-full"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-foreground">
                              {friend.full_name}
                            </p>
                            <p className="truncate font-mono text-xs text-accent-strong">
                              @{friend.username}
                            </p>
                          </div>
                          <span className="rounded-full bg-accent-soft px-3 py-1 text-[11px] font-semibold text-accent-strong">
                            Conversar
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <CreateGroupModal
        key={createGroupModalOpen ? "open" : "closed"}
        isOpen={createGroupModalOpen}
        friends={friends}
        isSubmitting={creatingGroup}
        error={workspaceError}
        onClose={() => setCreateGroupModalOpen(false)}
        onCreateGroup={handleCreateGroup}
        onOpenFindFriends={() => emitOpenFriendshipsDrawer("find")}
      />

      {selectedSummary && selectedSummary.conversation.kind === "group" ? (
        <GroupMembersModal
          key={`${selectedSummary.conversation.id}:${membersModalOpen ? "open" : "closed"}`}
          isOpen={membersModalOpen}
          summary={selectedSummary}
          currentUserId={userId}
          friends={friends}
          isOnline={isOnline}
          onClose={() => setMembersModalOpen(false)}
          onRenameGroup={async (nextTitle) => {
            const client = getSupabaseClient();
            if (!client) {
              return;
            }
            await renameGroupConversation(
              userId,
              selectedSummary.conversation.id,
              nextTitle,
              client,
            );
            await refreshWorkspace();
            await loadSelectedMessages(selectedSummary.conversation.id);
          }}
          onAddMembers={async (memberIds) => {
            const client = getSupabaseClient();
            if (!client) {
              return;
            }
            await addGroupMembers(
              userId,
              selectedSummary.conversation.id,
              memberIds,
              client,
            );
            await refreshWorkspace();
            await loadSelectedMessages(selectedSummary.conversation.id);
          }}
          onRemoveMember={async (targetUserId) => {
            const client = getSupabaseClient();
            if (!client) {
              return;
            }
            await leaveOrRemoveGroupMember(
              userId,
              selectedSummary.conversation.id,
              targetUserId,
              client,
            );
            await refreshWorkspace();
            await loadSelectedMessages(selectedSummary.conversation.id);
          }}
          onLeaveGroup={async () => {
            const client = getSupabaseClient();
            if (!client) {
              return;
            }
            await leaveOrRemoveGroupMember(
              userId,
              selectedSummary.conversation.id,
              userId,
              client,
            );
            setMembersModalOpen(false);
            if (activeCall?.conversationId === selectedSummary.conversation.id) {
              await leaveVoiceCall();
            }
            setSelectedId(null);
            setMobileView("list");
            await refreshWorkspace();
          }}
        />
      ) : null}
    </main>
  );
}
