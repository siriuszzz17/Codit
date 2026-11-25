# Mensagens

## Responsabilidade
Conversas diretas e em grupo, sinalização de chamadas, WebRTC e compartilhamento de tela.

## Arquivos-chave
- src/modules/messaging/messaging-service.ts — listUserConversations(), createGroupConversation(), addGroupMembers(), sendConversationMessage().
- src/modules/messaging/messaging-schemas.ts
- src/modules/messaging/voice-call-manager.ts — VoiceCallSessionManager.
- src/modules/messaging/voice-call-provider.tsx — VoiceCallProvider().
- src/modules/messaging/webrtc-media.ts
- src/components/messaging/messages-workspace.tsx
- src/components/messaging/global-call-overlay.tsx
- src/components/messaging/call-stage-panel.tsx
- src/app/mensagens/page.tsx

## Rotas
/mensagens; providers e overlay de chamada também são montados em src/app/layout.tsx.

## Dependências
[[Auth]] e [[Infraestrutura]]; usa amizades de [[Comunidade]] e alertas de [[Notificacoes]]. Chamadas usam permissões dos shells em [[Infraestrutura]].
