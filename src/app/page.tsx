import Link from "next/link";
import { OctopyBadge } from "@/components/brand/octopy-badge";

interface PillarCard {
  title: string;
  description: string;
  tag: string;
}

interface WorkspaceShortcut {
  href: string;
  badge: string;
  title: string;
  description: string;
  cta: string;
}

const WORKSPACE_SHORTCUTS: ReadonlyArray<WorkspaceShortcut> = [
  {
    href: "/projetos",
    badge: "Desenvolvimento",
    title: "Projetos & Estúdio",
    description:
      "Escreva código em até 15 linguagens, execute prévias isoladas no Sandbox e organize seu portfólio.",
    cta: "Abrir Projetos →",
  },
  {
    href: "/comunidade",
    badge: "Rede Social",
    title: "Comunidade Codit",
    description:
      "Explore criações de outros alunos, pesquise colegas por @usuário, curta, comente e clone ideias.",
    cta: "Explorar Comunidade →",
  },
  {
    href: "/conta",
    badge: "Identidade",
    title: "Meu Perfil",
    description:
      "Defina seu @usuário, personalize capa, tema visual, humor do Octopy e habilidades técnicas.",
    cta: "Personalizar Perfil →",
  },
];

const PRODUCT_PILLARS: ReadonlyArray<PillarCard> = [
  {
    tag: "Trilha Central",
    title: "Programação do básico ao avançado",
    description:
      "Fundamentos de lógica, estruturas de dados, web e Python com exercícios práticos passo a passo.",
  },
  {
    tag: "Futuro & Mercado",
    title: "Inteligência Artificial aplicada",
    description:
      "Uso consciente de LLMs, engenharia de prompts e integração prática com projetos reais.",
  },
  {
    tag: "Fluxo Profissional",
    title: "Git, GitHub e boas práticas",
    description:
      "Versionamento limpo, pull requests, organização de código e padrões usados por times de engenharia.",
  },
  {
    tag: "Preparação Real",
    title: "Carreira Tech & portfólio",
    description:
      "Mini-projetos compartilháveis, checklist de currículo/GitHub e preparação estruturada para entrevistas.",
  },
];

const ACTIVE_FOUNDATION: ReadonlyArray<string> = [
  "Next.js App Router com TypeScript em modo strict e exportação estática out/",
  "Autenticação client-side via Supabase (e-mail/senha + Google OAuth 2.0 PKCE)",
  "Estúdio dedicado de projetos com ícones de 15 linguagens + Sandbox HTML/CSS/JS isolado",
  "Comunidade Codit com @usuário, barra de amizades no topo, feed, curtidas e clonagem",
  "PWA instalável com manifest.webmanifest, Tauri v2 (.exe) e Capacitor 8 (.apk)",
];

const NEXT_MILESTONES: ReadonlyArray<{ phase: string; title: string }> = [
  {
    phase: "Fase 3 (Em andamento)",
    title:
      "Estúdio de projetos dedicado, perfil personalizável e trilhas didáticas",
  },
  {
    phase: "Fase 3 (Próxima entrega)",
    title:
      "Catálogo de trilhas/lições em pt-BR e execução Python via Pyodide Web Worker",
  },
  {
    phase: "Fase 4",
    title:
      "Tutor IA socrático Octopy via proxy server-side e expansão de portfólio",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:gap-10 sm:px-6 sm:py-10">
      <main className="space-y-8 sm:space-y-10">
        {/* Hero principal */}
        <section
          aria-labelledby="hero-title"
          className="overflow-hidden rounded-3xl border border-border bg-surface shadow-xs"
        >
          <div className="h-1.5 w-full bg-gradient-to-r from-accent via-violet-500 to-fuchsia-500" />
          <div className="flex flex-col gap-6 p-5 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3.5">
              <p className="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
                Plataforma Educacional Mobile-First
              </p>
              <h1
                id="hero-title"
                className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
              >
                Sua jornada em programação, IA e carreira tech começa aqui.
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
                O <strong className="font-semibold text-foreground">Codit</strong>{" "}
                combina prática guiada no navegador com o{" "}
                <strong className="font-semibold text-foreground">Octopy</strong>,
                nosso mascote polvo roxo que atuará como tutor socrático para
                destravar seu raciocínio sem entregar respostas prontas logo de
                cara.
              </p>
              <div className="flex flex-wrap items-center gap-2.5 pt-2">
                <Link
                  href="/auth?mode=signup"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
                >
                  Começar agora
                </Link>
                <Link
                  href="/projetos"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-accent"
                >
                  Abrir Projetos
                </Link>
                <Link
                  href="/comunidade"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-accent-strong transition-colors hover:border-accent"
                >
                  Comunidade (@)
                </Link>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3.5 self-start rounded-2xl border border-border bg-surface-muted/70 px-4 py-3.5 lg:self-center">
              <OctopyBadge
                size={60}
                variant="coding"
                decorative={false}
                className="shrink-0 rounded-xl shadow-sm"
              />
              <div className="text-xs leading-snug">
                <p className="font-bold text-foreground">Octopy</p>
                <p className="text-muted">Tutor IA socrático</p>
                <p className="mt-0.5 text-[11px] font-semibold text-accent-strong">
                  Planejado para a Fase 4
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Espaços organizados do Codit */}
        <section aria-labelledby="areas-title" className="space-y-4">
          <div className="space-y-1">
            <h2
              id="areas-title"
              className="text-lg font-semibold tracking-tight text-foreground sm:text-xl"
            >
              Navegue por área
            </h2>
            <p className="text-sm text-muted">
              Cada fluxo no seu espaço dedicado — acesse pela barra superior a
              qualquer momento.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {WORKSPACE_SHORTCUTS.map((area) => (
              <Link
                key={area.href}
                href={area.href}
                className="group flex flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-5 shadow-xs transition-all hover:border-accent"
              >
                <div className="space-y-2">
                  <span className="inline-block rounded-lg bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-strong">
                    {area.badge}
                  </span>
                  <h3 className="text-base font-bold text-foreground group-hover:text-accent-strong">
                    {area.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted sm:text-sm">
                    {area.description}
                  </p>
                </div>
                <span className="text-xs font-semibold text-accent-strong">
                  {area.cta}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="pillars-title" className="space-y-4">
          <div className="space-y-1">
            <h2
              id="pillars-title"
              className="text-lg font-semibold tracking-tight text-foreground sm:text-xl"
            >
              Pilares de formação do Codit
            </h2>
            <p className="text-sm text-muted">
              Estrutura pensada para celular e desktop, pronta para instalação
              como aplicativo PWA.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4">
            {PRODUCT_PILLARS.map((pillar) => (
              <article
                key={pillar.title}
                className="flex flex-col justify-between gap-2.5 rounded-2xl border border-border bg-surface p-5 shadow-xs"
              >
                <div className="space-y-1.5">
                  <span className="inline-block rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-accent-strong">
                    {pillar.tag}
                  </span>
                  <h3 className="text-base font-semibold text-foreground">
                    {pillar.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted">
                    {pillar.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="foundation-title"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
            <h2
              id="foundation-title"
              className="text-base font-semibold text-foreground"
            >
              Base técnica operacional
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {ACTIVE_FOUNDATION.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
            <h2 className="text-base font-semibold text-foreground">
              Próximos marcos do roadmap
            </h2>
            <ul className="mt-3 space-y-3 text-sm">
              {NEXT_MILESTONES.map((milestone) => (
                <li
                  key={milestone.phase}
                  className="rounded-xl border border-border bg-surface-muted/60 px-3.5 py-2.5"
                >
                  <p className="text-xs font-semibold text-accent-strong">
                    {milestone.phase}
                  </p>
                  <p className="mt-0.5 text-muted">{milestone.title}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="flex flex-col gap-1 border-t border-border pt-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          Codit · Estúdio de Projetos, Perfil Personalizável &amp; Comunidade
          Codit
        </p>
        <p className="font-mono">GET /api/v1/health</p>
      </footer>
    </div>
  );
}
