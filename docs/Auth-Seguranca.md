# Autenticação, Segurança & LGPD — Codit (`TCC-Codit`)

## 1. Autenticação, Sessão & OAuth Multiplataforma

- **Sessão PKCE (`src/lib/supabase/client.ts`):** `flowType: "pkce"`, `persistSession: true`, `autoRefreshToken: true`, `storageKey: "codit-supabase-auth"`.
- **Sessão Nativa Background (`NativeSessionStore.java`):** `SharedPreferences` (`codit_native_auth`, `MODE_PRIVATE`) sincronizada por `AuthProvider`, com refresh automático em `/auth/v1/token?grant_type=refresh_token` para `RemoteInput` Android.
- **Fluxos de Entrada:**
  - E-mail/senha (`signUpSchema` exige aceite explícito dos termos LGPD → grava `terms_accepted_at` + `privacy_version`), confirmação `token_hash` (`verifyOtp`) e reenvio com cooldown `60s` (`3` tentativas / `15min`).
  - Google OAuth PKCE: Web (`/auth/callback`), Tauri loopback (`127.0.0.1:43823` → `codit://oauth-callback`) e Android (`/auth/native-callback` → `intent://` / `com.codit.app://auth/callback`).

---

## 2. Isolamento, Realtime Privado, Moderação & LGPD

- **RLS + Anti-Enumeração (`20261126000001`, `20261126000002`):** todas as 19 tabelas usam RLS; `are_users_friends()` e `is_active_chat_member()` negam consultas de terceiros não participantes; `chat_conversation_members` bloqueia `UPDATE` direto de tabelas (permitido apenas via RPCs `SECURITY DEFINER` com `SET search_path = public`).
- **Canais Realtime Privados:** `realtime.messages` exige autenticação e participação verificada (`codit_realtime_messages_*`); clientes conectam exclusivamente com `{ config: { private: true } }`.
- **Moderação & Bloqueio Bilateral (`20261126000006`):** `public.user_blocks` desfaz amizade imediatamente e bloqueia novas solicitações, DMs, mensagens, broadcasts e visualização de projetos em ambos os sentidos; `public.moderation_reports` registra denúncias de usuários, projetos e mensagens.
- **Conformidade LGPD (`/privacidade`, `PrivacyDataPanel`):**
  - `accept_privacy_terms(p_version)` registra consentimento versionado.
  - `export_my_account_data()` gera pacote JSON portável de todos os dados do titular.
  - `delete_my_account(p_confirm_username)` exige confirmação exata do `@username` e apaga conta/dados em cascata (`auth.users` + `profiles` + anexos/tokens).

---

## 3. Sandbox, Pyodide Worker & CSP

- **Execução Web (`iframe`):** `sandbox="allow-scripts"` sem `allow-same-origin` + CSP meta `default-src 'none'` + watchdog `4s`.
- **Execução Python (`Pyodide WASM`):** Web Worker isolado (`worker.terminate()` imediato em timeout), sem acesso ao DOM ou `localStorage`.
- **CSP (`next.config.ts` & `src-tauri/tauri.conf.json`):** restringe scripts/conexões externas a `*.supabase.co`, `cdn.jsdelivr.net` (Pyodide) e GitHub Releases (OTA), bloqueando `object-src` e `frame-ancestors`.
- **Telemetria Zero-PII:** `error-reporter.ts` e `logger.ts` mascaram tokens, e-mails e chaves antes de persistir em `client_error_logs` / `error_events`.

## 4. Navegação
[[INDEX]] · [[Capacitor-Android]] · [[Backend]] · [[Banco-Dados]] · [[Fluxos-Criticos]] · [[STATE]]
