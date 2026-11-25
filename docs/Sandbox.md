# Sandbox

## Responsabilidade
Persistir projetos do usuário, catalogar linguagens e montar preview isolado no navegador.

## Arquivos-chave
- src/modules/sandbox/sandbox-project-service.ts — createSandboxProject(), listUserSandboxProjects(), updateSandboxProject(), softDeleteSandboxProject().
- src/modules/sandbox/language-catalog.ts — getLanguageMeta().
- src/modules/sandbox/sandbox-runner.ts — buildSandboxedPreviewDocument().
- src/components/projects/projects-workspace.tsx — ProjectsWorkspace().
- src/components/sandbox/sandbox-preview.tsx
- src/components/account/project-studio-modal.tsx
- src/app/projetos/page.tsx

## Rotas
/projetos; gestão de projetos também em /conta.

## Dependências
Persistência via [[Infraestrutura]] e identidade de [[Auth]]. Projetos são exibidos por [[Perfis]] e [[Comunidade]]. O runner atual usa iframe sandbox; Python via Pyodide consta como pendência em [[status]].
