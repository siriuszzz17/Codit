import Link from "next/link";
import { HeroWorkbench } from "@/components/home/hero-workbench";

interface WorkspaceArea {
  href: string;
  tag: string;
  title: string;
  description: string;
  cta: string;
}

const WORKSPACE_AREAS: ReadonlyArray<WorkspaceArea> = [
  {
    href: "/projetos",
    tag: "Oficina",
    title: "Estúdio & Sandbox",
    description:
      "Escreva código em 15 linguagens com execução HTML/CSS/JS isolada no navegador.",
    cta: "Abrir projetos",
  },
  {
    href: "/comunidade",
    tag: "Social",
    title: "Comunidade Codit",
    description:
      "Descubra projetos públicos, busque colegas por @usuário, curta, comente e clone ideias.",
    cta: "Explorar feed",
  },
  {
    href: "/mensagens",
    tag: "Grupos",
    title: "Mensagens & Voz",
    description:
      "Converse com amigos, crie grupos de até 10 pessoas e compartilhe a tela por voz.",
    cta: "Abrir conversas",
  },
  {
    href: "/conta",
    tag: "Personalização",
    title: "Perfil & Aparência",
    description:
      "Configure seu @usuário, tema do app, papel de parede, habilidades e links de portfólio.",
    cta: "Editar perfil",
  },
];

const LEARNING_PILLARS: ReadonlyArray<{
  title: string;
  description: string;
}> = [
  {
    title: "Programação do básico ao avançado",
    description:
      "Fundamentos de lógica, estruturas de dados, desenvolvimento web e Python com exercícios práticos.",
  },
  {
    title: "Inteligência Artificial aplicada",
    description:
      "Uso consciente de modelos de linguagem, engenharia de prompts e integração com projetos reais.",
  },
  {
    title: "Git, GitHub e boas práticas",
    description:
      "Versionamento limpo, pull requests e organização de código alinhada a times de engenharia.",
  },
  {
    title: "Carreira tech e portfólio",
    description:
      "Mini-projetos compartilháveis, checklist de currículo e preparação estruturada para entrevistas.",
  },
];

const ROADMAP_STEPS: ReadonlyArray<{
  step: string;
  title: string;
  status: string;
}> = [
  {
    step: "Etapa 01",
    title: "Estúdio de projetos, perfil personalizável, rede social e chat por voz",
    status: "Integrado",
  },
  {
    step: "Etapa 02",
    title: "Catálogo de trilhas em português e execução Python via Pyodide Web Worker",
    status: "Próxima entrega",
  },
  {
    step: "Etapa 03",
    title: "Tutor socrático Octopy via proxy seguro e expansão multi-linguagem",
    status: "Planejado",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-6 sm:gap-16 sm:px-6 sm:py-12">
      <main className="space-y-12 sm:space-y-16">
        {/* Hero assimétrico */}
        <section
          aria-labelledby="hero-title"
          className="grid items-center gap-8 lg:grid-cols-[1.06fr_0.94fr] lg:gap-10"
        >
          <div className="space-y-5">
            <h1
              id="hero-title"
              className="max-w-[19ch] text-3xl font-extrabold tracking-[-0.03em] text-foreground sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12]"
            >
              Aprenda programação criando projetos reais com seus amigos.
            </h1>

            <p className="max-w-[60ch] text-sm leading-relaxed text-muted sm:text-base">
              O <strong className="font-semibold text-foreground">Codit</strong>{" "}
              reúne um estúdio prático com Sandbox isolado, uma comunidade
              amigável por <code className="font-mono text-foreground">@usuário</code>{" "}
              e salas de voz em grupo para estudar junto no navegador, no desktop
              ou no celular.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <Link
                href="/auth?mode=signup"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
              >
                Começar gratuitamente
              </Link>
              <Link
                href="/projetos"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-accent"
              >
                Abrir estúdio
              </Link>
              <Link
                href="/comunidade"
                className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-accent-strong transition-colors hover:bg-accent-soft/60"
              >
                Explorar comunidade
              </Link>
            </div>

            <p className="text-xs text-muted">
              Dica: personalize o tema e o papel de parede do aplicativo pelo menu{" "}
              <strong className="font-semibold text-foreground">Aparência</strong>{" "}
              no topo.
            </p>
          </div>

          <HeroWorkbench />
        </section>

        {/* Diretório unificado dos espaços do Codit */}
        <section aria-labelledby="areas-title" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2
                id="areas-title"
                className="text-lg font-bold tracking-tight text-foreground sm:text-xl"
              >
                Tudo no lugar certo
              </h2>
              <p className="text-sm text-muted">
                Fluxos separados para escrever código, socializar e conversar sem
                poluição visual.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            {WORKSPACE_AREAS.map((area) => (
              <Link
                key={area.href}
                href={area.href}
                className="group flex flex-col justify-between gap-4 p-5 transition-colors hover:bg-surface-muted/45"
              >
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-accent-strong">
                    {area.tag}
                  </span>
                  <h3 className="text-base font-bold text-foreground group-hover:text-accent-strong">
                    {area.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted sm:text-sm">
                    {area.description}
                  </p>
                </div>
                <span className="text-xs font-semibold text-foreground group-hover:text-accent-strong">
                  {area.cta}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Pilares e evolução do projeto em formato editorial limpo */}
        <section
          aria-labelledby="pillars-title"
          className="grid grid-cols-1 gap-8 border-t border-border pt-10 lg:grid-cols-2 lg:gap-12"
        >
          <div className="space-y-4">
            <div>
              <h2
                id="pillars-title"
                className="text-lg font-bold tracking-tight text-foreground sm:text-xl"
              >
                O que você constrói no Codit
              </h2>
              <p className="mt-1 text-sm text-muted">
                Trilha pensada para celular e computador, pronta para instalar como
                PWA ou aplicativo nativo.
              </p>
            </div>

            <dl className="divide-y divide-border border-t border-border">
              {LEARNING_PILLARS.map((pillar) => (
                <div key={pillar.title} className="py-3.5">
                  <dt className="text-sm font-bold text-foreground">
                    {pillar.title}
                  </dt>
                  <dd className="mt-1 max-w-[64ch] text-xs leading-relaxed text-muted sm:text-sm">
                    {pillar.description}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                Evolução da plataforma
              </h2>
              <p className="mt-1 text-sm text-muted">
                Base multiplataforma compartilhada entre Web/PWA, Windows e Android.
              </p>
            </div>

            <ol className="space-y-3">
              {ROADMAP_STEPS.map((item) => (
                <li
                  key={item.step}
                  className="codit-panel flex flex-col gap-1.5 p-4"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-semibold text-accent-strong">
                      {item.step}
                    </span>
                    <span className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted">
                      {item.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed text-foreground">
                    {item.title}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="flex flex-col gap-1.5 border-t border-border pt-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>Codit · Estúdio de código, rede de estudos e mensagens em grupo.</p>
        <p className="font-mono">Web · PWA · Windows · Android</p>
      </footer>
    </div>
  );
}
