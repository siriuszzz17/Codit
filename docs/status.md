# Status e Progresso do Projeto — Codit (`TCC-Codit`)

> **Estado Atual:** **Fase Inicial (Fase 0) — apenas com estrutura base e documentação.**
> **Nenhum código de aplicação, `package.json`, migração de banco ou dependência foi criado/instalado ainda.**

| Campo | Valor |
| :--- | :--- |
| **Projeto** | Codit (`TCC-Codit`) |
| **Última atualização** | `2026-11-22` |
| **Documentos relacionados** | [GEMINI.md](../GEMINI.md) · [arquitetura.md](./arquitetura.md) · [banco-de-dados.md](./banco-de-dados.md) · [regras-negocio.md](./regras-negocio.md) |

---

## 1. Resumo Executivo (Estado Real Inspecionado)

| Aspecto | Situação Real | Detalhes |
| :--- | :--- | :--- |
| **Código da Aplicação** | **Não iniciado** | Sem `src/`, sem `package.json`, sem dependências instaladas e sem rotas/telas implementadas |
| **Banco de Dados** | **Não provisionado** | Apenas modelagem conceitual/dicionário documentados em [banco-de-dados.md](./banco-de-dados.md) |
| **Documentação Base** | **Completa (Fase 0)** | `GEMINI.md` (< 100 linhas) + `arquitetura.md`, `banco-de-dados.md`, `regras-negocio.md` e `status.md` refletindo a visão completa do SaaS |
| **Repositório Principal** | Ativo | `C:/Users/gusta/orca/projects/TCC-Codit` · branch `master` · remote `origin`: `https://github.com/siriuszzz17/Codit.git` |
| **Worktree Secundário Ativo** | Ativo (Orca) | `C:/Users/gusta/orca/workspaces/TCC-Codit/bichir` · branch `git-worktree-github-guide` |

---

## 2. Roadmap do Projeto

### Fase 0 — Fundação e Documentação Inicial *(Em conclusão)*
- [x] Inicialização do repositório Git e conexão com GitHub (`siriuszzz17/Codit`)
- [x] Definição da visão completa do SaaS Codit, mascote/tutor **Octopy** e diretrizes de segurança/isolamento
- [x] Criação do guia rápido [GEMINI.md](../GEMINI.md) e da pasta `docs/` completa
- [ ] Commit da documentação finalizada na branch atual e merge na `master`

### Fase 1 — Decisões Técnicas Finais e Scaffold Base
- [ ] Fechar decisões `DEC-001` a `DEC-004` (ORM, biblioteca de Auth, provedor LLM do Octopy, ambiente PostgreSQL)
- [ ] Criar projeto Next.js (App Router) + TypeScript `strict` + Tailwind CSS + configuração PWA (`manifest.webmanifest`, ícones e Service Worker)
- [ ] Configurar `.env.example`, validação *fail-fast* de variáveis de ambiente, ESLint/Prettier e estrutura de testes

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
| Documentação base da visão do SaaS Codit | `bichir` (`git-worktree-github-guide`) | Finalização e commit inicial dos docs | Revisar coerência, commitar e preparar integração com `master` |

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
  - **Atualização atual:** Consolidação completa da visão do SaaS **Codit**, mascote/tutor IA **Octopy**, experiência Web Mobile-First + PWA, stack TypeScript/Next.js/Tailwind/PostgreSQL, Sandbox client-side + expansão Judge0/Piston e isolamento estrito por `user_id` em `GEMINI.md` e `docs/*.md` (ainda sem código de aplicação criado).
