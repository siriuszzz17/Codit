# Status e Progresso do Projeto — Codit (`TCC-Codit`)

> **Estado Atual:** **Fase 1 (Em andamento) — Base inicial Next.js + TypeScript + Tailwind CSS + PWA criada.**
> **Autenticação, banco de dados PostgreSQL, ORM, sandbox de código e proxy do tutor Octopy ainda não foram implementados.**

| Campo | Valor |
| :--- | :--- |
| **Projeto** | Codit (`TCC-Codit`) |
| **Última atualização** | `2026-11-22` |
| **Documentos relacionados** | [GEMINI.md](../GEMINI.md) · [arquitetura.md](./arquitetura.md) · [banco-de-dados.md](./banco-de-dados.md) · [regras-negocio.md](./regras-negocio.md) |

---

## 1. Resumo Executivo (Estado Real Inspecionado)

| Aspecto | Situação Real | Detalhes |
| :--- | :--- | :--- |
| **Código da Aplicação** | **Base inicial criada (Fase 1)** | Next.js `16.4.6` (App Router), React `19.3.1`, TypeScript strict (`5.9.3`), Tailwind CSS `4.3.5`, suporte PWA (`/manifest.webmanifest`, `/sw.js`, `/offline`, ícones), `src/lib/*` (`env.ts`, `problem-details.ts`, `logger.ts`), `GET /api/v1/health` e testes Vitest (sem auth/banco/sandbox/Octopy) |
| **Banco de Dados** | **Não provisionado** | Apenas modelagem conceitual/dicionário documentados em [banco-de-dados.md](./banco-de-dados.md); ORM e provedor pendentes em `DEC-001` e `DEC-004` |
| **Documentação Base** | **Sincronizada (Fase 1)** | `GEMINI.md` + `arquitetura.md`, `banco-de-dados.md`, `regras-negocio.md` e `status.md` atualizados com o estado da fundação |
| **Repositório Principal** | Ativo | `C:/Users/gusta/orca/projects/TCC-Codit` · branch `master` · remote `origin`: `https://github.com/siriuszzz17/Codit.git` |
| **Worktree Secundário Ativo** | Ativo (Orca) | `C:/Users/gusta/orca/workspaces/TCC-Codit/BaseSetup` · branch `siriuszzz17/BaseSetup` |

---

## 2. Roadmap do Projeto

### Fase 0 — Fundação e Documentação Inicial *(Concluída)*
- [x] Inicialização do repositório Git e conexão com GitHub (`siriuszzz17/Codit`)
- [x] Definição da visão completa do SaaS Codit, mascote/tutor **Octopy** e diretrizes de segurança/isolamento
- [x] Criação do guia rápido [GEMINI.md](../GEMINI.md) e da pasta `docs/` completa
- [x] Commit da documentação inicial (`b73c9e8`)

### Fase 1 — Decisões Técnicas Finais e Scaffold Base *(Em andamento)*
- [ ] Fechar decisões `DEC-001` a `DEC-004` (ORM, biblioteca de Auth, provedor LLM do Octopy, ambiente PostgreSQL)
- [x] Criar projeto Next.js (App Router) + TypeScript `strict` + Tailwind CSS + configuração PWA (`manifest.webmanifest`, ícones e Service Worker)
- [x] Configurar `.env.example`, `.gitignore`, validação *fail-fast* de variáveis de ambiente, ESLint e estrutura de testes

### Fase 2 — Banco PostgreSQL, Autenticação e Isolamento por `user_id`
- [ ] Provisionar PostgreSQL e implementar migrações iniciais de `users`, `auth_accounts`, `user_sessions` e catálogo curricular
- [ ] Implementar autenticação tradicional (`Argon2id`/`bcrypt`) + Google OAuth 2.0 (PKCE + `state` + vinculação segura)
- [ ] Implementar middleware/guard de sessão, proteção anti-IDOR por `user_id` e políticas RLS

### Fase 3 — Trilhas Didáticas, Progresso e Sandbox MVP
- [ ] Construir interface Mobile-First em `pt-BR` para trilhas, módulos, lições e checklist de carreira
- [ ] Implementar persistência de progresso (`user_lesson_progress`) e submissões (`exercise_submissions`)
- [ ] Implementar Sandbox client-side isolado (HTML/CSS/JS em `iframe` sandboxed + Python via Pyodide Web Worker) e CRUD de mini-projetos (`sandbox_projects`, `sandbox_files`) com lock otimista

### Fase 4 — Tutor IA (`Octopy`) e Portfólio/Carreira
- [ ] Implementar proxy server-side `/api/v1/octopy/chat` com streaming SSE, cotas por `user_id`, prompt socrático e contingência estática
- [ ] Implementar trilha de carreira tech e visualização pública somente leitura de mini-projetos de portfólio

### Fase 5 — Expansão Multi-Linguagem, Auditoria e Entrega do TCC
- [ ] Integrar adaptador `CodeExecutionProvider` para linguagens adicionais via Judge0 CE / Piston
- [ ] Executar suíte completa de testes (`RN-XXX`), revisão OWASP/LGPD, testes PWA mobile e deploy de produção

---

## 3. Trabalho em Andamento

| Tarefa | Worktree / Branch | Status | Próximo Passo |
| :--- | :--- | :--- | :--- |
| Scaffold base Next.js + TypeScript + Tailwind CSS + PWA + `.env.example` + `.gitignore` | `BaseSetup` (`siriuszzz17/BaseSetup`) | Entregue e validado localmente (aguardando commit/revisão) | Revisar alterações, commitar e fechar decisões `DEC-001` a `DEC-004` para iniciar a Fase 2 |

---

## 4. Decisões em Aberto (`DEC-XXX`)

| ID | Tema | Opções em Análise | Documento Impactado |
| :--- | :--- | :--- | :--- |
| `DEC-001` | ORM e sistema de migrações PostgreSQL | Prisma ORM vs. Drizzle ORM | [arquitetura.md](./arquitetura.md), [banco-de-dados.md](./banco-de-dados.md) |
| `DEC-002` | Provedor de IA primário e secundário para o Octopy | Gemini API vs. OpenAI API (e estratégia de fallback) | [arquitetura.md](./arquitetura.md) |
| `DEC-003` | Biblioteca de autenticação e gestão de sessão | Auth.js (NextAuth v5) vs. Better Auth vs. implementação custom com OIDC | [arquitetura.md](./arquitetura.md) |
| `DEC-004` | Provedor de hospedagem, PostgreSQL gerenciado e adoção de RLS nativo | Vercel/Railway/Render + Neon/Supabase/RDS | [arquitetura.md](./arquitetura.md), [banco-de-dados.md](./banco-de-dados.md) |

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
  - **BaseSetup (atual, ainda sem commit):** Criada a estrutura inicial do projeto Next.js `16.4.6` (App Router), React `19.3.1`, TypeScript `strict` (`5.9.3`), Tailwind CSS `4.3.5`, suporte a PWA (`public/manifest.webmanifest`, `public/sw.js`, `public/icons/*`, registro de Service Worker, banner offline e página `/offline`), `.env.example`, `.gitignore`, base server-side (`src/lib/env.ts`, `src/lib/problem-details.ts`, `src/lib/logger.ts`), endpoint `GET /api/v1/health` e testes unitários Vitest (`tests/unit/*`), sem autenticação, ORM/PostgreSQL, sandbox ou proxy do Octopy. Validado localmente com `npm install` (`388` pacotes, `0 vulnerabilities`), `npm run typecheck`, `npm run lint`, `npm run test` (`3` arquivos, `6` testes aprovados), `npm run build` e smoke test HTTP em `next start` (`127.0.0.1:3099`).
