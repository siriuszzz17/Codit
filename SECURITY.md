# Política de Segurança — Codit (`TCC-Codit`)

## Versões Suportadas

O projeto encontra-se ativo na branch `master` (`v0.1.15`). Correções de segurança são publicadas diretamente na linha principal e distribuídas via atualizador assinado (Desktop Tauri) e GitHub Releases (Android APK).

| Canal / Versão | Status | Suporte a Correções de Segurança |
| :--- | :--- | :--- |
| `master` / `v0.1.15` | Atual (estável) | Sim |
| Versões `<= 0.1.14` | Substituídas | Atualizar para `v0.1.15` |

## Como Reportar uma Vulnerabilidade

**Não abra issues públicas** para reportar falhas de segurança, vazamento de dados ou bypasses de isolamento.

1. Utilize o canal privado do **GitHub Security Advisories**:
   `https://github.com/siriuszzz17/Codit/security/advisories/new`
2. Inclua passos de reprodução, camada afetada (Web/PWA, Edge Function, Sandbox/Pyodide, Tauri Desktop ou Android Capacitor), impacto potencial e versão analisada.

## Garantias e Controles Ativos (`v0.1.15`)

- **Zero segredos no cliente ou no Git:** chaves privadas (`FIREBASE_PRIVATE_KEY`, `PUSH_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `AUTH_SECRET`, `AI_PROVIDER_API_KEY`) residem apenas no servidor/Supabase Secrets, nunca em `NEXT_PUBLIC_*`.
- **Execução de código 100% isolada no cliente:** HTML/CSS/JS roda em `<iframe sandbox="allow-scripts">` sem `allow-same-origin` (watchdog `4s`), e Python roda em Web Worker WebAssembly isolado (Pyodide) com terminação forçada em timeout.
- **Isolamento estrito por `user_id` e Realtime privado:** todas as tabelas possuem Row-Level Security (`auth.uid()`), funções `SECURITY DEFINER` usam `SET search_path = public` com checagens explícitas anti-enumeração, e canais Supabase Realtime operam em modo privado (`codit_realtime_messages_*`).
- **Moderação & LGPD:** bloqueio bilateral imediato (`public.user_blocks`), denúncias (`public.moderation_reports`), aceite versionado de privacidade (`/privacidade`), exportação portável (`export_my_account_data`) e exclusão completa de conta (`delete_my_account`).
- **Atualizações assinadas no Desktop:** o Tauri v2 valida assinaturas criptográficas Minisign com a chave pública fixa em `src-tauri/tauri.conf.json`.
