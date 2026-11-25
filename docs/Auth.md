# Auth

## Responsabilidade
Autenticação Supabase, sessão persistente e callbacks OAuth web/nativos.

## Arquivos-chave
- src/modules/auth/auth-provider.tsx — AuthProvider(), loadInitialSession().
- src/modules/auth/auth-service.ts — operações de autenticação, incluindo signOutUser().
- src/modules/auth/auth-schemas.ts
- src/lib/native-oauth.ts — callbacks e handoff nativo.
- src/components/auth/auth-screen.tsx
- src/app/auth/page.tsx
- src/app/auth/callback/page.tsx
- src/app/auth/native-callback/page.tsx

## Rotas
/auth, /auth/callback, /auth/native-callback.

## Dependências
Usa [[Infraestrutura]] (Supabase) e inicializa [[Perfis]] com ensureProfile(). Integrado ao layout de [[Frontend]].
