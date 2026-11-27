import { requireSupabaseClient, type CoditSupabaseClient } from "@/lib/supabase/client";
import type {
  FriendshipRow,
  ModerationReportReason,
  ModerationReportRow,
  ModerationTargetType,
  ProfileRow,
  ProjectCommentRow,
  PublicProfileRow,
  SandboxLanguage,
  SandboxProjectRow,
  UserBlockRow,
} from "@/lib/supabase/database.types";
import {
  extractSupabaseErrorMeta,
  isMissingDatabaseSchemaError,
  isTablePrivilegeError,
  mapSupabaseDatabaseError,
} from "@/lib/supabase/errors";
import {
  assertAuthenticatedUserMatches,
  assertHasAuthenticatedSession,
} from "@/lib/supabase/session-guard";
import {
  DEFAULT_PROFILE_CUSTOMIZATION,
  getAccentThemeMeta,
  getAvatarFrameMeta,
  getBannerMeta,
  getOctopyCompanionMeta,
} from "@/modules/profiles/profile-themes";
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
  hasPublicCustomizationColumns: boolean;
}

export type RawPublicProfileDbRow = Pick<
  PublicProfileRow,
  | "id"
  | "username"
  | "full_name"
  | "avatar_url"
  | "bio"
  | "github_username"
  | "created_at"
  | "updated_at"
> &
  Partial<
    Pick<
      PublicProfileRow,
      | "headline"
      | "location"
      | "website_url"
      | "linkedin_url"
      | "banner_preset"
      | "accent_theme"
      | "avatar_frame"
      | "octopy_companion"
      | "skills"
      | "xp_total"
      | "current_streak"
      | "badges"
    >
  >;

export function hasPublicCustomizationSchema(
  raw: RawPublicProfileDbRow,
): boolean {
  return (
    raw.banner_preset !== undefined &&
    raw.accent_theme !== undefined &&
    raw.skills !== undefined
  );
}

export function normalizePublicProfileRow(
  raw: RawPublicProfileDbRow,
): PublicProfileRow {
  const skills = Array.isArray(raw.skills)
    ? raw.skills.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [...DEFAULT_PROFILE_CUSTOMIZATION.skills];

  return {
    id: raw.id,
    username: raw.username,
    full_name: raw.full_name,
    avatar_url: raw.avatar_url ?? null,
    bio: raw.bio ?? null,
    github_username: raw.github_username ?? null,
    headline: raw.headline ?? DEFAULT_PROFILE_CUSTOMIZATION.headline,
    location: raw.location ?? DEFAULT_PROFILE_CUSTOMIZATION.location,
    website_url: raw.website_url ?? DEFAULT_PROFILE_CUSTOMIZATION.website_url,
    linkedin_url:
      raw.linkedin_url ?? DEFAULT_PROFILE_CUSTOMIZATION.linkedin_url,
    banner_preset: getBannerMeta(raw.banner_preset).id,
    accent_theme: getAccentThemeMeta(raw.accent_theme).id,
    avatar_frame: getAvatarFrameMeta(raw.avatar_frame).id,
    octopy_companion: getOctopyCompanionMeta(raw.octopy_companion).id,
    skills,
    xp_total: typeof raw.xp_total === "number" ? raw.xp_total : 0,
    current_streak:
      typeof raw.current_streak === "number" ? raw.current_streak : 0,
    badges: Array.isArray(raw.badges)
      ? raw.badges.filter((item): item is string => typeof item === "string")
      : [],
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export function mergeSelfPublicProfileFallback(
  publicProfile: PublicProfileRow,
  ownProfile: Pick<
    ProfileRow,
    | "id"
    | "headline"
    | "location"
    | "website_url"
    | "linkedin_url"
    | "banner_preset"
    | "accent_theme"
    | "avatar_frame"
    | "octopy_companion"
    | "skills"
    | "xp_total"
    | "current_streak"
    | "badges"
  > | null,
  hasPublicCustomizationColumns: boolean,
): PublicProfileRow {
  if (!ownProfile || ownProfile.id !== publicProfile.id) {
    return publicProfile;
  }

  const mergedGamification = {
    xp_total: Math.max(publicProfile.xp_total ?? 0, ownProfile.xp_total ?? 0),
    current_streak: Math.max(
      publicProfile.current_streak ?? 0,
      ownProfile.current_streak ?? 0,
    ),
    badges:
      (ownProfile.badges?.length ?? 0) >= (publicProfile.badges?.length ?? 0)
        ? (ownProfile.badges ?? [])
        : (publicProfile.badges ?? []),
  };

  if (hasPublicCustomizationColumns) {
    return {
      ...publicProfile,
      ...mergedGamification,
    };
  }

  return {
    ...publicProfile,
    headline: ownProfile.headline,
    location: ownProfile.location,
    website_url: ownProfile.website_url,
    linkedin_url: ownProfile.linkedin_url,
    banner_preset: ownProfile.banner_preset,
    accent_theme: ownProfile.accent_theme,
    avatar_frame: ownProfile.avatar_frame,
    octopy_companion: ownProfile.octopy_companion,
    skills: ownProfile.skills,
    ...mergedGamification,
  };
}

export interface SocialServiceErrorDetails {
  isMigrationMissing?: boolean | undefined;
  isPermissionGrantMissing?: boolean | undefined;
  code?: string | undefined;
  status?: number | null | undefined;
}

export class SocialValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialValidationError";
  }
}

export class SocialServiceError extends Error {
  readonly isMigrationMissing: boolean;
  readonly isPermissionGrantMissing: boolean;
  readonly code?: string | undefined;
  readonly status?: number | null | undefined;

  constructor(
    message: string,
    isMigrationMissingOrDetails: boolean | SocialServiceErrorDetails = false,
  ) {
    super(message);
    this.name = "SocialServiceError";
    if (typeof isMigrationMissingOrDetails === "boolean") {
      this.isMigrationMissing = isMigrationMissingOrDetails;
      this.isPermissionGrantMissing = false;
      this.status = null;
    } else {
      this.isMigrationMissing = Boolean(
        isMigrationMissingOrDetails.isMigrationMissing,
      );
      this.isPermissionGrantMissing = Boolean(
        isMigrationMissingOrDetails.isPermissionGrantMissing,
      );
      this.code = isMigrationMissingOrDetails.code;
      this.status = isMigrationMissingOrDetails.status ?? null;
    }
  }
}

function toSocialServiceError(
  error: unknown,
  context?: { status?: number | null; table?: string; operation?: string },
): SocialServiceError {
  const meta = extractSupabaseErrorMeta(error, context);
  return new SocialServiceError(
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

  const { data, error, status } = await builder;
  if (error) {
    throw toSocialServiceError(error, {
      status,
      table: "public_profiles",
      operation: "searchCommunityUsers",
    });
  }

  const rows = ((data ?? []) as RawPublicProfileDbRow[]).map(
    normalizePublicProfileRow,
  );
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

async function fetchRawPublicProfileByUsername(
  rawUsername: string,
  client: CoditSupabaseClient,
): Promise<RawPublicProfileDbRow | null> {
  const parsed = coditUsernameSchema.safeParse(rawUsername);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new SocialValidationError(
      firstIssue?.message ?? "Informe um @usuário válido.",
    );
  }

  const { data, error, status } = await client
    .from("public_profiles")
    .select("*")
    .eq("username", parsed.data)
    .maybeSingle();

  if (error) {
    throw toSocialServiceError(error, {
      status,
      table: "public_profiles",
      operation: "getPublicProfileByUsername",
    });
  }

  return (data as RawPublicProfileDbRow | null) ?? null;
}

export async function getPublicProfileByUsername(
  rawUsername: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<PublicProfileRow | null> {
  const raw = await fetchRawPublicProfileByUsername(rawUsername, client);
  return raw ? normalizePublicProfileRow(raw) : null;
}

async function fetchRawPublicProfileById(
  userId: string,
  client: CoditSupabaseClient,
): Promise<RawPublicProfileDbRow | null> {
  const validId = assertValidUuid(userId, "Identificador de perfil");

  const { data, error, status } = await client
    .from("public_profiles")
    .select("*")
    .eq("id", validId)
    .maybeSingle();

  if (error) {
    throw toSocialServiceError(error, {
      status,
      table: "public_profiles",
      operation: "getPublicProfileById",
    });
  }

  return (data as RawPublicProfileDbRow | null) ?? null;
}

export async function getPublicProfileById(
  userId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<PublicProfileRow | null> {
  const raw = await fetchRawPublicProfileById(userId, client);
  return raw ? normalizePublicProfileRow(raw) : null;
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

  const {
    data: friendshipRows,
    error: friendshipError,
    status: friendshipStatus,
  } = await client
    .from("friendships")
    .select("*")
    .or(`requester_id.eq.${validUserId},addressee_id.eq.${validUserId}`)
    .order("updated_at", { ascending: false });

  if (friendshipError) {
    throw toSocialServiceError(friendshipError, {
      status: friendshipStatus,
      table: "friendships",
      operation: "listUserFriendships",
    });
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

  const {
    data: profilesData,
    error: profilesError,
    status: profilesStatus,
  } = await client
    .from("public_profiles")
    .select("*")
    .in("id", otherUserIds);

  if (profilesError) {
    throw toSocialServiceError(profilesError, {
      status: profilesStatus,
      table: "public_profiles",
      operation: "listUserFriendships.profiles",
    });
  }

  const profileMap = new Map<string, PublicProfileRow>(
    ((profilesData ?? []) as RawPublicProfileDbRow[]).map((item) => {
      const normalized = normalizePublicProfileRow(item);
      return [normalized.id, normalized];
    }),
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

  await assertAuthenticatedUserMatches(
    validRequester,
    client,
    (message) =>
      new SocialServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const {
    data: existingRows,
    error: checkError,
    status: checkStatus,
  } = await client
    .from("friendships")
    .select("*")
    .or(
      `and(requester_id.eq.${validRequester},addressee_id.eq.${validAddressee}),and(requester_id.eq.${validAddressee},addressee_id.eq.${validRequester})`,
    )
    .limit(1);

  if (checkError) {
    throw toSocialServiceError(checkError, {
      status: checkStatus,
      table: "friendships",
      operation: "sendFriendRequest.check",
    });
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

  const { data, error, status } = await client
    .from("friendships")
    .insert({
      requester_id: validRequester,
      addressee_id: validAddressee,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    throw toSocialServiceError(error, {
      status,
      table: "friendships",
      operation: "sendFriendRequest.insert",
    });
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

  await assertAuthenticatedUserMatches(
    validUserId,
    client,
    (message) =>
      new SocialServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const { data, error, status } = await client
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", validFriendshipId)
    .eq("addressee_id", validUserId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error) {
    throw toSocialServiceError(error, {
      status,
      table: "friendships",
      operation: "acceptFriendRequest",
    });
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

  await assertAuthenticatedUserMatches(
    validUserId,
    client,
    (message) =>
      new SocialServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const { data, error, status } = await client
    .from("friendships")
    .delete()
    .eq("id", validFriendshipId)
    .or(`requester_id.eq.${validUserId},addressee_id.eq.${validUserId}`)
    .select("id")
    .maybeSingle();

  if (error) {
    throw toSocialServiceError(error, {
      status,
      table: "friendships",
      operation: "removeFriendship",
    });
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
    throw toSocialServiceError(authorsResult.error, {
      status: authorsResult.status,
      table: "public_profiles",
      operation: "enrichProjects.authors",
    });
  }
  if (likesResult.error) {
    throw toSocialServiceError(likesResult.error, {
      status: likesResult.status,
      table: "project_likes",
      operation: "enrichProjects.likes",
    });
  }
  if (commentsResult.error) {
    throw toSocialServiceError(commentsResult.error, {
      status: commentsResult.status,
      table: "project_comments",
      operation: "enrichProjects.comments",
    });
  }

  const authorMap = new Map<string, PublicProfileRow>(
    ((authorsResult.data ?? []) as RawPublicProfileDbRow[]).map((author) => {
      const normalized = normalizePublicProfileRow(author);
      return [normalized.id, normalized];
    }),
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
    const {
      data: acceptedRows,
      error: friendError,
      status: friendStatus,
    } = await client
      .from("friendships")
      .select("requester_id, addressee_id")
      .or(`requester_id.eq.${validViewerId},addressee_id.eq.${validViewerId}`)
      .eq("status", "accepted");

    if (friendError) {
      throw toSocialServiceError(friendError, {
        status: friendStatus,
        table: "friendships",
        operation: "listCommunityProjects.friends",
      });
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

    const {
      data: projectsData,
      error: projectsError,
      status: projectsStatus,
    } = await friendsQuery
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (projectsError) {
      throw toSocialServiceError(projectsError, {
        status: projectsStatus,
        table: "sandbox_projects",
        operation: "listCommunityProjects.friendsProjects",
      });
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

  const {
    data: projectsData,
    error: projectsError,
    status: projectsStatus,
  } = await feedQuery
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (projectsError) {
    throw toSocialServiceError(projectsError, {
      status: projectsStatus,
      table: "sandbox_projects",
      operation: "listCommunityProjects.all",
    });
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

  const { data, error, status } = await client
    .from("sandbox_projects")
    .select("*")
    .eq("user_id", validAuthorId)
    .in("visibility", ["public_portfolio", "friends"])
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error) {
    throw toSocialServiceError(error, {
      status,
      table: "sandbox_projects",
      operation: "listVisibleProjectsByAuthor",
    });
  }

  return enrichProjectsWithSocialMeta(data ?? [], viewerId, client);
}

export async function getCommunityProjectById(
  projectId: string,
  viewerId: string | null,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<CommunityProjectCard | null> {
  const validProjectId = assertValidUuid(projectId, "Identificador do projeto");

  const { data, error, status } = await client
    .from("sandbox_projects")
    .select("*")
    .eq("id", validProjectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw toSocialServiceError(error, {
      status,
      table: "sandbox_projects",
      operation: "getCommunityProjectById",
    });
  }

  if (!data) {
    return null;
  }

  const enriched = await enrichProjectsWithSocialMeta([data], viewerId, client);
  return enriched[0] ?? null;
}

export async function getPublicProfileBundle(
  target: { username?: string | null; userId?: string | null },
  viewerId: string | null,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<PublicProfileBundle | null> {
  const targetUsername = target.username?.trim();
  const targetUserId = target.userId?.trim();

  let rawProfile: RawPublicProfileDbRow | null = null;
  if (targetUsername) {
    rawProfile = await fetchRawPublicProfileByUsername(targetUsername, client);
  } else if (targetUserId) {
    rawProfile = await fetchRawPublicProfileById(targetUserId, client);
  } else {
    throw new SocialValidationError(
      "Informe um @usuário ou identificador para abrir o perfil.",
    );
  }

  if (!rawProfile) {
    return null;
  }

  const profile = normalizePublicProfileRow(rawProfile);
  const hasPublicCustomizationColumns =
    hasPublicCustomizationSchema(rawProfile);

  const friendshipsPromise =
    viewerId && viewerId !== profile.id
      ? client
          .from("friendships")
          .select("*")
          .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`)
      : Promise.resolve({
          data: [] as FriendshipRow[],
          error: null,
          status: 200,
        });

  const [friendshipsResult, friendCount, projects] = await Promise.all([
    friendshipsPromise,
    getProfileFriendCount(profile.id, client),
    listVisibleProjectsByAuthor(profile.id, viewerId, client),
  ]);

  if (friendshipsResult.error) {
    throw toSocialServiceError(friendshipsResult.error, {
      status: friendshipsResult.status,
      table: "friendships",
      operation: "getPublicProfileBundle.friendships",
    });
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
    hasPublicCustomizationColumns,
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

  await assertAuthenticatedUserMatches(
    validUserId,
    client,
    (message) =>
      new SocialServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  if (currentlyLiked) {
    const { error, status } = await client
      .from("project_likes")
      .delete()
      .eq("project_id", validProjectId)
      .eq("user_id", validUserId);

    if (error) {
      throw toSocialServiceError(error, {
        status,
        table: "project_likes",
        operation: "toggleProjectLike.delete",
      });
    }

    return { liked: false };
  }

  const { error, status } = await client.from("project_likes").insert({
    project_id: validProjectId,
    user_id: validUserId,
  });

  if (error) {
    if (error.code === "23505") {
      return { liked: true };
    }
    throw toSocialServiceError(error, {
      status,
      table: "project_likes",
      operation: "toggleProjectLike.insert",
    });
  }

  return { liked: true };
}

export async function listProjectComments(
  projectId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<ProjectCommentWithAuthor[]> {
  const validProjectId = assertValidUuid(projectId, "Identificador do projeto");

  const {
    data: commentsData,
    error: commentsError,
    status: commentsStatus,
  } = await client
    .from("project_comments")
    .select("*")
    .eq("project_id", validProjectId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (commentsError) {
    throw toSocialServiceError(commentsError, {
      status: commentsStatus,
      table: "project_comments",
      operation: "listProjectComments",
    });
  }

  const comments = commentsData ?? [];
  if (comments.length === 0) {
    return [];
  }

  const authorIds = Array.from(new Set(comments.map((item) => item.user_id)));
  const {
    data: authorsData,
    error: authorsError,
    status: authorsStatus,
  } = await client
    .from("public_profiles")
    .select("*")
    .in("id", authorIds);

  if (authorsError) {
    throw toSocialServiceError(authorsError, {
      status: authorsStatus,
      table: "public_profiles",
      operation: "listProjectComments.authors",
    });
  }

  const authorMap = new Map<string, PublicProfileRow>(
    ((authorsData ?? []) as RawPublicProfileDbRow[]).map((author) => {
      const normalized = normalizePublicProfileRow(author);
      return [normalized.id, normalized];
    }),
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

  await assertAuthenticatedUserMatches(
    validUserId,
    client,
    (message) =>
      new SocialServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const { data: comment, error, status } = await client
    .from("project_comments")
    .insert({
      project_id: validProjectId,
      user_id: validUserId,
      content: parsed.data.content,
    })
    .select("*")
    .single();

  if (error) {
    throw toSocialServiceError(error, {
      status,
      table: "project_comments",
      operation: "createProjectComment",
    });
  }

  const { data: authorData } = await client
    .from("public_profiles")
    .select("*")
    .eq("id", validUserId)
    .maybeSingle();

  return {
    comment,
    author: authorData
      ? normalizePublicProfileRow(authorData as RawPublicProfileDbRow)
      : null,
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

  await assertHasAuthenticatedSession(
    client,
    (message) =>
      new SocialServiceError(message, {
        code: "AUTH_REQUIRED",
        status: 401,
      }),
  );

  const { data, error, status } = await client
    .from("project_comments")
    .delete()
    .eq("id", validCommentId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw toSocialServiceError(error, {
      status,
      table: "project_comments",
      operation: "deleteProjectComment",
    });
  }

  return data !== null;
}

export async function cloneProjectToMySandbox(
  userId: string,
  sourceProject: SandboxProjectRow,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<SandboxProjectRow> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");

  await assertAuthenticatedUserMatches(
    validUserId,
    client,
    (message) =>
      new SocialServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

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

export interface BlockedUserItem {
  block: UserBlockRow;
  profile: PublicProfileRow | null;
}

export async function blockUser(
  userId: string,
  targetUserId: string,
  reason?: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<UserBlockRow> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");
  const validTargetId = assertValidUuid(
    targetUserId,
    "Identificador do usuário alvo",
  );

  if (validUserId === validTargetId) {
    throw new SocialValidationError("Você não pode bloquear a si mesmo.");
  }

  await assertAuthenticatedUserMatches(
    validUserId,
    client,
    (message) =>
      new SocialServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const cleanReason = reason?.trim().slice(0, 200) || null;

  const { data, error, status } = await client
    .from("user_blocks")
    .upsert(
      {
        blocker_id: validUserId,
        blocked_id: validTargetId,
        reason: cleanReason,
      },
      { onConflict: "blocker_id,blocked_id" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw toSocialServiceError(
      error ?? new Error("Não foi possível bloquear este usuário."),
      {
        status,
        table: "user_blocks",
        operation: "blockUser",
      },
    );
  }

  return data;
}

export async function unblockUser(
  userId: string,
  targetUserId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<boolean> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");
  const validTargetId = assertValidUuid(
    targetUserId,
    "Identificador do usuário alvo",
  );

  await assertAuthenticatedUserMatches(
    validUserId,
    client,
    (message) =>
      new SocialServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const { error, status } = await client
    .from("user_blocks")
    .delete()
    .eq("blocker_id", validUserId)
    .eq("blocked_id", validTargetId);

  if (error) {
    throw toSocialServiceError(error, {
      status,
      table: "user_blocks",
      operation: "unblockUser",
    });
  }

  return true;
}

export async function listBlockedUsers(
  userId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<BlockedUserItem[]> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");

  await assertAuthenticatedUserMatches(
    validUserId,
    client,
    (message) =>
      new SocialServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const { data, error, status } = await client
    .from("user_blocks")
    .select("*")
    .eq("blocker_id", validUserId)
    .order("created_at", { ascending: false });

  if (error) {
    throw toSocialServiceError(error, {
      status,
      table: "user_blocks",
      operation: "listBlockedUsers",
    });
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return [];
  }

  const targetIds = rows.map((row) => row.blocked_id);
  const { data: profilesData } = await client
    .from("public_profiles")
    .select("*")
    .in("id", targetIds);

  const profileMap = new Map<string, PublicProfileRow>(
    (profilesData ?? []).map((item) => [
      item.id,
      normalizePublicProfileRow(item as RawPublicProfileDbRow),
    ]),
  );

  return rows.map((block) => ({
    block,
    profile: profileMap.get(block.blocked_id) ?? null,
  }));
}

export async function checkUsersBlocked(
  userId: string,
  otherUserId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<boolean> {
  if (!userId || !otherUserId || userId === otherUserId) {
    return false;
  }

  try {
    const { data, error } = await client.rpc("are_users_blocked", {
      p_user_a: userId,
      p_user_b: otherUserId,
    });
    if (error) {
      return false;
    }
    return Boolean(data);
  } catch {
    return false;
  }
}

export async function submitModerationReport(
  userId: string,
  input: {
    targetType: ModerationTargetType;
    targetId: string;
    reason: ModerationReportReason;
    details?: string;
  },
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<ModerationReportRow> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");
  const validTargetId = assertValidUuid(
    input.targetId,
    "Identificador do conteúdo denunciado",
  );

  await assertAuthenticatedUserMatches(
    validUserId,
    client,
    (message) =>
      new SocialServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const cleanDetails = input.details?.trim().slice(0, 1000) || null;

  const { data, error, status } = await client
    .from("moderation_reports")
    .insert({
      reporter_id: validUserId,
      target_type: input.targetType,
      target_id: validTargetId,
      reason: input.reason,
      details: cleanDetails,
      status: "open",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw toSocialServiceError(
      error ?? new Error("Não foi possível enviar a denúncia."),
      {
        status,
        table: "moderation_reports",
        operation: "submitModerationReport",
      },
    );
  }

  return data;
}

export async function getCommunityProjectCardById(
  projectId: string,
  viewerId: string | null,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<CommunityProjectCard | null> {
  const validProjectId = assertValidUuid(
    projectId,
    "Identificador do projeto",
  );

  const { data: rawProject, error, status } = await client
    .from("sandbox_projects")
    .select("*")
    .eq("id", validProjectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw toSocialServiceError(error, {
      status,
      table: "sandbox_projects",
      operation: "getCommunityProjectCardById",
    });
  }

  if (!rawProject) {
    return null;
  }

  const project = normalizeSandboxProjectRow(rawProject);

  const [authorRes, likesRes, commentsRes] = await Promise.all([
    client
      .from("public_profiles")
      .select("*")
      .eq("id", project.user_id)
      .maybeSingle(),
    client
      .from("project_likes")
      .select("user_id")
      .eq("project_id", project.id),
    client
      .from("project_comments")
      .select("id")
      .eq("project_id", project.id),
  ]);

  const likes = likesRes.data ?? [];
  const comments = commentsRes.data ?? [];

  return {
    project,
    author: authorRes.data
      ? normalizePublicProfileRow(authorRes.data as RawPublicProfileDbRow)
      : null,
    likesCount: likes.length,
    commentsCount: comments.length,
    likedByViewer: Boolean(
      viewerId && likes.some((like) => like.user_id === viewerId),
    ),
  };
}
