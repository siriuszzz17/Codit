import { describe, expect, it, vi } from "vitest";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import type {
  ChatConversationMemberRow,
  ChatConversationRow,
  ChatMessageRow,
  PublicProfileRow,
} from "@/lib/supabase/database.types";
import {
  addGroupMembers,
  createGroupConversation,
  getOrCreateDirectConversation,
  listUserConversations,
  MessagingServiceError,
  MessagingValidationError,
  sendConversationMessage,
} from "@/modules/messaging/messaging-service";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const USER_C = "33333333-3333-4333-8333-333333333333";
const CONV_ID = "44444444-4444-4444-8444-444444444444";

function makeUuid(index: number): string {
  const hex = String(index).padStart(12, "0");
  return `aaaaaaaa-aaaa-4aaa-8aaa-${hex}`;
}

function makeProfile(
  id: string,
  username: string,
  fullName: string,
): PublicProfileRow {
  return {
    id,
    username,
    full_name: fullName,
    avatar_url: null,
    bio: null,
    github_username: null,
    created_at: "2026-11-24T10:00:00.000Z",
    updated_at: "2026-11-24T10:00:00.000Z",
  };
}

describe("messaging-service", () => {
  it("blocks direct conversations with self or non-friends (RN-501)", async () => {
    const emptyClient = {
      from: vi.fn(),
      rpc: vi.fn(),
    } as unknown as CoditSupabaseClient;

    await expect(
      getOrCreateDirectConversation(USER_A, USER_A, emptyClient),
    ).rejects.toBeInstanceOf(MessagingValidationError);

    const limitNone = vi
      .fn()
      .mockResolvedValue({ data: [], error: null, status: 200 });
    const eqStatusNone = vi.fn().mockReturnValue({ limit: limitNone });
    const orNone = vi.fn().mockReturnValue({ eq: eqStatusNone });
    const selectNone = vi.fn().mockReturnValue({ or: orNone });
    const rpcMock = vi.fn();

    await expect(
      getOrCreateDirectConversation(USER_A, USER_B, {
        from: vi.fn().mockReturnValue({ select: selectNone }),
        rpc: rpcMock,
      } as unknown as CoditSupabaseClient),
    ).rejects.toThrow("Apenas amigos aceitos");
    expect(rpcMock).not.toHaveBeenCalled();

    // Amigo aceito -> chama RPC
    const limitAccepted = vi.fn().mockResolvedValue({
      data: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          requester_id: USER_A,
          addressee_id: USER_B,
          status: "accepted",
        },
      ],
      error: null,
      status: 200,
    });
    const eqStatusAccepted = vi.fn().mockReturnValue({ limit: limitAccepted });
    const orAccepted = vi.fn().mockReturnValue({ eq: eqStatusAccepted });
    const selectAccepted = vi.fn().mockReturnValue({ or: orAccepted });
    const rpcSuccess = vi
      .fn()
      .mockResolvedValue({ data: CONV_ID, error: null, status: 200 });

    const createdId = await getOrCreateDirectConversation(USER_A, USER_B, {
      from: vi.fn().mockReturnValue({ select: selectAccepted }),
      rpc: rpcSuccess,
    } as unknown as CoditSupabaseClient);

    expect(createdId).toBe(CONV_ID);
    expect(rpcSuccess).toHaveBeenCalledWith(
      "get_or_create_direct_conversation",
      { p_friend_id: USER_B },
    );
  });

  it("blocks group creation with non-friends (RN-501) or >10 members (RN-502)", async () => {
    const rpcMock = vi.fn();
    const tenFriends = Array.from({ length: 10 }, (_, idx) =>
      makeUuid(idx + 1),
    );

    // > 10 pessoas totais (criador + 10 convidados = 11) falha antes mesmo do banco.
    await expect(
      createGroupConversation(
        USER_A,
        { title: "Turma Full", memberIds: tenFriends },
        { from: vi.fn(), rpc: rpcMock } as unknown as CoditSupabaseClient,
      ),
    ).rejects.toThrow("no máximo 10 pessoas");

    // Convidado que não é amigo aceito falha (RN-501).
    const eqFriends = vi.fn().mockResolvedValue({
      data: [{ requester_id: USER_A, addressee_id: USER_B, status: "accepted" }],
      error: null,
      status: 200,
    });
    const orFriends = vi.fn().mockReturnValue({ eq: eqFriends });
    const selectFriends = vi.fn().mockReturnValue({ or: orFriends });

    await expect(
      createGroupConversation(
        USER_A,
        { title: "Grupo Python", memberIds: [USER_B, USER_C] },
        {
          from: vi.fn().mockReturnValue({ select: selectFriends }),
          rpc: rpcMock,
        } as unknown as CoditSupabaseClient,
      ),
    ).rejects.toThrow("Apenas amigos aceitos");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("blocks adding members beyond 10 active participants (RN-502)", async () => {
    const existingIds = [USER_A, ...Array.from({ length: 8 }, (_, i) => makeUuid(i + 1))];
    const isMembers = vi.fn().mockResolvedValue({
      data: existingIds.map((user_id) => ({ user_id })),
      error: null,
      status: 200,
    });
    const eqConv = vi.fn().mockReturnValue({ is: isMembers });
    const selectMembers = vi.fn().mockReturnValue({ eq: eqConv });
    const rpcMock = vi.fn();

    await expect(
      addGroupMembers(
        USER_A,
        CONV_ID,
        [makeUuid(20), makeUuid(21)],
        {
          from: vi.fn().mockReturnValue({ select: selectMembers }),
          rpc: rpcMock,
        } as unknown as CoditSupabaseClient,
      ),
    ).rejects.toThrow("no máximo 10 pessoas");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("blocks sending messages in a DM after friendship removal (RN-501)", async () => {
    const maybeSingleConv = vi.fn().mockResolvedValue({
      data: { id: CONV_ID, kind: "direct" },
      error: null,
      status: 200,
    });
    const eqConv = vi.fn().mockReturnValue({ maybeSingle: maybeSingleConv });

    const isMembers = vi.fn().mockResolvedValue({
      data: [{ user_id: USER_A }, { user_id: USER_B }],
      error: null,
      status: 200,
    });
    const eqMembers = vi.fn().mockReturnValue({ is: isMembers });

    const eqFriends = vi
      .fn()
      .mockResolvedValue({ data: [], error: null, status: 200 });
    const orFriends = vi.fn().mockReturnValue({ eq: eqFriends });

    const insertMock = vi.fn();

    const client = {
      from: vi.fn((table: string) => {
        if (table === "chat_conversations") {
          return { select: vi.fn().mockReturnValue({ eq: eqConv }) };
        }
        if (table === "chat_conversation_members") {
          return { select: vi.fn().mockReturnValue({ eq: eqMembers }) };
        }
        if (table === "friendships") {
          return { select: vi.fn().mockReturnValue({ or: orFriends }) };
        }
        return { insert: insertMock };
      }),
    } as unknown as CoditSupabaseClient;

    await expect(
      sendConversationMessage(USER_A, CONV_ID, "Oi sumido!", client),
    ).rejects.toThrow("Apenas amigos aceitos");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("sends message when DM friendship is active and returns sender profile", async () => {
    const createdRow: ChatMessageRow = {
      id: "66666666-6666-4666-8666-666666666666",
      conversation_id: CONV_ID,
      sender_id: USER_A,
      message_type: "text",
      content: "Vamos codar!",
      created_at: "2026-11-24T12:00:00.000Z",
      updated_at: "2026-11-24T12:00:00.000Z",
      deleted_at: null,
    };

    const maybeSingleConv = vi.fn().mockResolvedValue({
      data: { id: CONV_ID, kind: "direct" },
      error: null,
      status: 200,
    });
    const eqConv = vi.fn().mockReturnValue({ maybeSingle: maybeSingleConv });

    const isMembers = vi.fn().mockResolvedValue({
      data: [{ user_id: USER_A }, { user_id: USER_B }],
      error: null,
      status: 200,
    });
    const eqMembers = vi.fn().mockReturnValue({ is: isMembers });

    const eqFriends = vi.fn().mockResolvedValue({
      data: [{ requester_id: USER_A, addressee_id: USER_B, status: "accepted" }],
      error: null,
      status: 200,
    });
    const orFriends = vi.fn().mockReturnValue({ eq: eqFriends });

    const singleInsert = vi
      .fn()
      .mockResolvedValue({ data: createdRow, error: null, status: 201 });
    const selectInsert = vi.fn().mockReturnValue({ single: singleInsert });
    const insertMsg = vi.fn().mockReturnValue({ select: selectInsert });

    const maybeProfile = vi.fn().mockResolvedValue({
      data: makeProfile(USER_A, "ana.dev", "Ana"),
      error: null,
      status: 200,
    });
    const eqProfile = vi.fn().mockReturnValue({ maybeSingle: maybeProfile });

    const client = {
      from: vi.fn((table: string) => {
        if (table === "chat_conversations") {
          return { select: vi.fn().mockReturnValue({ eq: eqConv }) };
        }
        if (table === "chat_conversation_members") {
          return { select: vi.fn().mockReturnValue({ eq: eqMembers }) };
        }
        if (table === "friendships") {
          return { select: vi.fn().mockReturnValue({ or: orFriends }) };
        }
        if (table === "chat_messages") {
          return { insert: insertMsg };
        }
        return { select: vi.fn().mockReturnValue({ eq: eqProfile }) };
      }),
    } as unknown as CoditSupabaseClient;

    const item = await sendConversationMessage(
      USER_A,
      CONV_ID,
      "  Vamos codar! ",
      client,
    );
    expect(item.message.content).toBe("Vamos codar!");
    expect(item.sender?.username).toBe("ana.dev");
  });

  it("blocks cross-user mutations when session mismatches (RN-503) and flags missing migration", async () => {
    const fromMock = vi.fn();
    const mismatchClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: USER_C } } },
          error: null,
        }),
      },
      from: fromMock,
      rpc: vi.fn(),
    } as unknown as CoditSupabaseClient;

    await expect(
      getOrCreateDirectConversation(USER_A, USER_B, mismatchClient),
    ).rejects.toMatchObject({ code: "AUTH_USER_MISMATCH" });
    await expect(
      createGroupConversation(
        USER_A,
        { title: "Grupo", memberIds: [USER_B] },
        mismatchClient,
      ),
    ).rejects.toMatchObject({ code: "AUTH_USER_MISMATCH" });
    expect(fromMock).not.toHaveBeenCalled();

    const missingClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({
              data: null,
              error: {
                code: "PGRST205",
                message:
                  "Could not find the table 'public.chat_conversation_members' in the schema cache",
              },
              status: 404,
            }),
          }),
        }),
      }),
    } as unknown as CoditSupabaseClient;

    await expect(
      listUserConversations(USER_A, missingClient),
    ).rejects.toMatchObject({
      name: "MessagingServiceError",
      isMigrationMissing: true,
    } satisfies Partial<MessagingServiceError>);
  });

  it("enriches DM and group conversations with unread counts and friendship status", async () => {
    const ownRows: ChatConversationMemberRow[] = [
      {
        conversation_id: CONV_ID,
        user_id: USER_A,
        role: "member",
        added_by: USER_A,
        joined_at: "2026-11-24T10:00:00.000Z",
        left_at: null,
        last_read_at: "2026-11-24T10:00:00.000Z",
        updated_at: "2026-11-24T10:00:00.000Z",
      },
    ];
    const convRow: ChatConversationRow = {
      id: CONV_ID,
      kind: "direct",
      title: null,
      created_by: USER_A,
      direct_pair_key: `${USER_A}:${USER_B}`,
      last_message_at: "2026-11-24T10:05:00.000Z",
      last_message_preview: "Oi!",
      created_at: "2026-11-24T10:00:00.000Z",
      updated_at: "2026-11-24T10:05:00.000Z",
    };

    const allMembers: ChatConversationMemberRow[] = [
      ...ownRows,
      {
        conversation_id: CONV_ID,
        user_id: USER_B,
        role: "member",
        added_by: USER_A,
        joined_at: "2026-11-24T10:00:00.000Z",
        left_at: null,
        last_read_at: "2026-11-24T10:00:00.000Z",
        updated_at: "2026-11-24T10:00:00.000Z",
      },
    ];

    let membersCallCount = 0;
    const client = {
      from: vi.fn((table: string) => {
        if (table === "chat_conversation_members") {
          membersCallCount += 1;
          if (membersCallCount === 1) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({
                    data: ownRows,
                    error: null,
                    status: 200,
                  }),
                }),
              }),
            };
          }
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({
                  data: allMembers,
                  error: null,
                  status: 200,
                }),
              }),
            }),
          };
        }

        if (table === "chat_conversations") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [convRow],
                error: null,
                status: 200,
              }),
            }),
          };
        }

        if (table === "friendships") {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    {
                      requester_id: USER_A,
                      addressee_id: USER_B,
                      status: "accepted",
                    },
                  ],
                  error: null,
                  status: 200,
                }),
              }),
            }),
          };
        }

        if (table === "chat_messages") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  neq: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({
                        data: [
                          {
                            id: "msg-1",
                            conversation_id: CONV_ID,
                            sender_id: USER_B,
                            created_at: "2026-11-24T10:05:00.000Z",
                          },
                        ],
                        error: null,
                        status: 200,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                makeProfile(USER_A, "ana.dev", "Ana"),
                makeProfile(USER_B, "bruno.dev", "Bruno"),
              ],
              error: null,
              status: 200,
            }),
          }),
        };
      }),
    } as unknown as CoditSupabaseClient;

    const list = await listUserConversations(USER_A, client);
    expect(list).toHaveLength(1);
    expect(list[0]?.displayTitle).toBe("Bruno");
    expect(list[0]?.isDirectFriendActive).toBe(true);
    expect(list[0]?.canSendMessages).toBe(true);
    expect(list[0]?.unreadCount).toBe(1);
  });
});
