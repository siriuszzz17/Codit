# Mensagens

## Responsabilidade
Conversas diretas e em grupo, chamadas WebRTC de voz/vídeo, compartilhamento de tela e controles nativos de chamada no Android.

## Arquivos-chave
- src/modules/messaging/messaging-service.ts — listUserConversations(), createGroupConversation(), addGroupMembers(), sendConversationMessage().
- src/modules/messaging/messaging-schemas.ts
- src/modules/messaging/voice-call-manager.ts — VoiceCallSessionManager.
- src/modules/messaging/voice-call-provider.tsx — VoiceCallProvider().
- src/lib/codit-native-bridge.ts — sessão Android e ações nativas da chamada.
- android/app/src/main/java/com/codit/app/CallForegroundService.java — chamada ativa persistente com controles.
- src/modules/messaging/webrtc-media.ts
- supabase/migrations/20261126000001_harden_rls_and_soft_deleted_messages.sql — hardening de `are_users_friends`, `is_active_chat_member` e redação de `chat_messages` deletadas.
- src/components/messaging/messages-workspace.tsx — `useDialogA11y`, `SkeletonList` e `EmptyStateCard`.
- src/components/messaging/global-call-overlay.tsx
- src/components/messaging/call-stage-panel.tsx
- src/app/mensagens/page.tsx

## Rotas
/mensagens; providers e overlay de chamada também são montados em src/app/layout.tsx.

## Dependências
[[Auth]] e [[Infraestrutura]]; usa amizades de [[Comunidade]] e alertas de [[Notificacoes]]. Chamadas usam permissões dos shells em [[Infraestrutura]].
