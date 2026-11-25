# Estado do projeto

## Pronto no código
- App Router e interface em Next.js/React/TypeScript; PWA e shells Tauri/Capacitor (`v0.1.13`, Android `versionCode 14`).
- Auth/OAuth, perfis, aparência, projetos sandbox, comunidade, mensagens/WebRTC (voz, vídeo com alternância de câmera, tela, grid/PiP responsivo, ringtone de entrada/saída com timeout de 60s), notificações in-app/desktop e camada nativa Android + Bridge Capacitor (projeção `ScreenCaptureService` corrigida para SDK 36 + `CoditWebChromeClient`, `smallIcon` monocromático `ic_stat_codit`, `largeIcon` circular com fallback via `NotificationAvatarLoader`, resposta rápida `RemoteInput` sincronizada ao estado do app via `NotificationActionReceiver` + `NativeSessionStore` e chamada persistente `CallForegroundService` conectada a Mutar/Desmutar, Câmera, Encerrar e Voltar).
- Migrações Supabase versionadas em `supabase/migrations/` (incluindo `20261125000001_add_android_push_notifications.sql` e `20261125000002_add_call_sessions_and_push_reply.sql`); Edge Function `send-push` em FCM data-only com avatar (`largeIcon`), quick-reply (`reply`/`notification_reply`) e timeout server-side de 60s para chamadas `ringing` + sinalização WebRTC de câmera e screen share; testes unitários em `tests/unit/` (22 arquivos, 115 testes), `eslint`, `tsc --noEmit`, `next build --webpack` e `cap sync android` validados.

## Pendente / em andamento
- Aplicar e validar migrações no projeto Supabase remoto (`20261123000001`..`20261125000002`), publicar Edge Function `send-push` com secrets Firebase/webhook, Custom SMTP e Redirect URLs no painel.
- Catálogo curricular e progresso de aulas (tracks, lessons, etc.).
- Execução Python via Pyodide Worker.
- Proxy server-side para tutor Octopy.

## Pontos críticos / débitos
- Schema, RLS e secrets da Edge Function remotos não podem ser confirmados apenas pelo repositório.
- API própria contém só `GET /api/v1/health`; serviços de domínio acessam Supabase no cliente.
- `next.config.ts` usa exportação estática por padrão; handlers dinâmicos exigem build server (`CODIT_BUILD_TARGET=server`).
- O runner existente monta preview em iframe; Python e tutor IA são roadmap, não implementação atual.

## Navegação
[[INDEX]] · [[Backend]] · [[Infraestrutura]] · documentação detalhada: [[status]].
