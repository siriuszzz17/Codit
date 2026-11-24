# Design System e Padrão de UI — Codit (`TCC-Codit`)

| Campo | Valor |
| :--- | :--- |
| **Projeto** | Codit (`TCC-Codit`) |
| **Conceito Estético** | **Warm Technical Craft — Estúdio & Comunidade** |
| **Última atualização** | `2026-11-24` |
| **Documentos relacionados** | [GEMINI.md](../GEMINI.md) · [arquitetura.md](./arquitetura.md) · [banco-de-dados.md](./banco-de-dados.md) · [regras-negocio.md](./regras-negocio.md) |

---

## 1. Propósito deste Documento

Este guia estabelece as decisões permanentes de interface, tipografia, hierarquia visual e personalização do **Codit**. Toda nova página, componente ou refatoração futura deve preservar este padrão para que a aplicação mantenha equilíbrio entre **ferramenta técnica de programação** e **rede social acolhedora e intuitiva**.

---

## 2. Regra das 3 Zonas de Peso Visual

Para evitar interfaces visualmente pesadas ou poluídas por excesso de caixas, toda tela do Codit segue três níveis claros de densidade:

1. **Zona 1 — Shell e Navegação (`TopNavbar`, Dock Mobile, `AppearanceMenu`):**
   - Superfície translúcida silenciosa (`bg-surface/85 backdrop-blur-md`) com borda fina de `1px`.
   - Acesso direto em um clique a `Aparência`, `Amigos` e `Perfil`.
2. **Zona 2 — Fluxos Sociais e de Leitura (`/comunidade`, `/mensagens`, `/conta`, `FriendshipsDrawer`):**
   - **Cabeçalhos de página abertos** (sem embrulhar título e subtítulo dentro de cartões fechados redundantes).
   - Hierarquia centrada nas pessoas: avatar, nome, `@usuário` e conteúdo vêm antes de contadores ou metadados técnicos.
   - Formulários extensos são divididos em abas curtas (`Identidade & Bio`, `Estilo do Perfil`, `Habilidades`, `Aparência do App`).
3. **Zona 3 — Superfícies Técnicas (`HeroWorkbench`, `/projetos`, `ProjectStudioModal`, `SandboxPreview`):**
   - Precisão de editor moderno: blocos `.codit-code-window` em fundo escuro dedicado, fonte monoespaçada para código e indicadores de estado do Sandbox.
   - Metadados secundários (descrição longa, tags, links externos) ficam em bloco recolhível para maximizar a área útil de código e pré-visualização.

---

## 3. Regras Anti-Clichê (Obrigatórias)

1. **Sem etiquetas decorativas (`eyebrows`) em caixa alta acima de títulos:** não adicionar pílulas ou rótulos ALL-CAPS genéricos acima de todo cabeçalho.
2. **Sem setas (`→`) em texto de botões e links:** usar verbos diretos em *sentence case* (`"Abrir projetos"`, `"Explorar comunidade"`, `"Salvar alterações"`, `"Começar gratuitamente"`).
3. **Sem empilhamento de cartões iguais ("SaaS-card kit"):** preferir grades com divisores contínuos (`divide-x` / `divide-y`), faixas métricas unificadas e listas abertas.
4. **Marcadores numéricos apenas em sequências reais:** números (`Etapa 01`, `02`, `03`) só aparecem em cronogramas ou passos ordenados.
5. **Copy em `pt-BR` direta e ativa:** mensagens de erro e estados vazios explicam o que aconteceu e apontam a ação seguinte, sem tom robótico.
6. **Movimento com propósito:** transições curtas (`150ms–200ms`) apenas em resposta a ações, respeitando integralmente `@media (prefers-reduced-motion: reduce)`.

---

## 4. Tipografia e Legibilidade

- **Fonte Principal (`--font-sans`):** `Plus Jakarta Sans` via `next/font/google` (self-hosted em `out/`), usada em títulos, botões, UI social e texto corrido.
- **Fonte Monoespaçada (`--font-mono`):** `JetBrains Mono` via `next/font/google`, restrita a código-fonte, nomes de arquivo (`index.html`), `@usuário`, versões (`v2`) e cronômetros de chamada (`04:12`).
- **Comprimento de linha:** textos descritivos devem respeitar limite máximo aproximado de `60ch–68ch`.
- **Alvos de toque e safe-area:** elementos interativos têm altura mínima de `36px–44px` (`min-h-9` / `min-h-11`), utilizando os utilitários `--codit-safe-{top,right,bottom,left}` em [globals.css](../src/app/globals.css) para compatibilidade com Android Edge-to-Edge e Tauri Desktop.

---

## 5. Sistema Leve de Temas e Papéis de Parede

Para permitir personalização completa do aplicativo sem pesar o banco de dados PostgreSQL nem exigir armazenamento de imagens:

- **Renderização 100% CSS + SVG procedural inline (`body::before`):** zero imagens binárias, zero Base64 pesado, zero scripts inline (compatível com CSP estrita do Next.js e Tauri).
- **Preservação do Padrão Original:** o estado inicial (`DEFAULT_APPEARANCE_PREFS`) mantém o visual padrão oficial do Codit (`colorMode: "system"`, `appTheme: "original"`, `wallpaperPreset: "original"`, `wallpaperIntensity: "balanced"`).
- **Modos de iluminação (`data-color-mode`):** `system`, `light`, `dark`.
- **6 Temas globais (`data-ui-theme`):**
  - `original` — Original Codit (Ardósia Bioluminescente)
  - `ocean_circuit` — Oceano Circuito
  - `amber_terminal` — Âmbar Engenharia
  - `forest_syntax` — Floresta Sintaxe
  - `nordic_frost` — Gelo Nórdico
  - `mono_graphite` — Grafite Editorial
- **8 Papéis de parede (`data-wallpaper`):**
  - `original` (Padrão Original), `blueprint_grid` (Planta Técnica), `circuit_traces` (Trilhas de Circuito), `topographic_flow` (Mapa Topográfico), `constellation_nodes` (Rede de Nós), `isometric_matrix` (Grade Isométrica), `aurora_mesh` (Nebulosa Boreal) e `minimal_paper` (Liso Puro).
- **3 Níveis de presença (`data-wallpaper-intensity`):** `subtle`, `balanced` e `vivid`, ajustando a transparência das superfícies (`--surface-alpha`) com preservação de contraste legível.
- **Persistência com ~52 bytes por usuário:** apenas 4 colunas `VARCHAR` curtas em `public.profiles` (`color_mode`, `app_theme`, `wallpaper_preset`, `wallpaper_intensity`), com fallback automático para `localStorage` e `user_metadata`.
