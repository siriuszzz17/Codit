/**
 * Supabase Edge Function: send-push
 * Despacha notificações push FCM HTTP v1 com prioridade alta (heads-up Android)
 * a partir de webhooks internos do banco (`notifications`, `chat_messages`) ou
 * de chamada autenticada para ligações de voz (`voice_call`).
 *
 * Segredos configurados exclusivamente via Supabase Secrets (`Deno.env.get`):
 *   - SUPABASE_URL (automático no Supabase)
 *   - SUPABASE_SERVICE_ROLE_KEY (automático no Supabase)
 *   - FIREBASE_PROJECT_ID
 *   - FIREBASE_CLIENT_EMAIL
 *   - FIREBASE_PRIVATE_KEY
 *   - FIREBASE_TOKEN_URI (opcional, padrão https://oauth2.googleapis.com/token)
 *   - PUSH_WEBHOOK_SECRET
 */

import {
  buildFcmDataOnlyMessage,
  CALL_RINGING_TIMEOUT_MS,
  CALL_RINGING_TIMEOUT_SECONDS,
  CallRingingRegistry,
  type PushMessageSpec,
  type PushNotificationCategory,
  UUID_REGEX,
  validateQuickReplyInput,
} from "./helpers.ts";

const DEFAULT_GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const VOICE_CALL_RATE_LIMIT_MS = 10_000;

declare const EdgeRuntime:
  | { waitUntil?: (promise: Promise<unknown>) => void }
  | undefined;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-codit-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NotificationCategory = Exclude<PushNotificationCategory, "voice_call_cancel">;

type PrefCategoryKey =
  | "messages"
  | "voice_calls"
  | "project_likes"
  | "project_comments"
  | "friend_requests"
  | "friend_accepted"
  | "group_invites";

interface OAuthTokenCache {
  token: string;
  expiresAtMs: number;
  cacheKey: string;
}

let cachedOAuthToken: OAuthTokenCache | null = null;
let cachedCryptoKey: { pemHash: string; key: CryptoKey } | null = null;
const voiceCallRateLimits = new Map<string, number>();
const callRingingRegistry = new CallRingingRegistry(CALL_RINGING_TIMEOUT_MS);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) {
    throw new Error(`Missing required environment secret: ${name}`);
  }
  return value;
}

async function sha256Bytes(input: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return new Uint8Array(digest);
}

async function timingSafeEqualStrings(a: string, b: string): Promise<boolean> {
  if (!a || !b) {
    return false;
  }
  const [hashA, hashB] = await Promise.all([sha256Bytes(a), sha256Bytes(b)]);
  let diff = a.length ^ b.length;
  for (let i = 0; i < hashA.length; i += 1) {
    diff |= (hashA[i] ?? 0) ^ (hashB[i] ?? 0);
  }
  return diff === 0;
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8Bytes(rawPem: string): Uint8Array {
  const normalizedPem = rawPem.replace(/\\n/g, "\n").trim();
  const base64Body = normalizedPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  if (!base64Body) {
    throw new Error("Invalid FIREBASE_PRIVATE_KEY PEM format.");
  }

  const binary = atob(base64Body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getFirebaseSigningKey(rawPem: string): Promise<CryptoKey> {
  const digestBytes = await sha256Bytes(rawPem);
  const pemHash = base64UrlEncode(digestBytes);
  if (cachedCryptoKey && cachedCryptoKey.pemHash === pemHash) {
    return cachedCryptoKey.key;
  }

  const pkcs8 = pemToPkcs8Bytes(rawPem);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  cachedCryptoKey = { pemHash, key };
  return key;
}

async function getGoogleAccessToken(): Promise<{
  projectId: string;
  accessToken: string;
}> {
  const projectId = getRequiredEnv("FIREBASE_PROJECT_ID");
  const clientEmail = getRequiredEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = getRequiredEnv("FIREBASE_PRIVATE_KEY");
  const tokenUri =
    Deno.env.get("FIREBASE_TOKEN_URI")?.trim() || DEFAULT_GOOGLE_TOKEN_URI;

  const cacheKey = `${projectId}:${clientEmail}:${tokenUri}`;
  if (
    cachedOAuthToken &&
    cachedOAuthToken.cacheKey === cacheKey &&
    Date.now() < cachedOAuthToken.expiresAtMs - 60_000
  ) {
    return { projectId, accessToken: cachedOAuthToken.token };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const headerB64 = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payloadB64 = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      sub: clientEmail,
      aud: tokenUri,
      scope: FCM_SCOPE,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );

  const signingInput = `${headerB64}.${payloadB64}`;
  const signingKey = await getFirebaseSigningKey(privateKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenRes = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => "");
    throw new Error(
      `Google OAuth2 token exchange failed (${tokenRes.status}): ${errText.slice(0, 240)}`,
    );
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!tokenJson.access_token) {
    throw new Error("Google OAuth2 response missing access_token.");
  }

  const expiresInMs = Math.max((tokenJson.expires_in ?? 3600) * 1000, 120_000);
  cachedOAuthToken = {
    token: tokenJson.access_token,
    expiresAtMs: Date.now() + expiresInMs,
    cacheKey,
  };

  return { projectId, accessToken: tokenJson.access_token };
}

function supabaseHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

async function fetchSupabaseRest<T>(
  supabaseUrl: string,
  serviceKey: string,
  pathAndQuery: string,
): Promise<T> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${pathAndQuery}`;
  const res = await fetch(url, {
    method: "GET",
    headers: supabaseHeaders(serviceKey),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase REST GET ${pathAndQuery} failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function callSupabaseRpc<T>(
  supabaseUrl: string,
  serviceKey: string,
  fnName: string,
  params: Record<string, unknown>,
): Promise<T> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${fnName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(serviceKey),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase RPC ${fnName} failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function deleteDeadPushTokens(
  supabaseUrl: string,
  serviceKey: string,
  tokens: string[],
): Promise<void> {
  if (tokens.length === 0) {
    return;
  }
  const encodedList = tokens.map((t) => `"${t.replace(/["\\]/g, "\\$&")}"`).join(",");
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/push_devices`);
  url.searchParams.set("token", `in.(${encodedList})`);
  await fetch(url.toString(), {
    method: "DELETE",
    headers: supabaseHeaders(serviceKey),
  }).catch(() => undefined);
}

async function broadcastRealtimeEvents(
  supabaseUrl: string,
  serviceKey: string,
  messages: Array<{ topic: string; event: string; payload: Record<string, unknown> }>,
): Promise<void> {
  if (messages.length === 0) {
    return;
  }
  const url = `${supabaseUrl.replace(/\/$/, "")}/realtime/v1/api/broadcast`;
  await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(serviceKey),
    body: JSON.stringify({ messages }),
  }).catch(() => undefined);
}

async function persistCallSessionRinging(
  supabaseUrl: string,
  serviceKey: string,
  input: {
    callId: string;
    conversationId: string;
    callerId: string;
    hasVideo: boolean;
  },
): Promise<void> {
  const now = Date.now();
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/call_sessions`;
  await fetch(url, {
    method: "POST",
    headers: {
      ...supabaseHeaders(serviceKey),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      id: input.callId,
      conversation_id: input.conversationId,
      caller_id: input.callerId,
      status: "ringing",
      has_video: input.hasVideo,
      ringing_timeout_seconds: CALL_RINGING_TIMEOUT_SECONDS,
      started_at: new Date(now).toISOString(),
      expires_at: new Date(now + CALL_RINGING_TIMEOUT_MS).toISOString(),
    }),
  }).catch(() => undefined);
}

async function isCallSessionStillRingingInDb(
  supabaseUrl: string,
  serviceKey: string,
  callId: string,
): Promise<boolean> {
  try {
    const rows = await fetchSupabaseRest<Array<{ status?: string }>>(
      supabaseUrl,
      serviceKey,
      `call_sessions?id=eq.${encodeURIComponent(callId)}&select=status&limit=1`,
    );
    if (rows.length === 0) {
      return true;
    }
    return rows[0]?.status === "ringing";
  } catch {
    return true;
  }
}

async function updateCallSessionStatusInDb(
  supabaseUrl: string,
  serviceKey: string,
  callId: string,
  patch: Record<string, unknown>,
  onlyIfRinging = false,
): Promise<void> {
  const filter = onlyIfRinging
    ? `id=eq.${encodeURIComponent(callId)}&status=eq.ringing`
    : `id=eq.${encodeURIComponent(callId)}`;
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/call_sessions?${filter}`;
  await fetch(url, {
    method: "PATCH",
    headers: {
      ...supabaseHeaders(serviceKey),
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  }).catch(() => undefined);
}

async function authenticateBearerUser(
  req: Request,
  supabaseUrl: string,
  serviceKey: string,
): Promise<{ userId: string } | { error: Response }> {
  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const jwt = match?.[1]?.trim() ?? "";
  if (!jwt) {
    return { error: jsonResponse({ error: "Autenticação obrigatória." }, 401) };
  }

  const userRes = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!userRes.ok) {
    return {
      error: jsonResponse({ error: "Sessão inválida." }, 401),
    };
  }
  const userJson = (await userRes.json()) as { id?: string };
  const userId = typeof userJson.id === "string" ? userJson.id : "";
  if (!UUID_REGEX.test(userId)) {
    return {
      error: jsonResponse({ error: "Usuário não identificado." }, 401),
    };
  }
  return { userId };
}

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

function mapCategoryToPrefKey(category: NotificationCategory): PrefCategoryKey {
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

function shouldSendPushForPrefs(
  rawPrefs: unknown,
  prefKey: PrefCategoryKey,
  conversationId: string | null,
): boolean {
  if (!rawPrefs || typeof rawPrefs !== "object") {
    return true;
  }

  const record = rawPrefs as Record<string, unknown>;
  const muteAll = record.mute_all ?? record.muteAll;
  if (muteAll === true) {
    return false;
  }

  const pushEnabled = record.browser_push_enabled ?? record.browserPushEnabled;
  if (pushEnabled === false) {
    return false;
  }

  const categories = record.categories;
  if (categories && typeof categories === "object") {
    const catValue = (categories as Record<string, unknown>)[prefKey];
    if (catValue === false) {
      return false;
    }
  }

  if (
    conversationId &&
    (prefKey === "messages" ||
      prefKey === "voice_calls" ||
      prefKey === "group_invites")
  ) {
    const mutedIds = record.muted_conversation_ids ?? record.mutedConversationIds;
    if (Array.isArray(mutedIds) && mutedIds.includes(conversationId)) {
      return false;
    }
  }

  return true;
}

function sanitizeSafeLinkHref(rawHref: unknown): string {
  if (typeof rawHref === "string" && rawHref.startsWith("/") && !rawHref.startsWith("//")) {
    return rawHref.slice(0, 200);
  }
  return "/";
}

function isUnregisteredFcmError(status: number, errorText: string): boolean {
  if (status === 404) {
    return true;
  }
  const upper = errorText.toUpperCase();
  if (upper.includes("UNREGISTERED") || upper.includes("REGISTRATION-TOKEN-NOT-REGISTERED")) {
    return true;
  }
  if (
    status === 400 &&
    upper.includes("INVALID_ARGUMENT") &&
    upper.includes("REGISTRATION TOKEN")
  ) {
    return true;
  }
  return false;
}

async function sendFcmToTokens(
  supabaseUrl: string,
  serviceKey: string,
  tokens: string[],
  spec: PushMessageSpec,
): Promise<{ sent: number; failed: number; removed: number }> {
  const uniqueTokens = Array.from(new Set(tokens.filter((t) => t.trim().length >= 20)));
  if (uniqueTokens.length === 0) {
    return { sent: 0, failed: 0, removed: 0 };
  }

  const { projectId, accessToken } = await getGoogleAccessToken();
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

  const deadTokens: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    uniqueTokens.map(async (deviceToken) => {
      const payload = buildFcmDataOnlyMessage(deviceToken, spec);

      const res = await fetch(fcmUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        sent += 1;
        return;
      }

      failed += 1;
      const errText = await res.text().catch(() => "");
      if (isUnregisteredFcmError(res.status, errText)) {
        deadTokens.push(deviceToken);
      }
    }),
  );

  if (deadTokens.length > 0) {
    await deleteDeadPushTokens(supabaseUrl, serviceKey, deadTokens);
  }

  return { sent, failed, removed: deadTokens.length };
}

function formatActorDisplayName(
  profile: { full_name?: string | null; username?: string | null } | undefined,
  fallback: string,
): string {
  const fullName = profile?.full_name?.trim();
  if (fullName) {
    return fullName;
  }
  const username = profile?.username?.trim();
  if (username) {
    return `@${username}`;
  }
  return fallback;
}

async function handleNotificationsWebhook(
  supabaseUrl: string,
  serviceKey: string,
  eventType: string,
  record: Record<string, unknown>,
): Promise<Response> {
  if (eventType !== "INSERT" && eventType !== "UPDATE") {
    return jsonResponse({ skipped: "unsupported_event_type" });
  }

  if (record.read_at !== null && record.read_at !== undefined) {
    return jsonResponse({ skipped: "already_read" });
  }

  const recipientId = typeof record.recipient_id === "string" ? record.recipient_id : "";
  const category = typeof record.category === "string" ? (record.category as NotificationCategory) : null;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const id = typeof record.id === "string" ? record.id : "";

  if (!UUID_REGEX.test(recipientId) || !category || !title || !id) {
    return jsonResponse({ skipped: "invalid_notification_record" });
  }

  const linkHref = sanitizeSafeLinkHref(record.link_href);
  const conversationId = extractConversationIdFromLink(linkHref);
  const prefKey = mapCategoryToPrefKey(category);
  const actorId =
    typeof record.actor_id === "string" && UUID_REGEX.test(record.actor_id)
      ? record.actor_id
      : null;

  const [profiles, devices, actorProfiles] = await Promise.all([
    fetchSupabaseRest<Array<{ notification_prefs?: unknown }>>(
      supabaseUrl,
      serviceKey,
      `profiles?id=eq.${encodeURIComponent(recipientId)}&select=notification_prefs&limit=1`,
    ),
    fetchSupabaseRest<Array<{ token: string }>>(
      supabaseUrl,
      serviceKey,
      `push_devices?user_id=eq.${encodeURIComponent(recipientId)}&platform=eq.android&select=token`,
    ),
    actorId
      ? fetchSupabaseRest<
          Array<{
            id: string;
            full_name: string | null;
            username: string | null;
            avatar_url: string | null;
          }>
        >(
          supabaseUrl,
          serviceKey,
          `public_profiles?id=eq.${encodeURIComponent(actorId)}&select=id,full_name,username,avatar_url&limit=1`,
        ).catch(() => [])
      : Promise.resolve([]),
  ]);

  if (devices.length === 0) {
    return jsonResponse({ skipped: "no_registered_devices" });
  }

  if (!shouldSendPushForPrefs(profiles[0]?.notification_prefs, prefKey, conversationId)) {
    return jsonResponse({ skipped: "muted_by_preferences" });
  }

  const rawBody = typeof record.body === "string" ? record.body.trim() : "";
  const entityKey =
    typeof record.entity_key === "string" && record.entity_key.trim()
      ? record.entity_key.trim()
      : `notif:${id}`;
  const actor = actorProfiles[0];

  const result = await sendFcmToTokens(
    supabaseUrl,
    serviceKey,
    devices.map((d) => d.token),
    {
      title: title.slice(0, 140),
      body: (rawBody || "Você tem uma nova atualização no Codit.").slice(0, 240),
      linkHref,
      category,
      conversationId,
      conversationTitle: title.slice(0, 140),
      isGroup: false,
      tag: entityKey,
      ttl: "86400s",
      actorId,
      actorName: actor ? formatActorDisplayName(actor, title.slice(0, 140)) : title.slice(0, 140),
      actorUsername: actor?.username ?? null,
      actorAvatarUrl: actor?.avatar_url ?? null,
    },
  );

  return jsonResponse({ ok: true, table: "notifications", ...result });
}

async function handleChatMessageWebhook(
  supabaseUrl: string,
  serviceKey: string,
  eventType: string,
  record: Record<string, unknown>,
): Promise<Response> {
  if (eventType !== "INSERT") {
    return jsonResponse({ skipped: "unsupported_event_type" });
  }

  if (record.message_type !== "text" || record.deleted_at) {
    return jsonResponse({ skipped: "non_text_or_deleted" });
  }

  const conversationId =
    typeof record.conversation_id === "string" ? record.conversation_id : "";
  const senderId = typeof record.sender_id === "string" ? record.sender_id : "";
  const content = typeof record.content === "string" ? record.content.trim() : "";

  if (!UUID_REGEX.test(conversationId) || !UUID_REGEX.test(senderId) || !content) {
    return jsonResponse({ skipped: "invalid_chat_message_record" });
  }

  const [conversations, senderProfiles, members] = await Promise.all([
    fetchSupabaseRest<Array<{ id: string; kind: string; title: string | null }>>(
      supabaseUrl,
      serviceKey,
      `chat_conversations?id=eq.${encodeURIComponent(conversationId)}&select=id,kind,title&limit=1`,
    ),
    fetchSupabaseRest<
      Array<{
        full_name: string | null;
        username: string | null;
        avatar_url: string | null;
      }>
    >(
      supabaseUrl,
      serviceKey,
      `public_profiles?id=eq.${encodeURIComponent(senderId)}&select=full_name,username,avatar_url&limit=1`,
    ),
    fetchSupabaseRest<Array<{ user_id: string }>>(
      supabaseUrl,
      serviceKey,
      `chat_conversation_members?conversation_id=eq.${encodeURIComponent(conversationId)}&left_at=is.null&user_id=neq.${encodeURIComponent(senderId)}&select=user_id`,
    ),
  ]);

  const conversation = conversations[0];
  if (!conversation || members.length === 0) {
    return jsonResponse({ skipped: "no_recipients" });
  }

  const recipientIds = members.map((m) => m.user_id).filter((id) => UUID_REGEX.test(id));
  if (recipientIds.length === 0) {
    return jsonResponse({ skipped: "no_valid_recipients" });
  }

  const idFilter = `in.(${recipientIds.join(",")})`;
  const [recipientProfiles, devices] = await Promise.all([
    fetchSupabaseRest<Array<{ id: string; notification_prefs?: unknown }>>(
      supabaseUrl,
      serviceKey,
      `profiles?id=${encodeURIComponent(idFilter)}&select=id,notification_prefs`,
    ),
    fetchSupabaseRest<Array<{ user_id: string; token: string }>>(
      supabaseUrl,
      serviceKey,
      `push_devices?user_id=${encodeURIComponent(idFilter)}&platform=eq.android&select=user_id,token`,
    ),
  ]);

  if (devices.length === 0) {
    return jsonResponse({ skipped: "no_registered_devices" });
  }

  const prefsByUser = new Map<string, unknown>();
  for (const profile of recipientProfiles) {
    prefsByUser.set(profile.id, profile.notification_prefs);
  }

  const eligibleTokens = devices
    .filter((device) =>
      shouldSendPushForPrefs(
        prefsByUser.get(device.user_id),
        "messages",
        conversationId,
      ),
    )
    .map((device) => device.token);

  if (eligibleTokens.length === 0) {
    return jsonResponse({ skipped: "all_recipients_muted" });
  }

  const senderProfile = senderProfiles[0];
  const senderName = formatActorDisplayName(senderProfile, "Nova mensagem");
  const isGroup = conversation.kind === "group";
  const groupTitle = conversation.title?.trim() || "Grupo Codit";
  const title = isGroup ? `${senderName} em ${groupTitle}` : senderName;

  const result = await sendFcmToTokens(supabaseUrl, serviceKey, eligibleTokens, {
    title: title.slice(0, 140),
    body: content.slice(0, 180),
    linkHref: `/mensagens?c=${encodeURIComponent(conversationId)}`,
    category: "message",
    conversationId,
    conversationTitle: (isGroup ? groupTitle : senderName).slice(0, 140),
    isGroup,
    tag: `conv:${conversationId}`,
    ttl: "86400s",
    actorId: senderId,
    actorName: senderName.slice(0, 120),
    actorUsername: senderProfile?.username ?? null,
    actorAvatarUrl: senderProfile?.avatar_url ?? null,
    supportsReply: true,
  });

  return jsonResponse({ ok: true, table: "chat_messages", ...result });
}

function isVoiceCallRateLimited(callerId: string, conversationId: string): boolean {
  const now = Date.now();
  const key = `${callerId}:${conversationId}`;
  const prev = voiceCallRateLimits.get(key);
  if (prev !== undefined && now - prev < VOICE_CALL_RATE_LIMIT_MS) {
    return true;
  }
  voiceCallRateLimits.set(key, now);
  if (voiceCallRateLimits.size > 500) {
    for (const [entryKey, ts] of voiceCallRateLimits.entries()) {
      if (now - ts > VOICE_CALL_RATE_LIMIT_MS * 3) {
        voiceCallRateLimits.delete(entryKey);
      }
    }
  }
  return false;
}

async function handleVoiceCallPush(
  req: Request,
  supabaseUrl: string,
  serviceKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const auth = await authenticateBearerUser(req, supabaseUrl, serviceKey);
  if ("error" in auth) {
    return auth.error;
  }
  const callerId = auth.userId;

  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  if (!UUID_REGEX.test(conversationId)) {
    return jsonResponse({ error: "Identificador de conversa inválido." }, 400);
  }

  const rawCallId = typeof body.callId === "string" ? body.callId.trim() : "";
  const callId = UUID_REGEX.test(rawCallId) ? rawCallId : crypto.randomUUID();
  const hasVideo = body.hasVideo === true;

  if (isVoiceCallRateLimited(callerId, conversationId)) {
    return jsonResponse({ skipped: "rate_limited", callId });
  }

  const [conversations, activeMembers, callerProfiles] = await Promise.all([
    fetchSupabaseRest<Array<{ id: string; kind: string; title: string | null }>>(
      supabaseUrl,
      serviceKey,
      `chat_conversations?id=eq.${encodeURIComponent(conversationId)}&select=id,kind,title&limit=1`,
    ),
    fetchSupabaseRest<Array<{ user_id: string }>>(
      supabaseUrl,
      serviceKey,
      `chat_conversation_members?conversation_id=eq.${encodeURIComponent(conversationId)}&left_at=is.null&select=user_id`,
    ),
    fetchSupabaseRest<
      Array<{
        full_name: string | null;
        username: string | null;
        avatar_url: string | null;
      }>
    >(
      supabaseUrl,
      serviceKey,
      `public_profiles?id=eq.${encodeURIComponent(callerId)}&select=full_name,username,avatar_url&limit=1`,
    ),
  ]);

  const conversation = conversations[0];
  if (!conversation) {
    return jsonResponse({ error: "Conversa não encontrada." }, 404);
  }

  const isCallerActiveMember = activeMembers.some((m) => m.user_id === callerId);
  if (!isCallerActiveMember) {
    return jsonResponse({ error: "Você não participa desta conversa." }, 403);
  }

  const recipientIds = activeMembers
    .map((m) => m.user_id)
    .filter((id) => id !== callerId && UUID_REGEX.test(id));

  if (recipientIds.length === 0) {
    return jsonResponse({ skipped: "no_recipients", callId });
  }

  if (conversation.kind === "direct") {
    const peerId = recipientIds[0];
    if (!peerId) {
      return jsonResponse({ skipped: "no_peer", callId });
    }
    const areFriends = await callSupabaseRpc<boolean>(
      supabaseUrl,
      serviceKey,
      "are_users_friends",
      { p_user_a: callerId, p_user_b: peerId },
    );
    if (!areFriends) {
      return jsonResponse({ error: "Apenas amigos aceitos podem chamar em DMs." }, 403);
    }
  }

  const idFilter = `in.(${recipientIds.join(",")})`;
  const [recipientProfiles, devices] = await Promise.all([
    fetchSupabaseRest<Array<{ id: string; notification_prefs?: unknown }>>(
      supabaseUrl,
      serviceKey,
      `profiles?id=${encodeURIComponent(idFilter)}&select=id,notification_prefs`,
    ),
    fetchSupabaseRest<Array<{ user_id: string; token: string }>>(
      supabaseUrl,
      serviceKey,
      `push_devices?user_id=${encodeURIComponent(idFilter)}&platform=eq.android&select=user_id,token`,
    ),
  ]);

  const prefsByUser = new Map<string, unknown>();
  for (const profile of recipientProfiles) {
    prefsByUser.set(profile.id, profile.notification_prefs);
  }

  const eligibleTokens = devices
    .filter((device) =>
      shouldSendPushForPrefs(
        prefsByUser.get(device.user_id),
        "voice_calls",
        conversationId,
      ),
    )
    .map((device) => device.token);

  const callerProfile = callerProfiles[0];
  const callerName = formatActorDisplayName(callerProfile, "Amigo do Codit");
  const isGroup = conversation.kind === "group";
  const groupTitle = conversation.title?.trim() || "Grupo Codit";
  const title = isGroup
    ? `Ligação no grupo ${groupTitle}`
    : hasVideo
      ? `${callerName} está chamando com vídeo`
      : `${callerName} está chamando por voz`;

  await persistCallSessionRinging(supabaseUrl, serviceKey, {
    callId,
    conversationId,
    callerId,
    hasVideo,
  });

  const { waitPromise } = callRingingRegistry.registerRinging(
    {
      callId,
      conversationId,
      callerId,
      recipientIds,
      hasVideo,
      timeoutMs: CALL_RINGING_TIMEOUT_MS,
    },
    async (expiredSession) => {
      const stillRinging = await isCallSessionStillRingingInDb(
        supabaseUrl,
        serviceKey,
        expiredSession.callId,
      );
      if (!stillRinging) {
        return;
      }

      const timedOutAt = new Date().toISOString();
      await updateCallSessionStatusInDb(
        supabaseUrl,
        serviceKey,
        expiredSession.callId,
        {
          status: "missed",
          ended_at: timedOutAt,
          end_reason: "timeout",
        },
        true,
      );

      const timeoutPayload = {
        callId: expiredSession.callId,
        conversationId: expiredSession.conversationId,
        callerId: expiredSession.callerId,
        reason: "missed",
        timedOutAt,
      };

      const broadcastTargets = [
        {
          topic: `codit:user-inbox:${expiredSession.callerId}`,
          event: "call:timeout",
          payload: timeoutPayload,
        },
        ...expiredSession.recipientIds.map((rid) => ({
          topic: `codit:user-inbox:${rid}`,
          event: "call:timeout",
          payload: timeoutPayload,
        })),
        {
          topic: `codit:call:${expiredSession.conversationId}`,
          event: "webrtc:signal",
          payload: {
            conversationId: expiredSession.conversationId,
            fromUserId: expiredSession.callerId,
            toUserId: expiredSession.callerId,
            fromSessionId: "server-timeout",
            kind: "call-timeout",
            callId: expiredSession.callId,
            reason: "missed",
            timedOutAt,
          },
        },
      ];

      await Promise.allSettled([
        broadcastRealtimeEvents(supabaseUrl, serviceKey, broadcastTargets),
        eligibleTokens.length > 0
          ? sendFcmToTokens(supabaseUrl, serviceKey, eligibleTokens, {
              title: "Chamada perdida",
              body: `${callerName} ligou para você.`,
              linkHref: `/mensagens?c=${encodeURIComponent(expiredSession.conversationId)}`,
              category: "voice_call_cancel",
              conversationId: expiredSession.conversationId,
              conversationTitle: isGroup ? groupTitle : callerName,
              isGroup,
              tag: `call:${expiredSession.conversationId}`,
              ttl: "30s",
              actorId: callerId,
              actorName: callerName.slice(0, 120),
              actorUsername: callerProfile?.username ?? null,
              actorAvatarUrl: callerProfile?.avatar_url ?? null,
              callId: expiredSession.callId,
            })
          : Promise.resolve(),
      ]);
    },
  );

  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime?.waitUntil === "function") {
    EdgeRuntime.waitUntil(waitPromise);
  }

  if (eligibleTokens.length === 0) {
    return jsonResponse({
      ok: true,
      skipped: devices.length === 0 ? "no_registered_devices" : "all_recipients_muted",
      callId,
      timeoutSeconds: CALL_RINGING_TIMEOUT_SECONDS,
    });
  }

  const result = await sendFcmToTokens(supabaseUrl, serviceKey, eligibleTokens, {
    title: title.slice(0, 140),
    body: "Toque para entrar na chamada no Codit.",
    linkHref: `/mensagens?c=${encodeURIComponent(conversationId)}`,
    category: "voice_call",
    conversationId,
    conversationTitle: (isGroup ? groupTitle : callerName).slice(0, 140),
    isGroup,
    tag: `call:${conversationId}`,
    ttl: `${CALL_RINGING_TIMEOUT_SECONDS}s`,
    actorId: callerId,
    actorName: callerName.slice(0, 120),
    actorUsername: callerProfile?.username ?? null,
    actorAvatarUrl: callerProfile?.avatar_url ?? null,
    callId,
    hasVideo,
    timeoutSeconds: CALL_RINGING_TIMEOUT_SECONDS,
    supportsReply: false,
  });

  return jsonResponse({
    ok: true,
    kind: "voice_call",
    callId,
    timeoutSeconds: CALL_RINGING_TIMEOUT_SECONDS,
    ...result,
  });
}

async function handleVoiceCallStateChange(
  req: Request,
  supabaseUrl: string,
  serviceKey: string,
  body: Record<string, unknown>,
  action: "answer" | "cancel",
): Promise<Response> {
  const auth = await authenticateBearerUser(req, supabaseUrl, serviceKey);
  if ("error" in auth) {
    return auth.error;
  }
  const actorId = auth.userId;

  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  if (!UUID_REGEX.test(conversationId)) {
    return jsonResponse({ error: "Identificador de conversa inválido." }, 400);
  }

  const rawCallId = typeof body.callId === "string" ? body.callId.trim() : "";
  const callId = UUID_REGEX.test(rawCallId) ? rawCallId : null;

  const activeMembers = await fetchSupabaseRest<Array<{ user_id: string }>>(
    supabaseUrl,
    serviceKey,
    `chat_conversation_members?conversation_id=eq.${encodeURIComponent(conversationId)}&left_at=is.null&select=user_id`,
  );

  if (!activeMembers.some((m) => m.user_id === actorId)) {
    return jsonResponse({ error: "Você não participa desta conversa." }, 403);
  }

  const session =
    action === "answer"
      ? callRingingRegistry.markAnswered(conversationId, callId)
      : callRingingRegistry.markCancelled(conversationId, callId);

  const effectiveCallId = callId ?? session?.callId ?? null;
  const nowIso = new Date().toISOString();

  if (effectiveCallId) {
    await updateCallSessionStatusInDb(
      supabaseUrl,
      serviceKey,
      effectiveCallId,
      action === "answer"
        ? { status: "active", answered_by: actorId, answered_at: nowIso }
        : { status: "cancelled", ended_at: nowIso, end_reason: "cancelled" },
      true,
    );
  }

  const otherMemberIds = activeMembers
    .map((m) => m.user_id)
    .filter((id) => id !== actorId && UUID_REGEX.test(id));

  if (otherMemberIds.length > 0) {
    const idFilter = `in.(${otherMemberIds.join(",")})`;
    const devices = await fetchSupabaseRest<Array<{ token: string }>>(
      supabaseUrl,
      serviceKey,
      `push_devices?user_id=${encodeURIComponent(idFilter)}&platform=eq.android&select=token`,
    ).catch(() => []);

    const eventName = action === "answer" ? "call:answered" : "call:cancelled";
    const broadcastPayload = {
      callId: effectiveCallId ?? undefined,
      conversationId,
      callerId: session?.callerId ?? actorId,
      reason: action === "answer" ? "timeout" : "cancelled",
      timedOutAt: nowIso,
    };

    await Promise.allSettled([
      broadcastRealtimeEvents(
        supabaseUrl,
        serviceKey,
        otherMemberIds.map((rid) => ({
          topic: `codit:user-inbox:${rid}`,
          event: eventName,
          payload: broadcastPayload,
        })),
      ),
      devices.length > 0
        ? sendFcmToTokens(
            supabaseUrl,
            serviceKey,
            devices.map((d) => d.token),
            {
              title: "Chamada encerrada",
              body: "",
              linkHref: `/mensagens?c=${encodeURIComponent(conversationId)}`,
              category: "voice_call_cancel",
              conversationId,
              tag: `call:${conversationId}`,
              ttl: "30s",
              callId: effectiveCallId,
            },
          )
        : Promise.resolve(),
    ]);
  }

  return jsonResponse({
    ok: true,
    kind: action === "answer" ? "voice_call_answer" : "voice_call_cancel",
    callId: effectiveCallId,
  });
}

async function handleQuickReply(
  req: Request,
  supabaseUrl: string,
  serviceKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const auth = await authenticateBearerUser(req, supabaseUrl, serviceKey);
  if ("error" in auth) {
    return auth.error;
  }
  const senderId = auth.userId;

  const validated = validateQuickReplyInput(body);
  if (!validated.ok) {
    return jsonResponse({ error: validated.error }, 400);
  }
  const { conversationId, content } = validated;

  const [conversations, activeMembers, senderProfiles] = await Promise.all([
    fetchSupabaseRest<Array<{ id: string; kind: string; title: string | null }>>(
      supabaseUrl,
      serviceKey,
      `chat_conversations?id=eq.${encodeURIComponent(conversationId)}&select=id,kind,title&limit=1`,
    ),
    fetchSupabaseRest<Array<{ user_id: string }>>(
      supabaseUrl,
      serviceKey,
      `chat_conversation_members?conversation_id=eq.${encodeURIComponent(conversationId)}&left_at=is.null&select=user_id`,
    ),
    fetchSupabaseRest<
      Array<{
        full_name: string | null;
        username: string | null;
        avatar_url: string | null;
      }>
    >(
      supabaseUrl,
      serviceKey,
      `public_profiles?id=eq.${encodeURIComponent(senderId)}&select=full_name,username,avatar_url&limit=1`,
    ),
  ]);

  const conversation = conversations[0];
  if (!conversation) {
    return jsonResponse({ error: "Conversa não encontrada." }, 404);
  }

  if (!activeMembers.some((m) => m.user_id === senderId)) {
    return jsonResponse({ error: "Você não participa desta conversa." }, 403);
  }

  const recipientIds = activeMembers
    .map((m) => m.user_id)
    .filter((id) => id !== senderId && UUID_REGEX.test(id));

  if (conversation.kind === "direct") {
    const peerId = recipientIds[0];
    if (!peerId) {
      return jsonResponse({ error: "Destinatário indisponível." }, 400);
    }
    const areFriends = await callSupabaseRpc<boolean>(
      supabaseUrl,
      serviceKey,
      "are_users_friends",
      { p_user_a: senderId, p_user_b: peerId },
    );
    if (!areFriends) {
      return jsonResponse(
        { error: "Apenas amigos aceitos podem enviar mensagens diretas." },
        403,
      );
    }
  }

  const insertRes = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/chat_messages`,
    {
      method: "POST",
      headers: {
        ...supabaseHeaders(serviceKey),
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        sender_id: senderId,
        message_type: "text",
        content,
      }),
    },
  );

  if (!insertRes.ok) {
    const detail = await insertRes.text().catch(() => "");
    return jsonResponse(
      { error: `Não foi possível enviar a resposta (${insertRes.status}): ${detail.slice(0, 160)}` },
      500,
    );
  }

  const insertedRows = (await insertRes.json()) as Array<{
    id?: string;
    created_at?: string;
  }>;
  const created = insertedRows[0];

  const nowIso = created?.created_at ?? new Date().toISOString();
  const senderProfile = senderProfiles[0];
  const senderName = formatActorDisplayName(senderProfile, "Estudante Codit");

  await Promise.allSettled([
    fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/chat_conversation_members?conversation_id=eq.${encodeURIComponent(conversationId)}&user_id=eq.${encodeURIComponent(senderId)}&left_at=is.null`,
      {
        method: "PATCH",
        headers: {
          ...supabaseHeaders(serviceKey),
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ last_read_at: nowIso }),
      },
    ),
    recipientIds.length > 0
      ? broadcastRealtimeEvents(
          supabaseUrl,
          serviceKey,
          recipientIds.map((rid) => ({
            topic: `codit:user-inbox:${rid}`,
            event: "message:notify",
            payload: {
              conversationId,
              conversationTitle:
                conversation.kind === "group"
                  ? conversation.title?.trim() || "Grupo Codit"
                  : senderName,
              isGroup: conversation.kind === "group",
              senderId,
              senderName,
              senderUsername: senderProfile?.username ?? "codit",
              senderAvatarUrl: senderProfile?.avatar_url ?? null,
              preview: content.slice(0, 180),
              sentAt: nowIso,
            },
          })),
        )
      : Promise.resolve(),
  ]);

  return jsonResponse({
    ok: true,
    kind: "reply",
    conversationId,
    messageId: created?.id ?? null,
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return jsonResponse({ error: "Payload JSON inválido." }, 400);
    }

    const webhookSecretHeader = req.headers.get("x-codit-webhook-secret")?.trim() ?? "";
    if (webhookSecretHeader) {
      const configuredSecret = Deno.env.get("PUSH_WEBHOOK_SECRET")?.trim() ?? "";
      if (
        configuredSecret.length < 16 ||
        !(await timingSafeEqualStrings(webhookSecretHeader, configuredSecret))
      ) {
        return jsonResponse({ error: "Assinatura de webhook inválida." }, 401);
      }

      const table = typeof body.table === "string" ? body.table : "";
      const eventType = typeof body.type === "string" ? body.type : "";
      const record =
        body.record && typeof body.record === "object"
          ? (body.record as Record<string, unknown>)
          : null;

      if (!record) {
        return jsonResponse({ skipped: "missing_record" });
      }

      if (table === "notifications") {
        return await handleNotificationsWebhook(
          supabaseUrl,
          serviceKey,
          eventType,
          record,
        );
      }

      if (table === "chat_messages") {
        return await handleChatMessageWebhook(
          supabaseUrl,
          serviceKey,
          eventType,
          record,
        );
      }

      return jsonResponse({ skipped: "unhandled_table" });
    }

    if (body.kind === "voice_call") {
      return await handleVoiceCallPush(req, supabaseUrl, serviceKey, body);
    }

    if (body.kind === "voice_call_answer") {
      return await handleVoiceCallStateChange(
        req,
        supabaseUrl,
        serviceKey,
        body,
        "answer",
      );
    }

    if (body.kind === "voice_call_cancel") {
      return await handleVoiceCallStateChange(
        req,
        supabaseUrl,
        serviceKey,
        body,
        "cancel",
      );
    }

    if (body.kind === "reply" || body.kind === "notification_reply") {
      return await handleQuickReply(req, supabaseUrl, serviceKey, body);
    }

    return jsonResponse({ error: "Requisição não autorizada." }, 401);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno no send-push.";
    return jsonResponse({ error: message }, 500);
  }
});
