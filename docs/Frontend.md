# Frontend

## Responsabilidade
Rotas App Router, layout compartilhado, navegação e interface.

## Arquivos-chave
- src/app/layout.tsx — RootLayout(); providers e elementos globais.
- src/app/globals.css
- src/app/page.tsx — início.
- src/app/auth/page.tsx
- src/app/conta/page.tsx
- src/app/projetos/page.tsx
- src/app/trilhas/page.tsx e src/app/trilhas/licao/page.tsx — catálogo de trilhas, exercícios com runner isolado e Tutor Octopy.
- src/app/comunidade/page.tsx
- src/app/comunidade/perfil/page.tsx
- src/app/mensagens/page.tsx
- src/app/offline/page.tsx, src/app/not-found.tsx
- src/hooks/use-dialog-a11y.ts — focus trap, Escape e retorno de foco nos modais.
- src/components/ui/skeleton.tsx, src/components/ui/empty-state-card.tsx — estados de carregamento e vazio com CTA.
- src/components/layout/top-navbar.tsx
- src/components/home/hero-workbench.tsx
- src/components/messaging/call-stage-panel.tsx — palco responsivo de voz, vídeo e tela com grid, PiP local ajustável, troca de câmera e tela de chamada efetuada.
- src/components/messaging/global-call-overlay.tsx — modal de chamada recebida (voz/vídeo/recusar com contagem), áudio WebRTC persistente e barra flutuante.

## Rotas
/, /trilhas, /trilhas/licao, /auth, /conta, /projetos, /comunidade, /comunidade/perfil, /mensagens, /offline.

## Dependências
[[Auth]], [[Perfis]], [[Sandbox]], [[Comunidade]], [[Mensagens]], [[Notificacoes]] e [[design-system]].
