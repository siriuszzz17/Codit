"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  emitMessagesChanged,
  subscribeFriendshipsChanged,
} from "@/lib/social-events";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/modules/auth/auth-provider";
import {
  incomingCallNoticeSchema,
  type IncomingCallNotice,
} from "@/modules/messaging/messaging-schemas";
import {
  listUserConversations,
  type ConversationSummary,
} from "@/modules/messaging/messaging-service";
import {
  VoiceCallSessionManager,
  type VoiceCallSnapshot,
} from "@/modules/messaging/voice-call-manager";
import { playIncomingCallChime } from "@/modules/messaging/webrtc-media";

export interface VoiceCallContextValue {
  activeCall: VoiceCallSnapshot | null;
  incomingCall: IncomingCallNotice | null;
  callError: string | null;
  isJoiningCall: boolean;
  joinVoiceCall: (summary: ConversationSummary) => Promise<void>;
  leaveVoiceCall: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleScreenShare: () => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  dismissIncomingCall: () => void;
  notifyConversationParticipants: (
    recipientUserIds: ReadonlyArray<string>,
    event: "message:notify" | "call:incoming",
    payload: unknown,
  ) => Promise<void>;
  clearCallError: () => void;
}

const VoiceCallContext = createContext<VoiceCallContextValue | null>(null);

export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, profile, isConfigured } = useAuth();
  const userId = user?.id ?? null;

  const managerRef = useRef<VoiceCallSessionManager | null>(null);
  const activeCallRef = useRef<VoiceCallSnapshot | null>(null);
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeCall, setActiveCall] = useState<VoiceCallSnapshot | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallNotice | null>(
    null,
  );
  const [callError, setCallError] = useState<string | null>(null);
  const [isJoiningCall, setIsJoiningCall] = useState(false);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  const leaveVoiceCall = useCallback(async () => {
    const manager = managerRef.current;
    managerRef.current = null;
    setActiveCall(null);
    setIsJoiningCall(false);
    if (manager) {
      await manager.leaveCall();
    }
  }, []);

  const notifyConversationParticipants = useCallback(
    async (
      recipientUserIds: ReadonlyArray<string>,
      event: "message:notify" | "call:incoming",
      payload: unknown,
    ) => {
      const client = getSupabaseClient();
      if (!client || !userId) {
        return;
      }

      const targets = Array.from(new Set(recipientUserIds)).filter(
        (id) => id !== userId,
      );

      await Promise.allSettled(
        targets.map(async (targetId) => {
          const tempChannel = client.channel(`codit:user-inbox:${targetId}`);
          try {
            await tempChannel.httpSend(event, payload);
          } finally {
            await client.removeChannel(tempChannel).catch(() => undefined);
          }
        }),
      );
    },
    [userId],
  );

  // Encerrar chamada ao sair da conta.
  useEffect(() => {
    if (!userId) {
      const manager = managerRef.current;
      managerRef.current = null;
      if (manager) {
        void manager.leaveCall();
      }
      void Promise.resolve().then(() => {
        setActiveCall(null);
        setIncomingCall(null);
        setCallError(null);
        setIsJoiningCall(false);
      });
    }
  }, [userId]);

  // Limpar chamada caso ocorra unmount global.
  useEffect(() => {
    return () => {
      if (incomingTimerRef.current !== null) {
        clearTimeout(incomingTimerRef.current);
      }
      const manager = managerRef.current;
      managerRef.current = null;
      if (manager) {
        void manager.leaveCall();
      }
    };
  }, []);

  // Escutar inbox pessoal para chamadas recebidas, novas mensagens e alterações RLS.
  useEffect(() => {
    if (!userId || !isConfigured) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    const inboxChannel = client
      .channel(`codit:user-inbox:${userId}`)
      .on("broadcast", { event: "call:incoming" }, (event) => {
        const rawPayload =
          event && typeof event === "object" && "payload" in event
            ? event.payload
            : event;
        const parsed = incomingCallNoticeSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return;
        }
        const notice = parsed.data;
        if (notice.callerId === userId) {
          return;
        }
        if (activeCallRef.current?.conversationId === notice.conversationId) {
          return;
        }

        setIncomingCall(notice);
        playIncomingCallChime();

        if (incomingTimerRef.current !== null) {
          clearTimeout(incomingTimerRef.current);
        }
        incomingTimerRef.current = setTimeout(() => {
          setIncomingCall((current) =>
            current?.conversationId === notice.conversationId ? null : current,
          );
        }, 25_000);
      })
      .on("broadcast", { event: "message:notify" }, () => {
        emitMessagesChanged();
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        () => {
          emitMessagesChanged();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(inboxChannel);
    };
  }, [isConfigured, userId]);

  // Se uma amizade for desfeita durante chamada DM, encerrar chamada na hora (RN-501).
  useEffect(() => {
    if (!userId || !isConfigured) {
      return;
    }

    return subscribeFriendshipsChanged(() => {
      const current = activeCallRef.current;
      const manager = managerRef.current;
      if (!current || !manager) {
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        return;
      }

      void listUserConversations(userId, client)
        .then((conversations) => {
          const match = conversations.find(
            (item) => item.conversation.id === current.conversationId,
          );
          if (!match || !match.canSendMessages) {
            setCallError(
              "A chamada foi encerrada porque a conversa não está mais disponível.",
            );
            void leaveVoiceCall();
            return;
          }
          manager.updateAllowedMembers(
            match.members.map((entry) => entry.member.user_id),
          );
        })
        .catch(() => undefined);
    });
  }, [isConfigured, leaveVoiceCall, userId]);

  const joinVoiceCall = useCallback(
    async (summary: ConversationSummary) => {
      if (!userId) {
        setCallError("Entre na sua conta para entrar em chamadas de voz.");
        return;
      }

      if (!summary.canSendMessages) {
        setCallError(
          "Apenas amigos aceitos ou grupos ativos podem iniciar chamadas de voz.",
        );
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        setCallError("Integração Supabase não configurada.");
        return;
      }

      setIsJoiningCall(true);
      setCallError(null);
      setIncomingCall((current) =>
        current?.conversationId === summary.conversation.id ? null : current,
      );

      if (managerRef.current) {
        await managerRef.current.leaveCall();
        managerRef.current = null;
        setActiveCall(null);
      }

      const localName =
        profile?.full_name?.trim() ||
        (typeof user?.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : "") ||
        "Estudante Codit";
      const localUsername = profile?.username ?? "codit";

      const manager = new VoiceCallSessionManager({
        client,
        conversationId: summary.conversation.id,
        conversationTitle: summary.displayTitle,
        isGroup: summary.conversation.kind === "group",
        localUser: {
          userId,
          username: localUsername,
          fullName: localName,
          avatarUrl: profile?.avatar_url ?? null,
        },
        allowedMemberIds: summary.members.map((item) => item.member.user_id),
        onStateChange: (snapshot) => {
          setActiveCall(snapshot);
          if (snapshot.error) {
            setCallError(snapshot.error);
          }
        },
      });

      managerRef.current = manager;

      try {
        await manager.start();
        setIsJoiningCall(false);

        const recipientIds = summary.members
          .map((item) => item.member.user_id)
          .filter((id) => id !== userId);

        const notice: IncomingCallNotice = {
          conversationId: summary.conversation.id,
          conversationTitle: summary.displayTitle,
          isGroup: summary.conversation.kind === "group",
          callerId: userId,
          callerName: localName,
          callerUsername: localUsername,
          callerAvatarUrl: profile?.avatar_url ?? null,
          sentAt: new Date().toISOString(),
        };

        void notifyConversationParticipants(
          recipientIds,
          "call:incoming",
          notice,
        );
      } catch (error) {
        managerRef.current = null;
        await manager.leaveCall();
        setActiveCall(null);
        setIsJoiningCall(false);
        setCallError(
          error instanceof Error
            ? error.message
            : "Não foi possível iniciar a chamada de voz.",
        );
      }
    },
    [notifyConversationParticipants, profile, user, userId],
  );

  const acceptIncomingCall = useCallback(async () => {
    const notice = incomingCall;
    if (!notice || !userId) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    setIncomingCall(null);
    try {
      const conversations = await listUserConversations(userId, client);
      const target = conversations.find(
        (item) => item.conversation.id === notice.conversationId,
      );
      if (!target || !target.canSendMessages) {
        setCallError(
          "Esta conversa não está mais disponível para chamadas de voz.",
        );
        return;
      }

      router.push(`/mensagens?c=${encodeURIComponent(notice.conversationId)}`);
      await joinVoiceCall(target);
    } catch (error) {
      setCallError(
        error instanceof Error
          ? error.message
          : "Não foi possível atender a chamada.",
      );
    }
  }, [incomingCall, joinVoiceCall, router, userId]);

  const dismissIncomingCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  const toggleMute = useCallback(() => {
    managerRef.current?.toggleMute();
  }, []);

  const toggleDeafen = useCallback(() => {
    managerRef.current?.toggleDeafen();
  }, []);

  const toggleScreenShare = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) {
      return;
    }

    try {
      if (activeCallRef.current?.isScreenSharing) {
        await manager.stopScreenShare();
      } else {
        await manager.startScreenShare();
      }
    } catch (error) {
      setCallError(
        error instanceof Error
          ? error.message
          : "Não foi possível alternar o compartilhamento de tela.",
      );
    }
  }, []);

  const clearCallError = useCallback(() => {
    setCallError(null);
  }, []);

  const value = useMemo<VoiceCallContextValue>(
    () => ({
      activeCall,
      incomingCall,
      callError,
      isJoiningCall,
      joinVoiceCall,
      leaveVoiceCall,
      toggleMute,
      toggleDeafen,
      toggleScreenShare,
      acceptIncomingCall,
      dismissIncomingCall,
      notifyConversationParticipants,
      clearCallError,
    }),
    [
      activeCall,
      incomingCall,
      callError,
      isJoiningCall,
      joinVoiceCall,
      leaveVoiceCall,
      toggleMute,
      toggleDeafen,
      toggleScreenShare,
      acceptIncomingCall,
      dismissIncomingCall,
      notifyConversationParticipants,
      clearCallError,
    ],
  );

  return (
    <VoiceCallContext.Provider value={value}>
      {children}
    </VoiceCallContext.Provider>
  );
}

export function useVoiceCall(): VoiceCallContextValue {
  const context = useContext(VoiceCallContext);
  if (!context) {
    throw new Error(
      "useVoiceCall deve ser utilizado dentro de <VoiceCallProvider>.",
    );
  }
  return context;
}
