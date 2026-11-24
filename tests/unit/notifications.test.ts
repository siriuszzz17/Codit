import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import type {
  NotificationRow,
  PublicProfileRow,
} from "@/lib/supabase/database.types";
import {
  detectMissingMigrationName,
  mapSupabaseDatabaseError,
} from "@/lib/supabase/errors";
import {
  createDefaultNotificationPreferences,
  isDefaultNotificationPreferences,
  NOTIFICATION_CATEGORY_CATALOG,
  NOTIFICATION_CATEGORY_KEYS,
  normalizeNotificationPreferences,
  shouldDeliverNotification,
  toDatabaseNotificationPrefs,
} from "@/modules/notifications/notification-schemas";
import {
  clearReadNotifications,
  fetchUserNotificationPrefs,
  listUserNotifications,
  markAllNotificationsRead,
  NotificationServiceError,
  persistUserNotificationPrefs,
  readLocalNotificationPrefs,
  writeLocalNotificationPrefs,
} from "@/modules/notifications/notification-service";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const CONV_A = "33333333-3333-4333-8333-333333333333";
const CONV_B = "44444444-4444-4444-8444-444444444444";
const NOTIF_1 = "55555555-5555-4555-8555-555555555555";

describe("notifications preferences & delivery logic", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes camelCase and PostgreSQL snake_case preferences safely", () => {
    expect(NOTIFICATION_CATEGORY_KEYS).toHaveLength(7);
    expect(NOTIFICATION_CATEGORY_CATALOG).toHaveLength(7);

    const defaults = createDefaultNotificationPreferences();
    expect(isDefaultNotificationPreferences(defaults)).toBe(true);

    const fromSnake = normalizeNotificationPreferences({
      mute_all: false,
      toast_enabled: false,
      sound_enabled: true,
      browser_push_enabled: true,
      categories: {
        messages: true,
        voice_calls: false,
        project_likes: false,
        project_comments: true,
        friend_requests: true,
        friend_accepted: false,
        group_invites: true,
      },
      muted_conversation_ids: [CONV_A, CONV_A, "invalid-uuid"],
    });

    expect(fromSnake).toEqual({
      muteAll: false,
      toastEnabled: false,
      soundEnabled: true,
      browserPushEnabled: true,
      categories: {
        messages: true,
        voice_calls: false,
        project_likes: false,
        project_comments: true,
        friend_requests: true,
        friend_accepted: false,
        group_invites: true,
      },
      mutedConversationIds: [CONV_A],
    });
    expect(isDefaultNotificationPreferences(fromSnake)).toBe(false);

    expect(toDatabaseNotificationPrefs(fromSnake)).toEqual({
      mute_all: false,
      toast_enabled: false,
      sound_enabled: true,
      browser_push_enabled: true,
      categories: {
        messages: true,
        voice_calls: false,
        project_likes: false,
        project_comments: true,
        friend_requests: true,
        friend_accepted: false,
        group_invites: true,
      },
      muted_conversation_ids: [CONV_A],
    });

    expect(normalizeNotificationPreferences("corrupted")).toEqual(defaults);
  });

  it("applies muteAll, category mutes, channel toggles and per-conversation mute", () => {
    const base = createDefaultNotificationPreferences();

    expect(shouldDeliverNotification(base, "project_like")).toEqual({
      allowFeed: true,
      allowBadge: true,
      allowToast: true,
      allowSound: true,
      allowBrowserPush: false,
    });

    // Mutar categoria específica silencia apenas aquela categoria.
    const likesMuted = normalizeNotificationPreferences({
      ...base,
      categories: { ...base.categories, project_likes: false, voice_calls: false },
      browserPushEnabled: true,
    });
    expect(shouldDeliverNotification(likesMuted, "project_like")).toEqual({
      allowFeed: false,
      allowBadge: false,
      allowToast: false,
      allowSound: false,
      allowBrowserPush: false,
    });
    expect(shouldDeliverNotification(likesMuted, "voice_call")).toEqual({
      allowFeed: false,
      allowBadge: false,
      allowToast: false,
      allowSound: false,
      allowBrowserPush: false,
    });
    expect(shouldDeliverNotification(likesMuted, "project_comment")).toEqual({
      allowFeed: true,
      allowBadge: true,
      allowToast: true,
      allowSound: true,
      allowBrowserPush: true,
    });

    // Silenciar conversa afeta apenas mensagens, chamadas e convite daquela conversa.
    const convMuted = normalizeNotificationPreferences({
      ...base,
      mutedConversationIds: [CONV_A],
      soundEnabled: false,
    });
    expect(
      shouldDeliverNotification(convMuted, "message", {
        conversationId: CONV_A,
      }),
    ).toEqual({
      allowFeed: false,
      allowBadge: false,
      allowToast: false,
      allowSound: false,
      allowBrowserPush: false,
    });
    expect(
      shouldDeliverNotification(convMuted, "message", {
        conversationId: CONV_B,
      }),
    ).toEqual({
      allowFeed: true,
      allowBadge: true,
      allowToast: true,
      allowSound: false,
      allowBrowserPush: false,
    });

    // muteAll bloqueia tudo independentemente das categorias individuais.
    const globalMuted = normalizeNotificationPreferences({
      ...base,
      muteAll: true,
      browserPushEnabled: true,
    });
    for (const cat of [
      "message",
      "voice_call",
      "project_like",
      "project_comment",
      "friend_request",
      "friend_accepted",
      "group_invite",
    ] as const) {
      expect(shouldDeliverNotification(globalMuted, cat)).toEqual({
        allowFeed: false,
        allowBadge: false,
        allowToast: false,
        allowSound: false,
        allowBrowserPush: false,
      });
    }
  });
});

describe("notifications service & Supabase error diagnostics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists prefs locally, guards cross-user updates, and handles pending DB migration", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });

    const prefs = normalizeNotificationPreferences({
      muteAll: false,
      categories: { project_likes: false },
    });

    writeLocalNotificationPrefs(prefs, USER_A);
    expect(readLocalNotificationPrefs(USER_A)?.categories.project_likes).toBe(
      false,
    );

    const mismatchedClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: USER_B } } },
          error: null,
        }),
      },
      from: vi.fn(),
    } as unknown as CoditSupabaseClient;

    await expect(
      persistUserNotificationPrefs(USER_A, prefs, mismatchedClient),
    ).rejects.toMatchObject({
      name: "NotificationServiceError",
      code: "AUTH_USER_MISMATCH",
    } satisfies Partial<NotificationServiceError>);

    // Caso 1: banco migrado com profiles.notification_prefs
    const eqUpdate = vi.fn().mockResolvedValue({ error: null, status: 200 });
    const update = vi.fn().mockReturnValue({ eq: eqUpdate });
    const migratedClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: USER_A } } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({ update }),
    } as unknown as CoditSupabaseClient;

    const saved = await persistUserNotificationPrefs(
      USER_A,
      prefs,
      migratedClient,
    );
    expect(saved.syncedToDb).toBe(true);
    expect(update).toHaveBeenCalledWith({
      notification_prefs: toDatabaseNotificationPrefs(prefs),
    });

    // Caso 2: coluna ausente (PGRST204) aciona fallback em user_metadata
    const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null });
    const legacyClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: USER_A } } },
          error: null,
        }),
        updateUser,
      },
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: {
              code: "PGRST204",
              message:
                "Could not find the 'notification_prefs' column of 'profiles'",
            },
            status: 400,
          }),
        }),
      }),
    } as unknown as CoditSupabaseClient;

    const fallbackSaved = await persistUserNotificationPrefs(
      USER_A,
      prefs,
      legacyClient,
    );
    expect(fallbackSaved.syncedToDb).toBe(false);
    expect(updateUser).toHaveBeenCalledWith({
      data: {
        codit_notification_prefs: toDatabaseNotificationPrefs(prefs),
      },
    });

    // fetchUserNotificationPrefs prioriza DB quando disponível
    const fetchClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                notification_prefs: {
                  mute_all: true,
                  categories: { project_comments: false },
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as CoditSupabaseClient;

    const fetched = await fetchUserNotificationPrefs(
      { id: USER_A, user_metadata: {} },
      fetchClient,
    );
    expect(fetched.muteAll).toBe(true);
    expect(fetched.categories.project_comments).toBe(false);
  });

  it("lists enriched notifications, handles missing table cleanly, and runs batch RPCs", async () => {
    const sampleRow: NotificationRow = {
      id: NOTIF_1,
      recipient_id: USER_A,
      actor_id: USER_B,
      category: "project_like",
      title: "Maria Oliveira curtiu seu projeto",
      body: "Calculadora JS",
      link_href: "/comunidade?project=123",
      entity_key: "like:123:" + USER_B,
      read_at: null,
      created_at: "2026-11-24T12:00:00.000Z",
    };

    const actorProfile: PublicProfileRow = {
      id: USER_B,
      username: "maria.dev",
      full_name: "Maria Oliveira",
      avatar_url: null,
      bio: null,
      github_username: null,
      headline: null,
      location: null,
      website_url: null,
      linkedin_url: null,
      banner_preset: "nebula",
      accent_theme: "violet",
      avatar_frame: "glow",
      octopy_companion: "coding",
      skills: [],
      created_at: "2026-11-24T10:00:00.000Z",
      updated_at: "2026-11-24T10:00:00.000Z",
    };

    const rpcMock = vi.fn().mockResolvedValue({ data: 2, error: null });
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: USER_A } } },
          error: null,
        }),
      },
      rpc: rpcMock,
      from: vi.fn((table: string) => {
        if (table === "notifications") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [sampleRow],
                    error: null,
                    status: 200,
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [actorProfile],
              error: null,
              status: 200,
            }),
          }),
        };
      }),
    } as unknown as CoditSupabaseClient;

    const listed = await listUserNotifications(USER_A, { limit: 20 }, client);
    expect(listed.migrationMissing).toBe(false);
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.actor?.username).toBe("maria.dev");

    expect(await markAllNotificationsRead(USER_A, client)).toBe(2);
    expect(rpcMock).toHaveBeenCalledWith("mark_all_notifications_read");

    expect(await clearReadNotifications(USER_A, client)).toBe(2);
    expect(rpcMock).toHaveBeenCalledWith("clear_read_notifications");

    // Tabela ainda não criada -> migrationMissing = true sem lançar exceção
    const unmigratedClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: null,
                error: {
                  code: "42P01",
                  message: 'relation "public.notifications" does not exist',
                },
                status: 404,
              }),
            }),
          }),
        }),
      }),
    } as unknown as CoditSupabaseClient;

    const missingResult = await listUserNotifications(
      USER_A,
      {},
      unmigratedClient,
    );
    expect(missingResult.migrationMissing).toBe(true);
    expect(missingResult.items).toEqual([]);
  });

  it("identifies missing notifications migration in Supabase errors", () => {
    const err = {
      code: "PGRST205",
      message: "Could not find the table 'public.notifications' in the schema cache",
    };

    expect(detectMissingMigrationName(err)).toBe(
      "20261124000004_add_notifications_system.sql",
    );
    expect(mapSupabaseDatabaseError(err)).toContain(
      "20261124000004_add_notifications_system.sql",
    );
  });
});
