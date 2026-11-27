# Fluxos Críticos do Sistema — Codit (`TCC-Codit`)

## 1. Autenticação, OAuth Multiplataforma & Consentimento LGPD
1. `AuthScreen` (`src/components/auth/auth-screen.tsx`) valida `loginSchema` / `signUpSchema` (incluindo aceite LGPD `acceptTerms`) → `signInWithEmail()` / `signUpWithEmail()` (`src/modules/auth/auth-service.ts`).
2. `handle_new_user()` cria `public.profiles` (com `terms_accepted_at` / `privacy_version`) e sincroniza `public_profiles`.
3. OAuth Google PKCE: Web (`/auth/callback`), Tauri (`prepare_desktop_oauth` em `127.0.0.1:43823` → `codit://oauth-callback`) e Android (`/auth/native-callback` → `intent://` → `AuthProvider`).
4. `AuthProvider` executa `ensureProfile()`, sincroniza `syncNativeAuthSession(session)` no `NativeSessionStore` (Android) e registra token FCM (`register_push_device`).

---

## 2. Trilhas, Correção Automática (JS & Pyodide) & Gamificação
1. `/trilhas` (`TracksOverview`) carrega `listPublishedTracksWithProgress()` + `getLearningAnalyticsSummary()` (`learning-service.ts`).
2. Em `/trilhas/licao?slug=...` (`LessonWorkbench`), o aluno edita o código e consulta até 3 níveis de dicas socráticas em `OctopyHintPanel`.
3. Ao executar testes:
   - JavaScript: `runLessonAssertions()` (`learning/assert-runner.ts`) avalia `test_cases` em `<iframe sandbox="allow-scripts">` com timeout de `4000ms`.
   - Python: `runPythonLessonAssertions()` (`learning/pyodide-runner.ts`) inicia Web Worker Pyodide (`v0.27.4`), reporta estágios de download/init e termina o Worker se exceder timeout.
4. `recordLessonAttempt()` chama a RPC `public.record_lesson_attempt`, que grava `exercise_submissions`, atualiza `user_lesson_progress` de forma monotônica, credita XP (50% se usou dica nível 3), atualiza `current_streak` e desbloqueia `badges`, refletindo imediatamente em `AuthProvider.refreshProfile()`.

---

## 3. Chat Rico, Realtime Privado, Push FCM & `RemoteInput`
1. Em `/mensagens` (`MessagesWorkspace`), o envio suporta texto, bloco de código (`CodeMessageBlock`), imagem (`uploadChatImageAttachment()` → Storage `chat-attachments` → URL assinada em `ChatImageAttachment`), compartilhamento de projeto, reações (`toggleMessageReaction()`) e busca (`searchConversationMessages()`).
2. `INSERT` em `chat_messages` dispara `on_chat_message_inserted()` (atualiza preview, marca `last_read_at` e emite `message:notify` via `realtime.send` privado respeitando `are_users_blocked`) e `trg_chat_messages_push_edge` (`pg_net` → Edge Function `send-push` → FCM HTTP v1 `data-only`).
3. No Android em background, `NotificationActionReceiver` (`ACTION_DIRECT_REPLY`) usa `NativeSessionStore` para enviar `kind: "notification_reply"` a `send-push` e sincroniza `codit:native-reply-sent` com a WebView.

---

## 4. Chamadas WebRTC (Voz, Câmera & Tela) + Timeout 60s
1. `VoiceCallProvider.joinVoiceCall()` inicia `VoiceCallSessionManager` no canal privado `codit:call:<conversationId>`, chama RPC `notify_incoming_call` e aciona `dispatchVoiceCallPush()` → `send-push` (`call_sessions` `ringing` + timer `60s` `CallRingingRegistry`).
2. Pares negociam áudio, câmera (`user`/`environment`) e tela (`getDisplayMedia` ou `ScreenCaptureService` `MediaProjection` no Android) com resolução polite-peer (`isPolitePeer`).
3. No Android, `CallForegroundService` (`NOTIFICATION_ID = 4101`) mantém `WakeLock`/`WifiLock` e controles nativos (`toggle-mute`, `hangup`, `return`).

---

## 5. Moderação Bilateral, Portabilidade & Exclusão LGPD
1. `ReportBlockModal` aciona `blockUser()` (`INSERT` em `user_blocks` → `on_user_block_inserted` remove amizade e corta DMs/visibilidade) ou `submitModerationReport()` (`moderation_reports`).
2. Em `/conta` (`PrivacyDataPanel`), `exportMyAccountData()` baixa JSON completo via `export_my_account_data()`, e `deleteMyAccount()` chama `delete_my_account(p_confirm_username)`, limpando dispositivo FCM, sessão nativa e conta `auth.users`.

---

## 6. Observabilidade & Tratamento Global de Erros
1. Erros Supabase passam por `mapSupabaseDatabaseError()` (`src/lib/supabase/errors.ts`), gerando `ProblemDetails` RFC 9457, disparando toast acessível (`emitProblemToast`) e notificando `TelemetryErrorObserver` (`error-reporter.ts` → `client_error_logs` com sanitização de PII e throttle de 5/sessão) + `ObservabilityErrorObserver` (`error-observability.ts` → `error_events`).

## 7. Navegação
[[INDEX]] · [[Arquitetura]] · [[STATE]] · [[Auth-Seguranca]] · [[Backend]] · [[Capacitor-Android]] · [[Banco-Dados]]
