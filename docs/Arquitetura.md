# Arquitetura do Sistema — Codit (`TCC-Codit`)

## 1. Padrões Arquiteturais & Separação de Responsabilidades

- **Client-First Static Export (`output: "export"`):** Por padrão (`next.config.ts`), `npm run build` gera `out/`. O frontend consome diretamente **Supabase** (Auth, PostgREST + RLS, Storage, Realtime privado e RPCs `SECURITY DEFINER`) e a Edge Function Deno `send-push`. O modo servidor dinâmico é habilitado apenas com `CODIT_BUILD_TARGET=server`.
- **Modularização por Domínio (`src/modules/*`):**
  - `*-schemas.ts`: contratos Zod, constantes e validadores puros.
  - `*-service.ts`: queries/RPCs Supabase, guarda anti-IDOR (`session-guard.ts`), tradução de erros (`errors.ts` → RFC 9457 + `app-toast.ts`) e fallbacks de migração.
  - `*-provider.tsx`: estado global React, canais Realtime privados e sincronização nativa.
- **Execução Client-Side Isolada Dual:**
  - `HTML/CSS/JS`: `<iframe sandbox="allow-scripts">` sem `allow-same-origin` (`sandbox-runner.ts` e `learning/assert-runner.ts`).
  - `Python`: Web Worker isolado com **Pyodide `v0.27.4` (WebAssembly)** via `public/workers/pyodide-runner.worker.js` (`sandbox/pyodide-runner.ts` no Estúdio e `learning/pyodide-runner.ts` em `/trilhas/licao`).

---

## 2. Ciclo de Vida da Aplicação

### 2.1 Inicialização (`src/app/layout.tsx`)
1. `RootLayout` carrega `Plus Jakarta Sans` e `JetBrains Mono` e monta os providers:
   `AuthProvider` → `AppearanceProvider` → `NotificationsProvider` → `VoiceCallProvider`.
2. Componentes globais montados no shell:
   `TelemetryErrorObserver` + `ObservabilityErrorObserver` → `NativeInsetsSync` → `ServiceWorkerRegister` → `TopNavbar` → `OfflineBanner` → `AppUpdateModal` → `NotificationToastViewport` → `GlobalCallOverlay`.
3. Em `/auth/native-callback`, `detectSessionInUrl`, `AuthProvider` e `TopNavbar` ficam desativados para preservar o `code` PKCE até o handoff para o Android.

### 2.2 Comunicação Tempo Real Privada & Storage
- **Canais Privados (`config: { private: true }`):** autorizados no banco pelas políticas `codit_realtime_messages_select_authenticated` e `codit_realtime_messages_insert_authenticated` em `realtime.messages`:
  - `codit:conv:<conversationId>` · `codit:call:<conversationId>` · `codit:user-inbox:<userId>` · `codit:notifications:<userId>`.
- **Broadcasts do Banco (`realtime.send`):** `on_chat_message_inserted()` e `notify_incoming_call()` emitem eventos privados diretamente do PostgreSQL sem depender do cliente remetente.
- **Supabase Storage:** bucket privado `chat-attachments` (`5 MB`, `image/png|jpeg|webp|gif`) protegido por políticas de membro ativo da conversa.

### 2.3 Camada Nativa & CSP
- **CSP Web (`next.config.ts`) & Desktop (`src-tauri/tauri.conf.json`):** permitem `'wasm-unsafe-eval' https://cdn.jsdelivr.net` em `script-src`, `worker-src 'self' blob:` e `https://cdn.jsdelivr.net` em `connect-src` para carregar o runtime Pyodide WASM com segurança.
- **Permissões de Mídia Alinhadas:** `Microphone` e `Camera` habilitados em Web (`Permissions-Policy: camera=(self), microphone=(self), display-capture=(self)`), Tauri (`src-tauri/src/lib.rs`) e Android (`CoditWebChromeClient.java` + `CallForegroundService.java`).
- **Pipeline CI (`.github/workflows/ci.yml`):** job `quality` (`typecheck`, `lint`, `test`, `build`) + job `rls-integration` (`supabase start` aplicando todas as 19 migrações + `npm run test:rls`).

---

## 3. Variáveis de Ambiente, Portas & URLs Críticas

- **Bundle Público (`NEXT_PUBLIC_*`):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL`, `NEXT_PUBLIC_SUPABASE_NATIVE_REDIRECT_URL`, `NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON`, `NEXT_PUBLIC_APP_VERSION` (`0.1.18`).
- **Supabase Edge Secrets (`send-push` & `lesson-ai-tutor`):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_TOKEN_URI`, `PUSH_WEBHOOK_SECRET`, `AI_PROVIDER`, `AI_PROVIDER_API_KEY`, `AI_MODEL` (e opcionais `AI_FALLBACK_*`).
- **Portas & Endpoints:** Next/Tauri dev `http://localhost:3000`; OAuth Tauri loopback `http://127.0.0.1:43823/auth/callback`; Ponte OAuth Android `https://codit-omega.vercel.app/auth/native-callback` → `com.codit.app://auth/callback`; OTA `https://github.com/siriuszzz17/Codit/releases/latest/download/latest.json`; Pyodide CDN `https://cdn.jsdelivr.net/pyodide/v0.27.4/full/`.

---

## 4. Decisões Técnicas (`DEC-XXX`)
- **`DEC-001` (Migrações):** SQL puro versionado em `supabase/migrations/` (19 migrações) + `database.types.ts` + validação automática via `supabase start` no CI.
- **`DEC-002` (Tutor IA Octopy):** Implementado via Edge Function autenticada `lesson-ai-tutor` (`Gemini`/`OpenAI`, rate limit `6 req/min` + cooldown `4s` por `userId`, máx. 3 interações/lição no `LessonAiAssistant`).
- **`DEC-003` (Auth):** `@supabase/supabase-js` PKCE client-side multiplataforma.
- **`DEC-004` (Banco & Segurança):** Supabase PostgreSQL com RLS estrita, Realtime privado e RPCs `SECURITY DEFINER`.

## 5. Navegação
[[INDEX]] · [[STATE]] · [[Fluxos-Criticos]] · [[Backend]] · [[Frontend]] · [[Capacitor-Android]] · [[Auth-Seguranca]] · [[Banco-Dados]]
