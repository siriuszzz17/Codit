# Política de Segurança — Codit (`TCC-Codit`)

## Versões Suportadas

O projeto encontra-se em desenvolvimento ativo na branch `master` (Fase 1). Correções de segurança são aplicadas diretamente na linha principal antes da publicação de versões estáveis.

| Canal / Versão | Status | Suporte a Correções de Segurança |
| :--- | :--- | :--- |
| `master` (atual) | Em desenvolvimento | Sim |
| Pré-releases anteriores (`Apk`) | Apenas testes iniciais | Não |

## Como Reportar uma Vulnerabilidade

**Não abra issues públicas** para reportar falhas de segurança, vazamento de dados ou bypasses de isolamento.

1. Utilize o canal privado do **GitHub Security Advisories**:
   `https://github.com/siriuszzz17/Codit/security/advisories/new`
2. Inclua na descrição:
   - Passos claros para reprodução e componente afetado (Web/PWA, API, Sandbox, Desktop Tauri ou Android Capacitor).
   - Impacto potencial (exposição de `user_id`, XSS no Sandbox, bypass de CSP, vazamento em logs).
   - Versão ou commit analisado.

## Garantias e Princípios de Segurança do Codit

- **Zero segredos no cliente ou no Git:** variáveis como `DATABASE_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `AI_PROVIDER_API_KEY` e `SANDBOX_API_KEY` existem apenas no servidor (`.env` ignorado pelo Git) e jamais recebem prefixo `NEXT_PUBLIC_*`.
- **Isolamento do Sandbox:** código de alunos executa exclusivamente no navegador (`iframe` sandboxed sem `allow-same-origin` e Pyodide WASM em Web Worker) ou, em fases futuras, via provedor remoto isolado (`CodeExecutionProvider`), nunca no processo principal do servidor Next.js/Node.
- **Isolamento estrito por `user_id`:** todos os dados privados em banco de dados e APIs exigirão `user_id` validado da sessão no servidor e Row-Level Security (RLS) no PostgreSQL.
- **Atualizações assinadas no Desktop:** o atualizador do Tauri v2 verifica assinaturas criptográficas Ed25519/Minisign utilizando apenas a chave pública embarcada em `src-tauri/tauri.conf.json`.
