# Codit (`TCC-Codit`) — Roteador Mestre da Documentação

## 1. Visão Geral da Arquitetura & Stack Completa

Aplicação educacional e rede de estudos **client-first** construída sobre exportação estática Next.js (`output: "export"` → `out/`), backend gerenciado no **Supabase** (PostgreSQL + RLS + RPCs `SECURITY DEFINER` + Auth + Realtime privado + Storage + Edge Function `send-push`) e empacotamento nativo para **Desktop Windows (Tauri v2)** e **Android (Capacitor 8)**.

| Camada | Stack & Versões Reais (`0.1.16`) | Responsabilidade |
| :--- | :--- | :--- |
| **Web / UI** | Next.js `16.4.6` (App Router) · React `19.3.1` · TypeScript `5.9.3` (`strict`) · Tailwind CSS `4.3.5` · Zod `4.6.7` · CodeMirror 6 (`@uiw/react-codemirror`) · Prettier `3.10.1` | 14 rotas, trilhas gamificadas, Estúdio Multi-Arquivo com CodeMirror 6 + Prettier + versões, UI `Warm Technical Craft`, temas CSS/SVG, a11y (`useDialogA11y`), Sandbox `iframe` e Pyodide WASM Worker. |
| **PWA & Workers** | `public/sw.js` (`codit-static-v2`) · `public/workers/pyodide-runner.worker.js` · `manifest.webmanifest` | Cache offline estático na Web e execução Python isolada via Pyodide `v0.27.4` em Web Worker unificado (watchdog 5s, stdout/stderr 16 KB). |
| **Backend / Dados** | `@supabase/supabase-js` `2.119.2` · PostgreSQL (20 tabelas + RLS) · Storage (`chat-attachments`) · Edge Function `send-push` | Persistência isolada por `user_id`, snapshots de versão de projetos (`sandbox_project_versions`), canais Realtime privados, anexos de chat, LGPD, moderação, FCM HTTP v1 e timeout de chamadas. |
| **Android Nativo** | Capacitor `8.6.2` (`com.codit.app`, `versionCode 17`, `0.1.16`) · Firebase Messaging `25.0.1` · Java 21 / SDK 36 | WebView Edge-to-Edge, `MediaProjection` (screen share), `CallForegroundService`, `MessagingStyle` + `RemoteInput`. |
| **Desktop Nativo** | Tauri `2.12.x` (`com.codit.app`, `0.1.16`) · Rust (`oauth.rs`, `lib.rs`) · `tauri-plugin-{updater,notification,opener,process}` | Loopback OAuth local (`127.0.0.1:43823`), microfone/câmera liberados, CSP compatível com Pyodide WASM e auto-update assinado. |
| **Qualidade & CI** | Vitest `5.1.1` (`31` suítes unitárias / `156` testes + `tests/rls/rls-policies.integration.test.ts`) · GitHub Actions (`.github/workflows/ci.yml`) | Pipeline automático de `typecheck`, `lint`, `test`, `next build` e `supabase start` + `test:rls`. |

---

## 2. Comunicação Entre Camadas

1. **Frontend → Supabase (PostgREST / Storage / Realtime Privado):**
   - `src/lib/supabase/client.ts` opera sob **RLS** + RPCs `SECURITY DEFINER` (`src/modules/*/*-service.ts`). Upload de imagens de chat vai para o bucket privado `chat-attachments` (máx. 5 MB).
   - Canais Realtime **privados** (`config: { private: true }`, autorizados por `codit_realtime_messages_*` em `realtime.messages`): `codit:conv:<conversationId>`, `codit:call:<conversationId>`, `codit:user-inbox:<userId>` e `codit:notifications:<userId>`.
2. **PostgreSQL → Realtime & Edge Function (`send-push`):**
   - `on_chat_message_inserted()` publica `message:notify` diretamente via `realtime.send(..., TRUE)` e `notify_incoming_call()` coordena chamadas recebidas.
   - Triggers `trg_notifications_push_edge` e `trg_chat_messages_push_edge` disparam `notify_push_edge_on_event()` via `pg_net` + Vault (`x-codit-webhook-secret`) para `POST /functions/v1/send-push` (FCM HTTP v1 `data-only`).
3. **Frontend ↔ Web Workers / Sandbox de Código:**
   - Web (`HTML/CSS/JS`): `<iframe sandbox="allow-scripts">` sem `allow-same-origin` (`sandbox-runner.ts`, `assert-runner.ts`), watchdog `4000ms`.
   - Python (`Pyodide WASM`): `public/workers/pyodide-runner.worker.js` + `src/modules/sandbox/pyodide-runner.ts` (Estúdio `/projetos`) e `src/modules/learning/pyodide-runner.ts` (Lições `/trilhas/licao`), com terminação dura do Worker em caso de loop infinito.
4. **Frontend ↔ Android (`window.CoditNative`) & Background `RemoteInput`:**
   - `src/lib/codit-native-bridge.ts` invoca `MainActivity.java` (insets/IME, `ScreenCaptureService`, `NativeSessionStore`, `CoditNotificationHelper`, `CallForegroundService`).
   - `NotificationActionReceiver` (`ACTION_DIRECT_REPLY`) envia `kind: "notification_reply"` para `send-push` usando JWT do `NativeSessionStore` mesmo sem WebView ativa.
5. **Frontend ↔ Tauri Desktop & Auto-Update:**
   - `src/lib/native-oauth.ts` usa `prepare_desktop_oauth` (`127.0.0.1:43823`) + `codit://oauth-callback`; `src/lib/app-updater.ts` verifica `latest.json` no GitHub Releases.

---

## 3. Árvore Detalhada de Diretórios Críticos

```text
TCC-Codit/
├── .github/workflows/ci.yml                     # Jobs quality + rls-integration (supabase start)
├── src/
│   ├── app/
│   │   ├── layout.tsx, globals.css, page.tsx, not-found.tsx, offline/page.tsx
│   │   ├── api/v1/health/route.ts               # Health check estático (v0.1.16)
│   │   ├── auth/{page,callback/page,native-callback/page}.tsx
│   │   ├── trilhas/{page,licao/page}.tsx        # Catálogo de trilhas JS/Python, correção, analytics e Octopy
│   │   ├── projetos/page.tsx                    # Estúdio Multi-Arquivo CodeMirror 6 (15 linguagens) + Sandbox Web & Pyodide
│   │   ├── comunidade/{page,perfil/page}.tsx    # Feed, busca @, bloqueio e denúncias
│   │   ├── mensagens/page.tsx                   # Chat rico, reações, busca, grupos e WebRTC
│   │   ├── conta/page.tsx                       # Perfil, aparência, portfólio e painel LGPD
│   │   └── privacidade/page.tsx                 # Política LGPD e direitos do titular
│   ├── modules/
│   │   ├── auth/, profiles/, theme/
│   │   ├── learning/      # learning-{schemas,service,analytics-service}.ts, assert-runner.ts, pyodide-runner.ts
│   │   ├── sandbox/       # sandbox-project-service.ts, sandbox-files.ts, prettier-formatter.ts, language-catalog.ts, sandbox-runner.ts, pyodide-runner.ts
│   │   ├── social/        # social-{schemas,service}.ts (amizades, likes, comments, blocks, reports)
│   │   ├── messaging/     # messaging-{schemas,service}.ts, voice-call-{manager,provider}, webrtc-media.ts
│   │   └── notifications/ # notifications-provider.tsx, notification-{service,schemas}.ts, push/system
│   ├── components/        # account/, auth/, brand/, home/, layout/, learning/, messaging/, native/, notifications/, observability/, onboarding/, projects/, pwa/, sandbox/, social/, telemetry/, ui/
│   ├── hooks/             # use-dialog-a11y.ts (pilha de modais, focus trap, Escape)
│   └── lib/               # app-toast.ts, app-updater.ts, codit-native-bridge.ts, desktop-updater.ts, env.ts, error-observability.ts, logger.ts, native-oauth.ts, navigation.ts, problem-details.ts, problem-response.ts, social-events.ts, use-is-online.ts, supabase/*, telemetry/error-reporter.ts
├── supabase/
│   ├── config.toml
│   ├── migrations/        # 18 arquivos SQL (20261122000001 .. 20261127000002)
│   └── functions/send-push/{index.ts,helpers.ts}
├── android/app/src/main/  # AndroidManifest.xml + java/com/codit/app/* (9 classes Java)
├── src-tauri/             # tauri.conf.json, Cargo.toml, src/{main,lib,oauth}.rs
├── public/                # sw.js, manifest.webmanifest, icons/, workers/pyodide-runner.worker.js
└── tests/                 # unit/ (31 suítes) + rls/rls-policies.integration.test.ts + mocks/
```

---

## 4. Índice de Navegação (Obsidian Router)

| Nota | O que documenta | Quando um agente deve ler |
| :--- | :--- | :--- |
| [[STATE]] | Status real (`0.1.16`), entregas das fases integradas, pendências remotas e próximos passos. | **Sempre no início** de qualquer tarefa. |
| [[Arquitetura]] | Padrões arquiteturais, ciclo de vida, Realtime privado, Pyodide Worker, CI, `.env` e `DEC-XXX`. | Ao planejar features, alterar build/CSP ou integrar novos módulos. |
| [[Backend]] | `/api/v1/health`, Edge Function `send-push`, Realtime broadcasts do banco, Storage `chat-attachments` e RPCs. | Ao alterar Edge Functions, triggers, Storage ou contratos de backend. |
| [[Frontend]] | 14 rotas App Router, providers, componentes (`learning`, `messaging`, `sandbox`, `ui`, `a11y`), caches e armadilhas CSS. | Ao criar/editar páginas, modais, estados React ou navegação. |
| [[Capacitor-Android]] | `capacitor.config.ts`, `build.gradle` (`versionCode 17`), `window.CoditNative`, permissões e diferenças WebView. | Ao mexer no Android nativo, push/chamadas mobile ou gerar `Codit-mobile.apk`. |
| [[Auth-Seguranca]] | OAuth PKCE Web/Tauri/Android, `NativeSessionStore`, RLS, canais privados, moderação, LGPD e CSP. | Ao alterar login, permissões, políticas RLS, privacidade ou headers/CSP. |
| [[Banco-Dados]] | 18 migrações SQL, schema das 20 tabelas, bucket `chat-attachments`, triggers, RLS e RPCs. | Antes de escrever queries, criar migrações ou atualizar `database.types.ts`. |
| [[Fluxos-Criticos]] | Sequências ponta a ponta: Auth, Trilhas/Pyodide/XP, Chat Rico + Push + `RemoteInput`, WebRTC, LGPD e Telemetria. | Ao depurar fluxos multi-camada. |
| [[design-system]] | Padrão visual `Warm Technical Craft`, 3 zonas de peso, regras anti-clichê, tipografia e temas/wallpapers. | Ao criar ou refatorar qualquer interface ou copy em `pt-BR`. |
