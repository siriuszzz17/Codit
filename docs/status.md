# Status e Progresso do Projeto — Codit (`TCC-Codit`)

| Campo | Valor |
| :--- | :--- |
| **Projeto** | Codit (`TCC-Codit`) |
| **Fase Atual** | `Fase 0 — Fundação e Documentação Inicial` |
| **Última atualização** | `2026-11-22` |
| **Documentos relacionados** | [GEMINI.md](../GEMINI.md) · [arquitetura.md](./arquitetura.md) · [banco-de-dados.md](./banco-de-dados.md) · [regras-negocio.md](./regras-negocio.md) |

---

## 1. Resumo Executivo Atual (Estado Inspecionado)

| Aspecto | Estado Real | Detalhes |
| :--- | :--- | :--- |
| **Repositório Principal (Git)** | Inicializado | `C:/Users/gusta/orca/projects/TCC-Codit` · branch `master` · commit `7815ce3` (`Initial commit`) |
| **Worktree Secundário Ativo (Orca)** | Ativo | Pasta `C:/Users/gusta/orca/workspaces/TCC-Codit/bichir` · branch `git-worktree-github-guide` (`base: refs/heads/master`) |
| **Remote GitHub (`origin`)** | Não conectado | Nenhum remote configurado em `git remote -v`; CLI `gh` autenticado na conta `siriuszzz17` |
| **Documentação Base** | Criada (não commitada) | `GEMINI.md` + 4 arquivos em `docs/` criados no worktree `bichir` |
| **Código-fonte / Banco / Testes** | Não iniciados | Aguardando definição de escopo, stack e modelagem |

---

## 2. Roadmap por Fases

### Fase 0 — Fundação e Governança
- [x] Inicialização do repositório Git (`7815ce3 — Initial commit`)
- [x] Criação da constituição operacional [GEMINI.md](../GEMINI.md)
- [x] Criação da estrutura base em `docs/` ([arquitetura.md](./arquitetura.md), [banco-de-dados.md](./banco-de-dados.md), [regras-negocio.md](./regras-negocio.md), [status.md](./status.md))
- [ ] Conectar repositório remoto no GitHub (`origin`) e confirmar branch padrão (`master` vs `main`)
- [ ] Commitar documentação inicial e integrar na branch principal

### Fase 1 — Definição de Escopo, Regras e Stack
- [ ] Definir problema, objetivo, personas/perfis e regras do MVP em [regras-negocio.md](./regras-negocio.md)
- [ ] Definir stack tecnológica, estrutura de pastas, integrações e ADRs em [arquitetura.md](./arquitetura.md)
- [ ] Modelar DER, dicionário de dados e estratégia de migrações em [banco-de-dados.md](./banco-de-dados.md)

### Fase 2 — Setup Técnico e Infraestrutura Base
- [ ] Criar scaffold da aplicação com tipagem estrita, linter e formatter configurados
- [ ] Configurar `.env.example`, `.gitignore` e validação de variáveis de ambiente na inicialização
- [ ] Configurar SGBD local, ferramentas de migração, seeds e endpoints `/health` e `/ready`
- [ ] Configurar suíte de testes automatizados e pipeline inicial de CI

### Fase 3 — Implementação do MVP
- [ ] Implementar autenticação e autorização RBAC (`RN-001..099`)
- [ ] Implementar fluxos centrais do domínio Codit (`RN-100..199`) com testes unitários e de integração
- [ ] Implementar integrações externas e planos de contingência (`RN-300..399`)

### Fase 4 — Validação, Polimento e Entrega do TCC
- [ ] Revisão de segurança (OWASP Top 10), LGPD e testes de concorrência/carga
- [ ] Verificação integral de rastreabilidade `RN-XXX` ↔ código ↔ testes
- [ ] Revisão final de documentação, deploy/ambiente de demonstração e apresentação do TCC

---

## 3. Trabalho em Andamento

| Item | Worktree / Branch | Estado | Próxima Ação |
| :--- | :--- | :--- | :--- |
| Bootstrap da documentação (`GEMINI.md` e `docs/*.md`) | `bichir` (`git-worktree-github-guide`) | Arquivos criados localmente (sem commit) | Revisar conteúdo, commitar e integrar após conectar GitHub ou mergear na `master` |

---

## 4. Decisões em Aberto (`DEC-XXX`)

| ID | Tema | Documento Alvo | Impacto | Estado |
| :--- | :--- | :--- | :--- | :--- |
| `DEC-001` | Definição do escopo funcional, personas, perfis RBAC e regras `RN-XXX` do Codit | [regras-negocio.md](./regras-negocio.md) | Alto — bloqueia modelagem e código | Aberta |
| `DEC-002` | Definição da stack tecnológica (linguagem, framework backend/frontend, testes, CI) | [arquitetura.md](./arquitetura.md) | Alto — bloqueia scaffold e gates | Aberta |
| `DEC-003` | Escolha do SGBD, ORM/driver, tipo de PK (`UUIDv7` vs `BIGINT`) e ferramenta de migração | [banco-de-dados.md](./banco-de-dados.md) | Alto — bloqueia schema inicial | Aberta |
| `DEC-004` | Conexão com GitHub (`siriuszzz17`), visibilidade (privado/público) e branch padrão (`master` vs `main`) | [status.md](./status.md) | Médio — define fluxo de PR e backup remoto | Aberta |

---

## 5. Bloqueios e Riscos Ativos

| ID | Severidade | Descrição | Mitigação / Próximo Passo |
| :--- | :--- | :--- | :--- |
| `RISK-001` | Alta | Repositório existe apenas localmente (`git remote -v` vazio), sem backup remoto no GitHub | Criar/conectar repositório `origin` na conta `siriuszzz17` e enviar branch principal |
| `RISK-002` | Média | Escopo funcional e stack do Codit ainda não especificados; agentes não devem supor stack/regras sem aprovação | Preencher `DEC-001` a `DEC-003` antes de iniciar geração de código de produção |

---

## 6. Changelog / Diário de Evolução

- **`2026-11-22`:**
  - Commit inicial `7815ce3` (`Initial commit`) registrado na branch `master` do repositório `TCC-Codit`.
  - Criada a estrutura inicial de documentação no worktree `bichir` (branch `git-worktree-github-guide`): `GEMINI.md`, `docs/arquitetura.md`, `docs/banco-de-dados.md`, `docs/regras-negocio.md` e `docs/status.md`.
