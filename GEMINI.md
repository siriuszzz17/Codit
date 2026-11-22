# GEMINI.md — Constituição Operacional do Projeto Codit (`TCC-Codit`)

Este documento define as diretrizes obrigatórias para agentes de IA e desenvolvedores atuando no repositório **Codit (`TCC-Codit`)**. Ele funciona como ponto de entrada técnico e contrato de qualidade para toda alteração de código ou documentação.

---

## 1. Visão Geral do Projeto

- **Nome do Projeto:** Codit (`TCC-Codit`)
- **Objetivo e Escopo:** `[Pendente de definição]` — registrar em [docs/regras-negocio.md](./docs/regras-negocio.md) assim que o escopo do TCC for formalizado.
- **Stack Tecnológica:** `[Pendente de definição]` — registrar em [docs/arquitetura.md](./docs/arquitetura.md).
- **Idioma Padrão:** Documentação, especificações e textos de interface em **Português (`pt-BR`)**; símbolos de código, commits e contratos técnicos seguem o padrão definido na stack escolhida.

### Fonte Única de Verdade (`docs/`)

Antes de iniciar qualquer tarefa, consulte os documentos oficiais abaixo:

| Documento | Finalidade | Quando consultar / atualizar |
| :--- | :--- | :--- |
| [docs/status.md](./docs/status.md) | Estado real do projeto, roadmap, trabalho ativo, decisões em aberto e riscos | **Sempre** no início e ao final de cada tarefa |
| [docs/arquitetura.md](./docs/arquitetura.md) | Stack tecnológica, componentes, contratos de API, integrações, observabilidade e ADRs | Ao alterar stack, endpoints, serviços externos ou decisões estruturais |
| [docs/banco-de-dados.md](./docs/banco-de-dados.md) | SGBD, DER, dicionário de dados, índices, migrações, concorrência e LGPD | Ao criar/alterar tabelas, índices, queries críticas ou migrações |
| [docs/regras-negocio.md](./docs/regras-negocio.md) | Glossário ubíquo, RBAC, catálogo `RN-XXX`, fluxos críticos e casos de borda | Ao especificar, implementar ou testar comportamentos de domínio |

---

## 2. Protocolo Obrigatório para Agentes

1. **Leitura Prévia Obrigatória:**
   - Leia este `GEMINI.md`, [docs/status.md](./docs/status.md) e os documentos em `docs/` diretamente afetados antes de escrever ou refatorar código.
2. **Proibição de Suposições Não Documentadas:**
   - Nunca invente requisitos de negócio, entidades, endpoints, bibliotecas ou credenciais por conta própria.
   - Se uma decisão técnica ou de produto estiver marcada como `[Pendente de definição]`, **pergunte ao usuário** ou registre a decisão aprovada (em `docs/status.md` e/ou como ADR em `docs/arquitetura.md`) antes de implementar.
3. **Padrões de Produção desde o Primeiro Commit:**
   - Produza código completo, tipado e funcional, sem *placeholders*, *mocks* silenciosos em caminhos de produção ou trechos incompletos.
   - Implemente tratamento explícito de erros (padronizado em `docs/arquitetura.md`), validação de entradas na fronteira do sistema, controle de concorrência e cobertura dos casos de borda.
   - Para integrações com APIs externas, documente previamente URL base, endpoints, headers, payloads, códigos de resposta, limites de taxa e plano de contingência em [docs/arquitetura.md](./docs/arquitetura.md).
   - Toda regra de negócio implementada deve possuir testes automatizados correspondentes e rastreáveis ao seu identificador `RN-XXX`.
4. **Sincronização Obrigatória da Documentação:**
   - Nenhuma funcionalidade, mudança de schema ou decisão arquitetural é considerada concluída sem atualizar a documentação correspondente na mesma entrega:
     - Mudou progresso, bloqueio ou decisão em aberto -> atualize [docs/status.md](./docs/status.md).
     - Mudou stack, endpoint, integração externa ou decisão estrutural -> atualize [docs/arquitetura.md](./docs/arquitetura.md) (incluindo ADR).
     - Mudou tabela, coluna, índice ou migração -> atualize [docs/banco-de-dados.md](./docs/banco-de-dados.md).
     - Mudou regra, permissão, estado ou caso de borda -> atualize [docs/regras-negocio.md](./docs/regras-negocio.md).

---

## 3. Fluxo Git, Branches e Worktrees (Orca)

O repositório utiliza **Git Worktrees** gerenciados pelo Orca para isolar tarefas em paralelo:

| Papel | Caminho no Sistema de Arquivos | Branch |
| :--- | :--- | :--- |
| **Worktree Principal** | `C:/Users/gusta/orca/projects/TCC-Codit` | `master` (ou `main`, se renomeada) |
| **Worktrees Secundários (Orca)** | `C:/Users/gusta/orca/workspaces/TCC-Codit/<worktree>` | Branch dedicada da tarefa |

### Regras Operacionais de Worktree
- **Nunca faça checkout da branch principal dentro de um worktree secundário:** o Git bloqueia `git checkout master` em worktrees secundários porque `master` já está em uso no worktree principal.
- **Arquivos ignorados são locais por worktree:** arquivos como `.env`, dependências instaladas (`node_modules/`, `.venv/`) e artefatos de build não são compartilhados entre worktrees e devem ser provisionados localmente em cada pasta.
- **Encerramento e limpeza:** após integrar a branch (via Pull Request no GitHub ou merge no worktree principal), remova o worktree pelo Orca CLI (ou UI) em vez de apagar a pasta manualmente:
  ```powershell
  orca worktree rm --worktree branch:<nome-da-branch> --delete-branch
  ```

### Padrão de Commits (Conventional Commits)
Use mensagens objetivas no formato `<tipo>(<escopo opcional>): <descrição>`:
- `feat:` nova funcionalidade
- `fix:` correção de defeito
- `docs:` criação ou atualização de documentação
- `refactor:` refatoração sem alteração de comportamento externo
- `test:` adição ou ajuste de testes automatizados
- `chore:` tarefas de configuração, dependências ou manutenção
- `perf:` melhoria mensurável de desempenho
- `ci:` pipelines e automações de integração/entrega contínua

---

## 4. Gates de Validação e Segurança

### Gates antes de concluir uma tarefa
Os comandos oficiais serão registrados em [docs/arquitetura.md](./docs/arquitetura.md) após a definição da stack:
- **Lint & Formatação:** `[Pendente de definição]`
- **Verificação de Tipos (`typecheck`):** `[Pendente de definição]`
- **Testes Automatizados (unitários e integração):** `[Pendente de definição]`
- **Build de Produção:** `[Pendente de definição]`

### Higiene de Segredos e Configurações
- Nunca versione arquivos `.env`, chaves privadas, tokens, senhas ou dados reais de usuários.
- Mantenha um `.env.example` atualizado apenas com os nomes das variáveis e instruções de preenchimento sempre que uma nova configuração de ambiente for adicionada.
- Valide todas as variáveis de ambiente obrigatórias na inicialização da aplicação (*fail-fast* com mensagem clara indicando a variável ausente).
