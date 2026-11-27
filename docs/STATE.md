# Estado do projeto

## Pronto no código
- App Router e interface em Next.js/React/TypeScript; PWA e shells Tauri/Capacitor (`v0.1.14`, Android `versionCode 15`).
- Auth/OAuth, perfis, aparência, projetos sandbox, comunidade, mensagens/WebRTC (voz, vídeo com alternância de câmera, tela, grid/PiP responsivo, ringtone de entrada/saída com timeout de 60s), notificações in-app/desktop e camada nativa Android + Bridge Capacitor (projeção `ScreenCaptureService`, `smallIcon`/`largeIcon`, resposta rápida `RemoteInput` sincronizada ao app e chamada persistente com controles de áudio/vídeo, encerrar e retornar).
- **Fase 1 (Qualidade, Segurança RLS & Base UX):** `.github/workflows/ci.yml`, `supabase/config.toml`, migration `20261126000001_harden_rls_and_soft_deleted_messages.sql` (sem novas tabelas; hardening de `are_users_friends`, `is_active_chat_member`, `guard_chat_message_update`), `tests/rls/rls-policies.integration.test.ts`, `ProblemDetails` client-safe + `app-toast.ts` + `errors.ts`, `useDialogA11y`, `SkeletonList`/`EmptyStateCard`, `camera=(self)` em `next.config.ts` e `RN-504`.
- **Fase 2 (Núcleo Educacional MVP, Octopy & Gamificação):** migration `20261126000002_add_learning_mvp_and_gamification.sql` (`tracks`, `lessons`, `user_lesson_progress`, `exercise_submissions`, colunas `xp_total`/`current_streak`/`last_activity_date`/`badges`/`onboarding_completed_at` em `profiles`/`public_profiles`, RPC atômica `record_lesson_attempt` com RN-102 e seed JS de 5 lições), runner isolado em Web Worker com fallback `iframe` (`src/modules/learning/assert-runner.ts`, timeout 4s), painel socrático `OctopyHintPanel`, rotas estáticas `/trilhas` e `/trilhas/licao`, `FirstStepsCard` e gamificação nos perfis.
- **Fase 3 (Social, Moderação & LGPD):** migration `20261126000003_add_rich_chat_moderation_and_lgpd.sql` (`chat_message_reactions`, `user_blocks` bilateral, `moderation_reports`, `metadata_json`, bucket privado `chat-attachments`, `last_seen_at`/`terms_accepted_at`/`privacy_version`, RPCs `search_conversation_messages`, `touch_last_seen`, `accept_privacy_terms`, `export_my_account_data`, `delete_my_account`), chat rico (`code`, `image`, `project_share` abrindo `ProjectViewerModal`), reações/recibo de leitura/busca, `ReportBlockModal`, `/privacidade` e painel LGPD em `/conta`.
- **Fase 4 (Pyodide, Observabilidade & Analytics):** migration `20261126000004_add_observability_and_learning_analytics.sql` (`error_events` com RLS e RPC `get_learning_analytics_summary`), `src/modules/learning/pyodide-runner.ts` (Pyodide sob demanda em Web Worker dedicado com progresso), `src/lib/error-observability.ts` + `GlobalErrorObserver` no `RootLayout` e painel de Analytics de Aprendizado (TCC) em `/trilhas`.
- **`/verify`:** `typecheck`, `lint`, `test` (27 arquivos, 139 testes) e `build` PASS; `npm run test:rls` (6 testes, incluindo bloqueio bilateral e `delete_my_account`) bloqueado localmente (sem Supabase local/Docker), ativo no CI.
- **Próxima fase:** Fase 3 (Execução Python via Pyodide Web Worker e proxy server-side para tutor Octopy).

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
