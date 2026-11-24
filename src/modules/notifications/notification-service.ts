import type { User } from "@supabase/supabase-js";
import {
  requireSupabaseClient,
  type CoditSupabaseClient,
} from "@/lib/supabase/client";
import type {
  NotificationCategory,
  NotificationRow,
  PublicProfileRow,
} from "@/lib/supabase/database.types";
import {
  extractSupabaseErrorMeta,
  isMissingDatabaseSchemaError,
  isSchemaMismatchError,
  isTablePrivilegeError,
  mapSupabaseDatabaseError,
} from "@/lib/supabase/errors";
import { assertAuthenticatedUserMatches } from "@/lib/supabase/session-guard";
import {
  createDefaultNotificationPreferences,
  normalizeNotificationPreferences,
  toDatabaseNotificationPrefs,
  type NotificationPreferences,
} from "@/modules/notifications/notification-schemas";
import { uuidSchema } from "@/modules/social/social-schemas";
import {
  normalizePublicProfileRow,
  type RawPublicProfileDbRow,
} from "@/modules/social/social-service";

const NOTIFICATION_PREFS_GLOBAL_STORAGE_KEY = "codit:notifications:prefs:v1";
const NOTIFICATION_PREFS_USER_STORAGE_PREFIX =
  "codit:notifications:prefs:user:";
const TRANSIENT_ALERTS_USER_STORAGE_PREFIX =
  "codit:notifications:transient:user:";
const MAX_TRANSIENT_ALERTS = 15;

export interface EnrichedNotificationItem {
  notification: NotificationRow;
  actor: PublicProfileRow | null;
}

export interface TransientNotificationItem {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  linkHref: string | null;
  conversationId: string | null;
  actor: {
    id: string;
    fullName: string;
    username: string | null;
    avatarUrl: string | null;
  } | null;
  isUnread: boolean;
  createdAt: string;
  source: "live_call" | "live_message";
}

export interface NotificationServiceErrorDetails {
  isMigrationMissing?: boolean | undefined;
  isPermissionGrantMissing?: boolean | undefined;
  code?: string | undefined;
  status?: number | null | undefined;
}

export class NotificationServiceError extends Error {
  readonly isMigrationMissing: boolean;
  readonly isPermissionGrantMissing: boolean;
  readonly code?: string | undefined;
  readonly status?: number | null | undefined;

  constructor(
    message: string,
    details: NotificationServiceErrorDetails = {},
  ) {
    super(message);
    this.name = "NotificationServiceError";
    this.isMigrationMissing = Boolean(details.isMigrationMissing);
    this.isPermissionGrantMissing = Boolean(details.isPermissionGrantMissing);
    this.code = details.code;
    this.status = details.status ?? null;
  }
}

function toNotificationServiceError(
  error: unknown,
  context?: { status?: number | null; table?: string; operation?: string },
): NotificationServiceError {
  const meta = extractSupabaseErrorMeta(error, context);
  return new NotificationServiceError(
    mapSupabaseDatabaseError(error, {
      status: meta.status,
      table: context?.table,
      operation: context?.operation,
    }),
    {
      isMigrationMissing: isMissingDatabaseSchemaError(error),
      isPermissionGrantMissing: isTablePrivilegeError(error),
      code: meta.code || undefined,
      status: meta.status,
    },
  );
}

function getPrefsStorageKey(userId?: string | null): string {
  return userId
    ? `${NOTIFICATION_PREFS_USER_STORAGE_PREFIX}${userId}`
    : NOTIFICATION_PREFS_GLOBAL_STORAGE_KEY;
}

export function readLocalNotificationPrefs(
  userId?: string | null,
): NotificationPreferences | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    const raw =
      (userId
        ? window.localStorage.getItem(getPrefsStorageKey(userId))
        : null) ??
      window.localStorage.getItem(NOTIFICATION_PREFS_GLOBAL_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return normalizeNotificationPreferences(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeLocalNotificationPrefs(
  prefs: NotificationPreferences,
  userId?: string | null,
): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  const normalized = normalizeNotificationPreferences(prefs);
  const serialized = JSON.stringify(normalized);

  try {
    window.localStorage.setItem(
      NOTIFICATION_PREFS_GLOBAL_STORAGE_KEY,
      serialized,
    );
    if (userId) {
      window.localStorage.setItem(getPrefsStorageKey(userId), serialized);
    }
  } catch {
    // Ignora falha de cota ou modo privado.
  }
}

function readMetadataNotificationPrefs(
  user: Pick<User, "user_metadata">,
): NotificationPreferences | null {
  const metadata = user.user_metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const candidate = (metadata as Record<string, unknown>)
    .codit_notification_prefs;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  return normalizeNotificationPreferences(candidate);
}

export async function fetchUserNotificationPrefs(
  user: Pick<User, "id" | "user_metadata">,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<NotificationPreferences> {
  const localPrefs = readLocalNotificationPrefs(user.id);
  const metadataPrefs = readMetadataNotificationPrefs(user);

  const { data, error } = await client
    .from("profiles")
    .select("notification_prefs")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data || !("notification_prefs" in data)) {
    return (
      localPrefs ?? metadataPrefs ?? createDefaultNotificationPreferences()
    );
  }

  const normalized = normalizeNotificationPreferences(data.notification_prefs);
  writeLocalNotificationPrefs(normalized, user.id);
  return normalized;
}

export async function persistUserNotificationPrefs(
  userId: string,
  prefs: NotificationPreferences,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<{ prefs: NotificationPreferences; syncedToDb: boolean }> {
  const normalized = normalizeNotificationPreferences(prefs);
  writeLocalNotificationPrefs(normalized, userId);

  await assertAuthenticatedUserMatches(
    userId,
    client,
    (message) =>
      new NotificationServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const dbPayload = toDatabaseNotificationPrefs(normalized);
  const { error, status } = await client
    .from("profiles")
    .update({ notification_prefs: dbPayload })
    .eq("id", userId);

  if (!error) {
    return { prefs: normalized, syncedToDb: true };
  }

  if (isSchemaMismatchError(error) || isMissingDatabaseSchemaError(error)) {
    try {
      if (typeof client.auth?.updateUser === "function") {
        await client.auth.updateUser({
          data: {
            codit_notification_prefs: dbPayload,
          },
        });
      }
    } catch {
      // Fallback silencioso: preferências já foram salvas localmente.
    }
    return { prefs: normalized, syncedToDb: false };
  }

  throw toNotificationServiceError(error, {
    status,
    table: "profiles",
    operation: "persistUserNotificationPrefs",
  });
}

export async function listUserNotifications(
  userId: string,
  options: { limit?: number } = {},
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<{
  items: EnrichedNotificationItem[];
  migrationMissing: boolean;
  permissionGrantMissing: boolean;
}> {
  const parsedUserId = uuidSchema.safeParse(userId);
  if (!parsedUserId.success) {
    throw new NotificationServiceError("Identificador de usuário inválido.", {
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  const validUserId = parsedUserId.data;
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 60);

  const { data, error, status } = await client
    .from("notifications")
    .select("*")
    .eq("recipient_id", validUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    const isGrantMissing = isTablePrivilegeError(error);
    if (isMissingDatabaseSchemaError(error) && !isGrantMissing) {
      return {
        items: [],
        migrationMissing: true,
        permissionGrantMissing: false,
      };
    }
    throw toNotificationServiceError(error, {
      status,
      table: "notifications",
      operation: "listUserNotifications",
    });
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      items: [],
      migrationMissing: false,
      permissionGrantMissing: false,
    };
  }

  const actorIds = Array.from(
    new Set(
      rows
        .map((row) => row.actor_id)
        .filter((actorId): actorId is string => Boolean(actorId)),
    ),
  );

  const actorMap = new Map<string, PublicProfileRow>();
  if (actorIds.length > 0) {
    const { data: profilesData } = await client
      .from("public_profiles")
      .select("*")
      .in("id", actorIds);

    for (const item of (profilesData ?? []) as RawPublicProfileDbRow[]) {
      const normalized = normalizePublicProfileRow(item);
      actorMap.set(normalized.id, normalized);
    }
  }

  return {
    items: rows.map((row) => ({
      notification: row,
      actor: row.actor_id ? (actorMap.get(row.actor_id) ?? null) : null,
    })),
    migrationMissing: false,
    permissionGrantMissing: false,
  };
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<boolean> {
  const validUserId = uuidSchema.parse(userId);
  const validNotificationId = uuidSchema.parse(notificationId);

  await assertAuthenticatedUserMatches(
    validUserId,
    client,
    (message) =>
      new NotificationServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const { error, status } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", validNotificationId)
    .eq("recipient_id", validUserId)
    .is("read_at", null);

  if (error) {
    if (isMissingDatabaseSchemaError(error) && !isTablePrivilegeError(error)) {
      return false;
    }
    throw toNotificationServiceError(error, {
      status,
      table: "notifications",
      operation: "markNotificationRead",
    });
  }

  return true;
}

export async function markAllNotificationsRead(
  userId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<number> {
  const validUserId = uuidSchema.parse(userId);

  await assertAuthenticatedUserMatches(
    validUserId,
    client,
    (message) =>
      new NotificationServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const { data, error, status } = await client.rpc(
    "mark_all_notifications_read",
  );

  if (!error) {
    return typeof data === "number" ? data : 0;
  }

  if (isMissingDatabaseSchemaError(error) && !isTablePrivilegeError(error)) {
    const fallback = await client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", validUserId)
      .is("read_at", null);

    if (fallback.error) {
      if (isMissingDatabaseSchemaError(fallback.error)) {
        return 0;
      }
      throw toNotificationServiceError(fallback.error, {
        status: fallback.status,
        table: "notifications",
        operation: "markAllNotificationsRead.fallback",
      });
    }
    return 0;
  }

  throw toNotificationServiceError(error, {
    status,
    table: "notifications",
    operation: "markAllNotificationsRead",
  });
}

export async function deleteNotification(
  userId: string,
  notificationId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<boolean> {
  const validUserId = uuidSchema.parse(userId);
  const validNotificationId = uuidSchema.parse(notificationId);

  await assertAuthenticatedUserMatches(
    validUserId,
    client,
    (message) =>
      new NotificationServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const { error, status } = await client
    .from("notifications")
    .delete()
    .eq("id", validNotificationId)
    .eq("recipient_id", validUserId);

  if (error) {
    if (isMissingDatabaseSchemaError(error) && !isTablePrivilegeError(error)) {
      return false;
    }
    throw toNotificationServiceError(error, {
      status,
      table: "notifications",
      operation: "deleteNotification",
    });
  }

  return true;
}

export async function clearReadNotifications(
  userId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<number> {
  const validUserId = uuidSchema.parse(userId);

  await assertAuthenticatedUserMatches(
    validUserId,
    client,
    (message) =>
      new NotificationServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const { data, error, status } = await client.rpc("clear_read_notifications");

  if (!error) {
    return typeof data === "number" ? data : 0;
  }

  if (isMissingDatabaseSchemaError(error) && !isTablePrivilegeError(error)) {
    const fallback = await client
      .from("notifications")
      .delete()
      .eq("recipient_id", validUserId)
      .not("read_at", "is", null);

    if (fallback.error) {
      if (isMissingDatabaseSchemaError(fallback.error)) {
        return 0;
      }
      throw toNotificationServiceError(fallback.error, {
        status: fallback.status,
        table: "notifications",
        operation: "clearReadNotifications.fallback",
      });
    }
    return 0;
  }

  throw toNotificationServiceError(error, {
    status,
    table: "notifications",
    operation: "clearReadNotifications",
  });
}

export function readLocalTransientAlerts(
  userId: string | null | undefined,
): TransientNotificationItem[] {
  if (!userId || typeof window === "undefined" || !window.localStorage) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(
      `${TRANSIENT_ALERTS_USER_STORAGE_PREFIX}${userId}`,
    );
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.slice(0, MAX_TRANSIENT_ALERTS) as TransientNotificationItem[];
  } catch {
    return [];
  }
}

export function writeLocalTransientAlerts(
  userId: string | null | undefined,
  items: ReadonlyArray<TransientNotificationItem>,
): void {
  if (!userId || typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(
      `${TRANSIENT_ALERTS_USER_STORAGE_PREFIX}${userId}`,
      JSON.stringify(items.slice(0, MAX_TRANSIENT_ALERTS)),
    );
  } catch {
    // Ignora erro de armazenamento local.
  }
}

export function playNotificationChime(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) {
      return;
    }

    const context = new AudioCtx();
    const now = context.currentTime;
    const notes = [587.33, 880];

    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.09);
      gainNode.gain.setValueAtTime(0.0001, now + index * 0.09);
      gainNode.gain.exponentialRampToValueAtTime(
        0.05,
        now + index * 0.09 + 0.02,
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.0001,
        now + index * 0.09 + 0.22,
      );
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(now + index * 0.09);
      oscillator.stop(now + index * 0.09 + 0.24);
    });

    setTimeout(() => {
      void context.close().catch(() => undefined);
    }, 600);
  } catch {
    // Web Audio indisponível ou bloqueado sem gesto prévio.
  }
}
