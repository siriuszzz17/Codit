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
  dismissNativeNotificationTag,
  startOrUpdateNativeCallNotification,
  stopNativeCallNotification,
  type NativeCallActionDetail,
} from "@/lib/codit-native-bridge";
import {
  emitMessagesChanged,
  subscribeFriendshipsChanged,
} from "@/lib/social-events";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/modules/auth/auth-provider";
import {
  CALL_RINGING_TIMEOUT_MS,
  CALL_RINGING_TIMEOUT_SECONDS,
  callTimeoutNoticeSchema,
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
import { startIncomingCallRingtone } from "@/modules/messaging/webrtc-media";
import { shouldDeliverNotification } from "@/modules/notifications/notification-schemas";
import {
  dispatchVoiceCallAnswer,
  dispatchVoiceCallCancel,
  dispatchVoiceCallPush,
} from "@/modules/notifications/push-notification-service";
import {
  useNotificationsOptional,
  type ChatMessageRowNotificationInput,
} from "@/modules/notifications/notifications-provider";

export interface VoiceCallContextValue {
  activeCall: VoiceCallSnapshot | null;
  incomingCall: IncomingCallNotice | null;
  callError: string | null;
  isJoiningCall: boolean;
  joinVoiceCall: (summary: ConversationSummary) => Promise<void>;
  leaveVoiceCall: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  retryMicrophone: () => Promise<void>;
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
  const notifications = useNotificationsOptional();
  const userId = user?.id ?? null;

  const managerRef = useRef<VoiceCallSessionManager | null>(null);
  const activeCallRef = useRef<VoiceCallSnapshot | null>(null);
  const notificationsRef = useRef(notifications);
  const routerRef = useRef(router);
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRingtoneRef = useRef<(() => void) | null>(null);

  const stopIncomingRingtone = useCallback(() => {
    stopRingtoneRef.current?.();
    stopRingtoneRef.current = null;
  }, []);

  const [activeCall, setActiveCall] = useState<VoiceCallSnapshot | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallNotice | null>(
    null,
  );
  const [callError, setCallError] = useState<string | null>(null);
  const [isJoiningCall, setIsJoiningCall] = useState(false);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const leaveVoiceCall = useCallback(async () => {
    const manager = managerRef.current;
    const currentSnapshot = activeCallRef.current;
    managerRef.current = null;
    setActiveCall(null);
    setIsJoiningCall(false);
    stopNativeCallNotification();
    if (
      currentSnapshot &&
      currentSnapshot.participants.length <= 1
    ) {
      const client = getSupabaseClient();
      if (client) {
        void dispatchVoiceCallCancel(
          currentSnapshot.conversationId,
          currentSnapshot.callId,
          client,
        );
      }
    }
    if (manager) {
      await manager.leaveCall();
    }
  }, []);

  // Sincroniza a notificação persistente (`Ongoing`) da chamada ativa no Android.
  useEffect(() => {
    if (!activeCall) {
      stopNativeCallNotification();
      return;
    }

    const remotePeer = !activeCall.isGroup
      ? activeCall.participants.find((item) => item.userId !== userId)
      : undefined;

    startOrUpdateNativeCallNotification({
      conversationId: activeCall.conversationId,
      conversationTitle: activeCall.conversationTitle,
      isGroup: activeCall.isGroup,
      isMuted: activeCall.isMuted,
      participantCount: Math.max(1, activeCall.participants.length),
      startedAtMs: activeCall.startedAt,
      avatarUrl: remotePeer?.avatarUrl ?? null,
      username: remotePeer?.username ?? null,
    });
  }, [activeCall, userId]);

  // Recebe ações dos botões da notificação persistente Android (Mutar/Desmutar, Encerrar, Voltar).
  useEffect(() => {
    const onNativeCallAction = (event: Event) => {
      const detail = (event as CustomEvent<NativeCallActionDetail>).detail;
      if (!detail?.action) {
        return;
      }

      if (detail.action === "toggle-mute") {
        managerRef.current?.toggleMute();
        return;
      }

      if (detail.action === "hangup") {
        void leaveVoiceCall();
        return;
      }

      if (detail.action === "return") {
        const targetConvId =
          detail.conversationId || activeCallRef.current?.conversationId;
        const href =
          detail.linkHref &&
          detail.linkHref.startsWith("/") &&
          !detail.linkHref.startsWith("//")
            ? detail.linkHref
            : targetConvId
              ? `/mensagens?c=${encodeURIComponent(targetConvId)}`
              : "/mensagens";
        routerRef.current.push(href);
      }
    };

    window.addEventListener("codit:native-call-action", onNativeCallAction);
    return () => {
      window.removeEventListener(
        "codit:native-call-action",
        onNativeCallAction,
      );
    };
  }, [leaveVoiceCall]);

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
          const topic = `codit:user-inbox:${targetId}`;
          const existingChannel =
            typeof client.getChannels === "function"
              ? client
                  .getChannels()
                  .find((ch) => ch.topic === `realtime:${topic}`)
              : undefined;
          const targetChannel = existingChannel ?? client.channel(topic);
          try {
            await targetChannel.httpSend(event, payload);
          } catch {
            await targetChannel
              .send({
                type: "broadcast",
                event,
                payload,
              })
              .catch(() => undefined);
          } finally {
            if (!existingChannel) {
              await client.removeChannel(targetChannel).catch(() => undefined);
            }
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
      stopNativeCallNotification();
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
      stopIncomingRingtone();
      const manager = managerRef.current;
      managerRef.current = null;
      stopNativeCallNotification();
      if (manager) {
        void manager.leaveCall();
      }
    };
  }, [stopIncomingRingtone]);

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

        const notif = notificationsRef.current;
        const delivery = notif
          ? shouldDeliverNotification(notif.prefs, "voice_call", {
              conversationId: notice.conversationId,
            })
          : {
              allowFeed: true,
              allowBadge: true,
              allowToast: true,
              allowSound: true,
              allowBrowserPush: false,
            };

        if (!delivery.allowFeed) {
          return;
        }

        notif?.recordIncomingVoiceCall(notice);

        if (delivery.allowToast) {
          setIncomingCall(notice);
          if (incomingTimerRef.current !== null) {
            clearTimeout(incomingTimerRef.current);
          }
          const timeoutMs = notice.timeoutSeconds
            ? notice.timeoutSeconds * 1000
            : CALL_RINGING_TIMEOUT_MS;
          incomingTimerRef.current = setTimeout(() => {
            stopIncomingRingtone();
            dismissNativeNotificationTag(`call:${notice.conversationId}`);
            setIncomingCall((current) =>
              current?.conversationId === notice.conversationId
                ? null
                : current,
            );
          }, timeoutMs);
        }

        if (delivery.allowSound) {
          stopIncomingRingtone();
          stopRingtoneRef.current = startIncomingCallRingtone();
        }
      })
      .on("broadcast", { event: "call:timeout" }, (event) => {
        const rawPayload =
          event && typeof event === "object" && "payload" in event
            ? event.payload
            : event;
        const parsed = callTimeoutNoticeSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return;
        }
        const notice = parsed.data;
        stopIncomingRingtone();
        if (incomingTimerRef.current !== null) {
          clearTimeout(incomingTimerRef.current);
          incomingTimerRef.current = null;
        }
        dismissNativeNotificationTag(`call:${notice.conversationId}`);
        setIncomingCall((current) =>
          current?.conversationId === notice.conversationId ? null : current,
        );

        const active = activeCallRef.current;
        if (
          active &&
          active.conversationId === notice.conversationId &&
          active.participants.length <= 1
        ) {
          setCallError("Chamada não atendida (tempo esgotado).");
          void leaveVoiceCall();
        }
      })
      .on("broadcast", { event: "call:cancelled" }, (event) => {
        const rawPayload =
          event && typeof event === "object" && "payload" in event
            ? event.payload
            : event;
        const parsed = callTimeoutNoticeSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return;
        }
        const notice = parsed.data;
        stopIncomingRingtone();
        if (incomingTimerRef.current !== null) {
          clearTimeout(incomingTimerRef.current);
          incomingTimerRef.current = null;
        }
        dismissNativeNotificationTag(`call:${notice.conversationId}`);
        setIncomingCall((current) =>
          current?.conversationId === notice.conversationId ? null : current,
        );
      })
      .on("broadcast", { event: "call:answered" }, (event) => {
        const rawPayload =
          event && typeof event === "object" && "payload" in event
            ? event.payload
            : event;
        const parsed = callTimeoutNoticeSchema.safeParse(rawPayload);
        if (!parsed.success) {
          return;
        }
        stopIncomingRingtone();
        if (incomingTimerRef.current !== null) {
          clearTimeout(incomingTimerRef.current);
          incomingTimerRef.current = null;
        }
        dismissNativeNotificationTag(`call:${parsed.data.conversationId}`);
        setIncomingCall((current) =>
          current?.conversationId === parsed.data.conversationId ? null : current,
        );
      })
      .on("broadcast", { event: "message:notify" }, (event) => {
        const rawPayload =
          event && typeof event === "object" && "payload" in event
            ? event.payload
            : event;
        emitMessagesChanged();
        notificationsRef.current?.notifyIncomingMessage(rawPayload);
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          emitMessagesChanged();
          const newRow = (payload?.new ?? null) as
            | ChatMessageRowNotificationInput
            | null;
          if (newRow) {
            notificationsRef.current?.notifyIncomingMessageFromRow(newRow);
          }
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(inboxChannel);
    };
  }, [isConfigured, leaveVoiceCall, stopIncomingRingtone, userId]);

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
      stopIncomingRingtone();
      if (incomingTimerRef.current !== null) {
        clearTimeout(incomingTimerRef.current);
        incomingTimerRef.current = null;
      }
      dismissNativeNotificationTag(`call:${summary.conversation.id}`);
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
        onCallTimeout: () => {
          setCallError("Chamada não atendida (tempo esgotado).");
          void leaveVoiceCall();
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
          callId: manager.callId,
          conversationId: summary.conversation.id,
          conversationTitle: summary.displayTitle,
          isGroup: summary.conversation.kind === "group",
          callerId: userId,
          callerName: localName,
          callerUsername: localUsername,
          callerAvatarUrl: profile?.avatar_url ?? null,
          timeoutSeconds: CALL_RINGING_TIMEOUT_SECONDS,
          sentAt: new Date().toISOString(),
        };

        void notifyConversationParticipants(
          recipientIds,
          "call:incoming",
          notice,
        );
        if (recipientIds.length > 0) {
          void dispatchVoiceCallPush(summary.conversation.id, client, {
            callId: manager.callId,
          });
        }
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
    [leaveVoiceCall, notifyConversationParticipants, profile, stopIncomingRingtone, user, userId],
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

    stopIncomingRingtone();
    if (incomingTimerRef.current !== null) {
      clearTimeout(incomingTimerRef.current);
      incomingTimerRef.current = null;
    }
    setIncomingCall(null);
    void dispatchVoiceCallAnswer(notice.conversationId, notice.callId, client);
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
  }, [incomingCall, joinVoiceCall, router, stopIncomingRingtone, userId]);

  const dismissIncomingCall = useCallback(() => {
    stopIncomingRingtone();
    if (incomingTimerRef.current !== null) {
      clearTimeout(incomingTimerRef.current);
      incomingTimerRef.current = null;
    }
    setIncomingCall((current) => {
      if (current?.conversationId) {
        dismissNativeNotificationTag(`call:${current.conversationId}`);
      }
      return null;
    });
  }, [stopIncomingRingtone]);

  const toggleMute = useCallback(() => {
    managerRef.current?.toggleMute();
  }, []);

  const toggleDeafen = useCallback(() => {
    managerRef.current?.toggleDeafen();
  }, []);

  const toggleCamera = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) {
      return;
    }

    try {
      if (activeCallRef.current?.isCameraEnabled) {
        await manager.stopCamera();
      } else {
        await manager.startCamera();
      }
    } catch (error) {
      setCallError(
        error instanceof Error
          ? error.message
          : "Não foi possível alternar a câmera.",
      );
    }
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

  const retryMicrophone = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) {
      return;
    }
    await manager.retryMicrophone();
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
      toggleCamera,
      toggleScreenShare,
      retryMicrophone,
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
      toggleCamera,
      toggleScreenShare,
      retryMicrophone,
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
