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
import {
  listUserFriendships,
  type FriendshipListItem,
} from "@/modules/social/social-service";

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
    joinVoiceCall,
    leaveVoiceCall,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    notifyConversationParticipants,
    clearCallError,
  } = useVoiceCall();

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
  const [messageInput, setMessageInput] = useState("");
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

  // Selecionar conversa por ?c= quando informado na URL.
  useEffect(() => {
    if (requestedConversationId) {
      void Promise.resolve().then(() => {
        setSelectedId(requestedConversationId);
        setMobileView("thread");
      });
    }
  }, [requestedConversationId]);

  // Abrir/criar conversa direta por ?dm=<friendUserId> (somente amigos).
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

  // Carregar mensagens da conversa selecionada + marcar leitura.
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

    return () => {
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

  const filteredConversations = useMemo(() => {
    const query = conversationFilter.trim().toLowerCase().replace(/^@+/, "");
    if (!query) {
      return conversations;
    }

    return conversations.filter((item) => {
      if (item.displayTitle.toLowerCase().includes(query)) {
        return true;
      }
      return item.members.some(
        ({ profile: memberProfile }) =>
          memberProfile.username.toLowerCase().includes(query) ||
          memberProfile.full_name.toLowerCase().includes(query),
      );
    });
  }, [conversationFilter, conversations]);

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

  async function handleSendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!userId || !selectedSummary || !isOnline || sendingMessage) {
      return;
    }

    const trimmed = messageInput.trim();
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
      setMessageInput("");
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
      void notifyConversationParticipants(recipientIds, "message:notify", {
        conversationId: selectedSummary.conversation.id,
        senderId: userId,
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

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
    }
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
            grupos de estudo de até {MAX_GROUP_MEMBERS} pessoas e fazer chamadas
            de voz com compartilhamento de tela.
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 sm:py-5">
      {/* Barra superior enxuta para priorizar conversas e voz */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
        <div className="space-y-0.5">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Mensagens
          </h1>
          <p className="text-xs text-muted">
            Conversas com amigos, grupos de até {MAX_GROUP_MEMBERS} pessoas, voz e
            compartilhamento de tela.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setNewDirectModalOpen(true)}
            className="inline-flex min-h-9 items-center justify-center rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
          >
            Nova conversa
          </button>
          <button
            type="button"
            onClick={() => setCreateGroupModalOpen(true)}
            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground hover:border-accent"
          >
            Criar grupo
          </button>
          <button
            type="button"
            onClick={() => emitOpenFriendshipsDrawer("friends")}
            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent"
          >
            Amigos ({friends.length})
          </button>
        </div>
      </header>

      {permissionGrantMissing ? (
        <div
          role="alert"
          className="space-y-1.5 rounded-2xl border border-amber-500/45 bg-amber-500/10 p-4 text-xs text-foreground"
        >
          <p className="font-bold">
            Permissões SQL pendentes no Supabase (código 42501)
          </p>
          <p className="text-muted">
            Execute{" "}
            <code className="font-mono text-foreground">
              supabase/migrations/20261124000002_add_embedded_messaging.sql
            </code>{" "}
            no SQL Editor do Supabase e atualize a página.
          </p>
        </div>
      ) : null}

      {migrationMissing ? (
        <div
          role="alert"
          className="space-y-1.5 rounded-2xl border border-amber-500/45 bg-amber-500/10 p-4 text-xs text-foreground"
        >
          <p className="font-bold">
            Migração do sistema de mensagens pendente no Supabase
          </p>
          <p className="text-muted">
            Execute{" "}
            <code className="font-mono text-foreground">
              supabase/migrations/20261124000002_add_embedded_messaging.sql
            </code>{" "}
            no SQL Editor do projeto para habilitar conversas, grupos, voz e
            compartilhamento de tela.
          </p>
        </div>
      ) : null}

      {workspaceError && !migrationMissing && !permissionGrantMissing ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-foreground"
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

      {/* Área principal Master-Detail */}
      <section className="codit-panel grid min-h-[calc(100dvh-13.5rem)] grid-cols-1 overflow-hidden shadow-xs md:grid-cols-[310px_1fr]">
        {/* Lista de conversas */}
        <aside
          className={`flex flex-col border-b border-border md:border-r md:border-b-0 ${
            mobileView === "thread" && selectedSummary ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="border-b border-border p-3">
            <input
              type="search"
              value={conversationFilter}
              onChange={(event) => setConversationFilter(event.target.value)}
              placeholder="Buscar conversas ou @usuário..."
              aria-label="Buscar conversas"
              className="min-h-9 w-full rounded-xl border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {filteredConversations.length === 0 ? (
              <div className="space-y-3 rounded-2xl border border-dashed border-border bg-surface-muted/30 p-5 text-center">
                <p className="text-xs font-semibold text-foreground sm:text-sm">
                  Nenhuma conversa ainda.
                </p>
                <p className="text-xs text-muted">
                  Apenas amigos aceitos podem trocar mensagens entre si ou criar
                  grupos de até {MAX_GROUP_MEMBERS} pessoas.
                </p>
                <button
                  type="button"
                  onClick={() => setNewDirectModalOpen(true)}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
                >
                  Conversar com um amigo
                </button>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {filteredConversations.map((item) => {
                  const isSelected = item.conversation.id === selectedId;
                  const isCallHere =
                    activeCall?.conversationId === item.conversation.id;
                  const peer = item.directPeer;

                  return (
                    <li key={item.conversation.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(item.conversation.id);
                          setMobileView("thread");
                        }}
                        className={`flex w-full items-start gap-3 rounded-2xl border p-2.5 text-left transition-colors ${
                          isSelected
                            ? "border-accent bg-accent-soft/55"
                            : "border-transparent hover:border-border hover:bg-surface-muted/45"
                        }`}
                      >
                        {item.conversation.kind === "group" ? (
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-accent-soft text-xs font-bold text-accent-strong">
                            G{item.activeMemberCount}
                          </span>
                        ) : (
                          <UserAvatar
                            name={peer?.full_name ?? item.displayTitle}
                            username={peer?.username}
                            avatarUrl={peer?.avatar_url}
                            size="sm"
                          />
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <p className="truncate text-xs font-bold text-foreground sm:text-sm">
                              {item.displayTitle}
                            </p>
                            <span className="shrink-0 text-[10px] text-muted">
                              {formatShortTime(
                                item.conversation.last_message_at ??
                                  item.conversation.updated_at,
                              )}
                            </span>
                          </div>

                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-muted">
                              {item.conversation.last_message_preview ||
                                (item.conversation.kind === "group"
                                  ? `${item.activeMemberCount}/${MAX_GROUP_MEMBERS} participantes`
                                  : peer
                                    ? `@${peer.username}`
                                    : "Conversa direta")}
                            </p>

                            <div className="flex shrink-0 items-center gap-1">
                              {isCallHere ? (
                                <span
                                  aria-label="Chamada de voz ativa"
                                  className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500"
                                />
                              ) : null}
                              {item.unreadCount > 0 ? (
                                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                                  {item.unreadCount > 9
                                    ? "9+"
                                    : item.unreadCount}
                                </span>
                              ) : null}
                            </div>
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

        {/* Thread ativa */}
        <div
          className={`flex min-h-[60dvh] flex-col ${
            mobileView === "list" && !selectedSummary
              ? "hidden md:flex"
              : mobileView === "list"
                ? "hidden md:flex"
                : "flex"
          }`}
        >
          {!selectedSummary ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <OctopyBadge
                size={56}
                variant="happy"
                decorative={false}
                className="rounded-2xl shadow-xs"
              />
              <div className="space-y-1">
                <h2 className="text-base font-bold text-foreground">
                  Selecione uma conversa ou crie um grupo
                </h2>
                <p className="max-w-sm text-xs text-muted">
                  Converse por texto com amigos, reúna até {MAX_GROUP_MEMBERS}{" "}
                  pessoas em grupos e entre em chamadas de voz com
                  compartilhamento de tela.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setNewDirectModalOpen(true)}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
                >
                  Conversar com amigo
                </button>
                <button
                  type="button"
                  onClick={() => setCreateGroupModalOpen(true)}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface-muted px-3.5 py-1.5 text-xs font-semibold text-foreground hover:border-accent"
                >
                  Novo grupo (até {MAX_GROUP_MEMBERS})
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Topbar da conversa */}
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setMobileView("list")}
                    className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface-muted px-2.5 text-xs font-semibold text-foreground md:hidden"
                  >
                    Voltar
                  </button>

                  {selectedSummary.conversation.kind === "group" ? (
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-accent-soft text-xs font-bold text-accent-strong">
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
                    />
                  )}

                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold text-foreground sm:text-base">
                      {selectedSummary.displayTitle}
                    </h2>
                    <p className="truncate text-[11px] text-muted">
                      {selectedSummary.conversation.kind === "group"
                        ? `Grupo · ${selectedSummary.activeMemberCount}/${MAX_GROUP_MEMBERS} participantes`
                        : selectedSummary.directPeer
                          ? `@${selectedSummary.directPeer.username} · ${
                              selectedSummary.isDirectFriendActive
                                ? "Amigo aceito"
                                : "Amizade encerrada"
                            }`
                          : "Conversa direta"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {activeCallInSelected ? (
                    <button
                      type="button"
                      onClick={() => void leaveVoiceCall()}
                      className="inline-flex min-h-9 items-center justify-center rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      Sair da voz
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        isJoiningCall ||
                        !selectedSummary.canSendMessages ||
                        !isOnline
                      }
                      onClick={() => void joinVoiceCall(selectedSummary)}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {isJoiningCall ? "Conectando..." : "Chamada de voz"}
                    </button>
                  )}

                  {selectedSummary.conversation.kind === "group" ? (
                    <button
                      type="button"
                      onClick={() => setMembersModalOpen(true)}
                      className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent"
                    >
                      Membros ({selectedSummary.activeMemberCount}/
                      {MAX_GROUP_MEMBERS})
                    </button>
                  ) : selectedSummary.directPeer ? (
                    <Link
                      href={`/comunidade/perfil?u=${encodeURIComponent(selectedSummary.directPeer.username)}`}
                      className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent"
                    >
                      Ver perfil
                    </Link>
                  ) : null}
                </div>
              </header>

              {/* Painel de chamada de voz e compartilhamento de tela (sem câmera) */}
              {activeCallInSelected ? (
                <CallStagePanel
                  activeCall={activeCallInSelected}
                  currentUserId={userId}
                  callError={callError}
                  onToggleMute={toggleMute}
                  onToggleDeafen={toggleDeafen}
                  onToggleScreenShare={toggleScreenShare}
                  onLeaveCall={leaveVoiceCall}
                  onDismissError={clearCallError}
                />
              ) : null}

              {/* Lista de mensagens */}
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {loadingMessages && messages.length === 0 ? (
                  <div className="py-10 text-center text-xs text-muted">
                    Carregando histórico de mensagens...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-surface-muted/30 p-6 text-center text-xs text-muted">
                    Nenhuma mensagem ainda nesta conversa. Envie a primeira!
                  </div>
                ) : (
                  messages.map(({ message, sender }) => {
                    if (message.message_type === "system") {
                      return (
                        <div
                          key={message.id}
                          className="flex justify-center py-1"
                        >
                          <span className="rounded-full border border-border bg-surface-muted px-3 py-1 text-[11px] text-muted">
                            {message.content}
                          </span>
                        </div>
                      );
                    }

                    const isOwn = message.sender_id === userId;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] space-y-1 rounded-2xl px-3.5 py-2.5 sm:max-w-[72%] ${
                            isOwn
                              ? "rounded-br-md bg-accent text-accent-foreground"
                              : "rounded-bl-md border border-border bg-surface-muted/75 text-foreground"
                          }`}
                        >
                          {!isOwn &&
                          selectedSummary.conversation.kind === "group" ? (
                            <p className="text-[11px] font-bold text-accent-strong">
                              {sender?.full_name ?? "Participante"}{" "}
                              {sender?.username ? (
                                <span className="font-mono font-normal opacity-80">
                                  @{sender.username}
                                </span>
                              ) : null}
                            </p>
                          ) : null}

                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                            {message.content}
                          </p>

                          <div
                            className={`flex items-center justify-end gap-2 text-[10px] ${
                              isOwn ? "opacity-80" : "text-muted"
                            }`}
                          >
                            <span>{formatShortTime(message.created_at)}</span>
                            {isOwn ? (
                              <button
                                type="button"
                                onClick={() => void handleDeleteMessage(message.id)}
                                className="hover:underline"
                              >
                                Apagar
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {typingLabel ? (
                  <p className="text-[11px] font-medium text-muted italic">
                    {typingLabel}
                  </p>
                ) : null}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <footer className="border-t border-border bg-surface-muted/30 p-3 sm:p-4">
                {!selectedSummary.canSendMessages ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-foreground">
                    <p>
                      Apenas <strong>amigos aceitos</strong> podem enviar
                      mensagens ou iniciar chamadas de voz entre si.
                    </p>
                    {selectedSummary.directPeer ? (
                      <Link
                        href={`/comunidade/perfil?u=${encodeURIComponent(selectedSummary.directPeer.username)}`}
                        className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border bg-surface px-3 py-1 font-semibold text-accent-strong hover:border-accent"
                      >
                        Abrir perfil de @{selectedSummary.directPeer.username}
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <form
                    onSubmit={(event) => void handleSendMessage(event)}
                    className="flex items-end gap-2"
                  >
                    <label htmlFor="codit-message-composer" className="sr-only">
                      Escrever mensagem
                    </label>
                    <textarea
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
                        isOnline
                          ? "Escreva uma mensagem... (Enter envia, Shift+Enter quebra linha)"
                          : "Sem conexão com a internet..."
                      }
                      className="max-h-32 min-h-10 min-w-0 flex-1 resize-y rounded-xl border border-border bg-background px-3.5 py-2 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none sm:text-sm"
                    />
                    <button
                      type="submit"
                      disabled={
                        !isOnline || sendingMessage || !messageInput.trim()
                      }
                      className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {sendingMessage ? "..." : "Enviar"}
                    </button>
                  </form>
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

          <div className="relative z-10 flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2
                  id="codit-new-direct-title"
                  className="text-base font-bold text-foreground"
                >
                  Conversar com um amigo
                </h2>
                <p className="text-xs text-muted">
                  Somente amigos aceitos podem trocar mensagens diretas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewDirectModalOpen(false)}
                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface-muted px-3 text-xs font-semibold text-foreground"
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
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90"
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
                    className="min-h-9 w-full rounded-xl border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
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
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-foreground">
                              {friend.full_name}
                            </p>
                            <p className="truncate font-mono text-xs text-accent-strong">
                              @{friend.username}
                            </p>
                          </div>
                          <span className="rounded-lg bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-strong">
                            Abrir
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
