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

const ANDROID_HIGH_PRIORITY_CHANNEL_ID = "codit_alerts_high_v1";
const DEFAULT_GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const VOICE_CALL_RATE_LIMIT_MS = 10_000;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-codit-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NotificationCategory =
  | "message"
  | "voice_call"
  | "project_like"
  | "project_comment"
  | "friend_request"
  | "friend_accepted"
  | "group_invite";

type PrefCategoryKey =
  | "messages"
  | "voice_calls"
  | "project_likes"
  | "project_comments"
  | "friend_requests"
  | "friend_accepted"
  | "group_invites";

interface PushMessageSpec {
  title: string;
  body: string;
  linkHref: string;
  category: NotificationCategory;
  conversationId: string | null;
  tag: string;
  ttl: string;
}

interface OAuthTokenCache {
  token: string;
  expiresAtMs: number;
  cacheKey: string;
}

let cachedOAuthToken: OAuthTokenCache | null = null;
let cachedCryptoKey: { pemHash: string; key: CryptoKey } | null = null;
const voiceCallRateLimits = new Map<string, number>();

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
      const payload = {
        message: {
          token: deviceToken,
          notification: {
            title: spec.title,
            body: spec.body,
          },
          data: {
            linkHref: spec.linkHref,
            category: spec.category,
            conversationId: spec.conversationId ?? "",
            tag: spec.tag,
          },
          android: {
            priority: "HIGH",
            ttl: spec.ttl,
            collapse_key: spec.tag.slice(0, 64),
            notification: {
              channel_id: ANDROID_HIGH_PRIORITY_CHANNEL_ID,
              icon: "ic_stat_codit",
              color: "#8B6BFF",
              sound: "default",
              default_vibrate_timings: true,
              default_light_settings: true,
              notification_priority: "PRIORITY_HIGH",
              visibility: "PUBLIC",
              tag: spec.tag.slice(0, 64),
            },
          },
        },
      };

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

  const [profiles, devices] = await Promise.all([
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
      tag: entityKey,
      ttl: "86400s",
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
    fetchSupabaseRest<Array<{ full_name: string | null; username: string | null }>>(
      supabaseUrl,
      serviceKey,
      `public_profiles?id=eq.${encodeURIComponent(senderId)}&select=full_name,username&limit=1`,
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

  const senderName = formatActorDisplayName(senderProfiles[0], "Nova mensagem");
  const isGroup = conversation.kind === "group";
  const groupTitle = conversation.title?.trim() || "Grupo Codit";
  const title = isGroup ? `${senderName} em ${groupTitle}` : senderName;

  const result = await sendFcmToTokens(supabaseUrl, serviceKey, eligibleTokens, {
    title: title.slice(0, 140),
    body: content.slice(0, 180),
    linkHref: `/mensagens?c=${encodeURIComponent(conversationId)}`,
    category: "message",
    conversationId,
    tag: `conv:${conversationId}`,
    ttl: "86400s",
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
  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const jwt = match?.[1]?.trim() ?? "";
  if (!jwt) {
    return jsonResponse({ error: "Autenticação obrigatória." }, 401);
  }

  const userRes = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!userRes.ok) {
    return jsonResponse({ error: "Sessão inválida para disparar alerta de chamada." }, 401);
  }
  const userJson = (await userRes.json()) as { id?: string };
  const callerId = typeof userJson.id === "string" ? userJson.id : "";
  if (!UUID_REGEX.test(callerId)) {
    return jsonResponse({ error: "Usuário não identificado." }, 401);
  }

  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  if (!UUID_REGEX.test(conversationId)) {
    return jsonResponse({ error: "Identificador de conversa inválido." }, 400);
  }

  if (isVoiceCallRateLimited(callerId, conversationId)) {
    return jsonResponse({ skipped: "rate_limited" });
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
    fetchSupabaseRest<Array<{ full_name: string | null; username: string | null }>>(
      supabaseUrl,
      serviceKey,
      `public_profiles?id=eq.${encodeURIComponent(callerId)}&select=full_name,username&limit=1`,
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
    return jsonResponse({ skipped: "no_recipients" });
  }

  if (conversation.kind === "direct") {
    const peerId = recipientIds[0];
    if (!peerId) {
      return jsonResponse({ skipped: "no_peer" });
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
        "voice_calls",
        conversationId,
      ),
    )
    .map((device) => device.token);

  if (eligibleTokens.length === 0) {
    return jsonResponse({ skipped: "all_recipients_muted" });
  }

  const callerName = formatActorDisplayName(callerProfiles[0], "Amigo do Codit");
  const isGroup = conversation.kind === "group";
  const groupTitle = conversation.title?.trim() || "Grupo Codit";
  const title = isGroup
    ? `Ligação no grupo ${groupTitle}`
    : `${callerName} está chamando por voz`;

  const result = await sendFcmToTokens(supabaseUrl, serviceKey, eligibleTokens, {
    title: title.slice(0, 140),
    body: "Toque para entrar na chamada no Codit.",
    linkHref: `/mensagens?c=${encodeURIComponent(conversationId)}`,
    category: "voice_call",
    conversationId,
    tag: `call:${conversationId}`,
    ttl: "30s",
  });

  return jsonResponse({ ok: true, kind: "voice_call", ...result });
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

    return jsonResponse({ error: "Requisição não autorizada." }, 401);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno no send-push.";
    return jsonResponse({ error: message }, 500);
  }
});
