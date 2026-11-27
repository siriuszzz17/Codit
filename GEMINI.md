# GEMINI.md — Guia Rápido e Constituição do Projeto Codit

> **Estado atual (`v0.1.18`):** UI Remake (`Warm Technical Craft`) + Temas/Papéis de Parede (`src/modules/theme/`) + **Trilhas Práticas (`/trilhas`, `/trilhas/licao`) com JavaScript (runner estrito CSP sem `eval`/`new Function` + precisão IEEE 754) e Python (Pyodide WASM Web Worker unificado, watchdog 5s + precisão IEEE 754), enunciados em Markdown sanitizado (`LessonMarkdownBlocks`), Assistente IA Socrático do Octopy (`LessonAiAssistant` + Edge Function `lesson-ai-tutor`, máx. 3 interações/lição, `DEC-002`), `failed_case_ids`, funil analítico (`LearningAnalyticsDrawer`) e Gamificação (XP, streak, badges)** + **Estúdio Multi-Arquivo com CodeMirror 6 (`/projetos`) para 15 linguagens com abas `index.html`/`styles.css`/`script.js`, auto-save com lock otimista (1.5s), histórico/restauração de versões (`sandbox_project_versions`), formatação Prettier sob demanda (`Shift+Alt+F`), atalho `Ctrl+Enter`, handshake `ping`/`ready` e execução client-side Web (`iframe`) e Python (`Pyodide`)** + **Comunidade Codit (`@username`, amizades, bloqueio bilateral e denúncias)** + **Mensagens Ricas (`/mensagens`: código, imagens no Storage `chat-attachments`, projetos, reações, busca, grupos até 10 pessoas e chamadas WebRTC de voz, vídeo e tela)** + **Notificações + Push Android FCM HTTP v1 com `RemoteInput` e canais Realtime privados** + **Conformidade LGPD (`/privacidade`, aceite de termos, exportação e exclusão de conta)** + **Telemetria/Observabilidade sanitizada, Analytics de aprendizado e CI GitHub Actions (`quality` + `rls-integration`)** — empacotados para Web/PWA, Tauri v2 (`.exe` assinado) e Capacitor 8 Android (`Codit-mobile.apk`, `versionCode 19`). **Pendente:** provedor remoto Judge0/Piston para linguagens compiladas e deploy remoto das migrações/Edge Functions no Supabase de produção.

## 1. Visão Geral e Stack Real
- **Produto:** **Codit** — plataforma SaaS educacional Web Responsiva Mobile-First + PWA instalável, Desktop Windows e Android, para ensinar programação, IA, Git/GitHub, boas práticas e carreira tech.
- **Mascote / Tutor:** **Octopy** — polvo roxo guia visual e Assistente IA Socrático via Edge Function autenticada `lesson-ai-tutor` (`Gemini`/`OpenAI`, máx. 3 interações/lição).
- **Stack:** Next.js `16.4.6` (App Router + `output: "export"`), React `19.3.1`, TypeScript `5.9.3` (`strict`), Tailwind CSS `4.3.5`, Zod `4.6.7`, Supabase (Auth PKCE, PostgreSQL + RLS, Realtime privado, Storage, Edge Function `send-push`), Tauri v2 e Capacitor 8.
- **Execução Isolada de Código:** HTML/CSS/JS em `<iframe sandbox="allow-scripts">` (sem `allow-same-origin`) e Python em **Pyodide WebAssembly Web Worker** (`public/workers/pyodide-runner.worker.js` + `src/modules/learning/pyodide-runner.ts`), zero execução no servidor principal.

## 2. Padrão de Nomenclatura e Idioma
- **Inglês:** código-fonte, identificadores, arquivos técnicos, rotas/APIs (`/api/v1/...`), tabelas e colunas (`snake_case`).
- **Português (`pt-BR`):** interface do usuário (UI), mensagens exibidas ao aluno, documentação e conteúdo didático (trilhas, lições, exercícios e dicas do Octopy).

## 3. Regras Críticas de Segurança e Isolamento
1. **Isolamento rigoroso por `user_id`:** Todo dado privado exige coluna `user_id`, guarda de sessão (`session-guard.ts`) e Row-Level Security (`auth.uid()`) no PostgreSQL, além de canais Realtime privados (`codit_realtime_messages_*`).
2. **Segredos somente no servidor:** Chaves de IA, Google OAuth, `DATABASE_URL` e Firebase Service Account ficam apenas em `.env` server-side ou Supabase Secrets — **nunca** em `NEXT_PUBLIC_*`, no client-side ou no Git.
3. **Zero execução arbitrária no servidor principal:** Código de alunos roda exclusivamente em `iframe` isolado ou Web Worker WASM (Pyodide).
4. **Padrão de produção:** Código estritamente tipado, validação Zod na borda, erros padronizados (RFC 9457 + toasts acessíveis), controle de concorrência otimista (`version`) e suítes Vitest (`npm run test` + `npm run test:rls`).

## 4. Comandos Básicos
- **Git / Worktrees (Orca):**
  - `git status -sb` · `git log -n 5 --oneline`
  - Worktree principal (`master`): `<repo-root>` — **nunca** execute `git checkout master` em worktrees secundários.
  - Commits no padrão **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- **Aplicação:** `npm run dev` · `npm run lint` · `npm run typecheck` · `npm run test` · `npm run test:rls` · `npm run build` · `npm run tauri:dev` · `npm run tauri:build` · `npm run android:sync` · `npm run android:open`.

## 5. Diretrizes Permanentes de UI & Design System
- **Estética Oficial ("Warm Technical Craft"):** consultar obrigatoriamente [docs/design-system.md](./docs/design-system.md) antes de criar ou alterar telas.
- **Regras de Composição:** cabeçalhos de página abertos, formulários longos em abas curtas, zero `eyebrows` ALL-CAPS, zero setas `→` em botões/links, foco/a11y em modais (`useDialogA11y`) e `pt-BR` direto.
- **Temas e Papéis de Parede Leves:** camadas CSS/SVG inline em `src/modules/theme/*` e 4 colunas curtas em `public.profiles`.

## 6. Índice da Documentação (`docs/` — Cérebro Obsidian)

| Documento | Conteúdo |
| :--- | :--- |
| [docs/INDEX.md](./docs/INDEX.md) | Roteador mestre da arquitetura, stack, árvore crítica e grafo `[[wikilinks]]` |
| [docs/STATE.md](./docs/STATE.md) | Estado real do build (`0.1.18`), entregas concluídas, pendências e próximos passos |
| [docs/Arquitetura.md](./docs/Arquitetura.md) | Padrões arquiteturais, ciclo de vida, variáveis `.env`, URLs/portas e `DEC-XXX` |
| [docs/Backend.md](./docs/Backend.md) | `/api/v1/health`, Edge Functions `send-push` e `lesson-ai-tutor`, Realtime privado, Storage e RPCs |
| [docs/Banco-Dados.md](./docs/Banco-Dados.md) | 19 migrações SQL, 20 tabelas PostgreSQL, índices, triggers, RLS e RPCs |
| [docs/Frontend.md](./docs/Frontend.md) | 14 rotas App Router, providers, componentes, caches, a11y e armadilhas de UI |
| [docs/Capacitor-Android.md](./docs/Capacitor-Android.md) | Capacitor 8 (`versionCode 19`), `window.CoditNative`, permissões e build APK |
| [docs/Auth-Seguranca.md](./docs/Auth-Seguranca.md) | OAuth PKCE Web/Tauri/Android, `NativeSessionStore`, RLS, LGPD, moderação e CSP |
| [docs/Fluxos-Criticos.md](./docs/Fluxos-Criticos.md) | Fluxos ponta a ponta (Auth, Trilhas/Pyodide, Chat Rico/Push, WebRTC, LGPD) |
| [docs/design-system.md](./docs/design-system.md) | Padrão visual permanente, 3 zonas de peso, tipografia e temas/papéis de parede |

> **Sincronização obrigatória:** Sempre leia `docs/INDEX.md` antes de buscar no repositório e atualize o `.md` correspondente em `docs/` + `docs/STATE.md` a cada entrega.
