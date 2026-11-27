# Estado do projeto

## Pronto no código
- App Router e interface em Next.js/React/TypeScript; PWA e shells Tauri/Capacitor (`v0.1.14`, Android `versionCode 15`).
- Auth/OAuth, perfis, aparência, projetos sandbox, comunidade, mensagens/WebRTC (voz, vídeo com alternância de câmera, tela, grid/PiP responsivo, ringtone de entrada/saída com timeout de 60s), notificações in-app/desktop e camada nativa Android + Bridge Capacitor (projeção `ScreenCaptureService`, `smallIcon`/`largeIcon`, resposta rápida `RemoteInput` sincronizada ao app e chamada persistente com controles de áudio/vídeo, encerrar e retornar).
- **Fase 1 (Qualidade, Segurança RLS & Base UX):** `.github/workflows/ci.yml`, `supabase/config.toml`, migrations `20261126000001_harden_rls_and_soft_deleted_messages.sql` e `20261126000002_harden_realtime_rls_and_security_definers.sql` (canais Realtime privados + RLS em `realtime.messages`, `REVOKE UPDATE` em `chat_conversation_members`, trava de grafo social em `SECURITY DEFINER`, redação em soft-delete e GUCs blindadas), Edge Function `send-push` com broadcasts privados (`private: true`), `tests/rls/rls-policies.integration.test.ts`, `ProblemDetails` client-safe + `app-toast.ts` + `errors.ts`, `useDialogA11y`, `SkeletonList`/`EmptyStateCard`, `camera=(self)` em `next.config.ts` e `RN-504`.
- **Fase 4 (Python Pyodide Worker, Observabilidade & Analytics):** CSP atualizada (`'wasm-unsafe-eval'`, `worker-src 'self' blob:`, `cdn.jsdelivr.net`), `public/workers/pyodide-runner.worker.js` + `src/modules/sandbox/pyodide-runner.ts` (stdout/stderr 16 KB, asserts Python, watchdog `worker.terminate()` 5s `RN-202`), integrado em `SandboxPreview`, telemetria sanitizada zero-PII (`src/lib/telemetry/error-reporter.ts`, throttle 5/sessão, `GlobalErrorObserver` em `layout.tsx`, integrado ao `problem-details.ts`), migração `20261126000004_add_python_track_and_telemetry.sql` (`client_error_logs`, `learning_lesson_attempts`, seed trilha Python e RPC `get_learning_retention_analytics`) e `LearningAnalyticsDrawer` em `/projetos`.
- **`/verify`:** `lint`, `typecheck`, `test` (26 arquivos / 132 testes), `build` (13 rotas estáticas) e `npx cap sync android` PASS; `npm run test:rls` configurado no CI (requer Supabase local Docker).
- **Próxima fase:** Fase 2/3 (UI de catálogo curricular/lições e proxy server-side do tutor Octopy).

## Pendente / em andamento
- Aplicar e validar migrações no projeto Supabase remoto (`20261123000001`..`20261126000004`), publicar Edge Function `send-push` com secrets Firebase/webhook, Custom SMTP e Redirect URLs no painel.
- UI de catálogo curricular e leitor de lições (Fase 2).
- Proxy server-side para tutor Octopy (Fase 3).

## Pontos críticos / débitos
- Schema, RLS e secrets da Edge Function remotos não podem ser confirmados apenas pelo repositório.
- API própria contém só `GET /api/v1/health`; serviços de domínio acessam Supabase no cliente.
- `next.config.ts` usa exportação estática por padrão; handlers dinâmicos exigem build server (`CODIT_BUILD_TARGET=server`).
- O runner existente monta preview em iframe; Python e tutor IA são roadmap, não implementação atual.

## Navegação
[[INDEX]] · [[Backend]] · [[Infraestrutura]] · documentação detalhada: [[status]].
