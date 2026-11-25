package com.codit.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import androidx.annotation.Nullable;
import androidx.core.app.RemoteInput;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * BroadcastReceiver interno (`exported="false"`) para ações de notificações:
 * - `ACTION_DIRECT_REPLY`: recebe o texto do `RemoteInput`, envia ao Supabase REST
 *   (com fallback para a ponte JS quando a WebView está ativa) e atualiza a barra.
 * - `ACTION_CALL_TOGGLE_MUTE`: alterna mudo na chamada ativa sem forçar troca de tela.
 * - `ACTION_CALL_HANGUP`: encerra chamada e serviços de mídia imediatamente.
 */
public class NotificationActionReceiver extends BroadcastReceiver {
    public static final String ACTION_DIRECT_REPLY = "com.codit.app.action.DIRECT_REPLY";
    public static final String ACTION_CALL_TOGGLE_MUTE = "com.codit.app.action.CALL_TOGGLE_MUTE";
    public static final String ACTION_CALL_HANGUP = "com.codit.app.action.CALL_HANGUP";

    private static final ExecutorService ACTION_EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(final Context context, @Nullable final Intent intent) {
        if (context == null || intent == null || intent.getAction() == null) {
            return;
        }

        final String action = intent.getAction();
        final Context appContext = context.getApplicationContext();

        if (ACTION_CALL_TOGGLE_MUTE.equals(action)) {
            String conversationId = safeExtra(intent, CoditNotificationHelper.EXTRA_CONVERSATION_ID);
            if (CallForegroundService.isActive()) {
                Intent updateService = new Intent(appContext, CallForegroundService.class);
                updateService.setAction(CallForegroundService.ACTION_TOGGLE_MUTE_OPTIMISTIC);
                appContext.startService(updateService);
            }
            MainActivity.dispatchCallActionFromReceiver("toggle-mute", conversationId);
            return;
        }

        if (ACTION_CALL_HANGUP.equals(action)) {
            String conversationId = safeExtra(intent, CoditNotificationHelper.EXTRA_CONVERSATION_ID);

            Intent stopCallIntent = new Intent(appContext, CallForegroundService.class);
            stopCallIntent.setAction(CallForegroundService.ACTION_STOP);
            appContext.startService(stopCallIntent);

            if (ScreenCaptureService.isRunning()) {
                Intent stopScreenIntent = new Intent(appContext, ScreenCaptureService.class);
                stopScreenIntent.setAction(ScreenCaptureService.ACTION_STOP);
                appContext.startService(stopScreenIntent);
            }

            MainActivity.dispatchCallActionFromReceiver("hangup", conversationId);
            return;
        }

        if (ACTION_DIRECT_REPLY.equals(action)) {
            Bundle remoteResults = RemoteInput.getResultsFromIntent(intent);
            CharSequence rawSeq = remoteResults != null
                ? remoteResults.getCharSequence(CoditNotificationHelper.KEY_REMOTE_INPUT_REPLY)
                : null;
            final String replyText = rawSeq != null ? rawSeq.toString().trim() : "";
            final String conversationId = safeExtra(intent, CoditNotificationHelper.EXTRA_CONVERSATION_ID);
            final String conversationTitle = safeExtra(
                intent,
                CoditNotificationHelper.EXTRA_CONVERSATION_TITLE
            );
            final String tag = safeExtra(intent, CoditNotificationHelper.EXTRA_NOTIFICATION_TAG);
            final int notifId = intent.getIntExtra(CoditNotificationHelper.EXTRA_NOTIFICATION_ID, 0);

            if (replyText.isEmpty() || !NativeSessionStore.isValidUuid(conversationId)) {
                if (!tag.isEmpty()) {
                    CoditNotificationHelper.completeDirectReplyNotification(
                        appContext,
                        tag,
                        notifId,
                        conversationId,
                        conversationTitle,
                        replyText,
                        false
                    );
                }
                return;
            }

            final PendingResult pendingResult = goAsync();
            ACTION_EXECUTOR.execute(() -> {
                try {
                    boolean sentViaRest = NativeSessionStore.sendDirectReplyViaSupabase(
                        appContext,
                        conversationId,
                        replyText
                    );

                    boolean handledByWebView = false;
                    if (sentViaRest) {
                        MainActivity.notifyDirectReplySyncedFromReceiver(conversationId, replyText);
                    } else {
                        handledByWebView = MainActivity.dispatchDirectReplyToWebViewFromReceiver(
                            conversationId,
                            replyText
                        );
                    }

                    boolean ok = sentViaRest || handledByWebView;
                    String effectiveTag = !tag.isEmpty() ? tag : ("conv:" + conversationId);
                    CoditNotificationHelper.completeDirectReplyNotification(
                        appContext,
                        effectiveTag,
                        notifId,
                        conversationId,
                        conversationTitle,
                        replyText,
                        ok
                    );
                } finally {
                    pendingResult.finish();
                }
            });
        }
    }

    private static String safeExtra(Intent intent, String key) {
        String val = intent.getStringExtra(key);
        return val != null ? val.trim() : "";
    }
}
