package com.codit.app;

import android.content.Context;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.net.Uri;
import android.util.LruCache;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.util.Locale;

/**
 * Carregador seguro de avatares circulares (`largeIcon` / `Person`) para notificações Android.
 *
 * Ordem de resolução:
 * 1. Presets locais empacotados nos assets Capacitor (`public/icons/octopy-*.png`) com pixel-art nítido.
 * 2. URLs HTTPS externas públicas (com proteção SSRF, timeout curto e limite de 2 MB).
 * 3. Fallback determinístico com gradiente roxo Codit (`#7C3AED` -> `#4C1D95`) e iniciais brancas.
 */
public final class NotificationAvatarLoader {
    private static final int AVATAR_SIZE_PX = 192;
    private static final int CONNECT_TIMEOUT_MS = 3_000;
    private static final int READ_TIMEOUT_MS = 3_500;
    private static final int MAX_AVATAR_BYTES = 2 * 1024 * 1024;
    private static final int CACHE_MAX_KB = 4 * 1024;

    private static final LruCache<String, Bitmap> AVATAR_CACHE =
        new LruCache<String, Bitmap>(CACHE_MAX_KB) {
            @Override
            protected int sizeOf(String key, Bitmap value) {
                return Math.max(1, value.getByteCount() / 1024);
            }
        };

    private NotificationAvatarLoader() {}

    @Nullable
    public static Bitmap peekCachedAvatar(
        @Nullable String avatarUrl,
        @Nullable String displayName,
        @Nullable String username
    ) {
        String key = buildCacheKey(avatarUrl, displayName, username);
        synchronized (AVATAR_CACHE) {
            Bitmap cached = AVATAR_CACHE.get(key);
            return cached != null && !cached.isRecycled() ? cached : null;
        }
    }

    @NonNull
    public static Bitmap loadAvatarBitmap(
        @NonNull Context context,
        @Nullable String avatarUrl,
        @Nullable String displayName,
        @Nullable String username
    ) {
        String key = buildCacheKey(avatarUrl, displayName, username);
        synchronized (AVATAR_CACHE) {
            Bitmap cached = AVATAR_CACHE.get(key);
            if (cached != null && !cached.isRecycled()) {
                return cached;
            }
        }

        Bitmap resolved = null;
        String trimmedUrl = avatarUrl != null ? avatarUrl.trim() : "";

        if (!trimmedUrl.isEmpty()) {
            String localAssetRelPath = extractLocalPublicAssetPath(trimmedUrl);
            if (localAssetRelPath != null) {
                resolved = loadPixelArtAssetCircle(context, localAssetRelPath);
            } else if (isAllowedHttpsAvatarUrl(trimmedUrl)) {
                resolved = downloadHttpsAvatarCircle(trimmedUrl);
            }
        }

        if (resolved == null) {
            resolved = renderInitialsFallbackCircle(displayName, username);
        }

        synchronized (AVATAR_CACHE) {
            AVATAR_CACHE.put(key, resolved);
        }
        return resolved;
    }

    @NonNull
    public static Bitmap renderInitialsFallbackCircle(
        @Nullable String displayName,
        @Nullable String username
    ) {
        String initials = extractInitials(displayName, username);
        Bitmap out = Bitmap.createBitmap(AVATAR_SIZE_PX, AVATAR_SIZE_PX, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        float radius = AVATAR_SIZE_PX / 2f;

        Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        bgPaint.setShader(
            new LinearGradient(
                0f,
                0f,
                AVATAR_SIZE_PX,
                AVATAR_SIZE_PX,
                Color.parseColor("#7C3AED"),
                Color.parseColor("#3B0764"),
                Shader.TileMode.CLAMP
            )
        );
        canvas.drawCircle(radius, radius, radius - 2f, bgPaint);

        Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        borderPaint.setStyle(Paint.Style.STROKE);
        borderPaint.setStrokeWidth(4f);
        borderPaint.setColor(Color.parseColor("#A78BFA"));
        canvas.drawCircle(radius, radius, radius - 4f, borderPaint);

        Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        textPaint.setColor(Color.WHITE);
        textPaint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
        textPaint.setTextSize(AVATAR_SIZE_PX * 0.38f);
        textPaint.setTextAlign(Paint.Align.CENTER);

        Paint.FontMetrics fm = textPaint.getFontMetrics();
        float textY = radius - (fm.ascent + fm.descent) / 2f;
        canvas.drawText(initials, radius, textY, textPaint);

        return out;
    }

    private static String buildCacheKey(
        @Nullable String avatarUrl,
        @Nullable String displayName,
        @Nullable String username
    ) {
        String safeUrl = avatarUrl != null ? avatarUrl.trim() : "";
        String initials = extractInitials(displayName, username);
        return safeUrl + "|" + initials;
    }

    @Nullable
    private static String extractLocalPublicAssetPath(@NonNull String rawUrl) {
        if (rawUrl.startsWith("/icons/") && !rawUrl.contains("..")) {
            return "public" + rawUrl;
        }
        try {
            Uri uri = Uri.parse(rawUrl);
            String host = uri.getHost();
            String path = uri.getPath();
            if (
                host != null &&
                ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host)) &&
                path != null &&
                path.startsWith("/icons/") &&
                !path.contains("..")
            ) {
                return "public" + path;
            }
        } catch (Throwable ignored) {}
        return null;
    }

    @Nullable
    private static Bitmap loadPixelArtAssetCircle(
        @NonNull Context context,
        @NonNull String assetPath
    ) {
        AssetManager assets = context.getAssets();
        try (InputStream stream = assets.open(assetPath)) {
            Bitmap raw = BitmapFactory.decodeStream(stream);
            if (raw == null) {
                return null;
            }
            Bitmap out = Bitmap.createBitmap(AVATAR_SIZE_PX, AVATAR_SIZE_PX, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(out);
            float radius = AVATAR_SIZE_PX / 2f;

            Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            bgPaint.setColor(Color.parseColor("#141124"));
            canvas.drawCircle(radius, radius, radius - 2f, bgPaint);

            int pad = Math.round(AVATAR_SIZE_PX * 0.14f);
            Rect dst = new Rect(pad, pad, AVATAR_SIZE_PX - pad, AVATAR_SIZE_PX - pad);
            Paint spritePaint = new Paint();
            spritePaint.setAntiAlias(false);
            spritePaint.setFilterBitmap(false);
            canvas.drawBitmap(raw, null, dst, spritePaint);
            raw.recycle();

            Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            borderPaint.setStyle(Paint.Style.STROKE);
            borderPaint.setStrokeWidth(4f);
            borderPaint.setColor(Color.parseColor("#8B6BFF"));
            canvas.drawCircle(radius, radius, radius - 4f, borderPaint);

            return out;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static boolean isAllowedHttpsAvatarUrl(@NonNull String rawUrl) {
        try {
            Uri uri = Uri.parse(rawUrl);
            if (!"https".equalsIgnoreCase(uri.getScheme())) {
                return false;
            }
            String host = uri.getHost();
            if (host == null || host.trim().isEmpty()) {
                return false;
            }
            String lower = host.toLowerCase(Locale.US);
            if (
                "localhost".equals(lower) ||
                lower.endsWith(".local") ||
                lower.endsWith(".internal")
            ) {
                return false;
            }
            InetAddress[] addresses = InetAddress.getAllByName(host);
            if (addresses == null || addresses.length == 0) {
                return false;
            }
            for (InetAddress addr : addresses) {
                if (
                    addr.isAnyLocalAddress() ||
                    addr.isLoopbackAddress() ||
                    addr.isLinkLocalAddress() ||
                    addr.isSiteLocalAddress() ||
                    addr.isMulticastAddress()
                ) {
                    return false;
                }
                byte[] bytes = addr.getAddress();
                if (bytes != null && bytes.length == 16) {
                    // Bloqueia Unique Local IPv6 (fc00::/7)
                    int first = bytes[0] & 0xFF;
                    if ((first & 0xFE) == 0xFC) {
                        return false;
                    }
                }
            }
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    @Nullable
    private static Bitmap downloadHttpsAvatarCircle(@NonNull String urlString) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlString);
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "image/*");

            int status = conn.getResponseCode();
            if (status < 200 || status >= 300) {
                return null;
            }

            byte[] imageBytes;
            try (InputStream in = conn.getInputStream()) {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream(16 * 1024);
                byte[] chunk = new byte[4096];
                int total = 0;
                int read;
                while ((read = in.read(chunk)) != -1) {
                    total += read;
                    if (total > MAX_AVATAR_BYTES) {
                        return null;
                    }
                    buffer.write(chunk, 0, read);
                }
                imageBytes = buffer.toByteArray();
            }

            if (imageBytes.length == 0) {
                return null;
            }

            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
                return null;
            }

            int sampleSize = 1;
            while (
                (bounds.outWidth / sampleSize) > AVATAR_SIZE_PX * 2 &&
                (bounds.outHeight / sampleSize) > AVATAR_SIZE_PX * 2
            ) {
                sampleSize *= 2;
            }

            BitmapFactory.Options decodeOpts = new BitmapFactory.Options();
            decodeOpts.inSampleSize = sampleSize;
            decodeOpts.inPreferredConfig = Bitmap.Config.ARGB_8888;

            Bitmap decoded = BitmapFactory.decodeByteArray(
                imageBytes,
                0,
                imageBytes.length,
                decodeOpts
            );
            if (decoded == null) {
                return null;
            }

            Bitmap circle = cropToCircle(decoded);
            if (circle != decoded) {
                decoded.recycle();
            }
            return circle;
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

    @NonNull
    private static Bitmap cropToCircle(@NonNull Bitmap source) {
        Bitmap out = Bitmap.createBitmap(AVATAR_SIZE_PX, AVATAR_SIZE_PX, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);

        int srcW = source.getWidth();
        int srcH = source.getHeight();
        float scale = Math.max(
            (float) AVATAR_SIZE_PX / (float) Math.max(1, srcW),
            (float) AVATAR_SIZE_PX / (float) Math.max(1, srcH)
        );
        float dx = (AVATAR_SIZE_PX - srcW * scale) * 0.5f;
        float dy = (AVATAR_SIZE_PX - srcH * scale) * 0.5f;

        Matrix shaderMatrix = new Matrix();
        shaderMatrix.setScale(scale, scale);
        shaderMatrix.postTranslate(dx, dy);

        BitmapShader shader = new BitmapShader(
            source,
            Shader.TileMode.CLAMP,
            Shader.TileMode.CLAMP
        );
        shader.setLocalMatrix(shaderMatrix);

        Paint imagePaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        imagePaint.setShader(shader);

        float radius = AVATAR_SIZE_PX / 2f;
        canvas.drawCircle(radius, radius, radius - 2f, imagePaint);

        Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        borderPaint.setStyle(Paint.Style.STROKE);
        borderPaint.setStrokeWidth(3f);
        borderPaint.setColor(Color.parseColor("#8B6BFF"));
        canvas.drawCircle(radius, radius, radius - 3f, borderPaint);

        return out;
    }

    @NonNull
    private static String extractInitials(
        @Nullable String displayName,
        @Nullable String username
    ) {
        String cleanName = displayName != null ? displayName.trim() : "";
        if (cleanName.startsWith("@")) {
            cleanName = cleanName.substring(1).trim();
        }
        if (!cleanName.isEmpty()) {
            String[] parts = cleanName.split("\\s+");
            if (parts.length >= 2 && !parts[0].isEmpty() && !parts[parts.length - 1].isEmpty()) {
                return (
                    "" +
                    Character.toUpperCase(parts[0].charAt(0)) +
                    Character.toUpperCase(parts[parts.length - 1].charAt(0))
                );
            }
            if (cleanName.length() >= 2) {
                return cleanName.substring(0, 2).toUpperCase(Locale.ROOT);
            }
            return cleanName.substring(0, 1).toUpperCase(Locale.ROOT);
        }

        String cleanUser = username != null ? username.replace("@", "").trim() : "";
        if (cleanUser.length() >= 2) {
            return cleanUser.substring(0, 2).toUpperCase(Locale.ROOT);
        }
        if (cleanUser.length() == 1) {
            return cleanUser.toUpperCase(Locale.ROOT);
        }
        return "CD";
    }
}
