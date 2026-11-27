# Codit — Estado Real do Projeto (`STATE`)

## 1. Status de Build, CI & Versão
- **Versão atual:** `0.1.18` (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src/app/api/v1/health/route.ts`, `src/lib/app-updater.ts`, `android/app/build.gradle` `versionName "0.1.18"` / `versionCode 19`).
- **Artefatos de release:** `Codit_0.1.18_x64-setup.exe` + `.sig` (assinados via chave Minisign Tauri), `Codit-mobile.apk` e `latest.json` publicados no GitHub Releases (`siriuszzz17/Codit`).
- **Qualidade & CI (`.github/workflows/ci.yml`):** `npm run typecheck`, `npm run lint`, `npm run test` (`33` arquivos / `168` testes unitários passando), `npm run build` (`out/`) e job `rls-integration` (`supabase start` + `npm run test:rls` com 7 cenários ponta a ponta de RLS/anti-IDOR).

---

## 2. Funcionalidades Implementadas e Integradas na `master` (`v0.1.18`)

- **Estúdio Multi-Arquivo, CodeMirror 6, Prettier & Histórico de Versões (`/projetos`, `src/modules/sandbox/`, `20261127000001`):**
  - Editor técnico **CodeMirror 6** (`SandboxCodeEditor`, `@uiw/react-codemirror`) tematizado em *Warm Technical Craft* com suporte a HTML, CSS, JavaScript e Python, atalho `Ctrl+Enter` (`Prec.highest`) para executar e `Shift+Alt+F` para formatação sob demanda via **Prettier** (`prettier/standalone` com `import()` dinâmico).
  - Suporte multi-arquivo (`index.html`, `styles.css`, `script.js`) com extração retroativa de `source_code` legado (`sandbox-files.ts`), persistência em `sandbox_projects.files` (JSONB), auto-save com debounce de `1.5s` e lock otimista (`version`).
  - Histórico e restauração de snapshots em `public.sandbox_project_versions` (com RLS estrito ao dono do projeto, `recordSandboxProjectVersion` / `listSandboxProjectVersions` e drawer de versões no `ProjectStudioModal`).
  - Fix de handshake/race condition (`ping`/`ready`) no `iframe` do sandbox (`sandbox-runner.ts` + `sandbox-preview.tsx`) e integração direta do Python client-side via Pyodide Web Worker no `SandboxPreview`.
- **Núcleo Educacional, Pyodide Unificado & Gamificação (`/trilhas`, `/trilhas/licao`, `src/modules/learning/`, `20261127000002`):**
  - Catálogo publicado em `public.tracks` e `public.lessons` (JavaScript e Python) com runner Pyodide WASM `v0.27.4` unificado em Web Worker dedicado (`public/workers/pyodide-runner.worker.js` + `src/modules/sandbox/pyodide-runner.ts`, stdout/stderr 16 KB, watchdog `worker.terminate()` em `5s` / RN-202).
  - Parser Markdown sanitizado para enunciados (`src/modules/learning/lesson-markdown.ts`, `src/components/learning/lesson-markdown.tsx`), precisão IEEE 754 nos runners JS/Pyodide e migração `20261127000003` (`funcoes-e-calculos`), remoção das dicas estáticas (`OctopyHintPanel`) e **Assistente IA Socrático** (`LessonAiAssistant` + Edge Function `lesson-ai-tutor`, máx. 3 interações/lição), onboarding (`FirstStepsCard`), rastreamento de `failed_case_ids` por tentativa na RPC `record_lesson_attempt` (com badge `python_fundamentals_complete`) e botão *"Ver funil por lição"* abrindo o `LearningAnalyticsDrawer` em `/trilhas`.
  - Reporte automático de erros HTTP >= 500 via `reportProblemDetails` em `src/lib/supabase/errors.ts`.
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
  - E-mail/`token_hash` + Google OAuth PKCE (Web, Tauri loopback `43823`, Android `/auth/native-callback`), 6 temas + 8 wallpapers CSS/SVG, Edge Function `send-push` FCM HTTP v1 `data-only` com `RemoteInput` offline (`NativeSessionStore`) e atualizador GitHub Releases (`0.1.18`).

---

## 3. Pendências Ativas & Próximos Passos Priorizados

1. **[P1 — Limpeza de Worktrees]** Remover ou arquivar worktrees secundários já integrados na `master` (`Ultra`, `erros-trillhas`, `SetupTauri`).
2. **[P2 — Sandbox Remoto Compilado]** Integrar `CodeExecutionProvider` (Judge0 CE / Piston) para as 10 linguagens compiladas/backend restantes do catálogo de 15 linguagens.
