# Status e Progresso do Projeto — Codit (`TCC-Codit`)

> **Estado Atual:** **Fase 3 & Fase 4 integradas — Barra de navegação global superior (`TopNavbar`) com ícone dedicado de Amizades (`FriendshipsDrawer`), página exclusiva `/projetos` para desenvolvimento no Estúdio de 15 linguagens & Sandbox `iframe` isolado, página `/comunidade` focada em feed de mini-projetos/curtidas/comentários/clonagem e busca por `@username`, e página `/conta` dedicada ao perfil personalizável, mantendo RLS e exportação estática `out/`.**
> **Pendente para etapas seguintes:** executar as migrações pendentes no SQL Editor do projeto Supabase real ([20261123000001_enhance_profiles_and_projects.sql](../supabase/migrations/20261123000001_enhance_profiles_and_projects.sql) e [20261123000003_fix_grants_rls_and_username_cooldown.sql](../supabase/migrations/20261123000003_fix_grants_rls_and_username_cooldown.sql)), configurar Custom SMTP + Redirect URLs no painel Supabase Auth, catálogo curricular (`tracks`/`lessons`), execução Python via Pyodide Web Worker e proxy server-side do tutor Octopy.

| Campo | Valor |
| :--- | :--- |
| **Projeto** | Codit (`TCC-Codit`) |
| **Última atualização** | `2026-11-23` |
| **Documentos relacionados** | [GEMINI.md](../GEMINI.md) · [arquitetura.md](./arquitetura.md) · [banco-de-dados.md](./banco-de-dados.md) · [regras-negocio.md](./regras-negocio.md) |

---

## 1. Resumo Executivo (Estado Real Inspecionado)

| Aspecto | Situação Real | Detalhes |
| :--- | :--- | :--- |
| **Código da Aplicação** | **Fase 2 — Auth, Persistência & Comunidade** | Next.js `16.4.6` (exportação estática `out/`), React `19.3.1`, TypeScript strict (`5.9.3`), Tailwind CSS `4.3.5`, `@supabase/supabase-js` client-side (`src/lib/supabase/*`), rotas `/auth`, `/auth/callback`, `/projetos`, `/comunidade`, `/comunidade/perfil` e `/conta`, `TopNavbar` global com `FriendshipsDrawer`, módulos `src/modules/auth|profiles|sandbox|social`, Tauri v2, Capacitor 8 e suíte Vitest |
| **Toolchain Local (Desktop/Mobile)** | **Operacional (`.exe` e `.apk` compilados localmente)** | Node.js `v26.7.0`, `npm 11.19.0`, Rust/Cargo `1.100.0`, Visual Studio 18 Insiders (MSVC `14.52.37025` + Windows SDK `10.0.26100.0`), Edge WebView2 Runtime `157.0.4341.60`, Java JDK `21.0.12.1` e Android Studio / Android SDK (`Build-Tools 35.0.0`, `Platform android-36`) |
| **Banco de Dados** | **Supabase PostgreSQL + RLS (Migrações Versionadas)** | Migrações em [20261122000001_init_profiles_and_sandbox_projects.sql](../supabase/migrations/20261122000001_init_profiles_and_sandbox_projects.sql), [20261123000001_enhance_profiles_and_projects.sql](../supabase/migrations/20261123000001_enhance_profiles_and_projects.sql), [20261123000002_add_social_network.sql](../supabase/migrations/20261123000002_add_social_network.sql) e [20261123000003_fix_grants_rls_and_username_cooldown.sql](../supabase/migrations/20261123000003_fix_grants_rls_and_username_cooldown.sql) |
| **Documentação Base** | **Sincronizada (Fase 2)** | `GEMINI.md`, `arquitetura.md`, `banco-de-dados.md`, `regras-negocio.md` e `status.md` atualizados com a integração Supabase |
| **Repositório Principal** | Ativo | `C:/Users/gusta/orca/projects/TCC-Codit` · branch `master` · remote `origin`: `https://github.com/siriuszzz17/Codit.git` |
| **Worktree Secundário Ativo** | Ativo (Orca) | `C:/Users/gusta/orca/workspaces/TCC-Codit/Fase3` · branch `siriuszzz17/Fase3` |

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

### Fase 3 — Trilhas Didáticas, Progresso e Sandbox MVP *(Em andamento)*
- [x] Implementar migração SQL `20261123000001_enhance_profiles_and_projects.sql` e experiência `/conta` com perfil personalizável (capas, temas, molduras, humor do Octopy, habilidades e links) + projetos funcionais com ícones SVG de 15 linguagens, filtros, fixação e fallback resiliente
- [x] Implementar Sandbox client-side isolado (`iframe sandbox="allow-scripts"` + ponte de console + watchdog 4s) integrado ao Estúdio de Mini-Projetos (`sandbox_projects`) para HTML/CSS/JS, HTML5, CSS3 e JavaScript
- [ ] Construir interface Mobile-First em `pt-BR` para trilhas, módulos, lições e checklist de carreira
- [ ] Implementar persistência de progresso (`user_lesson_progress`) e submissões (`exercise_submissions`)
- [ ] Integrar execução Python client-side via Pyodide Web Worker ao Estúdio e lições práticas

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
| Integração Supabase (`@supabase/supabase-js`) — Auth + `profiles` + `sandbox_projects` + OAuth Nativo Multiplataforma | `Fase2` (`siriuszzz17/Fase2`) | Implementada (Web, Tauri `.exe` loopback RFC 8252, Android `.apk` com ponte `/auth/native-callback` -> `intent://` / Deep Link, confirmação `token_hash` e reenvio com rate limit) | Fazer merge/deploy do `/auth/native-callback` na Vercel (`codit-omega.vercel.app`) e regenerar o `Codit-mobile.apk` |
| Perfil personalizável + Estúdio Sandbox 15 linguagens | `Fase3` → `master` | Integrada no `master` | Executar [20261123000001_enhance_profiles_and_projects.sql](../supabase/migrations/20261123000001_enhance_profiles_and_projects.sql) no SQL Editor do painel Supabase |
| Rede Social Embutida (`Comunidade Codit`) — `@username`, amizades, feed e visualização de projetos | `Fase4` (`siriuszzz17/Fase4`) | Atualizada com correção de `GRANT`s SQL, diagnóstico detalhado de erros e cooldown de 30 dias em `@username` | Executar [20261123000003_fix_grants_rls_and_username_cooldown.sql](../supabase/migrations/20261123000003_fix_grants_rls_and_username_cooldown.sql) após a `20261123000001` no SQL Editor do painel Supabase |

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
  - **Identidade Visual (Octopy Pixel-Art + Ícone Multiplataforma + `Codit-mobile.apk`):** Substituído o mascote Octopy pelo novo design em pixel-art (`public/icons/octopy-{default,coding,headphones,happy}.png`, `public/icons/octopy-mark.svg` e `OctopyBadge` com suporte a variantes em `src/app/page.tsx` e `src/components/auth/auth-screen.tsx`); atualizado o ícone oficial do Codit em Web/PWA (`public/icons/*`, `public/manifest.webmanifest`, `public/sw.js`), Desktop Tauri (`src-tauri/icons/*`) e Android (`android/app/src/main/res/mipmap-*` e `ic_launcher_background.xml`); configurado `outputFileName = "Codit-mobile.apk"` em `android/app/build.gradle`, publicado o `Codit-mobile.apk` (`v0.1.2`) no GitHub (`v0.1.2`, `v0.1.1` e `Arquivos` com `latest.json` atualizado) e compilado localmente `Codit_0.1.2_x64-setup.exe` pronto para assinatura do updater.
  - **Fase 3 (Perfil Personalizável + Estúdio de Projetos com Ícones e Sandbox Isolado):** Criada migração idempotente `supabase/migrations/20261123000001_enhance_profiles_and_projects.sql` expandindo `public.profiles` (`headline`, `location`, `website_url`, `linkedin_url`, `banner_preset`, `accent_theme`, `avatar_frame`, `octopy_companion`, `skills`, `show_email`) e `public.sandbox_projects` (15 linguagens, `is_pinned`, `tags`, `repository_url`, `live_url`); implementados catálogo `language-catalog.ts` com ícones SVG inline (`LanguageIcon`, `LanguageBadge`), catálogo de temas `profile-themes.ts`, runner isolado `sandbox-runner.ts` + `SandboxPreview` (`iframe sandbox="allow-scripts"` sem `allow-same-origin` + watchdog 4s), fallback resiliente para bancos ainda na Fase 2 em `profile-service.ts` e `sandbox-project-service.ts`, nova UI `/conta` (`ProfileHeroCard`, `ProfileCustomizerPanel`, `ProjectsShowcasePanel`, `ProjectStudioModal`), avatar no header (`AuthHeaderControls`), permissão CSP para `https://avatars.githubusercontent.com` e novos testes unitários Vitest.
  - **Fase4 (`Comunidade Codit` — Rede Social Embutida):** Criada migração SQL idempotente [supabase/migrations/20261123000002_add_social_network.sql](../supabase/migrations/20261123000002_add_social_network.sql) (`profiles.username`, `public_profiles` sem PII, `friendships` com par único simétrico, visibilidade `friends` em `sandbox_projects`, `project_likes`, `project_comments` e funções RLS); implementado módulo `src/modules/social/` (`social-schemas.ts`, `social-service.ts`), UI mobile-first (`CommunityHub`, `PublicProfileView`, `ProjectViewerModal` com prévia HTML isolada `RN-201`, `FriendshipActionButton`, `UserAvatar`), rotas estáticas `/comunidade` e `/comunidade/perfil`, edição de `@usuário` em `/conta` e cadastro opcional em `/auth`, além de suíte unitária e sincronização de `docs/`.
  - **Integração Fase 3 + Fase 4 (`v0.1.3`):** Mescladas as branches `siriuszzz17/Fase3` e `siriuszzz17/Fase4` no `master` preservando todos os recursos de perfil personalizável, estúdio de 15 linguagens com Sandbox isolado e rede social Comunidade Codit (`@usuário` no `ProfileCustomizerPanel` e `ProfileHeroCard`, visibilidade `friends` no `ProjectStudioModal` e `ProjectsShowcasePanel`, avatar curado Octopy em `UserAvatar` e `AuthHeaderControls`, catálogo unificado de 15 linguagens em `SANDBOX_LANGUAGE_LABELS`); versão elevada para `0.1.3` (`versionCode 4` no Android) com builds `.exe`, `Codit-mobile.apk` e `latest.json` publicados no GitHub Releases.
  - **Diagnóstico e Correção (`Fase4` — Permissões SQL `GRANT`, Confirmação de E-mail e Cooldown de `@username`):** Criada migração idempotente [20261123000003_fix_grants_rls_and_username_cooldown.sql](../supabase/migrations/20261123000003_fix_grants_rls_and_username_cooldown.sql) concedendo `GRANT`s de menor privilégio para `anon` e `authenticated` mantendo RLS ativo, corrigindo backfill e adicionando `profiles.username_changed_at` com validação no banco para 1ª definição imediata do `@` e intervalo mínimo de 30 dias + bloqueio anti-impersonação (`is_reserved_or_impersonation_username`); aprimorados mapeamento diagnóstico (`errors.ts`), guarda de sessão (`session-guard.ts`), fluxo de confirmação/reenvio com rate limit (`resendSignUpConfirmationEmail`, callback `verifyOtp` via `token_hash`, detecção de conta pré-existente e UI em `AuthScreen`), banner específico de `GRANT` ausente e testes unitários completos (`tests/unit/*`).
  - **Release `v0.1.4` (`Fase4` integrada à `master`):** Versão elevada para `0.1.4` (`versionCode 5` no Android) incorporando todas as correções da `Fase4` (`GRANT`s SQL + RLS, guarda de sessão, confirmação/reenvio de e-mail via `token_hash`, diagnóstico de erros e cooldown de 30 dias em `@username`), com publicação dos instaladores Windows (`.exe` assinado), `Codit-mobile.apk` e `latest.json` no GitHub Releases.
  - **Reorganização de Navegação & UX (`Fase4`):** Adicionada barra superior persistente global ([TopNavbar](../src/components/layout/top-navbar.tsx)) com ícone dedicado de Amizades e painel lateral ([FriendshipsDrawer](../src/components/social/friendships-drawer.tsx)) com badge de solicitações pendentes, criada página exclusiva de desenvolvimento em [/projetos](../src/app/projetos/page.tsx) ([ProjectsWorkspace](../src/components/projects/projects-workspace.tsx)), separada [/comunidade](../src/app/comunidade/page.tsx) exclusivamente para feed/descoberta por `@usuário`, focada [/conta](../src/app/conta/page.tsx) em perfil/personalização e adicionados testes unitários em [navigation.test.ts](../tests/unit/navigation.test.ts).
  - **Release `v0.1.6` (Fase2 OAuth Android + UI mobile + fix 23502):** Versao elevada para `0.1.6` (`versionCode 7`) integrando na `master` a ponte HTTPS `/auth/native-callback` da `Fase2` (retorno OAuth no Android), os ajustes de UI mobile da `Fase4` (barras de sistema `SystemBarsSync`, `values-night/styles.xml`, studio de projetos) e a correcao do erro `23502` no INSERT de `sandbox_projects` (fallback legado envia `language`/`code`; migracao SQL recomendada: `ALTER COLUMN language/code DROP NOT NULL`). Instaladores `.exe` assinado, `Codit-mobile.apk` e `latest.json` publicados no GitHub Releases.
  - **Release `v0.1.5` (Navegação Global, Drawer de Amizades e `/projetos`):** Versão elevada para `0.1.5` (`versionCode 6` no Android) integrando a reorganização de navegação e UX da `Fase4` à `master`, com publicação dos instaladores Windows (`.exe` assinado), `Codit-mobile.apk` e `latest.json` no GitHub Releases.
  - **Shell Mobile, Safe-Area & Edge-to-Edge Android:** Corrigida sobreposição da UI atrás da câmera frontal (*notch*), barra de status (Wi-Fi/hora) e barra de gestos no Android (`EdgeToEdge.enable(this)` em `MainActivity.java`, `windowLayoutInDisplayCutoutMode = shortEdges` em `values/styles.xml` e `values-night/styles.xml`, `plugins.SystemBars` em `capacitor.config.ts` e `SystemBarsSync` sincronizado ao tema do sistema); adicionados tokens CSS `--codit-safe-*` em `globals.css`, barra fixa inferior no mobile em `TopNavbar`, cabeçalho compacto, scroll-lock e safe-area em `FriendshipsDrawer`, `ProjectStudioModal` (tela cheia no mobile com rodapé fixo), `ProjectViewerModal` e `AppUpdateModal`, além da ordem mobile-first do formulário em `AuthScreen` e melhorias de ergonomia em `/`, `/projetos`, `/conta` e `/auth/callback`.
  - **Fase2 (Ponte HTTPS `/auth/native-callback` sobre `v0.1.5` para retorno OAuth no Android):** Diagnosticado que `/auth/native-callback` ainda não estava publicado na Vercel (HTTP 404) e o APK `v0.1.5` enviava `com.codit.app://auth/callback`, rejeitado na allowlist do Supabase com fallback para `https://codit-omega.vercel.app/`. Reaplicada e integrada à base `v0.1.5` a rota estática `/auth/native-callback` (`src/app/auth/native-callback/page.tsx`) isolada de `TopNavbar` (`src/lib/navigation.ts`), `AuthProvider` (`src/modules/auth/auth-provider.tsx`) e `detectSessionInUrl` (`src/lib/supabase/client.ts`), preservando o `code` PKCE e redirecionando via `intent://auth/callback?...#Intent;scheme=com.codit.app;package=com.codit.app;...` / `com.codit.app://auth/callback`, com atualização de `src/lib/native-oauth.ts`, `src/modules/auth/auth-schemas.ts` e testes unitários em `navigation.test.ts` e `native-oauth.test.ts`.
