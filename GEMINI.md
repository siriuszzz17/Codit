# GEMINI.md — Guia Rápido e Constituição do Projeto Codit

> **Estado atual:** Fase 1 (base inicial criada) — Next.js (App Router), TypeScript `strict`, Tailwind CSS, suporte a PWA, `.env.example`, `.gitignore` e `GET /api/v1/health` operacionais. **Ainda sem autenticação, banco de dados/ORM, sandbox ou tutor Octopy.**

## 1. Visão Geral e Stack Alvo (Planejada)
- **Produto:** **Codit** — plataforma SaaS educacional Web Responsiva Mobile-First + PWA instalável, para ensinar programação (básico ao avançado), Inteligência Artificial, Git/GitHub, boas práticas e preparação para carreira tech (portfólio e entrevistas).
- **Mascote / Tutor IA:** **Octopy** — polvo roxo especialista em programação que atua como guia visual e tutor socrático interativo (ajuda a destravar exercícios sem entregar a resposta pronta de cara).
- **Stack Alvo:** TypeScript ponta a ponta, Next.js (App Router / React), Tailwind CSS, PostgreSQL e autenticação completa (cadastro/login tradicional + Google OAuth 2.0).
- **Sandbox e Mini-Projetos:** HTML, CSS, JavaScript e Python com execução **client-side isolada** no MVP (`iframe` sandboxed e WebAssembly/Pyodide em Web Worker), preparada para expansão futura via APIs de sandbox externas (Judge0 / Piston).

## 2. Padrão de Nomenclatura e Idioma
- **Inglês:** código-fonte, identificadores, arquivos técnicos, rotas/APIs (`/api/v1/...`), tabelas e colunas (`snake_case`).
- **Português (`pt-BR`):** interface do usuário (UI), mensagens exibidas ao aluno, documentação e conteúdo didático (trilhas, lições, exercícios e falas do Octopy).

## 3. Regras Críticas de Segurança e Isolamento
1. **Isolamento rigoroso por `user_id`:** Todo dado privado (progresso, submissões, mini-projetos, conversas com o Octopy e carreira) exige coluna `user_id` obrigatória e filtro explícito pelo `user_id` da sessão validada no servidor (anti-IDOR).
2. **Segredos somente no servidor:** Chaves de IA, Google OAuth, `DATABASE_URL` e APIs de sandbox ficam exclusivamente em `.env` server-side — **nunca** em `NEXT_PUBLIC_*`, no client-side ou no Git. Manter `.env.example` atualizado sem valores reais.
3. **Zero execução arbitrária no servidor principal:** Código de alunos nunca roda diretamente no servidor Next.js/Node.
4. **Sem suposições não documentadas:** Consulte `docs/status.md` e os docs afetados antes de implementar; decisões técnicas pendentes (`DEC-XXX`) devem ser aprovadas e registradas em `docs/` antes de virar código.
5. **Padrão de produção:** Código estritamente tipado, validação de entrada na borda, erros padronizados (RFC 9457), controle de concorrência e testes alinhados às regras `RN-XXX`.

## 4. Comandos Básicos
- **Git / Worktrees (Orca):**
  - `git status -sb` · `git log -n 5 --oneline`
  - Worktree principal (`master`): `C:/Users/gusta/orca/projects/TCC-Codit` — **nunca** execute `git checkout master` em worktrees secundários.
  - Limpeza após merge: `orca worktree rm --worktree branch:<branch> --delete-branch`
  - Commits no padrão **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- **Aplicação:** `npm run dev` · `npm run lint` · `npm run typecheck` · `npm run test` · `npm run build` · `migrate` `[Pendente — após fechamento de DEC-001]` (ver [docs/arquitetura.md](./docs/arquitetura.md)).

## 5. Índice da Documentação (`docs/`)

| Documento | Conteúdo |
| :--- | :--- |
| [docs/arquitetura.md](./docs/arquitetura.md) | Stack alvo, PWA, Sandbox (client-side + Judge0/Piston), proxy Octopy, Google OAuth, `/api/v1` e ADRs |
| [docs/banco-de-dados.md](./docs/banco-de-dados.md) | Modelagem PostgreSQL, isolamento `user_id` + RLS, DER, dicionário de dados, índices e LGPD |
| [docs/regras-negocio.md](./docs/regras-negocio.md) | Glossário, RBAC, catálogo `RN-XXX`, fluxos do Octopy/Sandbox e casos de borda |
| [docs/status.md](./docs/status.md) | Estado real (fase inicial sem código), roadmap, decisões em aberto (`DEC-XXX`) e changelog |

> **Sincronização obrigatória:** Toda entrega técnica que altere arquitetura, schema, regra de negócio ou progresso deve atualizar o respectivo documento em `docs/` no mesmo fluxo.
