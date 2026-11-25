# Aparência

## Responsabilidade
Preferências globais de tema, modo de cor e papel de parede, com persistência local e no perfil.

## Arquivos-chave
- src/modules/theme/appearance-catalog.ts — catálogo e padrões.
- src/modules/theme/appearance-service.ts — fetchUserAppearance(), persistUserAppearance(), applyAppearanceToDocument().
- src/modules/theme/appearance-provider.tsx — AppearanceProvider().
- src/components/layout/appearance-menu.tsx
- src/components/account/profile-customizer-panel.tsx
- src/app/globals.css

## Rotas
Sem rota própria; provider montado no layout global. Preferências são editadas em /conta.

## Dependências
[[Auth]] e [[Infraestrutura]]; interface em [[Frontend]], edição junto a [[Perfis]].
