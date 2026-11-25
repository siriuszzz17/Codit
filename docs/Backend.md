# Backend

## Responsabilidade
A API própria contém apenas o health check. Os serviços de domínio usam Supabase diretamente no cliente; não há API server-side de domínio implementada.

## Arquivos-chave
- src/app/api/v1/health/route.ts — GET /api/v1/health.
- src/lib/supabase/client.ts — cliente Supabase.
- src/modules/*/*-service.ts — acesso aos dados por domínio.
- supabase/migrations/*.sql — schema, funções e políticas RLS.

## Funções e rotas
- GET() em src/app/api/v1/health/route.ts.
- Recursos de autenticação e domínio ficam em [[Auth]], [[Perfis]], [[Sandbox]], [[Comunidade]], [[Mensagens]] e [[Notificacoes]].

## Dependências
[[Infraestrutura]] fornece configuração, tipos, sessão e tratamento de erros do Supabase. Builds estáticos não hospedam handlers dinâmicos; ver [[status]].
