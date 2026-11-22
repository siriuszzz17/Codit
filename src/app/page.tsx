import { OctopyBadge } from "@/components/brand/octopy-badge";

interface PillarCard {
  title: string;
  description: string;
  tag: string;
}

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
  "Next.js App Router com TypeScript em modo strict",
  "Estilização Mobile-First (360px+) com Tailwind CSS v4",
  "PWA instalável com manifest.webmanifest, ícones e fallback /offline",
  "Contrato server-side de variáveis de ambiente (.env.example) e erros RFC 9457",
  "Endpoint de verificação de saúde operacional em /api/v1/health",
];

const NEXT_MILESTONES: ReadonlyArray<{ phase: string; title: string }> = [
  {
    phase: "Fase 2",
    title: "PostgreSQL, autenticação tradicional + Google OAuth 2.0 e isolamento por user_id",
  },
  {
    phase: "Fase 3",
    title: "Trilhas didáticas, persistência de progresso e Sandbox client-side (iframe + Pyodide)",
  },
  {
    phase: "Fase 4",
    title: "Tutor IA socrático Octopy via proxy server-side e portfólio compartilhável",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <OctopyBadge size={40} className="shrink-0 rounded-xl shadow-sm" />
          <div>
            <p className="text-base font-bold tracking-tight text-foreground sm:text-lg">
              Codit
            </p>
            <p className="text-xs text-muted">
              Aprender tecnologia com clareza e prática
            </p>
          </div>
        </div>

        <span className="inline-flex items-center rounded-full border border-border bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
          Fase 1 · Base PWA
        </span>
      </header>

      <main className="flex-1 space-y-8 py-6 sm:space-y-10 sm:py-8">
        <section
          aria-labelledby="hero-title"
          className="rounded-2xl border border-border bg-surface p-5 shadow-xs sm:p-7"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-accent-strong uppercase">
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
            </div>

            <div className="flex shrink-0 items-center gap-3 self-start rounded-2xl border border-border bg-surface-muted px-4 py-3 sm:self-center">
              <OctopyBadge size={52} decorative={false} />
              <div className="text-xs leading-snug">
                <p className="font-semibold text-foreground">Octopy</p>
                <p className="text-muted">Tutor IA socrático</p>
                <p className="text-[11px] font-medium text-accent-strong">
                  Planejado para a Fase 4
                </p>
              </div>
            </div>
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
                className="flex flex-col justify-between gap-2.5 rounded-2xl border border-border bg-surface p-4 sm:p-5"
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
          <div className="rounded-2xl border border-border bg-surface p-5">
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

          <div className="rounded-2xl border border-border bg-surface p-5">
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
        <p>Codit · Estrutura inicial limpa (sem autenticação ou sandbox nesta etapa)</p>
        <p className="font-mono">GET /api/v1/health</p>
      </footer>
    </div>
  );
}
