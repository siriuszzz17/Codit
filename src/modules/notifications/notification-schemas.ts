import { z } from "zod";
import type {
  NotificationCategory,
  NotificationPreferencesJson,
} from "@/lib/supabase/database.types";
import { uuidSchema } from "@/modules/social/social-schemas";

export const NOTIFICATION_CATEGORY_KEYS = [
  "messages",
  "voice_calls",
  "project_likes",
  "project_comments",
  "friend_requests",
  "friend_accepted",
  "group_invites",
] as const;

export type NotificationPreferenceCategoryKey =
  (typeof NOTIFICATION_CATEGORY_KEYS)[number];

export const MAX_MUTED_CONVERSATIONS = 100;

export interface NotificationCategoryMeta {
  key: NotificationPreferenceCategoryKey;
  rowCategory: NotificationCategory;
  label: string;
  description: string;
}

export const NOTIFICATION_CATEGORY_CATALOG: ReadonlyArray<NotificationCategoryMeta> =
  [
    {
      key: "messages",
      rowCategory: "message",
      label: "Mensagens",
      description: "Mensagens diretas de amigos e mensagens em grupos.",
    },
    {
      key: "voice_calls",
      rowCategory: "voice_call",
      label: "Ligações de voz",
      description:
        "Chamadas de voz e compartilhamento de tela recebidos em tempo real.",
    },
    {
      key: "project_likes",
      rowCategory: "project_like",
      label: "Curtidas em projetos",
      description: "Quando alguém curte um mini-projeto publicado por você.",
    },
    {
      key: "project_comments",
      rowCategory: "project_comment",
      label: "Comentários em projetos",
      description: "Novos comentários publicados nos seus mini-projetos.",
    },
    {
      key: "friend_requests",
      rowCategory: "friend_request",
      label: "Pedidos de amizade",
      description: "Solicitações recebidas para o seu @usuário.",
    },
    {
      key: "friend_accepted",
      rowCategory: "friend_accepted",
      label: "Amizades aceitas",
      description: "Confirmações quando alguém aceita sua solicitação.",
    },
    {
      key: "group_invites",
      rowCategory: "group_invite",
      label: "Convites para grupos",
      description: "Quando um amigo adiciona você a um grupo de estudo.",
    },
  ];

export interface NotificationPreferences {
  muteAll: boolean;
  toastEnabled: boolean;
  soundEnabled: boolean;
  browserPushEnabled: boolean;
  categories: Record<NotificationPreferenceCategoryKey, boolean>;
  mutedConversationIds: string[];
}

export function createDefaultNotificationPreferences(): NotificationPreferences {
  return {
    muteAll: false,
    toastEnabled: true,
    soundEnabled: true,
    browserPushEnabled: false,
    categories: {
      messages: true,
      voice_calls: true,
      project_likes: true,
      project_comments: true,
      friend_requests: true,
      friend_accepted: true,
      group_invites: true,
    },
    mutedConversationIds: [],
  };
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences =
  createDefaultNotificationPreferences();

export const notificationPreferencesSchema = z.object({
  muteAll: z.boolean(),
  toastEnabled: z.boolean(),
  soundEnabled: z.boolean(),
  browserPushEnabled: z.boolean(),
  categories: z.object({
    messages: z.boolean(),
    voice_calls: z.boolean(),
    project_likes: z.boolean(),
    project_comments: z.boolean(),
    friend_requests: z.boolean(),
    friend_accepted: z.boolean(),
    group_invites: z.boolean(),
  }),
  mutedConversationIds: z
    .array(uuidSchema)
    .max(MAX_MUTED_CONVERSATIONS),
});

export const messageNotifyPayloadSchema = z.object({
  conversationId: uuidSchema,
  conversationTitle: z.string().trim().max(120).optional(),
  isGroup: z.boolean().optional(),
  senderId: uuidSchema,
  senderName: z.string().trim().max(120).optional(),
  senderUsername: z.string().trim().max(40).optional(),
  senderAvatarUrl: z.string().nullable().optional(),
  preview: z.string().trim().max(240).optional(),
  sentAt: z.string().optional(),
});

export type MessageNotifyPayload = z.infer<typeof messageNotifyPayloadSchema>;

function pickBoolean(candidate: unknown, fallback: boolean): boolean {
  return typeof candidate === "boolean" ? candidate : fallback;
}

function normalizeMutedConversationIds(rawIds: unknown): string[] {
  if (!Array.isArray(rawIds)) {
    return [];
  }

  const seen = new Set<string>();
  const validIds: string[] = [];

  for (const item of rawIds) {
    if (validIds.length >= MAX_MUTED_CONVERSATIONS) {
      break;
    }
    const parsed = uuidSchema.safeParse(item);
    if (parsed.success && !seen.has(parsed.data)) {
      seen.add(parsed.data);
      validIds.push(parsed.data);
    }
  }

  return validIds;
}

export function normalizeNotificationPreferences(
  raw: unknown,
): NotificationPreferences {
  const defaults = createDefaultNotificationPreferences();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const record = raw as Record<string, unknown>;
  const rawCategories =
    record.categories && typeof record.categories === "object"
      ? (record.categories as Record<string, unknown>)
      : {};

  return {
    muteAll: pickBoolean(record.muteAll ?? record.mute_all, defaults.muteAll),
    toastEnabled: pickBoolean(
      record.toastEnabled ?? record.toast_enabled,
      defaults.toastEnabled,
    ),
    soundEnabled: pickBoolean(
      record.soundEnabled ?? record.sound_enabled,
      defaults.soundEnabled,
    ),
    browserPushEnabled: pickBoolean(
      record.browserPushEnabled ?? record.browser_push_enabled,
      defaults.browserPushEnabled,
    ),
    categories: {
      messages: pickBoolean(rawCategories.messages, defaults.categories.messages),
      voice_calls: pickBoolean(
        rawCategories.voice_calls,
        defaults.categories.voice_calls,
      ),
      project_likes: pickBoolean(
        rawCategories.project_likes,
        defaults.categories.project_likes,
      ),
      project_comments: pickBoolean(
        rawCategories.project_comments,
        defaults.categories.project_comments,
      ),
      friend_requests: pickBoolean(
        rawCategories.friend_requests,
        defaults.categories.friend_requests,
      ),
      friend_accepted: pickBoolean(
        rawCategories.friend_accepted,
        defaults.categories.friend_accepted,
      ),
      group_invites: pickBoolean(
        rawCategories.group_invites,
        defaults.categories.group_invites,
      ),
    },
    mutedConversationIds: normalizeMutedConversationIds(
      record.mutedConversationIds ?? record.muted_conversation_ids,
    ),
  };
}

export function toDatabaseNotificationPrefs(
  prefs: NotificationPreferences,
): NotificationPreferencesJson {
  const normalized = normalizeNotificationPreferences(prefs);
  return {
    mute_all: normalized.muteAll,
    toast_enabled: normalized.toastEnabled,
    sound_enabled: normalized.soundEnabled,
    browser_push_enabled: normalized.browserPushEnabled,
    categories: {
      messages: normalized.categories.messages,
      voice_calls: normalized.categories.voice_calls,
      project_likes: normalized.categories.project_likes,
      project_comments: normalized.categories.project_comments,
      friend_requests: normalized.categories.friend_requests,
      friend_accepted: normalized.categories.friend_accepted,
      group_invites: normalized.categories.group_invites,
    },
    muted_conversation_ids: [...normalized.mutedConversationIds],
  };
}

export function mapRowCategoryToPrefKey(
  category: NotificationCategory,
): NotificationPreferenceCategoryKey {
  switch (category) {
    case "message":
      return "messages";
    case "voice_call":
      return "voice_calls";
    case "project_like":
      return "project_likes";
    case "project_comment":
      return "project_comments";
    case "friend_request":
      return "friend_requests";
    case "friend_accepted":
      return "friend_accepted";
    case "group_invite":
      return "group_invites";
  }
}

export function isNotificationCategoryAllowed(
  prefs: NotificationPreferences,
  category: NotificationCategory,
): boolean {
  if (prefs.muteAll) {
    return false;
  }
  const prefKey = mapRowCategoryToPrefKey(category);
  return prefs.categories[prefKey] !== false;
}

export function isConversationMuted(
  prefs: NotificationPreferences,
  conversationId: string | null | undefined,
): boolean {
  if (!conversationId) {
    return false;
  }
  return prefs.mutedConversationIds.includes(conversationId);
}

export interface NotificationDeliveryDecision {
  allowFeed: boolean;
  allowBadge: boolean;
  allowToast: boolean;
  allowSound: boolean;
  allowBrowserPush: boolean;
}

export function shouldDeliverNotification(
  prefs: NotificationPreferences,
  category: NotificationCategory,
  options?: { conversationId?: string | null },
): NotificationDeliveryDecision {
  const categoryAllowed = isNotificationCategoryAllowed(prefs, category);
  const conversationMuted =
    (category === "message" ||
      category === "voice_call" ||
      category === "group_invite") &&
    isConversationMuted(prefs, options?.conversationId);

  const allowFeed = categoryAllowed && !conversationMuted;

  return {
    allowFeed,
    allowBadge: allowFeed,
    allowToast: allowFeed && prefs.toastEnabled,
    allowSound: allowFeed && prefs.soundEnabled,
    allowBrowserPush: allowFeed && prefs.browserPushEnabled,
  };
}

export function isDefaultNotificationPreferences(
  prefs: NotificationPreferences,
): boolean {
  const defaults = createDefaultNotificationPreferences();
  return (
    prefs.muteAll === defaults.muteAll &&
    prefs.toastEnabled === defaults.toastEnabled &&
    prefs.soundEnabled === defaults.soundEnabled &&
    prefs.browserPushEnabled === defaults.browserPushEnabled &&
    prefs.mutedConversationIds.length === 0 &&
    NOTIFICATION_CATEGORY_KEYS.every(
      (key) => prefs.categories[key] === defaults.categories[key],
    )
  );
}
