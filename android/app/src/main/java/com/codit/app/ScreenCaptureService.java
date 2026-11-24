package com.codit.app;

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
import android.view.WindowManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.IntentCompat;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Serviço em primeiro plano para projeção de tela no Android (MediaProjection).
 *
 * Mantém a regra RN-504/RN-505 do Codit: captura apenas a tela do dispositivo
 * (sem câmera e sem áudio interno) e expõe o frame JPEG mais recente para a
 * ponte WebView -> canvas.captureStream() no WebRTC.
 */
public class ScreenCaptureService extends Service {
    public static final String ACTION_START = "com.codit.app.action.START_SCREEN_CAPTURE";
    public static final String ACTION_STOP = "com.codit.app.action.STOP_SCREEN_CAPTURE";
    public static final String EXTRA_RESULT_CODE = "result_code";
    public static final String EXTRA_RESULT_DATA = "result_data";

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
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            teardownCapture(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (!ACTION_START.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        // Android 8+ e 14+ exigem startForeground imediato com tipo MEDIA_PROJECTION antes de getMediaProjection.
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Integer.MIN_VALUE);
        Intent resultData = IntentCompat.getParcelableExtra(intent, EXTRA_RESULT_DATA, Intent.class);
        if (resultData == null || resultCode == Integer.MIN_VALUE) {
            notifyError("Não foi possível iniciar o compartilhamento de tela.");
            teardownCapture(false);
            stopSelf();
            return START_NOT_STICKY;
        }

        startProjection(resultCode, resultData);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        teardownCapture(true);
        super.onDestroy();
    }

    private void startProjection(int resultCode, Intent resultData) {
        teardownCapture(false);

        try {
            MediaProjectionManager projectionManager =
                (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            if (projectionManager == null) {
                notifyError("Serviço de projeção de tela indisponível neste dispositivo.");
                stopSelf();
                return;
            }

            MediaProjection projection = projectionManager.getMediaProjection(resultCode, resultData);
            if (projection == null) {
                notifyError("Permissão de captura de tela não concedida.");
                stopSelf();
                return;
            }

            captureThread = new HandlerThread("CoditScreenCapture");
            captureThread.start();
            captureHandler = new Handler(captureThread.getLooper());

            DisplayMetrics metrics = new DisplayMetrics();
            WindowManager windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
            if (windowManager != null && windowManager.getDefaultDisplay() != null) {
                windowManager.getDefaultDisplay().getRealMetrics(metrics);
            } else {
                metrics = getResources().getDisplayMetrics();
            }

            int rawWidth = Math.max(metrics.widthPixels, 720);
            int rawHeight = Math.max(metrics.heightPixels, 1280);
            int densityDpi = Math.max(metrics.densityDpi, 160);

            int targetWidth;
            int targetHeight;
            if (rawWidth >= rawHeight) {
                float scale = Math.min(1.0f, (float) MAX_CAPTURE_SIDE_PX / (float) rawWidth);
                targetWidth = Math.max(MIN_CAPTURE_SIDE_PX, Math.round(rawWidth * scale));
                targetHeight = Math.max(MIN_CAPTURE_SIDE_PX, Math.round(rawHeight * scale));
            } else {
                float scale = Math.min(1.0f, (float) MAX_CAPTURE_SIDE_PX / (float) rawHeight);
                targetHeight = Math.max(MIN_CAPTURE_SIDE_PX, Math.round(rawHeight * scale));
                targetWidth = Math.max(MIN_CAPTURE_SIDE_PX, Math.round(rawWidth * scale));
            }

            // Dimensões pares evitam artefatos de stride em codecs de hardware.
            targetWidth = targetWidth & ~1;
            targetHeight = targetHeight & ~1;

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
                            teardownCapture(true);
                            stopSelf();
                        });
                    }
                },
                captureHandler
            );

            imageReader = ImageReader.newInstance(
                targetWidth,
                targetHeight,
                PixelFormat.RGBA_8888,
                2
            );

            final int finalWidth = targetWidth;
            final int finalHeight = targetHeight;

            imageReader.setOnImageAvailableListener(
                reader -> processLatestFrame(reader, finalWidth, finalHeight),
                captureHandler
            );

            virtualDisplay = mediaProjection.createVirtualDisplay(
                "CoditScreenShare",
                targetWidth,
                targetHeight,
                densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(),
                null,
                captureHandler
            );

            running = true;
            Listener listener = activeListener;
            if (listener != null) {
                mainHandler.post(() -> listener.onStarted(finalWidth, finalHeight));
            }
        } catch (Throwable err) {
            notifyError("Falha ao iniciar captura de tela no Android.");
            teardownCapture(false);
            stopSelf();
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
                image.close();
            }
        }
    }

    private void teardownCapture(boolean notifyStop) {
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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }

        if (notifyStop && wasRunning) {
            Listener listener = activeListener;
            if (listener != null) {
                mainHandler.post(listener::onStopped);
            }
        }
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
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openAppIntent, pendingFlags);

        Intent stopIntent = new Intent(this, ScreenCaptureService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(this, 1, stopIntent, pendingFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Codit · Compartilhando tela")
            .setContentText("Sua tela está visível na chamada de voz atual.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setContentIntent(contentIntent)
            .addAction(0, "Parar", stopPendingIntent)
            .build();
    }
}
