"use client";

import Link from "next/link";
import { useState } from "react";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { LanguageIcon } from "@/components/sandbox/language-icon";

type WorkbenchTabId = "sandbox" | "community" | "voice";

const WORKBENCH_TABS: ReadonlyArray<{
  id: WorkbenchTabId;
  tabLabel: string;
  subtitle: string;
}> = [
  {
    id: "sandbox",
    tabLabel: "index.html",
    subtitle: "Sandbox isolado",
  },
  {
    id: "community",
    tabLabel: "@comunidade",
    subtitle: "Feed e clones",
  },
  {
    id: "voice",
    tabLabel: "sala-voz",
    subtitle: "Voz e tela",
  },
];

export function HeroWorkbench() {
  const [activeTab, setActiveTab] = useState<WorkbenchTabId>("sandbox");

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-sm">
      {/* Barra superior com abas reais do ambiente */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted/70 px-3 py-2.5">
        <div
          role="tablist"
          aria-label="Demonstração interativa do Codit"
          className="flex flex-wrap items-center gap-1"
        >
          {WORKBENCH_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-2.5 py-1.5 font-mono text-xs font-semibold transition-colors ${
                  active
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {tab.tabLabel}
              </button>
            );
          })}
        </div>

        <span className="text-[11px] font-medium text-muted">
          {WORKBENCH_TABS.find((tab) => tab.id === activeTab)?.subtitle}
        </span>
      </div>

      {/* Painel ativo */}
      {activeTab === "sandbox" ? (
        <div className="space-y-4 p-4 sm:p-5">
          <div className="codit-code-window">
            <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5 font-mono text-slate-200">
                <LanguageIcon language="html_css_js" size={14} />
                index.html
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                />
                Sandbox ativo
              </span>
            </div>
            <pre className="overflow-x-auto px-3.5 py-3 font-mono text-xs leading-relaxed text-slate-200">
              <code>{`const meta = "Dominar lógica com projetos reais";
function iniciar(aluno) {
  return \`\${aluno}, seu código roda isolado aqui.\`;
}
console.log(iniciar("@voce"));`}</code>
            </pre>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted/50 p-3.5">
            <OctopyBadge
              size={36}
              variant="coding"
              className="shrink-0 rounded-xl"
            />
            <div className="min-w-0 space-y-1 text-xs leading-relaxed">
              <p className="font-semibold text-foreground">
                Octopy · Guia de estudo
              </p>
              <p className="text-muted">
                Dica socrática: antes de mudar a função, observe o que{" "}
                <code className="font-mono text-foreground">iniciar()</code>{" "}
                retorna quando recebe um{" "}
                <code className="font-mono text-foreground">@usuário</code>.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted">
              15 linguagens organizadas no estúdio
            </span>
            <Link
              href="/projetos"
              className="font-semibold text-accent-strong hover:underline"
            >
              Abrir estúdio
            </Link>
          </div>
        </div>
      ) : activeTab === "community" ? (
        <div className="space-y-4 p-4 sm:p-5">
          <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <OctopyBadge
                  size={34}
                  variant="happy"
                  className="shrink-0 rounded-xl"
                />
                <div className="leading-tight">
                  <p className="text-xs font-bold text-foreground">
                    Marina Costa
                  </p>
                  <p className="font-mono text-[11px] text-accent-strong">
                    @marina.py
                  </p>
                </div>
              </div>
              <span className="rounded-lg border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
                Somente amigos
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">
                Simulador de Pomodoros em JS
              </p>
              <p className="text-xs leading-relaxed text-muted">
                Cronômetro leve para ciclos de estudo com alerta sonoro e histórico local.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-2.5 text-xs text-muted">
              <span>18 curtidas · 6 comentários</span>
              <span className="font-semibold text-accent-strong">
                Clonável em modo privado
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted">
              Perfis públicos sem exposição de e-mail
            </span>
            <Link
              href="/comunidade"
              className="font-semibold text-accent-strong hover:underline"
            >
              Explorar comunidade
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4 p-4 sm:p-5">
          <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-emerald-500"
                />
                Grupo de estudos · Voz ativa
              </span>
              <span className="font-mono text-xs font-semibold text-foreground">
                08:24
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-emerald-500/40 bg-surface p-2.5">
                <p className="font-semibold text-foreground">@lucas.dev</p>
                <p className="text-[11px] text-muted">Compartilhando tela</p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-2.5">
                <p className="font-semibold text-foreground">@ana.sql</p>
                <p className="text-[11px] text-muted">Ouvindo por voz</p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-muted">
              Grupos de até 10 amigos aceitos com chat em tempo real, áudio e compartilhamento de tela sem vídeo de câmera.
            </p>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted">
              Conversas protegidas entre amigos
            </span>
            <Link
              href="/mensagens"
              className="font-semibold text-accent-strong hover:underline"
            >
              Abrir mensagens
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
