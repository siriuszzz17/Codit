# Codit — Estado Real do Projeto (`STATE`)

## 1. Status de Build, CI & Versão
- **Versão atual:** `0.1.15` (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src/app/api/v1/health/route.ts`, `src/lib/app-updater.ts`, `android/app/build.gradle` `versionName "0.1.15"` / `versionCode 16`).
- **Artefatos de release:** `Codit_0.1.15_x64-setup.exe` + `.sig` (assinados via chave Minisign Tauri), `Codit-mobile.apk` e `latest.json` publicados no GitHub Releases (`siriuszzz17/Codit`).
- **Qualidade & CI (`.github/workflows/ci.yml`):** `npm run typecheck`, `npm run lint`, `npm run test` (`30` arquivos / `154` testes unitários passando), `npm run build` (`out/`) e job `rls-integration` (`supabase start` + `npm run test:rls` com 7 cenários ponta a ponta de RLS/anti-IDOR).

---

## 2. Funcionalidades Implementadas e Integradas na `master` (`v0.1.15`)

- **Núcleo Educacional, Pyodide & Gamificação (`/trilhas`, `/trilhas/licao`, `src/modules/learning/`):**
  - Catálogo publicado em `public.tracks` e `public.lessons` (trilha *Fundamentos de JavaScript* com 5 lições + trilha *Python na Prática com Pyodide* com 3 lições).
  - Correção automática client-side: `assert-runner.ts` (`iframe` isolado para JS) e `pyodide-runner.ts` + `public/workers/pyodide-runner.worker.js` (Pyodide WASM `v0.27.4` em Web Worker com barra de progresso e terminação dura em loop infinito, integrado tanto em `/trilhas/licao` quanto no Estúdio `/projetos`).
  - Dicas socráticas progressivas de 3 níveis (`OctopyHintPanel`), onboarding (`FirstStepsCard`) e RPC atômica `record_lesson_attempt` (progresso monotônico, XP, `current_streak` diário e `badges` sincronizados em `public_profiles`).
  - Painel e métricas de aprendizado/retenção (`LearningAnalyticsDrawer`, `get_learning_retention_analytics`, `get_learning_analytics_summary`).
- **Chat Rico, Reações, Busca & Chamadas WebRTC (`/mensagens`, `src/modules/messaging/`):**
  - Tipos de mensagem `'text' | 'system' | 'code' | 'image' | 'project_share'` com `metadata_json`, blocos de código (`CodeMessageBlock`), anexos de imagem no bucket privado `chat-attachments` (`ChatImageAttachment`), 6 reações (`chat_message_reactions`) e busca textual (`search_conversation_messages`).
  - Chamadas WebRTC mesh polite-peer de voz, vídeo de câmera (alinhado em Web, Android e Tauri Desktop) e compartilhamento de tela (Web `getDisplayMedia` + Android `ScreenCaptureService`), timeout de `60s` (`call_sessions` + RPC `notify_incoming_call`) e `CallForegroundService`.
- **Hardening de Segurança & Realtime Privado (`20261126000001`, `20261126000002`):**
  - Todos os canais Realtime migrados para `config: { private: true }` com políticas `codit_realtime_messages_select_authenticated` e `codit_realtime_messages_insert_authenticated` em `realtime.messages`.
  - Redação automática no banco para mensagens excluídas (`[Mensagem removida]`), revogação de `UPDATE` direto em `chat_conversation_members`, limpeza transacional de `codit.chat_rpc` e bloqueio de enumeração de terceiros em `are_users_friends` / `is_active_chat_member`.
- **Moderação Social & Conformidade LGPD (`20261126000006`, `/privacidade`, `/conta`):**
  - Bloqueio bilateral (`public.user_blocks` + `are_users_blocked`) cortando amizades, DMs, notificações e visibilidade de projetos; modal de denúncia (`ReportBlockModal` → `public.moderation_reports`) e indicador `last_seen_at` (`touch_last_seen`).
  - Página `/privacidade`, aceite de termos no cadastro (`terms_accepted_at`, `accept_privacy_terms`), exportação portável JSON (`export_my_account_data`) e exclusão completa de conta confirmada por `@username` (`delete_my_account` em `PrivacyDataPanel`).
- **UX, Acessibilidade & Observabilidade (`src/hooks/use-dialog-a11y.ts`, `src/lib/app-toast.ts`, `src/lib/telemetry/`):**
  - Pilha de diálogos acessíveis (`useDialogA11y` com focus trap e `Escape` apenas no topo), componentes `EmptyStateCard` e `SkeletonList`, toasts RFC 9457 (`emitProblemToast`) e captura sanitizada de erros de cliente/worker (`client_error_logs` + `error_events`).
- **Auth, Perfis, Aparência, Push Android FCM & Auto-Update:**
  - E-mail/`token_hash` + Google OAuth PKCE (Web, Tauri loopback `43823`, Android `/auth/native-callback`), 6 temas + 8 wallpapers CSS/SVG, Edge Function `send-push` FCM HTTP v1 `data-only` com `RemoteInput` offline (`NativeSessionStore`) e atualizador GitHub Releases (`0.1.15`).

---

## 3. Pendências Ativas & Próximos Passos Priorizados

1. **[P0 — Supabase Remoto]** Aplicar no projeto Supabase de produção as migrações `20261126000001` a `20261126000007`, validar o bucket `chat-attachments` e publicar a versão atualizada da Edge Function `supabase/functions/send-push`.
2. **[P1 — Limpeza de Worktrees]** Remover ou arquivar worktrees secundários já integrados na `master` (`Segurança`, `Ultra`, `Chamadas-not`, `SetupTauri`).
3. **[P2 — Tutor IA Dinâmico (`DEC-002`)]** Evoluir as dicas estáticas de 3 níveis do Octopy para chat socrático dinâmico via Edge Function/proxy com rate limit por `user_id`.
4. **[P2 — Sandbox Remoto Compilado]** Integrar `CodeExecutionProvider` (Judge0 CE / Piston) para as 10 linguagens compiladas/backend restantes do catálogo de 15 linguagens.
