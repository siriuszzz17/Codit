# Frontend — Codit (`TCC-Codit`)

## 1. Mapa Completo das 14 Rotas (`src/app/`)

| Rota | Arquivo | Função |
| :--- | :--- | :--- |
| `/` | `src/app/page.tsx` | Landing inicial + `HeroWorkbench` + atalhos para Trilhas, Projetos, Comunidade e Mensagens. |
| `/trilhas` | `src/app/trilhas/page.tsx` | Catálogo de trilhas JS/Python, progresso, XP/streak/badges, `FirstStepsCard`, resumo analítico e botão *Ver funil por lição* (`TracksOverview` + `LearningAnalyticsDrawer`). |
| `/trilhas/licao` | `src/app/trilhas/licao/page.tsx` | Ambiente interativo de lição por `?slug=<lessonSlug>` (`LessonWorkbench` em `<Suspense>`), `OctopyHintPanel`, `failed_case_ids` e runner JS/Pyodide unificado (watchdog 5s). |
| `/projetos` | `src/app/projetos/page.tsx` | Estúdio Multi-Arquivo de 15 linguagens (`ProjectsWorkspace`, `ProjectStudioModal`, `SandboxCodeEditor` CodeMirror 6, abas `index.html`/`styles.css`/`script.js`, Prettier `Shift+Alt+F`, auto-save 1.5s, histórico de versões) com `SandboxPreview` (`iframe` com handshake `ping`/`ready` + Python em Pyodide Worker). |
| `/comunidade` | `src/app/comunidade/page.tsx` | Busca `@` e feed de projetos (`CommunityHub`). |
| `/comunidade/perfil` | `src/app/comunidade/perfil/page.tsx` | Perfil público por `?u=` ou `?id=` (`PublicProfileView` em `<Suspense>`), badges/XP e botão denunciar/bloquear (`ReportBlockModal`). |
| `/mensagens` | `src/app/mensagens/page.tsx` | Chat rico (`text`, `code`, `image`, `project_share`), reações, busca na conversa, grupos <=10 e palco WebRTC (`MessagesWorkspace` em `<Suspense>`). |
| `/conta` | `src/app/conta/page.tsx` | Perfil, customização, aparência, projetos, notificações e aba Privacidade & Dados LGPD (`PrivacyDataPanel`). |
| `/privacidade` | `src/app/privacidade/page.tsx` | Política de privacidade, retenção e direitos LGPD. |
| `/auth` | `src/app/auth/page.tsx` | Login/cadastro (com checkbox obrigatório de termos LGPD), Google OAuth e reenvio (`AuthScreen`). |
| `/auth/callback` | `src/app/auth/callback/page.tsx` | Callback PKCE e confirmação `token_hash` (`verifyOtp`). |
| `/auth/native-callback` | `src/app/auth/native-callback/page.tsx` | Ponte HTTPS Android → `intent://` / `com.codit.app://auth/callback`. |
| `/offline` & `404` | `src/app/offline/page.tsx`, `not-found.tsx` | Fallback offline PWA e página não encontrada. |

---

## 2. Componentes, Hooks & A11y

- **Navegação Primária (`src/lib/navigation.ts`, `TopNavbar`):** 6 itens (`Início`, `Trilhas`, `Projetos`, `Comunidade`, `Mensagens`, `Perfil`) + `FriendshipsDrawer`, `AppearanceNavbarControl` e `NotificationsNavbarControl`.
- **Acessibilidade de Modais (`src/hooks/use-dialog-a11y.ts`):** gerencia pilha global `activeDialogStack` (focus trap com `Tab`/`Shift+Tab`, restauração de foco e fechamento por `Escape` apenas no diálogo do topo).
- **UI & Feedback (`src/components/ui/`, `src/lib/app-toast.ts`):** `EmptyStateCard`, `SkeletonList` e sistema de toasts de erro/sucesso (`emitAppToast`, `emitProblemToast`) renderizados em `NotificationToastViewport`.
- **Chat Rico (`src/components/messaging/`):** `CodeMessageBlock` (syntax/copy), `ChatImageAttachment` (signed URLs do bucket `chat-attachments`), `CallStagePanel` e `GlobalCallOverlay`.
- **Observabilidade Global (`src/app/layout.tsx`):** `TelemetryErrorObserver` (`src/lib/telemetry/error-reporter.ts` → `client_error_logs`) e `ObservabilityErrorObserver` (`src/lib/error-observability.ts` → `error_events`).

---

## 3. Armadilhas de UI & Convenções

- **`output: "export"` + `useSearchParams()`:** `/trilhas/licao`, `/comunidade/perfil` e `/mensagens` exigem `<Suspense>`.
- **Canais Realtime Privados:** sempre instanciar `.channel(topic, { config: { private: true } })` para compatibilidade com as políticas em `realtime.messages`.
- **Safe-Area Android/Desktop:** preservar `calc(... + var(--codit-safe-*))` em barras, modais e drawers e respeitar as regras visuais de [[design-system]].

## 4. Navegação
[[INDEX]] · [[Backend]] · [[Auth-Seguranca]] · [[Capacitor-Android]] · [[Fluxos-Criticos]] · [[design-system]] · [[STATE]]
