package com.codit.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Armazenamento privado (`MODE_PRIVATE`) da sessão autenticada do Supabase para
 * permitir envio direto de respostas rápidas (`RemoteInput`) em segundo plano,
 * mesmo quando a WebView está suspensa ou encerrada pelo Android.
 */
public final class NativeSessionStore {
    private static final String PREFS_NAME = "codit_native_auth";
    private static final String KEY_SUPABASE_URL = "supabase_url";
    private static final String KEY_ANON_KEY = "anon_key";
    private static final String KEY_USER_ID = "user_id";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_REFRESH_TOKEN = "refresh_token";
    private static final String KEY_EXPIRES_AT_SEC = "expires_at_sec";

    private static final int HTTP_CONNECT_TIMEOUT_MS = 6_000;
    private static final int HTTP_READ_TIMEOUT_MS = 8_000;
    private static final Pattern UUID_PATTERN = Pattern.compile(
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
    );

    private static final Object LOCK = new Object();

    public static final class SessionSnapshot {
        public final String supabaseUrl;
        public final String anonKey;
        public final String userId;
        public final String accessToken;
        public final String refreshToken;
        public final long expiresAtSec;

        SessionSnapshot(
            String supabaseUrl,
            String anonKey,
            String userId,
            String accessToken,
            String refreshToken,
            long expiresAtSec
        ) {
            this.supabaseUrl = supabaseUrl;
            this.anonKey = anonKey;
            this.userId = userId;
            this.accessToken = accessToken;
            this.refreshToken = refreshToken;
            this.expiresAtSec = expiresAtSec;
        }
    }

    private NativeSessionStore() {}

    public static boolean isValidUuid(@Nullable String candidate) {
        return candidate != null && UUID_PATTERN.matcher(candidate.trim()).matches();
    }

    private static boolean isAllowedSupabaseBaseUrl(@Nullable String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            return false;
        }
        try {
            Uri uri = Uri.parse(rawUrl.trim());
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (scheme == null || host == null) {
                return false;
            }
            if ("https".equalsIgnoreCase(scheme)) {
                return true;
            }
            return (
                "http".equalsIgnoreCase(scheme) &&
                ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host))
            );
        } catch (Throwable ignored) {
            return false;
        }
    }

    public static void saveFromJson(@NonNull Context context, @Nullable String rawJson) {
        if (rawJson == null || rawJson.trim().isEmpty()) {
            return;
        }
        try {
            JSONObject obj = new JSONObject(rawJson);
            String supabaseUrl = obj.optString("supabaseUrl", "").trim().replaceAll("/+$", "");
            String anonKey = obj.optString("anonKey", "").trim();
            String userId = obj.optString("userId", "").trim();
            String accessToken = obj.optString("accessToken", "").trim();
            String refreshToken = obj.optString("refreshToken", "").trim();
            long expiresAtSec = obj.optLong("expiresAtSec", 0L);

            if (
                !isAllowedSupabaseBaseUrl(supabaseUrl) ||
                anonKey.isEmpty() ||
                !isValidUuid(userId) ||
                accessToken.isEmpty()
            ) {
                return;
            }

            synchronized (LOCK) {
                SharedPreferences prefs =
                    context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                prefs
                    .edit()
                    .putString(KEY_SUPABASE_URL, supabaseUrl)
                    .putString(KEY_ANON_KEY, anonKey)
                    .putString(KEY_USER_ID, userId)
                    .putString(KEY_ACCESS_TOKEN, accessToken)
                    .putString(KEY_REFRESH_TOKEN, refreshToken)
                    .putLong(KEY_EXPIRES_AT_SEC, expiresAtSec)
                    .apply();
            }
        } catch (Throwable ignored) {}
    }

    public static void clear(@NonNull Context context) {
        synchronized (LOCK) {
            SharedPreferences prefs =
                context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().clear().apply();
        }
    }

    @Nullable
    public static SessionSnapshot read(@NonNull Context context) {
        synchronized (LOCK) {
            SharedPreferences prefs =
                context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String supabaseUrl = prefs.getString(KEY_SUPABASE_URL, "");
            String anonKey = prefs.getString(KEY_ANON_KEY, "");
            String userId = prefs.getString(KEY_USER_ID, "");
            String accessToken = prefs.getString(KEY_ACCESS_TOKEN, "");
            String refreshToken = prefs.getString(KEY_REFRESH_TOKEN, "");
            long expiresAtSec = prefs.getLong(KEY_EXPIRES_AT_SEC, 0L);

            if (
                !isAllowedSupabaseBaseUrl(supabaseUrl) ||
                anonKey == null ||
                anonKey.isEmpty() ||
                !isValidUuid(userId) ||
                accessToken == null ||
                accessToken.isEmpty()
            ) {
                return null;
            }

            return new SessionSnapshot(
                supabaseUrl,
                anonKey,
                userId,
                accessToken,
                refreshToken != null ? refreshToken : "",
                expiresAtSec
            );
        }
    }

    @Nullable
    private static SessionSnapshot refreshAccessToken(
        @NonNull Context context,
        @NonNull SessionSnapshot current
    ) {
        if (current.refreshToken.isEmpty()) {
            return null;
        }
        HttpURLConnection conn = null;
        try {
            URL url = new URL(current.supabaseUrl + "/auth/v1/token?grant_type=refresh_token");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(HTTP_READ_TIMEOUT_MS);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("apikey", current.anonKey);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");

            JSONObject body = new JSONObject();
            body.put("refresh_token", current.refreshToken);
            byte[] payloadBytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(payloadBytes);
            }

            int status = conn.getResponseCode();
            if (status < 200 || status >= 300) {
                return null;
            }

            String responseJson = readStreamUtf8(conn.getInputStream(), 64 * 1024);
            JSONObject parsed = new JSONObject(responseJson);
            String nextAccess = parsed.optString("access_token", "").trim();
            String nextRefresh = parsed.optString("refresh_token", current.refreshToken).trim();
            long expiresIn = parsed.optLong("expires_in", 3600L);
            long nextExpiresAt = parsed.optLong(
                "expires_at",
                (System.currentTimeMillis() / 1000L) + expiresIn
            );

            if (nextAccess.isEmpty()) {
                return null;
            }

            SessionSnapshot updated = new SessionSnapshot(
                current.supabaseUrl,
                current.anonKey,
                current.userId,
                nextAccess,
                nextRefresh,
                nextExpiresAt
            );

            synchronized (LOCK) {
                SharedPreferences prefs =
                    context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                prefs
                    .edit()
                    .putString(KEY_ACCESS_TOKEN, updated.accessToken)
                    .putString(KEY_REFRESH_TOKEN, updated.refreshToken)
                    .putLong(KEY_EXPIRES_AT_SEC, updated.expiresAtSec)
                    .apply();
            }
            return updated;
        } catch (Throwable ignored) {
            return null;
        } finally {
            if (conn != null) {
                try {
                    conn.disconnect();
                } catch (Throwable ignored) {}
            }
        }
    }

    /**
     * Envia resposta rápida diretamente para `public.chat_messages` respeitando RLS (`sender_id = auth.uid()`).
     */
    public static boolean sendDirectReplyViaSupabase(
        @NonNull Context context,
        @NonNull String conversationId,
        @NonNull String rawContent
    ) {
        String cleanConvId = conversationId.trim();
        String trimmedContent = rawContent.trim();
        if (!isValidUuid(cleanConvId) || trimmedContent.isEmpty() || trimmedContent.length() > 2000) {
            return false;
        }

        SessionSnapshot session = read(context);
        if (session == null) {
            return false;
        }

        long nowSec = System.currentTimeMillis() / 1000L;
        boolean refreshedAlready = false;
        if (session.expiresAtSec > 0L && nowSec + 30L >= session.expiresAtSec) {
            SessionSnapshot refreshed = refreshAccessToken(context, session);
            if (refreshed != null) {
                session = refreshed;
                refreshedAlready = true;
            }
        }

        int status = postChatMessage(session, cleanConvId, trimmedContent);
        if (status == 401 && !refreshedAlready) {
            SessionSnapshot refreshed = refreshAccessToken(context, session);
            if (refreshed != null) {
                session = refreshed;
                status = postChatMessage(session, cleanConvId, trimmedContent);
            }
        }

        if (status >= 200 && status < 300) {
            markConversationReadBestEffort(session, cleanConvId);
            return true;
        }
        return false;
    }

    /**
     * Busca o `avatar_url` do remetente/parceiro em `public_profiles` (timeout curto 2.2s)
     * quando o push FCM legado não incluiu `actorAvatarUrl` em `data`.
     */
    @Nullable
    public static String lookupPeerAvatarUrl(
        @NonNull Context context,
        @Nullable String conversationId,
        @Nullable String actorId
    ) {
        SessionSnapshot session = read(context);
        if (session == null) {
            return null;
        }

        HttpURLConnection conn = null;
        try {
            String queryUrl = null;
            if (isValidUuid(actorId)) {
                queryUrl = String.format(
                    Locale.US,
                    "%s/rest/v1/public_profiles?id=eq.%s&select=avatar_url&limit=1",
                    session.supabaseUrl,
                    Uri.encode(actorId.trim())
                );
            } else if (isValidUuid(conversationId)) {
                String memberUrl = String.format(
                    Locale.US,
                    "%s/rest/v1/chat_conversation_members?conversation_id=eq.%s&left_at=is.null&user_id=neq.%s&select=user_id&limit=1",
                    session.supabaseUrl,
                    Uri.encode(conversationId.trim()),
                    Uri.encode(session.userId)
                );
                String memberJson = quickGetRest(memberUrl, session, 1800);
                if (memberJson != null) {
                    JSONArray members = new JSONArray(memberJson);
                    if (members.length() > 0) {
                        String peerId = members.getJSONObject(0).optString("user_id", "");
                        if (isValidUuid(peerId)) {
                            queryUrl = String.format(
                                Locale.US,
                                "%s/rest/v1/public_profiles?id=eq.%s&select=avatar_url&limit=1",
                                session.supabaseUrl,
                                Uri.encode(peerId)
                            );
                        }
                    }
                }
            }

            if (queryUrl == null) {
                return null;
            }

            String profileJson = quickGetRest(queryUrl, session, 1800);
            if (profileJson == null) {
                return null;
            }
            JSONArray rows = new JSONArray(profileJson);
            if (rows.length() == 0) {
                return null;
            }
            String avatarUrl = rows.getJSONObject(0).optString("avatar_url", "").trim();
            return avatarUrl.isEmpty() || "null".equalsIgnoreCase(avatarUrl) ? null : avatarUrl;
        } catch (Throwable ignored) {
            return null;
        } finally {
            if (conn != null) {
                try {
                    conn.disconnect();
                } catch (Throwable ignored) {}
            }
        }
    }

    @Nullable
    private static String quickGetRest(
        @NonNull String urlString,
        @NonNull SessionSnapshot session,
        int timeoutMs
    ) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(urlString).openConnection();
            conn.setConnectTimeout(timeoutMs);
            conn.setReadTimeout(timeoutMs);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", session.anonKey);
            conn.setRequestProperty("Authorization", "Bearer " + session.accessToken);
            conn.setRequestProperty("Accept", "application/json");
            if (conn.getResponseCode() != 200) {
                return null;
            }
            return readStreamUtf8(conn.getInputStream(), 16 * 1024);
        } catch (Throwable ignored) {
            return null;
        } finally {
            if (conn != null) {
                try {
                    conn.disconnect();
                } catch (Throwable ignored) {}
            }
        }
    }

    private static int postChatMessage(
        @NonNull SessionSnapshot session,
        @NonNull String conversationId,
        @NonNull String content
    ) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(session.supabaseUrl + "/rest/v1/chat_messages");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(HTTP_READ_TIMEOUT_MS);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("apikey", session.anonKey);
            conn.setRequestProperty("Authorization", "Bearer " + session.accessToken);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Prefer", "return=minimal");

            JSONObject payload = new JSONObject();
            payload.put("conversation_id", conversationId);
            payload.put("sender_id", session.userId);
            payload.put("message_type", "text");
            payload.put("content", content);

            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(bytes);
            }
            return conn.getResponseCode();
        } catch (Throwable ignored) {
            return -1;
        } finally {
            if (conn != null) {
                try {
                    conn.disconnect();
                } catch (Throwable ignored) {}
            }
        }
    }

    private static void markConversationReadBestEffort(
        @NonNull SessionSnapshot session,
        @NonNull String conversationId
    ) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(session.supabaseUrl + "/rest/v1/rpc/mark_conversation_read");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(3000);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("apikey", session.anonKey);
            conn.setRequestProperty("Authorization", "Bearer " + session.accessToken);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");

            JSONObject payload = new JSONObject();
            payload.put("p_conversation_id", conversationId);
            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(bytes);
            }
            conn.getResponseCode();
        } catch (Throwable ignored) {
        } finally {
            if (conn != null) {
                try {
                    conn.disconnect();
                } catch (Throwable ignored) {}
            }
        }
    }

    @NonNull
    private static String readStreamUtf8(@NonNull InputStream in, int maxBytes) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream(1024);
        byte[] buf = new byte[2048];
        int total = 0;
        int n;
        while ((n = in.read(buf)) != -1) {
            total += n;
            if (total > maxBytes) {
                break;
            }
            out.write(buf, 0, n);
        }
        return out.toString(StandardCharsets.UTF_8.name());
    }
}
