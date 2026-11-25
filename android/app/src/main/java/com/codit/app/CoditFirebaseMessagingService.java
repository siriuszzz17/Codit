package com.codit.app;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Serviço FCM nativo do Codit que substitui o `MessagingService` padrão do plugin
 * para renderizar notificações ricas (`ic_stat_codit`, `largeIcon` circular com
 * avatar e ação `RemoteInput` "Responder") também em segundo plano.
 */
public class CoditFirebaseMessagingService extends FirebaseMessagingService {

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        String category = valueOrEmpty(data.get("category"));
        String conversationId = valueOrEmpty(data.get("conversationId"));

        if ("voice_call_cancel".equals(category)) {
            String cancelTag = valueOrEmpty(data.get("tag"));
            if (cancelTag.isEmpty() && !conversationId.isEmpty()) {
                cancelTag = "call:" + conversationId;
            }
            CoditNotificationHelper.dismissByTag(getApplicationContext(), cancelTag);
            if (!conversationId.isEmpty()) {
                CoditNotificationHelper.dismissByTag(getApplicationContext(), "conv:" + conversationId);
            }
            return;
        }

        // Em primeiro plano o React já exibe toast in-app e gerencia o som.
        if (MainActivity.isAppInForeground()) {
            return;
        }

        RemoteMessage.Notification notif = remoteMessage.getNotification();
        String title = valueOrEmpty(data.get("title"));
        if (title.isEmpty() && notif != null && notif.getTitle() != null) {
            title = notif.getTitle().trim();
        }
        if (title.isEmpty()) {
            return;
        }

        String body = valueOrEmpty(data.get("body"));
        if (body.isEmpty() && notif != null && notif.getBody() != null) {
            body = notif.getBody().trim();
        }

        if (category.isEmpty()) {
            category = !conversationId.isEmpty() ? "message" : "social";
        }

        String linkHref = CoditNotificationHelper.sanitizeSafeHref(data.get("linkHref"));
        String tag = valueOrEmpty(data.get("tag"));
        if (tag.isEmpty() && notif != null && notif.getTag() != null) {
            tag = notif.getTag().trim();
        }
        if (tag.isEmpty()) {
            tag = !conversationId.isEmpty()
                ? ("voice_call".equals(category) ? "call:" + conversationId : "conv:" + conversationId)
                : "notif:" + Math.abs(title.hashCode());
        }

        String actorId = valueOrEmpty(data.get("actorId"));
        String actorName = valueOrEmpty(data.get("actorName"));
        if (actorName.isEmpty()) {
            actorName = title;
        }
        String actorUsername = valueOrEmpty(data.get("actorUsername"));
        String actorAvatarUrl = valueOrEmpty(data.get("actorAvatarUrl"));
        if (actorAvatarUrl.isEmpty() && notif != null && notif.getImageUrl() != null) {
            actorAvatarUrl = notif.getImageUrl().toString();
        }

        boolean isGroup = "true".equalsIgnoreCase(valueOrEmpty(data.get("isGroup")));
        String conversationTitle = valueOrEmpty(data.get("conversationTitle"));
        if (conversationTitle.isEmpty()) {
            conversationTitle = title;
        }

        CoditNotificationHelper.RichNotificationSpec spec =
            new CoditNotificationHelper.RichNotificationSpec(
                title,
                body,
                category,
                linkHref,
                conversationId,
                conversationTitle,
                isGroup,
                tag,
                actorId,
                actorName,
                actorUsername,
                actorAvatarUrl
            );

        // Já estamos numa worker thread do FirebaseMessagingService; executa de forma síncrona.
        CoditNotificationHelper.showRichNotificationSync(getApplicationContext(), spec);
    }

    @NonNull
    private static String valueOrEmpty(String value) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        return "null".equalsIgnoreCase(trimmed) ? "" : trimmed;
    }
}
