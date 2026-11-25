package com.codit.app;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Display;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.IntentCompat;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Serviço em primeiro plano para projeção de tela no Android (MediaProjection).
 *
 * Compatível com Android 10–16 (`targetSdkVersion = 36`):
 * - Mantém o estado Foreground `FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION` ativo
 *   durante `getMediaProjection()` e `createVirtualDisplay()` (nunca chama
 *   `stopForeground()` antes de adquirir a projeção).
 * - Evita `getSystemService(WINDOW_SERVICE)` em contexto de Service não-visual,
 *   usando dimensões passadas pela `MainActivity` com fallback em `DisplayManager`.
 * - Suporta redimensionamento dinâmico (`onCapturedContentResize`) para captura
 *   de aplicativo único no Android 14+.
 */
public class ScreenCaptureService extends Service {
    public static final String ACTION_START = "com.codit.app.action.START_SCREEN_CAPTURE";
    public static final String ACTION_STOP = "com.codit.app.action.STOP_SCREEN_CAPTURE";
    public static final String EXTRA_RESULT_CODE = "result_code";
    public static final String EXTRA_RESULT_DATA = "result_data";
    public static final String EXTRA_DISPLAY_WIDTH = "display_width";
    public static final String EXTRA_DISPLAY_HEIGHT = "display_height";
    public static final String EXTRA_DISPLAY_DENSITY = "display_density";

    private static final String CHANNEL_ID = "codit_screen_share";
    private static final int NOTIFICATION_ID = 4102;
    private static final int MAX_CAPTURE_SIDE_PX = 960;
    private static final int MIN_CAPTURE_SIDE_PX = 320;
    private static final long MIN_FRAME_INTERVAL_MS = 95L;
    private static final int JPEG_QUALITY = 62;

    public interface Listener {
        void onStarted(int width, int height);
        void onStopped();
        void onError(String message);
    }

    private static volatile Listener activeListener;
    private static volatile String latestFrameDataUrl = "";
    private static final AtomicLong latestFrameSeq = new AtomicLong(0L);
    private static volatile int captureWidth = 0;
    private static volatile int captureHeight = 0;
    private static volatile boolean running = false;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private HandlerThread captureThread;
    private Handler captureHandler;
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private Bitmap reusableBitmap;
    private int captureDensityDpi = 320;
    private long lastEncodedAtMs = 0L;

    public static void setListener(@Nullable Listener listener) {
        activeListener = listener;
    }

    public static long getLatestFrameSeq() {
        return latestFrameSeq.get();
    }

    public static String getLatestFrameDataUrl() {
        return latestFrameDataUrl;
    }

    public static int getCaptureWidth() {
        return captureWidth;
    }

    public static int getCaptureHeight() {
        return captureHeight;
    }

    public static boolean isRunning() {
        return running;
    }

    @Override
    @Nullable
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        if (intent == null) {
            stopForegroundCompat();
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            releaseCaptureResources(true);
            stopForegroundCompat();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (!ACTION_START.equals(action)) {
            stopForegroundCompat();
            stopSelf();
            return START_NOT_STICKY;
        }

        // Android 10+ e 14+ exigem startForeground imediato com tipo MEDIA_PROJECTION antes de getMediaProjection.
        Notification notification = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Throwable fgErr) {
            notifyError("Não foi possível iniciar o serviço de captura de tela no Android.");
            stopSelf();
            return START_NOT_STICKY;
        }

        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Integer.MIN_VALUE);
        Intent resultData = IntentCompat.getParcelableExtra(intent, EXTRA_RESULT_DATA, Intent.class);
        if (resultData == null || resultCode != Activity.RESULT_OK) {
            notifyError("Não foi possível iniciar o compartilhamento de tela.");
            releaseCaptureResources(false);
            stopForegroundCompat();
            stopSelf();
            return START_NOT_STICKY;
        }

        int hintWidth = intent.getIntExtra(EXTRA_DISPLAY_WIDTH, 0);
        int hintHeight = intent.getIntExtra(EXTRA_DISPLAY_HEIGHT, 0);
        int hintDensity = intent.getIntExtra(EXTRA_DISPLAY_DENSITY, 0);

        startProjection(resultCode, resultData, hintWidth, hintHeight, hintDensity);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        releaseCaptureResources(true);
        stopForegroundCompat();
        super.onDestroy();
    }

    private static int[] computeScaledEvenDimensions(int rawWidth, int rawHeight) {
        int safeRawWidth = Math.max(rawWidth, MIN_CAPTURE_SIDE_PX);
        int safeRawHeight = Math.max(rawHeight, MIN_CAPTURE_SIDE_PX);

        int targetWidth;
        int targetHeight;
        if (safeRawWidth >= safeRawHeight) {
            float scale = Math.min(1.0f, (float) MAX_CAPTURE_SIDE_PX / (float) safeRawWidth);
            targetWidth = Math.max(MIN_CAPTURE_SIDE_PX, Math.round(safeRawWidth * scale));
            targetHeight = Math.max(MIN_CAPTURE_SIDE_PX, Math.round(safeRawHeight * scale));
        } else {
            float scale = Math.min(1.0f, (float) MAX_CAPTURE_SIDE_PX / (float) safeRawHeight);
            targetHeight = Math.max(MIN_CAPTURE_SIDE_PX, Math.round(safeRawHeight * scale));
            targetWidth = Math.max(MIN_CAPTURE_SIDE_PX, Math.round(safeRawWidth * scale));
        }

        // Dimensões pares evitam artefatos de stride em codecs de hardware.
        targetWidth = Math.max(MIN_CAPTURE_SIDE_PX, targetWidth & ~1);
        targetHeight = Math.max(MIN_CAPTURE_SIDE_PX, targetHeight & ~1);
        return new int[] { targetWidth, targetHeight };
    }

    private int[] resolveInitialDisplayMetrics(int hintWidth, int hintHeight, int hintDensity) {
        int rawWidth = hintWidth;
        int rawHeight = hintHeight;
        int densityDpi = hintDensity;

        if (rawWidth <= 0 || rawHeight <= 0 || densityDpi <= 0) {
            DisplayMetrics fallbackMetrics = new DisplayMetrics();
            boolean resolvedFromDisplay = false;
            try {
                DisplayManager displayManager =
                    (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);
                Display defaultDisplay =
                    displayManager != null ? displayManager.getDisplay(Display.DEFAULT_DISPLAY) : null;
                if (defaultDisplay != null) {
                    defaultDisplay.getRealMetrics(fallbackMetrics);
                    resolvedFromDisplay =
                        fallbackMetrics.widthPixels > 0 && fallbackMetrics.heightPixels > 0;
                }
            } catch (Throwable ignored) {
                resolvedFromDisplay = false;
            }

            if (!resolvedFromDisplay) {
                fallbackMetrics = getResources().getDisplayMetrics();
            }

            if (rawWidth <= 0) {
                rawWidth = fallbackMetrics.widthPixels;
            }
            if (rawHeight <= 0) {
                rawHeight = fallbackMetrics.heightPixels;
            }
            if (densityDpi <= 0) {
                densityDpi = fallbackMetrics.densityDpi;
            }
        }

        return new int[] {
            Math.max(rawWidth, 720),
            Math.max(rawHeight, 1280),
            Math.max(densityDpi, 160)
        };
    }

    private void startProjection(
        int resultCode,
        Intent resultData,
        int hintWidth,
        int hintHeight,
        int hintDensity
    ) {
        // Libera apenas recursos anteriores sem chamar stopForeground()!
        releaseCaptureResources(false);

        try {
            MediaProjectionManager projectionManager =
                (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            if (projectionManager == null) {
                notifyError("Serviço de projeção de tela indisponível neste dispositivo.");
                stopForegroundCompat();
                stopSelf();
                return;
            }

            MediaProjection projection = projectionManager.getMediaProjection(resultCode, resultData);
            if (projection == null) {
                notifyError("Permissão de captura de tela não concedida.");
                stopForegroundCompat();
                stopSelf();
                return;
            }

            captureThread = new HandlerThread("CoditScreenCapture");
            captureThread.start();
            captureHandler = new Handler(captureThread.getLooper());

            int[] displaySpec = resolveInitialDisplayMetrics(hintWidth, hintHeight, hintDensity);
            int[] scaled = computeScaledEvenDimensions(displaySpec[0], displaySpec[1]);
            int targetWidth = scaled[0];
            int targetHeight = scaled[1];
            captureDensityDpi = displaySpec[2];

            captureWidth = targetWidth;
            captureHeight = targetHeight;
            latestFrameDataUrl = "";
            latestFrameSeq.set(0L);
            lastEncodedAtMs = 0L;

            mediaProjection = projection;
            mediaProjection.registerCallback(
                new MediaProjection.Callback() {
                    @Override
                    public void onStop() {
                        mainHandler.post(() -> {
                            releaseCaptureResources(true);
                            stopForegroundCompat();
                            stopSelf();
                        });
                    }

                    @Override
                    public void onCapturedContentResize(int width, int height) {
                        if (width > 0 && height > 0 && captureHandler != null) {
                            captureHandler.post(() -> handleContentResize(width, height));
                        }
                    }
                },
                captureHandler
            );

            imageReader = buildImageReader(targetWidth, targetHeight);

            virtualDisplay = mediaProjection.createVirtualDisplay(
                "CoditScreenShare",
                targetWidth,
                targetHeight,
                captureDensityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(),
                null,
                captureHandler
            );

            running = true;
            final int startedWidth = targetWidth;
            final int startedHeight = targetHeight;
            Listener listener = activeListener;
            if (listener != null) {
                mainHandler.post(() -> listener.onStarted(startedWidth, startedHeight));
            }
        } catch (Throwable err) {
            notifyError("Falha ao iniciar captura de tela no Android.");
            releaseCaptureResources(false);
            stopForegroundCompat();
            stopSelf();
        }
    }

    private ImageReader buildImageReader(final int width, final int height) {
        ImageReader reader = ImageReader.newInstance(
            width,
            height,
            PixelFormat.RGBA_8888,
            2
        );
        reader.setOnImageAvailableListener(
            r -> processLatestFrame(r, width, height),
            captureHandler
        );
        return reader;
    }

    private void handleContentResize(int rawWidth, int rawHeight) {
        if (!running || virtualDisplay == null || captureHandler == null) {
            return;
        }
        int[] scaled = computeScaledEvenDimensions(rawWidth, rawHeight);
        int nextWidth = scaled[0];
        int nextHeight = scaled[1];
        if (nextWidth == captureWidth && nextHeight == captureHeight) {
            return;
        }

        try {
            ImageReader nextReader = buildImageReader(nextWidth, nextHeight);
            ImageReader previousReader = imageReader;
            imageReader = nextReader;
            captureWidth = nextWidth;
            captureHeight = nextHeight;

            virtualDisplay.resize(nextWidth, nextHeight, captureDensityDpi);
            virtualDisplay.setSurface(nextReader.getSurface());

            if (previousReader != null) {
                try {
                    previousReader.setOnImageAvailableListener(null, null);
                    previousReader.close();
                } catch (Throwable ignored) {}
            }
        } catch (Throwable ignored) {
            // Mantém a superfície atual caso o OEM não suporte resize dinâmico.
        }
    }

    private void processLatestFrame(ImageReader reader, int width, int height) {
        Image image = null;
        try {
            image = reader.acquireLatestImage();
            if (image == null || !running) {
                return;
            }

            long now = System.currentTimeMillis();
            if (now - lastEncodedAtMs < MIN_FRAME_INTERVAL_MS) {
                return;
            }

            Image.Plane[] planes = image.getPlanes();
            if (planes == null || planes.length == 0) {
                return;
            }

            ByteBuffer buffer = planes[0].getBuffer();
            int pixelStride = planes[0].getPixelStride();
            int rowStride = planes[0].getRowStride();
            if (pixelStride <= 0) {
                return;
            }
            int rowPadding = rowStride - pixelStride * width;
            int bitmapWidth = width + Math.max(0, rowPadding / pixelStride);

            if (
                reusableBitmap == null ||
                reusableBitmap.getWidth() != bitmapWidth ||
                reusableBitmap.getHeight() != height
            ) {
                if (reusableBitmap != null) {
                    reusableBitmap.recycle();
                }
                reusableBitmap = Bitmap.createBitmap(
                    bitmapWidth,
                    height,
                    Bitmap.Config.ARGB_8888
                );
            }

            buffer.rewind();
            reusableBitmap.copyPixelsFromBuffer(buffer);
            Bitmap frameBitmap = bitmapWidth == width
                ? reusableBitmap
                : Bitmap.createBitmap(reusableBitmap, 0, 0, width, height);

            ByteArrayOutputStream out = new ByteArrayOutputStream(32 * 1024);
            frameBitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out);
            if (frameBitmap != reusableBitmap) {
                frameBitmap.recycle();
            }

            String encoded = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            latestFrameDataUrl = "data:image/jpeg;base64," + encoded;
            latestFrameSeq.incrementAndGet();
            lastEncodedAtMs = now;
        } catch (Throwable ignored) {
            // Descartar quadros inválidos durante rotação ou encerramento.
        } finally {
            if (image != null) {
                try {
                    image.close();
                } catch (Throwable ignored) {}
            }
        }
    }

    private void releaseCaptureResources(boolean notifyStop) {
        boolean wasRunning = running;
        running = false;
        latestFrameDataUrl = "";
        captureWidth = 0;
        captureHeight = 0;

        if (virtualDisplay != null) {
            try {
                virtualDisplay.release();
            } catch (Throwable ignored) {}
            virtualDisplay = null;
        }

        if (imageReader != null) {
            try {
                imageReader.setOnImageAvailableListener(null, null);
                imageReader.close();
            } catch (Throwable ignored) {}
            imageReader = null;
        }

        if (mediaProjection != null) {
            try {
                mediaProjection.stop();
            } catch (Throwable ignored) {}
            mediaProjection = null;
        }

        if (reusableBitmap != null) {
            try {
                reusableBitmap.recycle();
            } catch (Throwable ignored) {}
            reusableBitmap = null;
        }

        if (captureThread != null) {
            try {
                captureThread.quitSafely();
            } catch (Throwable ignored) {}
            captureThread = null;
            captureHandler = null;
        }

        if (notifyStop && wasRunning) {
            Listener listener = activeListener;
            if (listener != null) {
                mainHandler.post(listener::onStopped);
            }
        }
    }

    private void stopForegroundCompat() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Throwable ignored) {}
    }

    private void notifyError(String message) {
        Listener listener = activeListener;
        if (listener != null) {
            mainHandler.post(() -> listener.onError(message));
        }
    }

    private Notification buildNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Compartilhamento de tela",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Notificação ativa enquanto sua tela é compartilhada em chamadas do Codit.");
            channel.setShowBadge(false);
            NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }

        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(this, 41020, openAppIntent, pendingFlags);

        Intent stopIntent = new Intent(this, ScreenCaptureService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(this, 41021, stopIntent, pendingFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Codit · Compartilhando tela")
            .setContentText("Sua tela está visível na chamada de voz atual.")
            .setSmallIcon(R.drawable.ic_stat_codit)
            .setColor(ContextCompat.getColor(this, R.color.codit_notification_accent))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentIntent)
            .addAction(R.drawable.ic_notif_call_end, "Parar", stopPendingIntent)
            .build();
    }
}
