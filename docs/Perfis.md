# Perfis

## Responsabilidade
Criação e atualização de perfis, dados de conta, customização e projetos exibidos no portfólio.

## Arquivos-chave
- src/modules/profiles/profile-service.ts — ensureProfile(), updateProfile().
- src/modules/profiles/profile-themes.ts — validação e opções de personalização.
- src/components/account/account-workspace.tsx
- src/components/account/profile-customizer-panel.tsx
- src/components/account/projects-showcase-panel.tsx
- src/app/conta/page.tsx

## Rotas
/conta; perfil público em /comunidade/perfil.

## Dependências
[[Auth]] fornece a identidade; [[Infraestrutura]] fornece Supabase. [[Comunidade]] consome perfis públicos; [[Sandbox]] fornece projetos do usuário; [[design-system]] controla o tema global.
