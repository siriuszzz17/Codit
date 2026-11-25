# Estado do projeto

## Pronto no código
- App Router e interface em Next.js/React/TypeScript; PWA e shells Tauri/Capacitor (`v0.1.13`, Android `versionCode 14`).
- Auth/OAuth, perfis, aparência, projetos sandbox, comunidade, mensagens/WebRTC, notificações in-app/desktop e Push Notifications nativas Android (FCM HTTP v1 + canal `codit_alerts_high_v1` `IMPORTANCE_HIGH` + Edge Function `send-push`).
- Migrações Supabase versionadas em `supabase/migrations/` (incluindo `20261125000001_add_android_push_notifications.sql`); testes unitários em `tests/unit/`.

## Pendente / em andamento
- Aplicar e validar migrações no projeto Supabase remoto (`20261123000001`..`20261125000001`), configurar secrets Firebase/webhook na Edge Function `send-push`, Custom SMTP e Redirect URLs no painel.
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
