import { requireSupabaseClient, type CoditSupabaseClient } from "@/lib/supabase/client";
import type {
  FriendshipRow,
  ProjectCommentRow,
  PublicProfileRow,
  SandboxLanguage,
  SandboxProjectRow,
} from "@/lib/supabase/database.types";
import {
  isMissingDatabaseSchemaError,
  mapSupabaseDatabaseError,
} from "@/lib/supabase/errors";
import {
  createSandboxProject,
  normalizeSandboxProjectRow,
} from "@/modules/sandbox/sandbox-project-service";
import {
  coditUsernameSchema,
  createProjectCommentSchema,
  sanitizeCommunitySearchTerm,
  uuidSchema,
} from "@/modules/social/social-schemas";

export type FriendshipRelationStatus =
  | "self"
  | "none"
  | "friends"
  | "outgoing_pending"
  | "incoming_pending";

export interface SocialRelationSummary {
  status: FriendshipRelationStatus;
  friendshipId: string | null;
}

export interface FriendshipListItem {
  friendship: FriendshipRow;
  profile: PublicProfileRow;
}

export interface UserFriendshipsBundle {
  raw: FriendshipRow[];
  friends: FriendshipListItem[];
  incomingRequests: FriendshipListItem[];
  outgoingRequests: FriendshipListItem[];
}

export interface CommunityProjectCard {
  project: SandboxProjectRow;
  author: PublicProfileRow | null;
  likesCount: number;
  commentsCount: number;
  likedByViewer: boolean;
}

export interface ProjectCommentWithAuthor {
  comment: ProjectCommentRow;
  author: PublicProfileRow | null;
}

export interface PublicProfileBundle {
  profile: PublicProfileRow;
  relation: SocialRelationSummary;
  friendCount: number | null;
  projects: CommunityProjectCard[];
}

export class SocialValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialValidationError";
  }
}

export class SocialServiceError extends Error {
  readonly isMigrationMissing: boolean;

  constructor(message: string, isMigrationMissing = false) {
    super(message);
    this.name = "SocialServiceError";
    this.isMigrationMissing = isMigrationMissing;
  }
}

function toSocialServiceError(error: unknown): SocialServiceError {
  return new SocialServiceError(
    mapSupabaseDatabaseError(error),
    isMissingDatabaseSchemaError(error),
  );
}

function assertValidUuid(value: string, fieldLabel = "Identificador"): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new SocialValidationError(`${fieldLabel} inválido.`);
  }
  return parsed.data;
}

function rankSearchCandidate(
  candidate: PublicProfileRow,
  lowerTerm: string,
): number {
  const usernameLower = candidate.username.toLowerCase();
  const nameLower = candidate.full_name.toLowerCase();

  if (usernameLower === lowerTerm) {
    return 0;
  }
  if (usernameLower.startsWith(lowerTerm)) {
    return 1;
  }
  if (usernameLower.includes(lowerTerm)) {
    return 2;
  }
  if (nameLower.startsWith(lowerTerm)) {
    return 3;
  }
  return 4;
}

export function resolveRelationStatus(
  viewerId: string | null,
  targetUserId: string,
  friendships: ReadonlyArray<FriendshipRow>,
): SocialRelationSummary {
  if (viewerId && viewerId === targetUserId) {
    return { status: "self", friendshipId: null };
  }

  if (!viewerId) {
    return { status: "none", friendshipId: null };
  }

  const match = friendships.find(
    (item) =>
      (item.requester_id === viewerId && item.addressee_id === targetUserId) ||
      (item.requester_id === targetUserId && item.addressee_id === viewerId),
  );

  if (!match) {
    return { status: "none", friendshipId: null };
  }

  if (match.status === "accepted") {
    return { status: "friends", friendshipId: match.id };
  }

  if (match.requester_id === viewerId) {
    return { status: "outgoing_pending", friendshipId: match.id };
  }

  return { status: "incoming_pending", friendshipId: match.id };
}

export async function searchCommunityUsers(
  rawQuery: string,
  options?: { limit?: number },
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<PublicProfileRow[]> {
  const limit = Math.min(Math.max(options?.limit ?? 24, 1), 50);
  const { query, isHandleOnly } = sanitizeCommunitySearchTerm(rawQuery);

  let builder = client.from("public_profiles").select("*");

  if (!query) {
    builder = builder.order("created_at", { ascending: false }).limit(limit);
  } else if (isHandleOnly) {
    builder = builder
      .ilike("username", `%${query}%`)
      .order("username", { ascending: true })
      .limit(limit);
  } else {
    builder = builder
      .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
      .order("username", { ascending: true })
      .limit(limit);
  }

  const { data, error } = await builder;
  if (error) {
    throw toSocialServiceError(error);
  }

  const rows = data ?? [];
  if (!query || rows.length <= 1) {
    return rows;
  }

  const lowerTerm = query.replace(/\\([%_])/g, "$1").toLowerCase();
  return [...rows].sort((a, b) => {
    const rankDiff =
      rankSearchCandidate(a, lowerTerm) - rankSearchCandidate(b, lowerTerm);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return a.username.localeCompare(b.username);
  });
}

export async function getPublicProfileByUsername(
  rawUsername: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<PublicProfileRow | null> {
  const parsed = coditUsernameSchema.safeParse(rawUsername);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new SocialValidationError(
      firstIssue?.message ?? "Informe um @usuário válido.",
    );
  }

  const { data, error } = await client
    .from("public_profiles")
    .select("*")
    .eq("username", parsed.data)
    .maybeSingle();

  if (error) {
    throw toSocialServiceError(error);
  }

  return data;
}

export async function getPublicProfileById(
  userId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<PublicProfileRow | null> {
  const validId = assertValidUuid(userId, "Identificador de perfil");

  const { data, error } = await client
    .from("public_profiles")
    .select("*")
    .eq("id", validId)
    .maybeSingle();

  if (error) {
    throw toSocialServiceError(error);
  }

  return data;
}

export async function getProfileFriendCount(
  userId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<number | null> {
  const parsed = uuidSchema.safeParse(userId);
  if (!parsed.success) {
    return null;
  }

  try {
    const { data, error } = await client.rpc("get_profile_friend_count", {
      p_user_id: parsed.data,
    });

    if (error || typeof data !== "number") {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export async function listUserFriendships(
  userId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<UserFriendshipsBundle> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");

  const { data: friendshipRows, error: friendshipError } = await client
    .from("friendships")
    .select("*")
    .or(`requester_id.eq.${validUserId},addressee_id.eq.${validUserId}`)
    .order("updated_at", { ascending: false });

  if (friendshipError) {
    throw toSocialServiceError(friendshipError);
  }

  const raw = friendshipRows ?? [];
  if (raw.length === 0) {
    return {
      raw: [],
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
    };
  }

  const otherUserIds = Array.from(
    new Set(
      raw.map((row) =>
        row.requester_id === validUserId ? row.addressee_id : row.requester_id,
      ),
    ),
  );

  const { data: profilesData, error: profilesError } = await client
    .from("public_profiles")
    .select("*")
    .in("id", otherUserIds);

  if (profilesError) {
    throw toSocialServiceError(profilesError);
  }

  const profileMap = new Map<string, PublicProfileRow>(
    (profilesData ?? []).map((item) => [item.id, item]),
  );

  const friends: FriendshipListItem[] = [];
  const incomingRequests: FriendshipListItem[] = [];
  const outgoingRequests: FriendshipListItem[] = [];

  for (const row of raw) {
    const otherId =
      row.requester_id === validUserId ? row.addressee_id : row.requester_id;
    const otherProfile = profileMap.get(otherId);
    if (!otherProfile) {
      continue;
    }

    const entry: FriendshipListItem = {
      friendship: row,
      profile: otherProfile,
    };

    if (row.status === "accepted") {
      friends.push(entry);
    } else if (row.addressee_id === validUserId) {
      incomingRequests.push(entry);
    } else {
      outgoingRequests.push(entry);
    }
  }

  return {
    raw,
    friends,
    incomingRequests,
    outgoingRequests,
  };
}

export async function sendFriendRequest(
  requesterId: string,
  addresseeId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<FriendshipRow> {
  const validRequester = assertValidUuid(requesterId, "Identificador de origem");
  const validAddressee = assertValidUuid(
    addresseeId,
    "Identificador de destino",
  );

  if (validRequester === validAddressee) {
    throw new SocialValidationError(
      "Você não pode adicionar a si mesmo como amigo.",
    );
  }

  const { data: existingRows, error: checkError } = await client
    .from("friendships")
    .select("*")
    .or(
      `and(requester_id.eq.${validRequester},addressee_id.eq.${validAddressee}),and(requester_id.eq.${validAddressee},addressee_id.eq.${validRequester})`,
    )
    .limit(1);

  if (checkError) {
    throw toSocialServiceError(checkError);
  }

  const existing = existingRows?.[0];
  if (existing) {
    if (existing.status === "accepted") {
      throw new SocialValidationError("Vocês já são amigos no Codit.");
    }
    if (existing.requester_id === validRequester) {
      throw new SocialValidationError(
        "Você já enviou uma solicitação de amizade para esta pessoa.",
      );
    }
    throw new SocialValidationError(
      "Esta pessoa já enviou uma solicitação para você. Aceite o pedido na aba Solicitações.",
    );
  }

  const { data, error } = await client
    .from("friendships")
    .insert({
      requester_id: validRequester,
      addressee_id: validAddressee,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    throw toSocialServiceError(error);
  }

  return data;
}

export async function acceptFriendRequest(
  currentUserId: string,
  friendshipId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<FriendshipRow> {
  const validUserId = assertValidUuid(currentUserId, "Identificador do usuário");
  const validFriendshipId = assertValidUuid(
    friendshipId,
    "Identificador da solicitação",
  );

  const { data, error } = await client
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", validFriendshipId)
    .eq("addressee_id", validUserId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error) {
    throw toSocialServiceError(error);
  }

  if (!data) {
    throw new SocialValidationError(
      "Solicitação de amizade não encontrada ou já respondida.",
    );
  }

  return data;
}

export async function removeFriendship(
  currentUserId: string,
  friendshipId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<boolean> {
  const validUserId = assertValidUuid(currentUserId, "Identificador do usuário");
  const validFriendshipId = assertValidUuid(
    friendshipId,
    "Identificador da amizade",
  );

  const { data, error } = await client
    .from("friendships")
    .delete()
    .eq("id", validFriendshipId)
    .or(`requester_id.eq.${validUserId},addressee_id.eq.${validUserId}`)
    .select("id")
    .maybeSingle();

  if (error) {
    throw toSocialServiceError(error);
  }

  return data !== null;
}

async function enrichProjectsWithSocialMeta(
  projects: SandboxProjectRow[],
  viewerId: string | null,
  client: CoditSupabaseClient,
): Promise<CommunityProjectCard[]> {
  if (projects.length === 0) {
    return [];
  }

  const authorIds = Array.from(new Set(projects.map((item) => item.user_id)));
  const projectIds = projects.map((item) => item.id);

  const [authorsResult, likesResult, commentsResult] = await Promise.all([
    client.from("public_profiles").select("*").in("id", authorIds),
    client
      .from("project_likes")
      .select("project_id, user_id")
      .in("project_id", projectIds),
    client
      .from("project_comments")
      .select("project_id")
      .in("project_id", projectIds),
  ]);

  if (authorsResult.error) {
    throw toSocialServiceError(authorsResult.error);
  }
  if (likesResult.error) {
    throw toSocialServiceError(likesResult.error);
  }
  if (commentsResult.error) {
    throw toSocialServiceError(commentsResult.error);
  }

  const authorMap = new Map<string, PublicProfileRow>(
    (authorsResult.data ?? []).map((author) => [author.id, author]),
  );

  const likesCountMap = new Map<string, number>();
  const viewerLikedSet = new Set<string>();
  for (const like of likesResult.data ?? []) {
    likesCountMap.set(
      like.project_id,
      (likesCountMap.get(like.project_id) ?? 0) + 1,
    );
    if (viewerId && like.user_id === viewerId) {
      viewerLikedSet.add(like.project_id);
    }
  }

  const commentsCountMap = new Map<string, number>();
  for (const comment of commentsResult.data ?? []) {
    commentsCountMap.set(
      comment.project_id,
      (commentsCountMap.get(comment.project_id) ?? 0) + 1,
    );
  }

  return projects.map((project) => ({
    project: normalizeSandboxProjectRow(project),
    author: authorMap.get(project.user_id) ?? null,
    likesCount: likesCountMap.get(project.id) ?? 0,
    commentsCount: commentsCountMap.get(project.id) ?? 0,
    likedByViewer: viewerLikedSet.has(project.id),
  }));
}

export async function listCommunityProjects(
  options: {
    viewerId: string | null;
    scope: "all" | "friends";
    language?: SandboxLanguage | "all";
    limit?: number;
  },
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<CommunityProjectCard[]> {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 60);

  if (options.scope === "friends") {
    if (!options.viewerId) {
      return [];
    }

    const validViewerId = assertValidUuid(
      options.viewerId,
      "Identificador do usuário",
    );
    const { data: acceptedRows, error: friendError } = await client
      .from("friendships")
      .select("requester_id, addressee_id")
      .or(`requester_id.eq.${validViewerId},addressee_id.eq.${validViewerId}`)
      .eq("status", "accepted");

    if (friendError) {
      throw toSocialServiceError(friendError);
    }

    const friendIds = Array.from(
      new Set(
        (acceptedRows ?? []).map((row) =>
          row.requester_id === validViewerId
            ? row.addressee_id
            : row.requester_id,
        ),
      ),
    );

    if (friendIds.length === 0) {
      return [];
    }

    let friendsQuery = client
      .from("sandbox_projects")
      .select("*")
      .in("user_id", friendIds)
      .in("visibility", ["friends", "public_portfolio"])
      .is("deleted_at", null);

    if (options.language && options.language !== "all") {
      friendsQuery = friendsQuery.eq("primary_language", options.language);
    }

    const { data: projectsData, error: projectsError } = await friendsQuery
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (projectsError) {
      throw toSocialServiceError(projectsError);
    }

    return enrichProjectsWithSocialMeta(
      projectsData ?? [],
      validViewerId,
      client,
    );
  }

  let feedQuery = client
    .from("sandbox_projects")
    .select("*")
    .in("visibility", ["public_portfolio", "friends"])
    .is("deleted_at", null);

  if (options.language && options.language !== "all") {
    feedQuery = feedQuery.eq("primary_language", options.language);
  }

  const { data: projectsData, error: projectsError } = await feedQuery
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (projectsError) {
    throw toSocialServiceError(projectsError);
  }

  return enrichProjectsWithSocialMeta(
    projectsData ?? [],
    options.viewerId,
    client,
  );
}

export async function listVisibleProjectsByAuthor(
  authorId: string,
  viewerId: string | null,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<CommunityProjectCard[]> {
  const validAuthorId = assertValidUuid(authorId, "Identificador do autor");

  const { data, error } = await client
    .from("sandbox_projects")
    .select("*")
    .eq("user_id", validAuthorId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error) {
    throw toSocialServiceError(error);
  }

  return enrichProjectsWithSocialMeta(data ?? [], viewerId, client);
}

export async function getPublicProfileBundle(
  target: { username?: string | null; userId?: string | null },
  viewerId: string | null,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<PublicProfileBundle | null> {
  const targetUsername = target.username?.trim();
  const targetUserId = target.userId?.trim();

  let profile: PublicProfileRow | null = null;
  if (targetUsername) {
    profile = await getPublicProfileByUsername(targetUsername, client);
  } else if (targetUserId) {
    profile = await getPublicProfileById(targetUserId, client);
  } else {
    throw new SocialValidationError(
      "Informe um @usuário ou identificador para abrir o perfil.",
    );
  }

  if (!profile) {
    return null;
  }

  const friendshipsPromise =
    viewerId && viewerId !== profile.id
      ? client
          .from("friendships")
          .select("*")
          .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`)
      : Promise.resolve({ data: [] as FriendshipRow[], error: null });

  const [friendshipsResult, friendCount, projects] = await Promise.all([
    friendshipsPromise,
    getProfileFriendCount(profile.id, client),
    listVisibleProjectsByAuthor(profile.id, viewerId, client),
  ]);

  if (friendshipsResult.error) {
    throw toSocialServiceError(friendshipsResult.error);
  }

  const relation = resolveRelationStatus(
    viewerId,
    profile.id,
    friendshipsResult.data ?? [],
  );

  return {
    profile,
    relation,
    friendCount,
    projects,
  };
}

export async function toggleProjectLike(
  userId: string,
  projectId: string,
  currentlyLiked: boolean,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<{ liked: boolean }> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");
  const validProjectId = assertValidUuid(projectId, "Identificador do projeto");

  if (currentlyLiked) {
    const { error } = await client
      .from("project_likes")
      .delete()
      .eq("project_id", validProjectId)
      .eq("user_id", validUserId);

    if (error) {
      throw toSocialServiceError(error);
    }

    return { liked: false };
  }

  const { error } = await client.from("project_likes").insert({
    project_id: validProjectId,
    user_id: validUserId,
  });

  if (error) {
    if (error.code === "23505") {
      return { liked: true };
    }
    throw toSocialServiceError(error);
  }

  return { liked: true };
}

export async function listProjectComments(
  projectId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<ProjectCommentWithAuthor[]> {
  const validProjectId = assertValidUuid(projectId, "Identificador do projeto");

  const { data: commentsData, error: commentsError } = await client
    .from("project_comments")
    .select("*")
    .eq("project_id", validProjectId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (commentsError) {
    throw toSocialServiceError(commentsError);
  }

  const comments = commentsData ?? [];
  if (comments.length === 0) {
    return [];
  }

  const authorIds = Array.from(new Set(comments.map((item) => item.user_id)));
  const { data: authorsData, error: authorsError } = await client
    .from("public_profiles")
    .select("*")
    .in("id", authorIds);

  if (authorsError) {
    throw toSocialServiceError(authorsError);
  }

  const authorMap = new Map<string, PublicProfileRow>(
    (authorsData ?? []).map((author) => [author.id, author]),
  );

  return comments.map((comment) => ({
    comment,
    author: authorMap.get(comment.user_id) ?? null,
  }));
}

export async function createProjectComment(
  userId: string,
  projectId: string,
  content: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<ProjectCommentWithAuthor> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");
  const validProjectId = assertValidUuid(projectId, "Identificador do projeto");

  const parsed = createProjectCommentSchema.safeParse({ content });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new SocialValidationError(
      firstIssue?.message ?? "Escreva um comentário válido.",
    );
  }

  const { data: comment, error } = await client
    .from("project_comments")
    .insert({
      project_id: validProjectId,
      user_id: validUserId,
      content: parsed.data.content,
    })
    .select("*")
    .single();

  if (error) {
    throw toSocialServiceError(error);
  }

  const { data: authorData } = await client
    .from("public_profiles")
    .select("*")
    .eq("id", validUserId)
    .maybeSingle();

  return {
    comment,
    author: authorData ?? null,
  };
}

export async function deleteProjectComment(
  commentId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<boolean> {
  const validCommentId = assertValidUuid(
    commentId,
    "Identificador do comentário",
  );

  const { data, error } = await client
    .from("project_comments")
    .delete()
    .eq("id", validCommentId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw toSocialServiceError(error);
  }

  return data !== null;
}

export async function cloneProjectToMySandbox(
  userId: string,
  sourceProject: SandboxProjectRow,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<SandboxProjectRow> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");
  const clonedTitle = `Cópia de ${sourceProject.title}`.slice(0, 120);

  return createSandboxProject(
    validUserId,
    {
      title: clonedTitle,
      description: sourceProject.description,
      primaryLanguage: sourceProject.primary_language,
      sourceCode: sourceProject.source_code,
      visibility: "private",
    },
    client,
  );
}
