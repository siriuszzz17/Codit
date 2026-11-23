import { describe, expect, it, vi } from "vitest";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import type {
  FriendshipRow,
  ProjectCommentRow,
  PublicProfileRow,
  SandboxProjectRow,
} from "@/lib/supabase/database.types";
import {
  acceptFriendRequest,
  cloneProjectToMySandbox,
  createProjectComment,
  listVisibleProjectsByAuthor,
  removeFriendship,
  resolveRelationStatus,
  searchCommunityUsers,
  sendFriendRequest,
  SocialServiceError,
  SocialValidationError,
  toggleProjectLike,
} from "@/modules/social/social-service";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const USER_C = "33333333-3333-4333-8333-333333333333";
const FRIENDSHIP_ID = "44444444-4444-4444-8444-444444444444";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const COMMENT_ID = "66666666-6666-4666-8666-666666666666";

function createPublicProfile(
  overrides: Partial<PublicProfileRow> = {},
): PublicProfileRow {
  return {
    id: USER_B,
    username: "maria.dev",
    full_name: "Maria Oliveira",
    avatar_url: null,
    bio: "Aprendendo Python no Codit",
    github_username: "maria-dev",
    created_at: "2026-11-23T10:00:00.000Z",
    updated_at: "2026-11-23T10:00:00.000Z",
    ...overrides,
  };
}

function createFriendship(
  overrides: Partial<FriendshipRow> = {},
): FriendshipRow {
  return {
    id: FRIENDSHIP_ID,
    requester_id: USER_A,
    addressee_id: USER_B,
    status: "pending",
    created_at: "2026-11-23T10:00:00.000Z",
    updated_at: "2026-11-23T10:00:00.000Z",
    accepted_at: null,
    ...overrides,
  };
}

function createProject(
  overrides: Partial<SandboxProjectRow> = {},
): SandboxProjectRow {
  return {
    id: PROJECT_ID,
    user_id: USER_B,
    title: "Jogo da Velha",
    description: "Projeto HTML/JS",
    primary_language: "html_css_js",
    runtime_target: "client_iframe",
    source_code: "<h1>Jogo</h1>",
    visibility: "public_portfolio",
    share_slug: null,
    is_pinned: false,
    tags: [],
    repository_url: null,
    live_url: null,
    version: 3,
    created_at: "2026-11-23T10:00:00.000Z",
    updated_at: "2026-11-23T11:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("social-service", () => {
  it("resolves all 5 friendship relation states accurately", () => {
    expect(resolveRelationStatus(USER_A, USER_A, [])).toEqual({
      status: "self",
      friendshipId: null,
    });
    expect(resolveRelationStatus(null, USER_B, [])).toEqual({
      status: "none",
      friendshipId: null,
    });
    expect(resolveRelationStatus(USER_A, USER_C, [])).toEqual({
      status: "none",
      friendshipId: null,
    });

    const outgoing = createFriendship({
      requester_id: USER_A,
      addressee_id: USER_B,
      status: "pending",
    });
    expect(resolveRelationStatus(USER_A, USER_B, [outgoing])).toEqual({
      status: "outgoing_pending",
      friendshipId: FRIENDSHIP_ID,
    });
    expect(resolveRelationStatus(USER_B, USER_A, [outgoing])).toEqual({
      status: "incoming_pending",
      friendshipId: FRIENDSHIP_ID,
    });

    const accepted = createFriendship({ status: "accepted" });
    expect(resolveRelationStatus(USER_B, USER_A, [accepted])).toEqual({
      status: "friends",
      friendshipId: FRIENDSHIP_ID,
    });
  });

  it("searches public_profiles with @handle priority and flags 42501 table grant errors", async () => {
    const candidates: PublicProfileRow[] = [
      createPublicProfile({
        id: USER_C,
        username: "joao.octopy",
        full_name: "João Silva",
      }),
      createPublicProfile({
        id: USER_B,
        username: "octopy.dev",
        full_name: "Maria Oliveira",
      }),
    ];

    const limit = vi
      .fn()
      .mockResolvedValue({ data: candidates, error: null, status: 200 });
    const order = vi.fn().mockReturnValue({ limit });
    const ilike = vi.fn().mockReturnValue({ order });
    const or = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ ilike, or, order });

    const mockClient = {
      from: vi.fn().mockReturnValue({ select }),
    } as unknown as CoditSupabaseClient;

    const handleResults = await searchCommunityUsers(
      "@octopy",
      { limit: 10 },
      mockClient,
    );
    expect(mockClient.from).toHaveBeenCalledWith("public_profiles");
    expect(ilike).toHaveBeenCalledWith("username", "%octopy%");
    expect(handleResults[0]?.username).toBe("octopy.dev");

    await searchCommunityUsers("Maria", { limit: 10 }, mockClient);
    expect(or).toHaveBeenCalledWith(
      "username.ilike.%Maria%,full_name.ilike.%Maria%",
    );

    const limitDenied = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for table public_profiles",
      },
      status: 401,
    });
    const deniedClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ limit: limitDenied }),
        }),
      }),
    } as unknown as CoditSupabaseClient;

    await expect(
      searchCommunityUsers("", { limit: 10 }, deniedClient),
    ).rejects.toMatchObject({
      name: "SocialServiceError",
      isPermissionGrantMissing: true,
      isMigrationMissing: false,
      status: 401,
    } satisfies Partial<SocialServiceError>);
  });

  it("filters public profile projects to public_portfolio and friends only (RN-204)", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue({ data: [], error: null, status: 200 });
    const order = vi.fn().mockReturnValue({ limit });
    const is = vi.fn().mockReturnValue({ order });
    const inVisibility = vi.fn().mockReturnValue({ is });
    const eqUser = vi.fn().mockReturnValue({ in: inVisibility });
    const select = vi.fn().mockReturnValue({ eq: eqUser });

    const client = {
      from: vi.fn().mockReturnValue({ select }),
    } as unknown as CoditSupabaseClient;

    await listVisibleProjectsByAuthor(USER_A, USER_A, client);
    expect(eqUser).toHaveBeenCalledWith("user_id", USER_A);
    expect(inVisibility).toHaveBeenCalledWith("visibility", [
      "public_portfolio",
      "friends",
    ]);
  });

  it("blocks cross-user social mutations when session user mismatches", async () => {
    const dbMock = vi.fn();
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: USER_C } } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: dbMock,
        insert: dbMock,
        update: dbMock,
        delete: dbMock,
      }),
    } as unknown as CoditSupabaseClient;

    await expect(sendFriendRequest(USER_A, USER_B, client)).rejects.toMatchObject({
      code: "AUTH_USER_MISMATCH",
    });
    await expect(
      acceptFriendRequest(USER_B, FRIENDSHIP_ID, client),
    ).rejects.toMatchObject({ code: "AUTH_USER_MISMATCH" });
    await expect(
      removeFriendship(USER_A, FRIENDSHIP_ID, client),
    ).rejects.toMatchObject({ code: "AUTH_USER_MISMATCH" });
    await expect(
      toggleProjectLike(USER_A, PROJECT_ID, false, client),
    ).rejects.toMatchObject({ code: "AUTH_USER_MISMATCH" });
    await expect(
      createProjectComment(USER_A, PROJECT_ID, "Oi!", client),
    ).rejects.toMatchObject({ code: "AUTH_USER_MISMATCH" });
    await expect(
      cloneProjectToMySandbox(USER_A, createProject(), client),
    ).rejects.toMatchObject({ code: "AUTH_USER_MISMATCH" });

    expect(dbMock).not.toHaveBeenCalled();
  });

  it("blocks self-friendship and duplicate pairs, and inserts pending requests", async () => {
    const mockEmpty = {
      from: vi.fn(),
    } as unknown as CoditSupabaseClient;

    await expect(
      sendFriendRequest(USER_A, USER_A, mockEmpty),
    ).rejects.toBeInstanceOf(SocialValidationError);

    // Par já existente (pendente recebido)
    const limitExisting = vi.fn().mockResolvedValue({
      data: [
        createFriendship({
          requester_id: USER_B,
          addressee_id: USER_A,
          status: "pending",
        }),
      ],
      error: null,
      status: 200,
    });
    const orExisting = vi.fn().mockReturnValue({ limit: limitExisting });
    const selectExisting = vi.fn().mockReturnValue({ or: orExisting });

    await expect(
      sendFriendRequest(USER_A, USER_B, {
        from: vi.fn().mockReturnValue({ select: selectExisting }),
      } as unknown as CoditSupabaseClient),
    ).rejects.toThrow("já enviou uma solicitação");

    // Inserção válida
    const createdRow = createFriendship();
    const limitNone = vi
      .fn()
      .mockResolvedValue({ data: [], error: null, status: 200 });
    const orNone = vi.fn().mockReturnValue({ limit: limitNone });
    const selectNone = vi.fn().mockReturnValue({ or: orNone });

    const single = vi
      .fn()
      .mockResolvedValue({ data: createdRow, error: null, status: 201 });
    const insertSelect = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });

    const result = await sendFriendRequest(USER_A, USER_B, {
      from: vi.fn().mockReturnValue({ select: selectNone, insert }),
    } as unknown as CoditSupabaseClient);

    expect(insert).toHaveBeenCalledWith({
      requester_id: USER_A,
      addressee_id: USER_B,
      status: "pending",
    });
    expect(result.status).toBe("pending");
  });

  it("accepts and removes friendships scoped by authenticated participant", async () => {
    const acceptedRow = createFriendship({ status: "accepted" });
    const maybeSingleAccept = vi
      .fn()
      .mockResolvedValue({ data: acceptedRow, error: null, status: 200 });
    const selectAccept = vi
      .fn()
      .mockReturnValue({ maybeSingle: maybeSingleAccept });
    const eqStatus = vi.fn().mockReturnValue({ select: selectAccept });
    const eqAddressee = vi.fn().mockReturnValue({ eq: eqStatus });
    const eqIdAccept = vi.fn().mockReturnValue({ eq: eqAddressee });
    const update = vi.fn().mockReturnValue({ eq: eqIdAccept });

    const accepted = await acceptFriendRequest(USER_B, FRIENDSHIP_ID, {
      from: vi.fn().mockReturnValue({ update }),
    } as unknown as CoditSupabaseClient);

    expect(eqAddressee).toHaveBeenCalledWith("addressee_id", USER_B);
    expect(eqStatus).toHaveBeenCalledWith("status", "pending");
    expect(accepted.status).toBe("accepted");

    const maybeSingleDelete = vi
      .fn()
      .mockResolvedValue({ data: { id: FRIENDSHIP_ID }, error: null, status: 200 });
    const selectDelete = vi
      .fn()
      .mockReturnValue({ maybeSingle: maybeSingleDelete });
    const orDelete = vi.fn().mockReturnValue({ select: selectDelete });
    const eqIdDelete = vi.fn().mockReturnValue({ or: orDelete });
    const del = vi.fn().mockReturnValue({ eq: eqIdDelete });

    const removed = await removeFriendship(USER_A, FRIENDSHIP_ID, {
      from: vi.fn().mockReturnValue({ delete: del }),
    } as unknown as CoditSupabaseClient);

    expect(removed).toBe(true);
    expect(orDelete).toHaveBeenCalledWith(
      `requester_id.eq.${USER_A},addressee_id.eq.${USER_A}`,
    );
  });

  it("toggles project likes idempotently and creates comments with author metadata", async () => {
    const insertLike = vi
      .fn()
      .mockResolvedValue({ error: { code: "23505" }, status: 409 });
    const eqUserDelete = vi.fn().mockResolvedValue({ error: null, status: 200 });
    const eqProjDelete = vi.fn().mockReturnValue({ eq: eqUserDelete });
    const delLike = vi.fn().mockReturnValue({ eq: eqProjDelete });

    const likeClient = {
      from: vi.fn().mockReturnValue({ insert: insertLike, delete: delLike }),
    } as unknown as CoditSupabaseClient;

    await expect(
      toggleProjectLike(USER_A, PROJECT_ID, false, likeClient),
    ).resolves.toEqual({ liked: true });

    await expect(
      toggleProjectLike(USER_A, PROJECT_ID, true, likeClient),
    ).resolves.toEqual({ liked: false });

    const commentRow: ProjectCommentRow = {
      id: COMMENT_ID,
      project_id: PROJECT_ID,
      user_id: USER_A,
      content: "Excelente lógica!",
      created_at: "2026-11-23T12:00:00.000Z",
      updated_at: "2026-11-23T12:00:00.000Z",
    };
    const authorRow = createPublicProfile({ id: USER_A, username: "ana.dev" });

    const singleComment = vi
      .fn()
      .mockResolvedValue({ data: commentRow, error: null, status: 201 });
    const selectComment = vi.fn().mockReturnValue({ single: singleComment });
    const insertComment = vi.fn().mockReturnValue({ select: selectComment });

    const maybeAuthor = vi
      .fn()
      .mockResolvedValue({ data: authorRow, error: null, status: 200 });
    const eqAuthor = vi.fn().mockReturnValue({ maybeSingle: maybeAuthor });
    const selectAuthor = vi.fn().mockReturnValue({ eq: eqAuthor });

    const commentClient = {
      from: vi.fn((table: string) =>
        table === "project_comments"
          ? { insert: insertComment }
          : { select: selectAuthor },
      ),
    } as unknown as CoditSupabaseClient;

    const createdComment = await createProjectComment(
      USER_A,
      PROJECT_ID,
      "  Excelente lógica! ",
      commentClient,
    );

    expect(createdComment.comment.content).toBe("Excelente lógica!");
    expect(createdComment.author?.username).toBe("ana.dev");
  });

  it("clones another user's project privately bound to the current user (RN-204)", async () => {
    const sourceProject = createProject();
    const clonedRow: SandboxProjectRow = {
      ...sourceProject,
      id: "77777777-7777-4777-8777-777777777777",
      user_id: USER_A,
      title: "Cópia de Jogo da Velha",
      visibility: "private",
      version: 1,
    };

    const single = vi
      .fn()
      .mockResolvedValue({ data: clonedRow, error: null, status: 201 });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });

    const result = await cloneProjectToMySandbox(USER_A, sourceProject, {
      from: vi.fn().mockReturnValue({ insert }),
    } as unknown as CoditSupabaseClient);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_A,
        title: "Cópia de Jogo da Velha",
        visibility: "private",
        source_code: "<h1>Jogo</h1>",
      }),
    );
    expect(result.visibility).toBe("private");
  });
});
