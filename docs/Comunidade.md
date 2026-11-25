# Comunidade

## Responsabilidade
Busca de usuários, amizades, feed e visualização de perfis/projetos públicos.

## Arquivos-chave
- src/modules/social/social-service.ts — searchCommunityUsers(), listUserFriendships(), acceptFriendRequest(), getPublicProfileBundle().
- src/modules/social/social-schemas.ts
- src/lib/social-events.ts
- src/components/social/community-hub.tsx — CommunityHub().
- src/components/social/public-profile-view.tsx
- src/components/social/friendships-drawer.tsx
- src/components/social/project-viewer-modal.tsx
- src/app/comunidade/page.tsx
- src/app/comunidade/perfil/page.tsx

## Rotas
/comunidade, /comunidade/perfil.

## Dependências
[[Auth]] identifica o usuário; [[Infraestrutura]] fornece Supabase. Consome [[Perfis]] e [[Sandbox]]; integra-se com [[Mensagens]] e [[Notificacoes]].
