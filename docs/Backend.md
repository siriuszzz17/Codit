# Backend

## Responsabilidade
A API própria contém apenas o health check. Os serviços de domínio usam Supabase diretamente no cliente; não há API server-side de domínio implementada.

## Arquivos-chave
- src/app/api/v1/health/route.ts — GET /api/v1/health.
- src/lib/supabase/client.ts — cliente Supabase.
- src/modules/*/*-service.ts — acesso aos dados por domínio.
- supabase/functions/send-push/index.ts e helpers.ts — Edge Function FCM HTTP v1 data-only (avatar/`largeIcon`, resposta autenticada, notificações `Ongoing` de chamada e timeout server-side de 60s com broadcast privado `private: true` em `codit:user-inbox:<uid>`).
- supabase/migrations/*.sql — schema, funções, políticas RLS (`realtime.messages`, `chat_conversation_members`, `public.call_sessions`) e hardening `20261126000002_harden_realtime_rls_and_security_definers.sql`.

## Funções e rotas
- GET() em src/app/api/v1/health/route.ts.
- Recursos de autenticação e domínio ficam em [[Auth]], [[Perfis]], [[Sandbox]], [[Comunidade]], [[Mensagens]] e [[Notificacoes]].

## Dependências
[[Infraestrutura]] fornece configuração, tipos, sessão e tratamento de erros do Supabase. Builds estáticos não hospedam handlers dinâmicos; ver [[status]].
