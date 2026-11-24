import {
  requireSupabaseClient,
  type CoditSupabaseClient,
} from "@/lib/supabase/client";
import type {
  ChatConversationMemberRow,
  ChatConversationRow,
  ChatMessageRow,
  FriendshipRow,
  PublicProfileRow,
} from "@/lib/supabase/database.types";
import {
  extractSupabaseErrorMeta,
  isMissingDatabaseSchemaError,
  isTablePrivilegeError,
  mapSupabaseDatabaseError,
} from "@/lib/supabase/errors";
import { assertAuthenticatedUserMatches } from "@/lib/supabase/session-guard";
import {
  createGroupConversationSchema,
  groupTitleSchema,
  MAX_GROUP_MEMBERS,
  sendChatMessageSchema,
  validateGroupMemberAddition,
} from "@/modules/messaging/messaging-schemas";
import { uuidSchema } from "@/modules/social/social-schemas";

export interface ChatMemberProfile {
  member: ChatConversationMemberRow;
  profile: PublicProfileRow;
}

export interface ConversationSummary {
  conversation: ChatConversationRow;
  members: ChatMemberProfile[];
  activeMemberCount: number;
  currentMember: ChatConversationMemberRow;
  directPeer: PublicProfileRow | null;
  isDirectFriendActive: boolean;
  canSendMessages: boolean;
  unreadCount: number;
  displayTitle: string;
}

export interface ChatMessageItem {
  message: ChatMessageRow;
  sender: PublicProfileRow | null;
}

export interface MessagingServiceErrorDetails {
  isMigrationMissing?: boolean | undefined;
  isPermissionGrantMissing?: boolean | undefined;
  code?: string | undefined;
  status?: number | null | undefined;
}

export class MessagingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessagingValidationError";
  }
}

export class MessagingServiceError extends Error {
  readonly isMigrationMissing: boolean;
  readonly isPermissionGrantMissing: boolean;
  readonly code?: string | undefined;
  readonly status?: number | null | undefined;

  constructor(
    message: string,
    details: MessagingServiceErrorDetails = {},
  ) {
    super(message);
    this.name = "MessagingServiceError";
    this.isMigrationMissing = Boolean(details.isMigrationMissing);
    this.isPermissionGrantMissing = Boolean(details.isPermissionGrantMissing);
    this.code = details.code;
    this.status = details.status ?? null;
  }
}

function toMessagingServiceError(
  error: unknown,
  context?: { status?: number | null; table?: string; operation?: string },
): MessagingServiceError {
  const meta = extractSupabaseErrorMeta(error, context);
  return new MessagingServiceError(
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
    throw new MessagingValidationError(`${fieldLabel} inválido.`);
  }
  return parsed.data;
}

function collectAcceptedFriendIds(
  viewerId: string,
  friendships: ReadonlyArray<Pick<FriendshipRow, "requester_id" | "addressee_id" | "status">>,
): Set<string> {
  const result = new Set<string>();
  for (const row of friendships) {
    if (row.status !== "accepted") {
      continue;
    }
    if (row.requester_id === viewerId) {
      result.add(row.addressee_id);
    } else if (row.addressee_id === viewerId) {
      result.add(row.requester_id);
    }
  }
  return result;
}

async function fetchAcceptedFriendIds(
  userId: string,
  client: CoditSupabaseClient,
): Promise<Set<string>> {
  const { data, error, status } = await client
    .from("friendships")
    .select("requester_id, addressee_id, status")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq("status", "accepted");

  if (error) {
    throw toMessagingServiceError(error, {
      status,
      table: "friendships",
      operation: "fetchAcceptedFriendIds",
    });
  }

  return collectAcceptedFriendIds(userId, data ?? []);
}

export async function listUserConversations(
  userId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<ConversationSummary[]> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");

  const {
    data: ownMemberRows,
    error: ownMemberError,
    status: ownMemberStatus,
  } = await client
    .from("chat_conversation_members")
    .select("*")
    .eq("user_id", validUserId)
    .is("left_at", null);

  if (ownMemberError) {
    throw toMessagingServiceError(ownMemberError, {
      status: ownMemberStatus,
      table: "chat_conversation_members",
      operation: "listUserConversations.ownMembers",
    });
  }

  const ownMembers = ownMemberRows ?? [];
  if (ownMembers.length === 0) {
    return [];
  }

  const conversationIds = ownMembers.map((item) => item.conversation_id);
  const ownMemberMap = new Map<string, ChatConversationMemberRow>(
    ownMembers.map((item) => [item.conversation_id, item]),
  );

  const [
    conversationsResult,
    allMembersResult,
    acceptedFriendshipsResult,
    unreadMessagesResult,
  ] = await Promise.all([
    client.from("chat_conversations").select("*").in("id", conversationIds),
    client
      .from("chat_conversation_members")
      .select("*")
      .in("conversation_id", conversationIds)
      .is("left_at", null),
    client
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .or(`requester_id.eq.${validUserId},addressee_id.eq.${validUserId}`)
      .eq("status", "accepted"),
    client
      .from("chat_messages")
      .select("id, conversation_id, sender_id, created_at")
      .in("conversation_id", conversationIds)
      .is("deleted_at", null)
      .neq("sender_id", validUserId)
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  if (conversationsResult.error) {
    throw toMessagingServiceError(conversationsResult.error, {
      status: conversationsResult.status,
      table: "chat_conversations",
      operation: "listUserConversations.conversations",
    });
  }

  if (allMembersResult.error) {
    throw toMessagingServiceError(allMembersResult.error, {
      status: allMembersResult.status,
      table: "chat_conversation_members",
      operation: "listUserConversations.allMembers",
    });
  }

  if (acceptedFriendshipsResult.error) {
    throw toMessagingServiceError(acceptedFriendshipsResult.error, {
      status: acceptedFriendshipsResult.status,
      table: "friendships",
      operation: "listUserConversations.friendships",
    });
  }

  if (unreadMessagesResult.error) {
    throw toMessagingServiceError(unreadMessagesResult.error, {
      status: unreadMessagesResult.status,
      table: "chat_messages",
      operation: "listUserConversations.unread",
    });
  }

  const allMemberRows = allMembersResult.data ?? [];
  const memberUserIds = Array.from(
    new Set(allMemberRows.map((item) => item.user_id)),
  );

  const profileMap = new Map<string, PublicProfileRow>();
  if (memberUserIds.length > 0) {
    const {
      data: profilesData,
      error: profilesError,
      status: profilesStatus,
    } = await client
      .from("public_profiles")
      .select("*")
      .in("id", memberUserIds);

    if (profilesError) {
      throw toMessagingServiceError(profilesError, {
        status: profilesStatus,
        table: "public_profiles",
        operation: "listUserConversations.profiles",
      });
    }

    for (const profile of profilesData ?? []) {
      profileMap.set(profile.id, profile);
    }
  }

  const acceptedFriendIds = collectAcceptedFriendIds(
    validUserId,
    acceptedFriendshipsResult.data ?? [],
  );

  const membersByConversation = new Map<string, ChatConversationMemberRow[]>();
  for (const row of allMemberRows) {
    const existing = membersByConversation.get(row.conversation_id) ?? [];
    existing.push(row);
    membersByConversation.set(row.conversation_id, existing);
  }

  const unreadCountMap = new Map<string, number>();
  for (const msg of unreadMessagesResult.data ?? []) {
    const member = ownMemberMap.get(msg.conversation_id);
    if (!member) {
      continue;
    }
    const lastReadMs = Date.parse(member.last_read_at);
    const createdMs = Date.parse(msg.created_at);
    if (!Number.isNaN(lastReadMs) && !Number.isNaN(createdMs) && createdMs > lastReadMs) {
      unreadCountMap.set(
        msg.conversation_id,
        (unreadCountMap.get(msg.conversation_id) ?? 0) + 1,
      );
    }
  }

  const summaries: ConversationSummary[] = [];

  for (const conversation of conversationsResult.data ?? []) {
    const currentMember = ownMemberMap.get(conversation.id);
    if (!currentMember) {
      continue;
    }

    const rawMembers = membersByConversation.get(conversation.id) ?? [];
    const enrichedMembers: ChatMemberProfile[] = rawMembers
      .map((member) => {
        const profile = profileMap.get(member.user_id);
        return profile ? { member, profile } : null;
      })
      .filter((entry): entry is ChatMemberProfile => entry !== null)
      .sort((a, b) => {
        if (a.member.role !== b.member.role) {
          return a.member.role === "owner" ? -1 : 1;
        }
        if (a.member.user_id === validUserId) {
          return -1;
        }
        if (b.member.user_id === validUserId) {
          return 1;
        }
        return a.profile.full_name.localeCompare(b.profile.full_name);
      });

    const activeMemberCount = rawMembers.length;
    const directPeerEntry =
      conversation.kind === "direct"
        ? enrichedMembers.find((entry) => entry.member.user_id !== validUserId) ??
          null
        : null;
    const directPeer = directPeerEntry?.profile ?? null;
    const isDirectFriendActive =
      conversation.kind === "direct" &&
      directPeer !== null &&
      acceptedFriendIds.has(directPeer.id);

    const canSendMessages =
      conversation.kind === "direct"
        ? isDirectFriendActive
        : activeMemberCount >= 1 && activeMemberCount <= MAX_GROUP_MEMBERS;

    const displayTitle =
      conversation.kind === "group"
        ? conversation.title?.trim() || "Grupo Codit"
        : directPeer?.full_name || "Amigo no Codit";

    summaries.push({
      conversation,
      members: enrichedMembers,
      activeMemberCount,
      currentMember,
      directPeer,
      isDirectFriendActive,
      canSendMessages,
      unreadCount: unreadCountMap.get(conversation.id) ?? 0,
      displayTitle,
    });
  }

  summaries.sort((a, b) => {
    const aAnchor = Date.parse(
      a.conversation.last_message_at ??
        a.conversation.updated_at ??
        a.conversation.created_at,
    );
    const bAnchor = Date.parse(
      b.conversation.last_message_at ??
        b.conversation.updated_at ??
        b.conversation.created_at,
    );
    return (Number.isNaN(bAnchor) ? 0 : bAnchor) - (Number.isNaN(aAnchor) ? 0 : aAnchor);
  });

  return summaries;
}

export async function listConversationMessages(
  userId: string,
  conversationId: string,
  options?: { limit?: number },
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<ChatMessageItem[]> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");
  const validConversationId = assertValidUuid(
    conversationId,
    "Identificador da conversa",
  );
  const limit = Math.min(Math.max(options?.limit ?? 80, 1), 200);

  await assertAuthenticatedUserMatches(validUserId, client, (message) => {
    return new MessagingServiceError(message, {
      code: "AUTH_USER_MISMATCH",
      status: 403,
    });
  });

  const { data, error, status } = await client
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", validConversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw toMessagingServiceError(error, {
      status,
      table: "chat_messages",
      operation: "listConversationMessages",
    });
  }

  const rows = [...(data ?? [])].reverse();
  if (rows.length === 0) {
    return [];
  }

  const senderIds = Array.from(new Set(rows.map((item) => item.sender_id)));
  const {
    data: sendersData,
    error: sendersError,
    status: sendersStatus,
  } = await client.from("public_profiles").select("*").in("id", senderIds);

  if (sendersError) {
    throw toMessagingServiceError(sendersError, {
      status: sendersStatus,
      table: "public_profiles",
      operation: "listConversationMessages.senders",
    });
  }

  const senderMap = new Map<string, PublicProfileRow>(
    (sendersData ?? []).map((item) => [item.id, item]),
  );

  return rows.map((message) => ({
    message,
    sender: senderMap.get(message.sender_id) ?? null,
  }));
}

export async function getOrCreateDirectConversation(
  userId: string,
  friendId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<string> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");
  const validFriendId = assertValidUuid(friendId, "Identificador do amigo");

  if (validUserId === validFriendId) {
    throw new MessagingValidationError(
      "Você não pode iniciar uma conversa direta consigo mesmo.",
    );
  }

  await assertAuthenticatedUserMatches(validUserId, client, (message) => {
    return new MessagingServiceError(message, {
      code: "AUTH_USER_MISMATCH",
      status: 403,
    });
  });

  const {
    data: friendshipRows,
    error: friendError,
    status: friendStatus,
  } = await client
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .or(
      `and(requester_id.eq.${validUserId},addressee_id.eq.${validFriendId}),and(requester_id.eq.${validFriendId},addressee_id.eq.${validUserId})`,
    )
    .eq("status", "accepted")
    .limit(1);

  if (friendError) {
    throw toMessagingServiceError(friendError, {
      status: friendStatus,
      table: "friendships",
      operation: "getOrCreateDirectConversation.friendshipCheck",
    });
  }

  if (!friendshipRows || friendshipRows.length === 0) {
    throw new MessagingValidationError(
      "Apenas amigos aceitos podem enviar mensagens diretas entre si no Codit.",
    );
  }

  const { data, error, status } = await client.rpc(
    "get_or_create_direct_conversation",
    {
      p_friend_id: validFriendId,
    },
  );

  if (error || !data) {
    throw toMessagingServiceError(
      error ?? new Error("Resposta inválida ao abrir conversa direta."),
      {
        status,
        table: "chat_conversations",
        operation: "getOrCreateDirectConversation.rpc",
      },
    );
  }

  return data;
}

export async function createGroupConversation(
  userId: string,
  input: { title: string; memberIds: string[] },
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<string> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");

  await assertAuthenticatedUserMatches(validUserId, client, (message) => {
    return new MessagingServiceError(message, {
      code: "AUTH_USER_MISMATCH",
      status: 403,
    });
  });

  const inviteesWithoutSelf = input.memberIds.filter(
    (candidate) => candidate !== validUserId,
  );
  const parsed = createGroupConversationSchema.safeParse({
    title: input.title,
    memberIds: inviteesWithoutSelf,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new MessagingValidationError(
      firstIssue?.message ?? "Revise o nome e os amigos selecionados.",
    );
  }

  const acceptedFriendIds = await fetchAcceptedFriendIds(validUserId, client);
  const hasNonFriend = parsed.data.memberIds.some(
    (memberId) => !acceptedFriendIds.has(memberId),
  );

  if (hasNonFriend) {
    throw new MessagingValidationError(
      "Apenas amigos aceitos podem ser convidados para grupos no Codit.",
    );
  }

  const { data, error, status } = await client.rpc(
    "create_group_conversation",
    {
      p_title: parsed.data.title,
      p_member_ids: parsed.data.memberIds,
    },
  );

  if (error || !data) {
    throw toMessagingServiceError(
      error ?? new Error("Não foi possível criar o grupo."),
      {
        status,
        table: "chat_conversations",
        operation: "createGroupConversation.rpc",
      },
    );
  }

  return data;
}

export async function addGroupMembers(
  userId: string,
  conversationId: string,
  candidateFriendIds: string[],
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<number> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");
  const validConversationId = assertValidUuid(
    conversationId,
    "Identificador do grupo",
  );

  await assertAuthenticatedUserMatches(validUserId, client, (message) => {
    return new MessagingServiceError(message, {
      code: "AUTH_USER_MISMATCH",
      status: 403,
    });
  });

  const {
    data: activeMembers,
    error: membersError,
    status: membersStatus,
  } = await client
    .from("chat_conversation_members")
    .select("user_id")
    .eq("conversation_id", validConversationId)
    .is("left_at", null);

  if (membersError) {
    throw toMessagingServiceError(membersError, {
      status: membersStatus,
      table: "chat_conversation_members",
      operation: "addGroupMembers.activeMembers",
    });
  }

  const existingIds = (activeMembers ?? []).map((item) => item.user_id);
  if (!existingIds.includes(validUserId)) {
    throw new MessagingValidationError(
      "Você não é participante ativo deste grupo.",
    );
  }

  const additionCheck = validateGroupMemberAddition(
    existingIds.length,
    existingIds,
    candidateFriendIds,
  );

  if (!additionCheck.ok) {
    throw new MessagingValidationError(additionCheck.message);
  }

  const acceptedFriendIds = await fetchAcceptedFriendIds(validUserId, client);
  const hasNonFriend = additionCheck.newMemberIds.some(
    (memberId) => !acceptedFriendIds.has(memberId),
  );

  if (hasNonFriend) {
    throw new MessagingValidationError(
      "Você só pode adicionar amigos aceitos ao grupo.",
    );
  }

  const { data, error, status } = await client.rpc(
    "add_group_conversation_members",
    {
      p_conversation_id: validConversationId,
      p_member_ids: additionCheck.newMemberIds,
    },
  );

  if (error) {
    throw toMessagingServiceError(error, {
      status,
      table: "chat_conversation_members",
      operation: "addGroupMembers.rpc",
    });
  }

  return typeof data === "number" ? data : additionCheck.newMemberIds.length;
}

export async function leaveOrRemoveGroupMember(
  userId: string,
  conversationId: string,
  targetUserId: string = userId,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<boolean> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");
  const validConversationId = assertValidUuid(
    conversationId,
    "Identificador do grupo",
  );
  const validTargetId = assertValidUuid(
    targetUserId,
    "Identificador do participante",
  );

  await assertAuthenticatedUserMatches(validUserId, client, (message) => {
    return new MessagingServiceError(message, {
      code: "AUTH_USER_MISMATCH",
      status: 403,
    });
  });

  const { data, error, status } = await client.rpc(
    "remove_or_leave_group_member",
    {
      p_conversation_id: validConversationId,
      p_target_user_id: validTargetId,
    },
  );

  if (error) {
    throw toMessagingServiceError(error, {
      status,
      table: "chat_conversation_members",
      operation: "leaveOrRemoveGroupMember.rpc",
    });
  }

  return Boolean(data);
}

export async function renameGroupConversation(
  userId: string,
  conversationId: string,
  rawTitle: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<boolean> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");
  const validConversationId = assertValidUuid(
    conversationId,
    "Identificador do grupo",
  );

  await assertAuthenticatedUserMatches(validUserId, client, (message) => {
    return new MessagingServiceError(message, {
      code: "AUTH_USER_MISMATCH",
      status: 403,
    });
  });

  const parsedTitle = groupTitleSchema.safeParse(rawTitle);
  if (!parsedTitle.success) {
    const firstIssue = parsedTitle.error.issues[0];
    throw new MessagingValidationError(
      firstIssue?.message ?? "Informe um nome válido para o grupo.",
    );
  }

  const { data, error, status } = await client.rpc(
    "rename_group_conversation",
    {
      p_conversation_id: validConversationId,
      p_title: parsedTitle.data,
    },
  );

  if (error) {
    throw toMessagingServiceError(error, {
      status,
      table: "chat_conversations",
      operation: "renameGroupConversation.rpc",
    });
  }

  return Boolean(data);
}

export async function sendConversationMessage(
  userId: string,
  conversationId: string,
  rawContent: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<ChatMessageItem> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");
  const validConversationId = assertValidUuid(
    conversationId,
    "Identificador da conversa",
  );

  await assertAuthenticatedUserMatches(validUserId, client, (message) => {
    return new MessagingServiceError(message, {
      code: "AUTH_USER_MISMATCH",
      status: 403,
    });
  });

  const parsed = sendChatMessageSchema.safeParse({ content: rawContent });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new MessagingValidationError(
      firstIssue?.message ?? "Escreva uma mensagem válida antes de enviar.",
    );
  }

  const [conversationResult, membersResult] = await Promise.all([
    client
      .from("chat_conversations")
      .select("id, kind")
      .eq("id", validConversationId)
      .maybeSingle(),
    client
      .from("chat_conversation_members")
      .select("user_id")
      .eq("conversation_id", validConversationId)
      .is("left_at", null),
  ]);

  if (conversationResult.error) {
    throw toMessagingServiceError(conversationResult.error, {
      status: conversationResult.status,
      table: "chat_conversations",
      operation: "sendConversationMessage.conversation",
    });
  }

  if (membersResult.error) {
    throw toMessagingServiceError(membersResult.error, {
      status: membersResult.status,
      table: "chat_conversation_members",
      operation: "sendConversationMessage.members",
    });
  }

  const conversation = conversationResult.data;
  const activeMembers = membersResult.data ?? [];

  if (!conversation) {
    throw new MessagingValidationError("Conversa não encontrada.");
  }

  if (!activeMembers.some((item) => item.user_id === validUserId)) {
    throw new MessagingValidationError(
      "Você não participa mais desta conversa.",
    );
  }

  if (conversation.kind === "direct") {
    const otherMember = activeMembers.find(
      (item) => item.user_id !== validUserId,
    );
    if (!otherMember) {
      throw new MessagingValidationError(
        "Destinatário da conversa não encontrado.",
      );
    }

    const acceptedFriends = await fetchAcceptedFriendIds(validUserId, client);
    if (!acceptedFriends.has(otherMember.user_id)) {
      throw new MessagingValidationError(
        "Apenas amigos aceitos podem enviar mensagens entre si no Codit.",
      );
    }
  }

  const { data, error, status } = await client
    .from("chat_messages")
    .insert({
      conversation_id: validConversationId,
      sender_id: validUserId,
      message_type: "text",
      content: parsed.data.content,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw toMessagingServiceError(
      error ?? new Error("Falha ao enviar mensagem."),
      {
        status,
        table: "chat_messages",
        operation: "sendConversationMessage.insert",
      },
    );
  }

  let senderProfile: PublicProfileRow | null = null;
  try {
    const { data: senderData } = await client
      .from("public_profiles")
      .select("*")
      .eq("id", validUserId)
      .maybeSingle();
    senderProfile = senderData ?? null;
  } catch {
    senderProfile = null;
  }

  return {
    message: data,
    sender: senderProfile,
  };
}

export async function softDeleteConversationMessage(
  userId: string,
  messageId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<boolean> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");
  const validMessageId = assertValidUuid(
    messageId,
    "Identificador da mensagem",
  );

  await assertAuthenticatedUserMatches(validUserId, client, (message) => {
    return new MessagingServiceError(message, {
      code: "AUTH_USER_MISMATCH",
      status: 403,
    });
  });

  const { data, error, status } = await client
    .from("chat_messages")
    .update({
      deleted_at: new Date().toISOString(),
    })
    .eq("id", validMessageId)
    .eq("sender_id", validUserId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw toMessagingServiceError(error, {
      status,
      table: "chat_messages",
      operation: "softDeleteConversationMessage",
    });
  }

  return data !== null;
}

export async function markConversationRead(
  userId: string,
  conversationId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<boolean> {
  const validUserId = assertValidUuid(userId, "Identificador do usuário");
  const validConversationId = assertValidUuid(
    conversationId,
    "Identificador da conversa",
  );

  await assertAuthenticatedUserMatches(validUserId, client, (message) => {
    return new MessagingServiceError(message, {
      code: "AUTH_USER_MISMATCH",
      status: 403,
    });
  });

  const { data, error } = await client.rpc("mark_conversation_read", {
    p_conversation_id: validConversationId,
  });

  if (!error) {
    return Boolean(data);
  }

  const { error: fallbackError } = await client
    .from("chat_conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", validConversationId)
    .eq("user_id", validUserId)
    .is("left_at", null);

  if (fallbackError) {
    throw toMessagingServiceError(fallbackError, {
      table: "chat_conversation_members",
      operation: "markConversationRead.fallback",
    });
  }

  return true;
}
