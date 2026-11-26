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
  consumeNativePendingNavigationHref,
  dismissNativeNotificationTag,
  type NativeReplyEventDetail,
} from "@/lib/codit-native-bridge";
import {
  emitFriendshipsChanged,
  emitMessagesChanged,
  emitNotificationsChanged,
  subscribeFriendshipsChanged,
  subscribeMessagesChanged,
  subscribeNotificationsChanged,
} from "@/lib/social-events";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  NotificationCategory,
  NotificationRow,
} from "@/lib/supabase/database.types";
import { useIsOnline } from "@/lib/use-is-online";
import { useAuth } from "@/modules/auth/auth-provider";
import type { IncomingCallNotice } from "@/modules/messaging/messaging-schemas";
import {
  listUserConversations,
  markConversationRead,
  sendConversationMessage,
  type ConversationSummary,
} from "@/modules/messaging/messaging-service";
import {
  createDefaultNotificationPreferences,
  isConversationMuted as checkConversationMuted,
  messageNotifyPayloadSchema,
  normalizeNotificationPreferences,
  shouldDeliverNotification,
  type NotificationPreferenceCategoryKey,
  type NotificationPreferences,
} from "@/modules/notifications/notification-schemas";
import {
  clearReadNotifications,
  deleteNotification,
  fetchUserNotificationPrefs,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  persistUserNotificationPrefs,
  playNotificationChime,
  readLocalNotificationPrefs,
  readLocalTransientAlerts,
  writeLocalNotificationPrefs,
  writeLocalTransientAlerts,
  type EnrichedNotificationItem,
  type TransientNotificationItem,
} from "@/modules/notifications/notification-service";
import {
  getSystemNotificationPermission,
  isSafeNotificationHref,
  requestSystemNotificationPermission,
  shouldPromptForNativeNotificationPermission,
  showSystemNotification,
} from "@/modules/notifications/system-notifications";
import {
  ANDROID_HIGH_PRIORITY_CHANNEL_ID,
  hasActiveAndroidPushRegistration,
  persistAndroidPushToken,
  unregisterCurrentAndroidPushDevice,
} from "@/modules/notifications/push-notification-service";

export type BrowserNotificationPermission =
  | "default"
  | "granted"
  | "denied"
  | "unsupported";

export interface NotificationActorSummary {
  id: string;
  fullName: string;
  username: string | null;
  avatarUrl: string | null;
}

export interface FeedNotificationItem {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  linkHref: string | null;
  conversationId: string | null;
  actor: NotificationActorSummary | null;
  isUnread: boolean;
  createdAt: string;
  source: "database" | "unread_conversation" | "live_call";
  dbNotificationId?: string;
}

export interface ActiveNotificationToast {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  linkHref: string | null;
  conversationId: string | null;
  actor: NotificationActorSummary | null;
  createdAt: string;
}

export interface ChatMessageRowNotificationInput {
  id?: string | undefined;
  conversation_id?: string | undefined;
  sender_id?: string | undefined;
  message_type?: string | undefined;
  content?: string | undefined;
  created_at?: string | undefined;
}

export interface NotificationsContextValue {
  prefs: NotificationPreferences;
  isLoading: boolean;
  isSyncingPrefs: boolean;
  migrationMissing: boolean;
  permissionGrantMissing: boolean;
  browserPermission: BrowserNotificationPermission;
  dbNotifications: EnrichedNotificationItem[];
  unreadConversations: ConversationSummary[];
  conversationTitlesById: Record<string, string>;
  voiceCallAlerts: TransientNotificationItem[];
  visibleItems: FeedNotificationItem[];
  unreadBadgeCount: number;
  toasts: ActiveNotificationToast[];
  updatePrefs: (patch: Partial<NotificationPreferences>) => void;
  setCategoryEnabled: (
    key: NotificationPreferenceCategoryKey,
    enabled: boolean,
  ) => void;
  toggleMuteAll: () => void;
  toggleConversationMute: (conversationId: string) => void;
  isConversationMuted: (conversationId: string | null | undefined) => boolean;
  resetPrefs: () => void;
  requestBrowserPermission: () => Promise<BrowserNotificationPermission>;
  refreshNotifications: () => Promise<void>;
  markItemAsRead: (item: FeedNotificationItem) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  removeNotificationItem: (item: FeedNotificationItem) => Promise<void>;
  clearRead: () => Promise<void>;
  dismissToast: (toastId: string) => void;
  setActiveViewedConversationId: (conversationId: string | null) => void;
  recordIncomingVoiceCall: (notice: IncomingCallNotice) => void;
  notifyIncomingMessage: (payload: unknown) => void;
  notifyIncomingMessageFromRow: (row: ChatMessageRowNotificationInput) => void;
}

const MAX_ACTIVE_TOASTS = 3;
const TOAST_TTL_MS = 5500;
const DEDUP_WINDOW_MS = 3500;

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

function extractConversationIdFromLink(
  linkHref: string | null | undefined,
): string | null {
  if (!linkHref) {
    return null;
  }
  const match = linkHref.match(/[?&]c=([^&]+)/);
  if (!match?.[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isLoading: isAuthLoading, isConfigured } = useAuth();
  const isOnline = useIsOnline();
  const userId = user?.id ?? null;

  const [prefs, setPrefs] = useState<NotificationPreferences>(() =>
    createDefaultNotificationPreferences(),
  );
  const [hydratedScope, setHydratedScope] = useState<string | null>(null);
  const currentAuthScope = isAuthLoading ? null : (userId ?? "guest");
  const prefsHydrated =
    currentAuthScope !== null && hydratedScope === currentAuthScope;
  const [browserPermission, setBrowserPermission] =
    useState<BrowserNotificationPermission>("default");
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingPrefs, setIsSyncingPrefs] = useState(false);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [permissionGrantMissing, setPermissionGrantMissing] = useState(false);

  const [dbNotifications, setDbNotifications] = useState<
    EnrichedNotificationItem[]
  >([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [voiceCallAlerts, setVoiceCallAlerts] = useState<
    TransientNotificationItem[]
  >([]);
  const [toasts, setToasts] = useState<ActiveNotificationToast[]>([]);

  const prefsRef = useRef(prefs);
  const routerRef = useRef(router);
  const userIdRef = useRef(userId);
  const conversationsRef = useRef(conversations);
  const refreshNotificationsRef = useRef<() => Promise<void>>(async () => {});
  const activeViewedConversationIdRef = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedPrefsUserIdRef = useRef<string | null>(null);
  const dedupTimestampsRef = useRef<Map<string, number>>(new Map());
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Cria o canal Android de alta importância no boot e abre rotas ao tocar nos avisos.
  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];
    const openHref = (href: unknown) => {
      if (isSafeNotificationHref(href)) {
        routerRef.current.push(href);
      }
    };

    const pendingLaunchHref = consumeNativePendingNavigationHref();
    if (pendingLaunchHref) {
      openHref(pendingLaunchHref);
    }

    const onNativeNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ linkHref?: string }>).detail;
      openHref(detail?.linkHref);
    };
    const onNativeReplySent = (event: Event) => {
      const detail = (event as CustomEvent<NativeReplyEventDetail>).detail;
      const convId = detail?.conversationId?.trim();
      if (convId) {
        dismissNativeNotificationTag(`conv:${convId}`);
      }
      emitMessagesChanged();
      void refreshNotificationsRef.current();
    };
    const onNativeNotificationReply = (event: Event) => {
      const detail = (event as CustomEvent<NativeReplyEventDetail>).detail;
      const convId = detail?.conversationId?.trim();
      const content = detail?.content?.trim();
      const activeUserId = userIdRef.current;
      const client = getSupabaseClient();
      if (!convId || !content || !activeUserId || !client) {
        return;
      }
      void sendConversationMessage(activeUserId, convId, content, client)
        .then(async () => {
          await markConversationRead(activeUserId, convId, client).catch(
            () => false,
          );
          dismissNativeNotificationTag(`conv:${convId}`);
          emitMessagesChanged();
          void refreshNotificationsRef.current();
        })
        .catch(() => undefined);
    };

    window.addEventListener("codit:native-navigate", onNativeNavigate);
    window.addEventListener("codit:native-reply-sent", onNativeReplySent);
    window.addEventListener(
      "codit:native-notification-reply",
      onNativeNotificationReply,
    );
    cleanups.push(() => {
      window.removeEventListener("codit:native-navigate", onNativeNavigate);
      window.removeEventListener("codit:native-reply-sent", onNativeReplySent);
      window.removeEventListener(
        "codit:native-notification-reply",
        onNativeNotificationReply,
      );
    });

    void import("@tauri-apps/plugin-notification")
      .then(({ onAction }) =>
        onAction((event) => openHref(event.notification?.extra?.linkHref)),
      )
      .then((unlisten) => {
        if (disposed) void unlisten.unregister();
        else cleanups.push(() => void unlisten.unregister());
      })
      .catch(() => undefined);

    void import("@capacitor/core")
      .then(async ({ Capacitor }) => {
        if (
          !Capacitor.isNativePlatform() ||
          Capacitor.getPlatform() !== "android"
        ) {
          return;
        }
        const [{ PushNotifications }, { LocalNotifications }] =
          await Promise.all([
            import("@capacitor/push-notifications"),
            import("@capacitor/local-notifications"),
          ]);

        await PushNotifications.createChannel({
          id: ANDROID_HIGH_PRIORITY_CHANNEL_ID,
          name: "Mensagens e alertas urgentes",
          description:
            "Mensagens diretas, chamadas de voz e atividades sociais do Codit.",
          importance: 4,
          visibility: 1,
          vibration: true,
          lights: true,
          lightColor: "#8B6BFF",
        }).catch(() => undefined);

        const [pushListener, localListener] = await Promise.all([
          PushNotifications.addListener(
            "pushNotificationActionPerformed",
            (event) => openHref(event.notification.data?.linkHref),
          ),
          LocalNotifications.addListener(
            "localNotificationActionPerformed",
            (event) => openHref(event.notification.extra?.linkHref),
          ),
        ]);

        if (disposed) {
          await pushListener.remove();
          await localListener.remove();
        } else {
          cleanups.push(() => void pushListener.remove());
          cleanups.push(() => void localListener.remove());
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  // Limpar timers no unmount.
  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      if (persistTimerRef.current !== null) {
        clearTimeout(persistTimerRef.current);
      }
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const dismissToast = useCallback((toastId: string) => {
    const existingTimer = toastTimersRef.current.get(toastId);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
      toastTimersRef.current.delete(toastId);
    }
    setToasts((current) => current.filter((item) => item.id !== toastId));
  }, []);

  const pushToast = useCallback(
    (toast: ActiveNotificationToast) => {
      setToasts((current) => {
        const filtered = current.filter((item) => item.id !== toast.id);
        return [toast, ...filtered].slice(0, MAX_ACTIVE_TOASTS);
      });

      const oldTimer = toastTimersRef.current.get(toast.id);
      if (oldTimer !== undefined) {
        clearTimeout(oldTimer);
      }
      const nextTimer = setTimeout(() => {
        toastTimersRef.current.delete(toast.id);
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, TOAST_TTL_MS);
      toastTimersRef.current.set(toast.id, nextTimer);
    },
    [],
  );

  const shouldSkipDuplicateKey = useCallback((key: string): boolean => {
    const now = Date.now();
    const map = dedupTimestampsRef.current;
    const prev = map.get(key);
    if (prev !== undefined && now - prev < DEDUP_WINDOW_MS) {
      return true;
    }
    map.set(key, now);
    if (map.size > 80) {
      for (const [entryKey, ts] of map.entries()) {
        if (now - ts > DEDUP_WINDOW_MS * 3) {
          map.delete(entryKey);
        }
      }
    }
    return false;
  }, []);

  const setActiveViewedConversationId = useCallback(
    (conversationId: string | null) => {
      activeViewedConversationIdRef.current = conversationId;
      if (conversationId) {
        dismissNativeNotificationTag(`conv:${conversationId}`);
      }
    },
    [],
  );

  const schedulePrefsPersistence = useCallback(
    (nextPrefs: NotificationPreferences) => {
      writeLocalNotificationPrefs(nextPrefs, userId);

      if (!userId || !isConfigured || !isOnline) {
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        return;
      }

      if (persistTimerRef.current !== null) {
        clearTimeout(persistTimerRef.current);
      }

      persistTimerRef.current = setTimeout(() => {
        setIsSyncingPrefs(true);
        void persistUserNotificationPrefs(userId, nextPrefs, client)
          .catch(() => undefined)
          .finally(() => {
            setIsSyncingPrefs(false);
          });
      }, 450);
    },
    [isConfigured, isOnline, userId],
  );

  const updatePrefs = useCallback(
    (patch: Partial<NotificationPreferences>) => {
      setPrefs((current) => {
        const next = normalizeNotificationPreferences({
          ...current,
          ...patch,
          categories: {
            ...current.categories,
            ...(patch.categories ?? {}),
          },
        });
        prefsRef.current = next;
        schedulePrefsPersistence(next);
        return next;
      });
    },
    [schedulePrefsPersistence],
  );

  const setCategoryEnabled = useCallback(
    (key: NotificationPreferenceCategoryKey, enabled: boolean) => {
      setPrefs((current) => {
        const next = normalizeNotificationPreferences({
          ...current,
          categories: {
            ...current.categories,
            [key]: enabled,
          },
        });
        prefsRef.current = next;
        schedulePrefsPersistence(next);
        return next;
      });
    },
    [schedulePrefsPersistence],
  );

  const toggleMuteAll = useCallback(() => {
    setPrefs((current) => {
      const next = normalizeNotificationPreferences({
        ...current,
        muteAll: !current.muteAll,
      });
      prefsRef.current = next;
      schedulePrefsPersistence(next);
      return next;
    });
  }, [schedulePrefsPersistence]);

  const toggleConversationMute = useCallback(
    (conversationId: string) => {
      setPrefs((current) => {
        const exists = current.mutedConversationIds.includes(conversationId);
        const nextIds = exists
          ? current.mutedConversationIds.filter((id) => id !== conversationId)
          : [conversationId, ...current.mutedConversationIds];

        const next = normalizeNotificationPreferences({
          ...current,
          mutedConversationIds: nextIds,
        });
        prefsRef.current = next;
        schedulePrefsPersistence(next);
        return next;
      });
    },
    [schedulePrefsPersistence],
  );

  const isConversationMuted = useCallback(
    (conversationId: string | null | undefined) => {
      return checkConversationMuted(prefs, conversationId);
    },
    [prefs],
  );

  const resetPrefs = useCallback(() => {
    const next = createDefaultNotificationPreferences();
    prefsRef.current = next;
    setPrefs(next);
    schedulePrefsPersistence(next);
  }, [schedulePrefsPersistence]);

  const requestBrowserPermission = useCallback(async () => {
    try {
      const result = await requestSystemNotificationPermission();
      setBrowserPermission(result);
      if (result === "granted") {
        updatePrefs({ browserPushEnabled: true });
      } else {
        updatePrefs({ browserPushEnabled: false });
      }
      return result;
    } catch {
      const current = await getSystemNotificationPermission();
      setBrowserPermission(current);
      return current;
    }
  }, [updatePrefs]);

  // Pede a permissão nativa uma vez após hidratar preferências; no navegador, via botão.
  useEffect(() => {
    let cancelled = false;
    let promptTimer: number | undefined;

    const refreshPermission = async () => {
      const permission = await getSystemNotificationPermission();
      if (cancelled) return;
      setBrowserPermission(permission);

      if (!shouldPromptForNativeNotificationPermission() || !prefsHydrated) {
        return;
      }

      try {
        const permissionPromptKey = `codit:native-notification-prompted:v2:${userId ?? "guest"}`;
        if (window.localStorage.getItem(permissionPromptKey) === "1") return;

        if (permission === "granted") {
          window.localStorage.setItem(permissionPromptKey, "1");
          if (!prefsRef.current.browserPushEnabled) {
            updatePrefs({ browserPushEnabled: true });
          }
          return;
        }
        if (permission !== "default") {
          window.localStorage.setItem(permissionPromptKey, "1");
          return;
        }

        promptTimer = window.setTimeout(() => {
          try {
            window.localStorage.setItem(permissionPromptKey, "1");
          } catch {
            // Segue com o prompt mesmo sem localStorage gravável.
          }
          void requestBrowserPermission();
        }, 1200);
      } catch {
        // O estado da permissão segue disponível pelo painel de preferências.
      }
    };

    void refreshPermission();
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") void refreshPermission();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      cancelled = true;
      if (promptTimer !== undefined) window.clearTimeout(promptTimer);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [prefsHydrated, requestBrowserPermission, updatePrefs, userId]);

  // Sincroniza o token FCM no servidor ou revoga quando o usuário desativa push.
  useEffect(() => {
    if (!userId || !isConfigured || !prefsHydrated) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    let disposed = false;
    const cleanups: Array<() => void> = [];

    const setup = async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (
          !Capacitor.isNativePlatform() ||
          Capacitor.getPlatform() !== "android"
        ) {
          return;
        }

        if (!prefs.browserPushEnabled) {
          if (hasActiveAndroidPushRegistration()) {
            await unregisterCurrentAndroidPushDevice(client);
          }
          return;
        }

        const { PushNotifications } = await import(
          "@capacitor/push-notifications"
        );
        const registrationListener = await PushNotifications.addListener(
          "registration",
          (token) => {
            void persistAndroidPushToken(userId, token.value, client);
          },
        );
        const registrationErrorListener = await PushNotifications.addListener(
          "registrationError",
          () => undefined,
        );

        if (disposed) {
          await registrationListener.remove();
          await registrationErrorListener.remove();
          return;
        }
        cleanups.push(() => void registrationListener.remove());
        cleanups.push(() => void registrationErrorListener.remove());

        const permission = await PushNotifications.checkPermissions();
        if (permission.receive === "granted") {
          await PushNotifications.register();
        }
      } catch {
        // O app ainda funciona sem push enquanto Firebase não está configurado.
      }
    };

    void setup();
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [
    browserPermission,
    isConfigured,
    prefs.browserPushEnabled,
    prefsHydrated,
    userId,
  ]);

  // Carregar preferências e alertas locais quando o usuário autenticado muda.
  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!userId) {
      loadedPrefsUserIdRef.current = null;
      const guestLocal =
        readLocalNotificationPrefs(null) ??
        createDefaultNotificationPreferences();
      void Promise.resolve().then(() => {
        prefsRef.current = guestLocal;
        setPrefs(guestLocal);
        setDbNotifications([]);
        setConversations([]);
        setVoiceCallAlerts([]);
        setToasts([]);
        setMigrationMissing(false);
        setPermissionGrantMissing(false);
        setHydratedScope("guest");
      });
      return;
    }

    const localFirst = readLocalNotificationPrefs(userId);
    const localCalls = readLocalTransientAlerts(userId);
    void Promise.resolve().then(() => {
      if (localFirst) {
        prefsRef.current = localFirst;
        setPrefs(localFirst);
      }
      setVoiceCallAlerts(localCalls);
    });

    if (!isConfigured || !user || loadedPrefsUserIdRef.current === userId) {
      void Promise.resolve().then(() => setHydratedScope(userId));
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      void Promise.resolve().then(() => setHydratedScope(userId));
      return;
    }

    let cancelled = false;
    let completed = false;
    loadedPrefsUserIdRef.current = userId;

    void fetchUserNotificationPrefs(user, client)
      .then((remotePrefs) => {
        if (!cancelled) {
          prefsRef.current = remotePrefs;
          setPrefs(remotePrefs);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        completed = true;
        if (!cancelled) {
          setHydratedScope(userId);
        }
      });

    return () => {
      cancelled = true;
      if (!completed && loadedPrefsUserIdRef.current === userId) {
        loadedPrefsUserIdRef.current = null;
      }
    };
  }, [isAuthLoading, isConfigured, user, userId]);

  const refreshNotifications = useCallback(async () => {
    if (!userId || !isConfigured) {
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    setIsLoading(true);
    try {
      const [notifResult, conversationsData] = await Promise.all([
        listUserNotifications(userId, { limit: 50 }, client),
        listUserConversations(userId, client).catch(() => null),
      ]);

      setDbNotifications(notifResult.items);
      setMigrationMissing(notifResult.migrationMissing);
      setPermissionGrantMissing(notifResult.permissionGrantMissing);
      if (conversationsData) {
        conversationsRef.current = conversationsData;
        setConversations(conversationsData);
      }
    } catch {
      // Falhas transitórias de rede mantêm o estado atual visível.
    } finally {
      setIsLoading(false);
    }
  }, [isConfigured, userId]);

  useEffect(() => {
    refreshNotificationsRef.current = refreshNotifications;
  }, [refreshNotifications]);

  // Carregar lista inicial de notificações + conversas e responder a eventos internos.
  useEffect(() => {
    if (isAuthLoading || !isConfigured || !userId) {
      return;
    }

    void Promise.resolve().then(() => refreshNotifications());

    const unsubNotif = subscribeNotificationsChanged(() => {
      void refreshNotifications();
    });
    const unsubFriends = subscribeFriendshipsChanged(() => {
      void refreshNotifications();
    });
    const unsubMessages = subscribeMessagesChanged(() => {
      const client = getSupabaseClient();
      if (!client) {
        return;
      }
      void listUserConversations(userId, client)
        .then((items) => {
          conversationsRef.current = items;
          setConversations(items);
        })
        .catch(() => undefined);
    });

    return () => {
      unsubNotif();
      unsubFriends();
      unsubMessages();
    };
  }, [isAuthLoading, isConfigured, refreshNotifications, userId]);

  // Canal dedicado `codit:notifications:{userId}` para eventos em tempo real de `public.notifications`.
  useEffect(() => {
    if (!userId || !isConfigured) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    const channel = client
      .channel(`codit:notifications:${userId}`, {
        config: { private: true },
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          void refreshNotifications();

          if (payload.eventType === "DELETE") {
            return;
          }

          const rawRow = payload.new as Partial<NotificationRow> | null;
          if (!rawRow || !rawRow.id || !rawRow.category || !rawRow.title) {
            return;
          }

          if (
            rawRow.category === "friend_request" ||
            rawRow.category === "friend_accepted"
          ) {
            emitFriendshipsChanged();
          }

          if (rawRow.read_at) {
            return;
          }

          const createdMs = rawRow.created_at
            ? Date.parse(rawRow.created_at)
            : Date.now();
          if (!Number.isNaN(createdMs) && Date.now() - createdMs > 25_000) {
            return;
          }

          if (shouldSkipDuplicateKey(`db:${rawRow.id}:${rawRow.created_at ?? ""}`)) {
            return;
          }

          const convId = extractConversationIdFromLink(rawRow.link_href);
          const delivery = shouldDeliverNotification(
            prefsRef.current,
            rawRow.category,
            { conversationId: convId },
          );

          if (delivery.allowToast) {
            pushToast({
              id: `db:${rawRow.id}`,
              category: rawRow.category,
              title: rawRow.title,
              body: rawRow.body ?? null,
              linkHref: rawRow.link_href ?? null,
              conversationId: convId,
              actor: null,
              createdAt: rawRow.created_at ?? new Date().toISOString(),
            });
          }

          if (delivery.allowSound) {
            playNotificationChime();
          }

          if (delivery.allowBrowserPush) {
            void showSystemNotification(
              rawRow.title,
              rawRow.body ?? null,
              rawRow.link_href ?? null,
              {
                category: rawRow.category,
                conversationId: convId,
                tag: rawRow.entity_key ?? `notif:${rawRow.id}`,
                actorId: rawRow.actor_id ?? null,
              },
            );
          }
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [
    isConfigured,
    pushToast,
    refreshNotifications,
    shouldSkipDuplicateKey,
    userId,
  ]);

  const recordIncomingVoiceCall = useCallback(
    (notice: IncomingCallNotice) => {
      if (!userId) {
        return;
      }

      const delivery = shouldDeliverNotification(
        prefsRef.current,
        "voice_call",
        { conversationId: notice.conversationId },
      );

      if (!delivery.allowFeed) {
        return;
      }

      const item: TransientNotificationItem = {
        id: `call:${notice.conversationId}:${Date.parse(notice.sentAt) || Date.now()}`,
        category: "voice_call",
        title: notice.isGroup
          ? `Ligação no grupo ${notice.conversationTitle}`
          : `${notice.callerName} está chamando por voz`,
        body: `Por @${notice.callerUsername} · voz e compartilhamento de tela`,
        linkHref: `/mensagens?c=${encodeURIComponent(notice.conversationId)}`,
        conversationId: notice.conversationId,
        actor: {
          id: notice.callerId,
          fullName: notice.callerName,
          username: notice.callerUsername,
          avatarUrl: notice.callerAvatarUrl ?? null,
        },
        isUnread: true,
        createdAt: notice.sentAt,
        source: "live_call",
      };

      setVoiceCallAlerts((current) => {
        const filtered = current.filter((entry) => entry.id !== item.id);
        const next = [item, ...filtered].slice(0, 15);
        writeLocalTransientAlerts(userId, next);
        return next;
      });

      if (delivery.allowBrowserPush) {
        void showSystemNotification(item.title, item.body, item.linkHref, {
          category: "voice_call",
          conversationId: notice.conversationId,
          conversationTitle: notice.conversationTitle,
          isGroup: notice.isGroup,
          tag: `call:${notice.conversationId}`,
          actorId: notice.callerId,
          actorName: notice.callerName,
          actorUsername: notice.callerUsername,
          actorAvatarUrl: notice.callerAvatarUrl ?? null,
        });
      }
    },
    [userId],
  );

  const handleIncomingMessageInternal = useCallback(
    (params: {
      conversationId: string;
      senderId: string;
      conversationTitle?: string;
      isGroup?: boolean;
      senderName?: string;
      senderUsername?: string;
      senderAvatarUrl?: string | null;
      preview?: string;
      sentAt?: string;
    }) => {
      if (!userId || params.senderId === userId) {
        return;
      }

      if (
        shouldSkipDuplicateKey(
          `msg:${params.conversationId}:${params.senderId}`,
        )
      ) {
        return;
      }

      const matchedSummary = conversationsRef.current.find(
        (item) => item.conversation.id === params.conversationId,
      );
      const matchedMember = matchedSummary?.members.find(
        (item) => item.member.user_id === params.senderId,
      );

      const senderName =
        params.senderName ||
        matchedMember?.profile.full_name ||
        matchedSummary?.directPeer?.full_name ||
        "Nova mensagem";
      const senderUsername =
        params.senderUsername ||
        matchedMember?.profile.username ||
        matchedSummary?.directPeer?.username ||
        null;
      const senderAvatarUrl =
        params.senderAvatarUrl !== undefined
          ? params.senderAvatarUrl
          : (matchedMember?.profile.avatar_url ??
            matchedSummary?.directPeer?.avatar_url ??
            null);
      const isGroup =
        params.isGroup ?? matchedSummary?.conversation.kind === "group";
      const conversationTitle =
        params.conversationTitle || matchedSummary?.displayTitle || senderName;

      const delivery = shouldDeliverNotification(prefsRef.current, "message", {
        conversationId: params.conversationId,
      });

      const isActivelyViewingThread =
        activeViewedConversationIdRef.current === params.conversationId &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible";

      if (isActivelyViewingThread) {
        return;
      }

      const title = isGroup
        ? `${senderName} em ${conversationTitle}`
        : senderName;
      const body =
        params.preview || "Enviou uma nova mensagem para você no Codit.";
      const linkHref = `/mensagens?c=${encodeURIComponent(params.conversationId)}`;
      const createdAt = params.sentAt || new Date().toISOString();

      if (delivery.allowToast) {
        pushToast({
          id: `msg:${params.conversationId}:${Date.now()}`,
          category: "message",
          title,
          body,
          linkHref,
          conversationId: params.conversationId,
          actor: {
            id: params.senderId,
            fullName: senderName,
            username: senderUsername,
            avatarUrl: senderAvatarUrl ?? null,
          },
          createdAt,
        });
      }

      if (delivery.allowSound) {
        playNotificationChime();
      }

      if (delivery.allowBrowserPush) {
        void showSystemNotification(title, body, linkHref, {
          category: "message",
          conversationId: params.conversationId,
          conversationTitle,
          isGroup: Boolean(isGroup),
          tag: `conv:${params.conversationId}`,
          actorId: params.senderId,
          actorName: senderName,
          actorUsername: senderUsername,
          actorAvatarUrl: senderAvatarUrl ?? null,
        });
      }
    },
    [pushToast, shouldSkipDuplicateKey, userId],
  );

  const notifyIncomingMessage = useCallback(
    (payload: unknown) => {
      const parsed = messageNotifyPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      handleIncomingMessageInternal({
        conversationId: parsed.data.conversationId,
        senderId: parsed.data.senderId,
        conversationTitle: parsed.data.conversationTitle,
        isGroup: parsed.data.isGroup,
        senderName: parsed.data.senderName,
        senderUsername: parsed.data.senderUsername,
        senderAvatarUrl: parsed.data.senderAvatarUrl ?? null,
        preview: parsed.data.preview,
        sentAt: parsed.data.sentAt,
      });
    },
    [handleIncomingMessageInternal],
  );

  const notifyIncomingMessageFromRow = useCallback(
    (row: ChatMessageRowNotificationInput) => {
      if (
        !row.conversation_id ||
        !row.sender_id ||
        row.message_type === "system"
      ) {
        return;
      }
      handleIncomingMessageInternal({
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        preview: row.content ? row.content.slice(0, 140) : undefined,
        sentAt: row.created_at,
      });
    },
    [handleIncomingMessageInternal],
  );

  const unreadConversations = useMemo(
    () => conversations.filter((item) => item.unreadCount > 0),
    [conversations],
  );

  const conversationTitlesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of conversations) {
      map[item.conversation.id] = item.displayTitle;
    }
    return map;
  }, [conversations]);

  const visibleItems = useMemo<FeedNotificationItem[]>(() => {
    const merged: FeedNotificationItem[] = [];

    for (const entry of dbNotifications) {
      const convId = extractConversationIdFromLink(entry.notification.link_href);
      const delivery = shouldDeliverNotification(
        prefs,
        entry.notification.category,
        { conversationId: convId },
      );
      if (!delivery.allowFeed) {
        continue;
      }

      merged.push({
        id: `db:${entry.notification.id}`,
        category: entry.notification.category,
        title: entry.notification.title,
        body: entry.notification.body,
        linkHref: entry.notification.link_href,
        conversationId: convId,
        actor: entry.actor
          ? {
              id: entry.actor.id,
              fullName: entry.actor.full_name,
              username: entry.actor.username,
              avatarUrl: entry.actor.avatar_url,
            }
          : null,
        isUnread: entry.notification.read_at === null,
        createdAt: entry.notification.created_at,
        source: "database",
        dbNotificationId: entry.notification.id,
      });
    }

    for (const summary of unreadConversations) {
      const delivery = shouldDeliverNotification(prefs, "message", {
        conversationId: summary.conversation.id,
      });
      if (!delivery.allowFeed) {
        continue;
      }

      const peer = summary.directPeer;
      merged.push({
        id: `conv:${summary.conversation.id}`,
        category: "message",
        title:
          summary.unreadCount > 1
            ? `${summary.unreadCount} mensagens não lidas em ${summary.displayTitle}`
            : `Nova mensagem em ${summary.displayTitle}`,
        body:
          summary.conversation.last_message_preview ||
          "Toque para abrir a conversa.",
        linkHref: `/mensagens?c=${encodeURIComponent(summary.conversation.id)}`,
        conversationId: summary.conversation.id,
        actor: peer
          ? {
              id: peer.id,
              fullName: peer.full_name,
              username: peer.username,
              avatarUrl: peer.avatar_url,
            }
          : null,
        isUnread: true,
        createdAt:
          summary.conversation.last_message_at ??
          summary.conversation.updated_at,
        source: "unread_conversation",
      });
    }

    for (const alert of voiceCallAlerts) {
      const delivery = shouldDeliverNotification(prefs, alert.category, {
        conversationId: alert.conversationId,
      });
      if (!delivery.allowFeed) {
        continue;
      }
      merged.push({
        id: alert.id,
        category: alert.category,
        title: alert.title,
        body: alert.body,
        linkHref: alert.linkHref,
        conversationId: alert.conversationId,
        actor: alert.actor,
        isUnread: alert.isUnread,
        createdAt: alert.createdAt,
        source: "live_call",
      });
    }

    merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return merged;
  }, [dbNotifications, prefs, unreadConversations, voiceCallAlerts]);

  const unreadBadgeCount = useMemo(
    () => visibleItems.filter((item) => item.isUnread).length,
    [visibleItems],
  );

  const markItemAsRead = useCallback(
    async (item: FeedNotificationItem) => {
      if (!userId) {
        return;
      }

      if (item.source === "live_call") {
        setVoiceCallAlerts((current) => {
          const next = current.map((entry) =>
            entry.id === item.id ? { ...entry, isUnread: false } : entry,
          );
          writeLocalTransientAlerts(userId, next);
          return next;
        });
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        return;
      }

      if (item.source === "unread_conversation" && item.conversationId) {
        await markConversationRead(userId, item.conversationId, client).catch(
          () => false,
        );
        emitMessagesChanged();
        return;
      }

      if (item.source === "database" && item.dbNotificationId) {
        const readAt = new Date().toISOString();
        setDbNotifications((current) =>
          current.map((entry) =>
            entry.notification.id === item.dbNotificationId
              ? { ...entry, notification: { ...entry.notification, read_at: readAt } }
              : entry,
          ),
        );
        await markNotificationRead(userId, item.dbNotificationId, client).catch(
          () => false,
        );
      }
    },
    [userId],
  );

  const markAllAsRead = useCallback(async () => {
    if (!userId) {
      return;
    }

    const nowIso = new Date().toISOString();
    setDbNotifications((current) =>
      current.map((entry) =>
        entry.notification.read_at
          ? entry
          : { ...entry, notification: { ...entry.notification, read_at: nowIso } },
      ),
    );
    setVoiceCallAlerts((current) => {
      const next = current.map((entry) => ({ ...entry, isUnread: false }));
      writeLocalTransientAlerts(userId, next);
      return next;
    });

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    await Promise.allSettled([
      markAllNotificationsRead(userId, client),
      ...unreadConversations.map((summary) =>
        markConversationRead(userId, summary.conversation.id, client),
      ),
    ]);

    if (unreadConversations.length > 0) {
      emitMessagesChanged();
    }
    emitNotificationsChanged();
  }, [unreadConversations, userId]);

  const removeNotificationItem = useCallback(
    async (item: FeedNotificationItem) => {
      if (!userId) {
        return;
      }

      if (item.source === "live_call") {
        setVoiceCallAlerts((current) => {
          const next = current.filter((entry) => entry.id !== item.id);
          writeLocalTransientAlerts(userId, next);
          return next;
        });
        return;
      }

      if (item.source === "database" && item.dbNotificationId) {
        setDbNotifications((current) =>
          current.filter(
            (entry) => entry.notification.id !== item.dbNotificationId,
          ),
        );
        const client = getSupabaseClient();
        if (client) {
          await deleteNotification(userId, item.dbNotificationId, client).catch(
            () => false,
          );
        }
      }
    },
    [userId],
  );

  const clearRead = useCallback(async () => {
    if (!userId) {
      return;
    }

    setDbNotifications((current) =>
      current.filter((entry) => entry.notification.read_at === null),
    );
    setVoiceCallAlerts((current) => {
      const next = current.filter((entry) => entry.isUnread);
      writeLocalTransientAlerts(userId, next);
      return next;
    });

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    await clearReadNotifications(userId, client).catch(() => 0);
  }, [userId]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      prefs,
      isLoading,
      isSyncingPrefs,
      migrationMissing,
      permissionGrantMissing,
      browserPermission,
      dbNotifications,
      unreadConversations,
      conversationTitlesById,
      voiceCallAlerts,
      visibleItems,
      unreadBadgeCount,
      toasts,
      updatePrefs,
      setCategoryEnabled,
      toggleMuteAll,
      toggleConversationMute,
      isConversationMuted,
      resetPrefs,
      requestBrowserPermission,
      refreshNotifications,
      markItemAsRead,
      markAllAsRead,
      removeNotificationItem,
      clearRead,
      dismissToast,
      setActiveViewedConversationId,
      recordIncomingVoiceCall,
      notifyIncomingMessage,
      notifyIncomingMessageFromRow,
    }),
    [
      browserPermission,
      clearRead,
      conversationTitlesById,
      dbNotifications,
      dismissToast,
      isConversationMuted,
      isLoading,
      isSyncingPrefs,
      markAllAsRead,
      markItemAsRead,
      migrationMissing,
      notifyIncomingMessage,
      notifyIncomingMessageFromRow,
      permissionGrantMissing,
      prefs,
      recordIncomingVoiceCall,
      refreshNotifications,
      removeNotificationItem,
      requestBrowserPermission,
      resetPrefs,
      setActiveViewedConversationId,
      setCategoryEnabled,
      toasts,
      toggleConversationMute,
      toggleMuteAll,
      unreadBadgeCount,
      unreadConversations,
      updatePrefs,
      visibleItems,
      voiceCallAlerts,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error(
      "useNotifications deve ser utilizado dentro de <NotificationsProvider>.",
    );
  }
  return context;
}

export function useNotificationsOptional(): NotificationsContextValue | null {
  return useContext(NotificationsContext);
}
