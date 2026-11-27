# Backend, Storage & Edge Functions — Codit (`TCC-Codit`)

## 1. Estrutura & Camadas de Backend

1. **Rota Next.js Estática:** `GET /api/v1/health` (`src/app/api/v1/health/route.ts`, `force-static`) → retorna `{ status: "ok", service: "codit", version: "0.1.18", timestamp }`.
2. **PostgREST + RLS + RPCs `SECURITY DEFINER`:** toda lógica transacional (trilhas/XP, chat rico, chamadas, moderação, LGPD e analytics) roda no PostgreSQL via RPCs autenticadas chamadas por `src/modules/*/*-service.ts`.
3. **Supabase Storage (`chat-attachments`):** bucket privado (`file_size_limit = 5242880`, MIME `image/png|jpeg|webp|gif`), caminho `<conversation_id>/<sender_id>/<uuid>.<ext>`, protegido pelas políticas `chat_attachments_select_member` e `chat_attachments_insert_member`.
4. **Edge Function Deno (`supabase/functions/send-push/{index.ts,helpers.ts}`):** despacho FCM HTTP v1 `data-only` (OAuth2 RS256), coordenação de estado/timeout `60s` de `call_sessions` e resposta rápida `RemoteInput`.
5. **Edge Function Deno (`supabase/functions/lesson-ai-tutor/{index.ts,helpers.ts}`):** proxy autenticado do Assistente IA socrático (`Gemini` / `OpenAI`, timeout `12s`, rate-limit `6 req/min` + cooldown `4s` por `userId`, payload máx. `32 KB`).
6. **Helpers RFC 9457 (`src/lib/problem-details.ts`, `src/lib/problem-response.ts`):** padronização de erros com observador global conectado à telemetria (`setProblemDetailsObserver`).

---

## 2. Contratos da Edge Function `POST /functions/v1/send-push`

- **Modo Webhook (`x-codit-webhook-secret`, SHA-256 timing-safe):** acionado por `pg_net` (`trg_notifications_push_edge` e `trg_chat_messages_push_edge`). Consulta `notification_prefs` e `push_devices`, envia FCM `HIGH` `data-only` e remove tokens inválidos (`UNREGISTERED` / `INVALID_ARGUMENT`).
- **Modo Autenticado (`Authorization: Bearer <jwt>`):**
  - `kind: "voice_call"`: rate limit `10s`, valida membro/amizade, grava `call_sessions` (`ringing`, 60s), agenda timer `CallRingingRegistry` (`EdgeRuntime.waitUntil`) para marcar `missed` + emitir `call:timeout` + FCM `voice_call_cancel`.
  - `kind: "voice_call_answer"` / `"voice_call_cancel"`: atualiza `call_sessions` (`active`/`cancelled`) e notifica membros ativos.
  - `kind: "reply"` / `"notification_reply"`: valida `1..2000` chars + membro ativo + `are_users_friends` em DM e insere em `chat_messages` (o trigger `on_chat_message_inserted` atualiza `last_read_at` e publica `message:notify` via `realtime.send` privado).

---

## 3. Principais RPCs de Negócio no Servidor PostgreSQL

- **Educação & Analytics:** `record_lesson_attempt` (calcula XP monotônico, penalidade de dica nível 3 = 50% XP, streak UTC e desbloqueio de badges `first_lesson`, `streak_3`, `xp_250`, `track_finisher`), `get_learning_retention_analytics(p_track_slug)`, `get_learning_analytics_summary()`.
- **Mensagens & Chamadas:** `get_or_create_direct_conversation`, `create_group_conversation`, `add_group_conversation_members`, `remove_or_leave_group_member`, `rename_group_conversation`, `mark_conversation_read`, `notify_incoming_call`, `search_conversation_messages`.
- **Moderação & LGPD:** `are_users_blocked`, `touch_last_seen`, `accept_privacy_terms`, `export_my_account_data` (exporta JSON completo do titular), `delete_my_account(p_confirm_username)` (remove dados + linha em `auth.users`).

## 4. Navegação
[[INDEX]] · [[Banco-Dados]] · [[Auth-Seguranca]] · [[Frontend]] · [[Capacitor-Android]] · [[Fluxos-Criticos]] · [[STATE]]
