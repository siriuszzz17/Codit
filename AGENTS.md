<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Regras Globais de Contexto e Eficiência

## 1. Cérebro do Projeto (Obsidian)
- **Ponto de partida obrigatório:** Antes de rodar buscas (`grep`, `find`) ou abrir arquivos de código, leia `docs/INDEX.md`.
- **Navegação cirúrgica:** Use os caminhos e `[[wikilinks]]` listados em `docs/` para abrir apenas o arquivo e o trecho exato necessário.
- **Manutenção:** Ao criar arquivos novos, mudar rotas ou alterar arquitetura, atualize apenas o `.md` correspondente em `docs/` e o `docs/STATE.md`.

## 2. Uso do Context-Mode (MCP)
- Nunca jogue logs inteiros, saídas de testes, builds ou arquivos com mais de 200 linhas direto no chat.
- Use obrigatoriamente as ferramentas do MCP `context-mode` para comandos verbosos, `git diff` grande e leitura filtrada de erros/funções.

## 3. Comandos Rápidos (Atalhos de Mensagem)
Quando o usuário iniciar a mensagem com um ou mais destes comandos, siga estritamente o modo:
- `/plan`: Leia `docs/INDEX.md` e responda apenas com: causa raiz/diagnóstico + arquivos a alterar + checklist curto. **Não escreva código ainda.**
- `/surgical`: Altere apenas as linhas estritamente necessárias. Não refatore código vizinho, não renomeie variáveis e não reescreva arquivos inteiros fora do escopo.
- `/fix`: Inspecione o erro via `context-mode`, diga a causa raiz em 1 frase e aplique a correção mínima sem chutar soluções.
- `/verify`: Rode apenas o teste/build do módulo afetado via `context-mode`. Retorne só `PASS` ou as linhas exatas da falha.
- `/simplify`: Enxugue o código recém-escrito removendo código morto, imports inúteis e boilerplate, mantendo o comportamento intacto.
- `/sync`: Atualize `docs/STATE.md` e o `.md` do módulo alterado em `docs/` de forma ultra-concisa (máx. 5 linhas).
- `/handoff`: Empacote o estado atual em bullets curtos (o que foi feito, arquivos modificados, pendências e próximo passo exato) para continuar em um chat limpo.
- `/grill-me`: Faça perguntas rápidas e aponte falhas lógicas, casos de borda ou riscos arquiteturais antes de qualquer código ser escrito.