# Notificacoes

## Responsabilidade
Notificações no app, leitura, preferências de mudo, notificações locais de sistema e Push Notifications nativas Android (`ic_stat_codit` monocromático, `largeIcon` circular com fallback, `MessagingStyle` + `RemoteInput` "Responder" e notificação `Ongoing` de chamada ativa com Mutar/Desmutar, Encerrar e Voltar).

## Arquivos-chave
- src/modules/notifications/notification-service.ts — listUserNotifications(), markAllNotificationsRead(), persistUserNotificationPrefs().
- src/modules/notifications/notification-schemas.ts
- src/modules/notifications/notifications-provider.tsx — NotificationsProvider().
- src/modules/notifications/system-notifications.ts, src/lib/codit-native-bridge.ts — bridge `window.CoditNative`.
- src/modules/notifications/push-notification-service.ts — registro/desregistro FCM (`@capacitor/push-notifications`).
- android/app/src/main/java/com/codit/app/ — `CoditNotificationHelper`, `NotificationAvatarLoader`, `CoditFirebaseMessagingService`, `NotificationActionReceiver`, `NativeSessionStore` e `CallForegroundService`.
- supabase/migrations/20261125000001_add_android_push_notifications.sql — `public.push_devices`, RPCs e triggers `pg_net`.
- supabase/functions/send-push/index.ts — Edge Function FCM HTTP v1 (OAuth2 RS256 server-side).
- src/components/notifications/notifications-bell-menu.tsx
- src/components/notifications/notification-preferences-panel.tsx
- src/components/notifications/notification-toast-viewport.tsx

## Rotas
Sem rota própria; provider, toast e controle global são montados em src/app/layout.tsx.

## Dependências
[[Auth]] e [[Infraestrutura]]; recebe eventos dos domínios [[Comunidade]] e [[Mensagens]]. Integra notificações de sistema em [[Infraestrutura]].
