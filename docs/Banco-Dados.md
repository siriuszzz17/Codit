# Banco de Dados — Codit (`TCC-Codit`)

## 1. Migrações Versionadas (`supabase/migrations/` — 16 arquivos)

1. `20261122000001_init_profiles_and_sandbox_projects.sql` — `profiles`, `sandbox_projects`, RLS base.
2. `20261123000001_enhance_profiles_and_projects.sql` — customização de perfil e 15 linguagens em `sandbox_projects`.
3. `20261123000002_add_social_network.sql` — `public_profiles`, `friendships`, `project_likes`, `project_comments`.
4. `20261123000003_fix_grants_rls_and_username_cooldown.sql` — `GRANT`s mínimos, cooldown de 30d em `username` e anti-impersonação.
5. `20261124000001_sync_public_profile_customization.sql` — espelhamento visual em `public_profiles`.
6. `20261124000002_add_embedded_messaging.sql` — `chat_conversations`, `chat_conversation_members`, `chat_messages` e RPCs.
7. `20261124000003_add_app_appearance_preferences.sql` — 4 colunas de tema/wallpaper em `profiles`.
8. `20261124000004_add_notifications_system.sql` — `notifications` (poda 60) e `profiles.notification_prefs`.
9. `20261125000001_add_android_push_notifications.sql` — `push_devices` (poda 10) e triggers `pg_net` → `send-push`.
10. `20261125000002_add_call_sessions_and_push_reply.sql` — `call_sessions` (`ringing` 60s).
11. `20261126000001_harden_rls_and_soft_deleted_messages.sql` — anti-enumeração em helpers e redação física de mensagens excluídas.
12. `20261126000002_harden_realtime_rls_and_security_definers.sql` — políticas em `realtime.messages` para canais privados, `notify_incoming_call`, revogação de `UPDATE` direto em `chat_conversation_members` e fan-out `realtime.send`.
13. `20261126000004_add_python_track_and_telemetry.sql` — trilha Python (`python-fundamentos`), `client_error_logs`, `learning_lesson_attempts` e `get_learning_retention_analytics`.
14. `20261126000005_add_learning_mvp_and_gamification.sql` — gamificação (`xp_total`, `current_streak`, `badges`, `onboarding_completed_at`), `user_lesson_progress`, `exercise_submissions`, `record_lesson_attempt`, trilha JS (5 lições) e enriquecimento das 3 lições Python.
15. `20261126000006_add_rich_chat_moderation_and_lgpd.sql` — `user_blocks`, `moderation_reports`, chat rico (`metadata_json`, `code`/`image`/`project_share`), `chat_message_reactions`, `search_conversation_messages`, bucket `chat-attachments` e RPCs LGPD (`accept_privacy_terms`, `export_my_account_data`, `delete_my_account`).
16. `20261126000007_add_observability_and_learning_analytics.sql` — `error_events` e `get_learning_analytics_summary()`.

---

## 2. Catálogo Completo das 19 Tabelas (`public.*`) + Tipagem (`database.types.ts`)

- **Identidade & LGPD:**
  - `profiles`: PK `id`, PII privada (`email`, `notification_prefs`, `terms_accepted_at`, `privacy_version`, `last_activity_date`, `onboarding_completed_at`), gamificação (`xp_total`, `current_streak`, `badges`), `last_seen_at`, `username` (cooldown 30d), customização e aparência.
  - `public_profiles`: espelho público sem PII sincronizado por `sync_public_profile()` (inclui `xp_total`, `current_streak`, `badges`, `last_seen_at`).
- **Currículo, Progresso & Analytics:**
  - `tracks`: catálogo publicado (`slug` único, `difficulty`, `category`, `level`, `language`, `estimated_minutes`, `order_index`).
  - `lessons`: lições (`track_id`, `slug`, `summary`, `content_md`, `starter_code`, `solution_code`, `language`, `xp_reward`, `hints`, `test_cases`, `assertions_json`).
  - `user_lesson_progress`: PK composta `(user_id, lesson_id)`, progresso monotônico (`not_started` → `in_progress` → `completed`), `best_code`, `xp_awarded`.
  - `exercise_submissions`: histórico imutável de submissões por tentativa (`passed_cases`, `total_cases`, `execution_ms`, `xp_earned`).
  - `learning_lesson_attempts`: telemetria detalhada de tentativas e asserções falhas para `get_learning_retention_analytics`.
- **Estúdio & Comunidade:**
  - `sandbox_projects`: `user_id`, 15 linguagens, `visibility`, lock otimista `version`, `deleted_at` (respeita `user_blocks` em `can_view_sandbox_project`).
  - `friendships` · `project_likes` · `project_comments` · `user_blocks` (bloqueio bilateral com trigger `on_user_block_inserted` que desfaz amizade) · `moderation_reports` (`user|project|message`).
- **Mensagens, Chamadas & Alertas:**
  - `chat_conversations` · `chat_conversation_members` (máx. 10 ativos; escrita apenas via RPC) · `chat_messages` (`text|system|code|image|project_share`, `metadata_json`, redação `[Mensagem removida]` no soft delete) · `chat_message_reactions` (`👍 ❤️ 🔥 🚀 👏 👀`) · `call_sessions` (`ringing` 60s).
  - `notifications` (poda 60, `entity_key` único) · `push_devices` (poda 10/usuário).
- **Observabilidade:**
  - `client_error_logs` (erros sanitizados `window_error`/`unhandled_rejection`/`problem_details`/`pyodide_worker`) · `error_events` (eventos front/API/worker).

---

## 3. Políticas Realtime & Storage
- **`realtime.messages`:** `codit_realtime_messages_select_authenticated` e `codit_realtime_messages_insert_authenticated` validam `codit:conv:<uuid>`/`codit:call:<uuid>` via `is_active_chat_member()` e `codit:user-inbox:<uuid>`/`codit:notifications:<uuid>` via `auth.uid()`.
- **`storage.objects` (`bucket_id = 'chat-attachments'`):** leitura/upload restritos a membros ativos da conversa correspondente ao 1º segmento do path.

## 4. Navegação
[[INDEX]] · [[Backend]] · [[Auth-Seguranca]] · [[Capacitor-Android]] · [[Fluxos-Criticos]] · [[STATE]]
