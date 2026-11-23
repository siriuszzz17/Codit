# Status e Progresso do Projeto — Codit (`TCC-Codit`)

> **Estado Atual:** **Fase 2 (Em andamento) — Integração client-side com Supabase (`@supabase/supabase-js`) implementada para autenticação (e-mail/senha + Google OAuth PKCE) e persistência em `profiles` e `sandbox_projects` com RLS, preservando exportação estática `out/` para Web/PWA, Tauri `.exe` e Capacitor `.apk`.**
> **Pendente para etapas seguintes:** catálogo curricular (`tracks`/`lessons`), sandbox de execução client-side (`iframe` + Pyodide) e proxy server-side do tutor Octopy.

| Campo | Valor |
| :--- | :--- |
| **Projeto** | Codit (`TCC-Codit`) |
| **Última atualização** | `2026-11-22` |
| **Documentos relacionados** | [GEMINI.md](../GEMINI.md) · [arquitetura.md](./arquitetura.md) · [banco-de-dados.md](./banco-de-dados.md) · [regras-negocio.md](./regras-negocio.md) |

---

## 1. Resumo Executivo (Estado Real Inspecionado)

| Aspecto | Situação Real | Detalhes |
| :--- | :--- | :--- |
| **Código da Aplicação** | **Fase 2 — Auth & Persistência Supabase** | Next.js `16.4.6` (exportação estática `out/`), React `19.3.1`, TypeScript strict (`5.9.3`), Tailwind CSS `4.3.5`, `@supabase/supabase-js` client-side (`src/lib/supabase/*`), rotas `/auth`, `/auth/callback` e `/conta`, módulos `src/modules/auth|profiles|sandbox`, Tauri v2, Capacitor 8 e suíte Vitest |
| **Toolchain Local (Desktop/Mobile)** | **Operacional (`.exe` e `.apk` compilados localmente)** | Node.js `v26.7.0`, `npm 11.19.0`, Rust/Cargo `1.100.0`, Visual Studio 18 Insiders (MSVC `14.52.37025` + Windows SDK `10.0.26100.0`), Edge WebView2 Runtime `157.0.4341.60`, Java JDK `21.0.12.1` e Android Studio / Android SDK (`Build-Tools 35.0.0`, `Platform android-36`) |
| **Banco de Dados** | **Supabase PostgreSQL + RLS (Migração Inicial Pronta)** | Migração SQL versionada em [supabase/migrations/20261122000001_init_profiles_and_sandbox_projects.sql](../supabase/migrations/20261122000001_init_profiles_and_sandbox_projects.sql) criando `public.profiles` e `public.sandbox_projects` com triggers e policies RLS (`auth.uid()`); configurar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` em `.env.local` |
| **Documentação Base** | **Sincronizada (Fase 2)** | `GEMINI.md`, `arquitetura.md`, `banco-de-dados.md`, `regras-negocio.md` e `status.md` atualizados com a integração Supabase |
| **Repositório Principal** | Ativo | `C:/Users/gusta/orca/projects/TCC-Codit` · branch `master` · remote `origin`: `https://github.com/siriuszzz17/Codit.git` |
| **Worktree Secundário Ativo** | Ativo (Orca) | `C:/Users/gusta/orca/workspaces/TCC-Codit/Fase2` · branch `siriuszzz17/Fase2` |

---

## 2. Roadmap do Projeto

### Fase 0 — Fundação e Documentação Inicial *(Concluída)*
- [x] Inicialização do repositório Git e conexão com GitHub (`siriuszzz17/Codit`)
- [x] Definição da visão completa do SaaS Codit, mascote/tutor **Octopy** e diretrizes de segurança/isolamento
- [x] Criação do guia rápido [GEMINI.md](../GEMINI.md) e da pasta `docs/` completa
- [x] Commit da documentação inicial (`b73c9e8`)

### Fase 1 — Decisões Técnicas Finais e Scaffold Base *(Concluída)*
- [x] Fechar decisões de autenticação e banco gerenciado (`DEC-003` e `DEC-004` via Supabase Auth + Supabase PostgreSQL RLS)
- [x] Criar projeto Next.js (App Router) + TypeScript `strict` + Tailwind CSS + configuração PWA (`manifest.webmanifest`, ícones e Service Worker)
- [x] Configurar `.env.example`, `.gitignore`, validação *fail-fast* de variáveis de ambiente, ESLint e estrutura de testes
- [x] Configurar empacotamento multiplataforma nativo sobre exportação estática (`out/`) com Tauri v2 (Windows `.exe` + `tauri-plugin-updater`) e Capacitor 8 (Android `.apk`)

### Fase 2 — Banco PostgreSQL, Autenticação e Isolamento por `user_id` *(Em andamento)*
- [x] Criar migração SQL inicial do Supabase (`public.profiles` e `public.sandbox_projects`) com triggers (`handle_new_user`, `prevent_profile_role_escalation`) e RLS (`auth.uid()`)
- [x] Implementar autenticação client-side via Supabase (e-mail/senha + Google OAuth 2.0 PKCE em `/auth` e `/auth/callback`) compatível com exportação estática (`out/`)
- [x] Implementar serviços tipados de perfil (`profiles`) e mini-projetos (`sandbox_projects` com lock otimista `version` e soft delete) na área `/conta`
- [ ] Aplicar migração e configurar Google OAuth no painel do projeto Supabase real + expandir schema para catálogo curricular (`tracks`, `lessons`, `user_lesson_progress`)

### Fase 3 — Trilhas Didáticas, Progresso e Sandbox MVP
- [ ] Construir interface Mobile-First em `pt-BR` para trilhas, módulos, lições e checklist de carreira
- [ ] Implementar persistência de progresso (`user_lesson_progress`) e submissões (`exercise_submissions`)
- [ ] Implementar Sandbox client-side isolado (HTML/CSS/JS em `iframe` sandboxed + Python via Pyodide Web Worker) integrado ao editor dos mini-projetos (`sandbox_projects`)

### Fase 4 — Tutor IA (`Octopy`) e Portfólio/Carreira
- [ ] Implementar proxy server-side `/api/v1/octopy/chat` (ou Supabase Edge Function / backend dedicado) com streaming SSE, cotas por `user_id`, prompt socrático e contingência estática
- [ ] Implementar trilha de carreira tech e visualização pública somente leitura de mini-projetos de portfólio

### Fase 5 — Expansão Multi-Linguagem, Auditoria e Entrega do TCC
- [ ] Integrar adaptador `CodeExecutionProvider` para linguagens adicionais via Judge0 CE / Piston
- [ ] Executar suíte completa de testes (`RN-XXX`), revisão OWASP/LGPD, testes PWA mobile e deploy de produção

---

## 3. Trabalho em Andamento

| Tarefa | Worktree / Branch | Status | Próximo Passo |
| :--- | :--- | :--- | :--- |
| Integração Supabase (`@supabase/supabase-js`) — Auth + `profiles` + `sandbox_projects` + OAuth Nativo Multiplataforma | `Fase2` (`siriuszzz17/Fase2`) | Implementada (Web, Tauri `.exe` loopback RFC 8252 e Android `.apk` Chrome Custom Tab + Deep Link) | Cadastrar `http://127.0.0.1:*/auth/callback` e `com.codit.app://auth/callback` em Redirect URLs no painel Supabase, corrigir URL raiz em `.env.local` e regenerar `.exe`/`.apk` |

---

## 4. Decisões Técnicas (`DEC-XXX`)

| ID | Tema | Status / Escolha | Documento Impactado |
| :--- | :--- | :--- | :--- |
| `DEC-001` | ORM complementar para catálogo/migrações avançadas | Em análise (Prisma vs. Drizzle vs. Supabase CLI/SQL puro) | [arquitetura.md](./arquitetura.md), [banco-de-dados.md](./banco-de-dados.md) |
| `DEC-002` | Provedor de IA primário e secundário para o Octopy | Em aberto (Gemini API vs. OpenAI API e estratégia de fallback) | [arquitetura.md](./arquitetura.md) |
| `DEC-003` | Autenticação e gestão de sessão | **Resolvida (2026-11-22):** `@supabase/supabase-js` client-side (e-mail/senha + Google OAuth 2.0 PKCE) para manter compatibilidade com exportação estática `out/` | [arquitetura.md](./arquitetura.md) |
| `DEC-004` | Provedor PostgreSQL gerenciado e RLS nativo | **Resolvida (2026-11-22):** Supabase PostgreSQL com Row-Level Security (`auth.uid()`) e migrações SQL versionadas em `supabase/migrations/` | [arquitetura.md](./arquitetura.md), [banco-de-dados.md](./banco-de-dados.md) |

---

## 5. Riscos Ativos

| ID | Severidade | Risco | Mitigação Planejada |
| :--- | :--- | :--- | :--- |
| `RISK-001` | Alta | Vazamento de dados entre usuários (IDOR) em progresso, projetos ou histórico do Octopy | Filtro obrigatório `user_id` da sessão no servidor + RLS no PostgreSQL + testes automatizados de acesso cruzado |
| `RISK-002` | Alta | Execução insegura de código de alunos (XSS / RCE) | MVP 100% client-side (`iframe` sem `allow-same-origin` + Web Worker Pyodide); expansão futura apenas em sandbox remoto isolado |
| `RISK-003` | Média | Custo ou indisponibilidade da API de IA do Octopy | Proxy server-side com rate limit por `user_id`, fallback de modelo e dicas estáticas pré-curadas por exercício |

---

## 6. Changelog

- **`2026-11-22`:**
  - `7815ce3`: Commit inicial do repositório `TCC-Codit`.
  - `0ac8955`: Bootstrap inicial da estrutura de arquivos `GEMINI.md` e `docs/`.
  - `b73c9e8`: Consolidação completa da visão do SaaS **Codit**, mascote/tutor IA **Octopy**, experiência Web Mobile-First + PWA, stack TypeScript/Next.js/Tailwind/PostgreSQL, Sandbox client-side + expansão Judge0/Piston e isolamento estrito por `user_id` em `GEMINI.md` e `docs/*.md`.
  - `d5a91a5`: Scaffold inicial da aplicação Next.js `16.4.6` (App Router), React `19.3.1`, TypeScript `strict` (`5.9.3`), Tailwind CSS `4.3.5`, suporte a PWA (`public/manifest.webmanifest`, `public/sw.js`, `public/icons/*`, registro de Service Worker, banner offline e página `/offline`), `.env.example`, `.gitignore`, base server-side (`src/lib/env.ts`, `src/lib/problem-details.ts`, `src/lib/logger.ts`), endpoint `GET /api/v1/health` e testes unitários Vitest (`tests/unit/*`).
  - **SetupTauri (setup multiplataforma):** Configurado empacotamento multiplataforma nativo sobre uma única base TypeScript: `next.config.ts` adaptado para exportação estática em `out/` (`output: "export"`, `images: { unoptimized: true }`) mantendo `npm run dev` com headers de segurança e suporte futuro a `CODIT_BUILD_TARGET=server`; `GET /api/v1/health` ajustado para `force-static`; guarda em `ServiceWorkerRegister` para não registrar `sw.js` em shells nativos; Tauri v2 inicializado em `src-tauri/` (`com.codit.app`, janela `Codit`, `frontendDist: "../out"`, `devUrl: "http://localhost:3000"`, ícones gerados e `tauri-plugin-updater` + `tauri-plugin-process` + `src/lib/desktop-updater.ts` pré-configurados); chaves do Tauri movidas para fora do repositório (`C:/Users/gusta/.tauri/codit.key` e `codit.key.pub`), regra `*.key` adicionada ao `.gitignore` e `plugins.updater.pubkey` preenchida em `src-tauri/tauri.conf.json`; Capacitor 8 inicializado em `capacitor.config.ts` e `android/` (`com.codit.app`, `Codit`, `webDir: "out"`) com sincronização Android via `npm run android:sync`; compilados `codit.exe`, instaladores NSIS/MSI e `app-debug.apk`.
  - **SetupTauri (`v0.1.1`):** Implementado o verificador multiplataforma de atualizações (`src/lib/app-updater.ts`, `src/components/native/app-update-modal.tsx`, montado em `src/app/layout.tsx`) com `NEXT_PUBLIC_APP_VERSION` exposta em `next.config.ts`, versão elevada para `0.1.1` (`versionCode 2` / `versionName "0.1.1"` em `android/app/build.gradle`, `tauri.conf.json`, `Cargo.toml` e `/api/v1/health`), usando `tauri-plugin-updater` no Windows (com barra de progresso e reinício automático) e `CapacitorHttp` nativo + fallback GitHub REST API no Android, além de suíte de testes unitários em `tests/unit/app-updater.test.ts` e atualização de `docs/arquitetura.md`.
  - **Fase2 (Integração Supabase Client-Side):** Instalado `@supabase/supabase-js` (`^2.119.2`), atualizados `.env.example` (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`) e migração SQL em `supabase/migrations/20261122000001_init_profiles_and_sandbox_projects.sql` (`public.profiles` e `public.sandbox_projects` com triggers e RLS); criada camada `src/lib/supabase/*`, serviços `src/modules/auth/*`, `src/modules/profiles/*` e `src/modules/sandbox/*`, tela responsiva de Login/Cadastro (`/auth`) com identidade Codit + Octopy e Google OAuth PKCE (`/auth/callback`), área autenticada `/conta` exercitando persistência em `profiles` e `sandbox_projects`, testes unitários Vitest e atualização de `docs/arquitetura.md`, `docs/banco-de-dados.md` e `docs/status.md`, mantendo `npm run build` (`output: "export"`) operacional.
- **`2026-11-23`:**
  - **Fase2 (`v0.1.2` — Google OAuth Nativo Multiplataforma — RFC 8252):** Corrigido retorno OAuth fora do app no Android e bloqueio na WebView2 no Windows: implementado listener loopback local no backend Tauri (`src-tauri/src/oauth.rs` + `tauri-plugin-opener` abrindo navegador padrão em `127.0.0.1:43823/auth/callback` e emitindo `codit://oauth-callback` com testes Rust); configurados `@capacitor/browser`, `@capacitor/app` e `<intent-filter>` de Deep Link `com.codit.app://auth/callback` em `android/app/src/main/AndroidManifest.xml`; adicionados `src/lib/native-oauth.ts`, proteção de URL raiz em `src/lib/supabase/config.ts`, fallback PKCE em `/auth/callback`, botão de cancelamento de espera externa em `AuthScreen`, ajuste de `emailRedirectTo` por plataforma, suíte `tests/unit/native-oauth.test.ts` e elevação da versão para `0.1.2` (`versionCode 3` no Android).
