"use client";

import { useMemo, useState } from "react";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { LanguageBadge, LanguageIcon } from "@/components/sandbox/language-icon";
import type {
  SandboxLanguage,
  SandboxProjectRow,
  SandboxVisibility,
} from "@/lib/supabase/database.types";
import {
  computeLanguageBreakdown,
  getLanguageMeta,
} from "@/modules/sandbox/language-catalog";

interface ProjectsShowcasePanelProps {
  projects: readonly SandboxProjectRow[];
  isLoading: boolean;
  isOnline: boolean;
  error: string | null;
  message: string | null;
  deletingProjectId: string | null;
  pinningProjectId: string | null;
  duplicatingProjectId: string | null;
  hideTopHeader?: boolean;
  onCreateNew: (language?: SandboxLanguage) => void;
  onOpenProject: (project: SandboxProjectRow) => void;
  onTogglePin: (project: SandboxProjectRow) => Promise<void>;
  onDuplicateProject: (project: SandboxProjectRow) => Promise<void>;
  onDeleteProject: (project: SandboxProjectRow) => Promise<void>;
  onRefresh: () => Promise<void>;
}

const VISIBILITY_LABELS: Record<SandboxVisibility, string> = {
  private: "Privado",
  friends: "Somente amigos",
  unlisted: "Não listado",
  public_portfolio: "Portfólio público",
};

const QUICK_STARTER_LANGUAGES: readonly SandboxLanguage[] = [
  "html_css_js",
  "python",
  "javascript",
];

function formatDatePtBr(isoDate: string): string {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) {
    return "Agora";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function getCodeExcerpt(sourceCode: string): string {
  const lines = sourceCode.split(/\r?\n/).slice(0, 4);
  return lines.join("\n").trim() || "// Sem código salvo ainda";
}

function toSafeUrl(rawUrl: string | null): string | null {
  if (!rawUrl) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function ProjectsShowcasePanel({
  projects,
  isLoading,
  isOnline,
  error,
  message,
  deletingProjectId,
  pinningProjectId,
  duplicatingProjectId,
  hideTopHeader = false,
  onCreateNew,
  onOpenProject,
  onTogglePin,
  onDuplicateProject,
  onDeleteProject,
  onRefresh,
}: ProjectsShowcasePanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState<SandboxLanguage | "all">(
    "all",
  );
  const [visibilityFilter, setVisibilityFilter] = useState<
    SandboxVisibility | "all"
  >("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const languageCounts = useMemo(
    () => computeLanguageBreakdown(projects),
    [projects],
  );

  const filteredProjects = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return projects.filter((project) => {
      if (
        languageFilter !== "all" &&
        project.primary_language !== languageFilter
      ) {
        return false;
      }
      if (
        visibilityFilter !== "all" &&
        project.visibility !== visibilityFilter
      ) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      const meta = getLanguageMeta(project.primary_language);
      const searchable = [
        project.title,
        project.description ?? "",
        meta.label,
        meta.shortLabel,
        ...project.tags,
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [languageFilter, projects, searchQuery, visibilityFilter]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    languageFilter !== "all" ||
    visibilityFilter !== "all";

  return (
    <section
      aria-labelledby="projects-section-title"
      className="codit-panel space-y-5 p-5 shadow-xs sm:p-6"
    >
      {/* Cabeçalho e ações */}
      {!hideTopHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h2
              id="projects-section-title"
              className="text-lg font-bold text-foreground sm:text-xl"
            >
              Meus Projetos ({projects.length})
            </h2>
            <p className="text-xs text-muted sm:text-sm">
              Crie, execute no sandbox isolado, organize por linguagem e destaque
              no seu portfólio.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={isLoading || !isOnline}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface-muted px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent disabled:opacity-60"
            >
              {isLoading ? "Atualizando..." : "Atualizar"}
            </button>

            <button
              type="button"
              onClick={() => onCreateNew()}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 sm:text-sm"
            >
              <span>+ Novo projeto</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="projects-section-title"
            className="text-base font-bold text-foreground sm:text-lg"
          >
            Todos os projetos ({projects.length})
          </h2>
          <span className="text-xs text-muted">
            Clique em um projeto para editar código e rodar o Sandbox
          </span>
        </div>
      )}

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
        >
          {error}
        </p>
      ) : null}

      {message ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
        >
          {message}
        </p>
      ) : null}

      {/* Barra de busca e filtros */}
      {projects.length > 0 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_210px]">
            <input
              type="search"
              aria-label="Buscar projetos"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar por título, descrição, linguagem ou #tag..."
              className="min-h-10 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
            />

            <select
              aria-label="Filtrar por visibilidade"
              value={visibilityFilter}
              onChange={(event) =>
                setVisibilityFilter(
                  event.target.value as SandboxVisibility | "all",
                )
              }
              className="min-h-10 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:border-accent focus:outline-none sm:text-sm"
            >
              <option value="all">Todas as visibilidades</option>
              <option value="private">Privado</option>
              <option value="friends">Somente amigos</option>
              <option value="unlisted">Não listado</option>
              <option value="public_portfolio">Portfólio público</option>
            </select>
          </div>

          {languageCounts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setLanguageFilter("all")}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-semibold transition-colors ${
                  languageFilter === "all"
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface-muted/50 text-muted hover:border-accent/60 hover:text-foreground"
                }`}
              >
                <span>Todas ({projects.length})</span>
              </button>

              {languageCounts.map((item) => {
                const selected = languageFilter === item.language;
                return (
                  <button
                    key={item.language}
                    type="button"
                    onClick={() =>
                      setLanguageFilter(selected ? "all" : item.language)
                    }
                    className={`inline-flex min-h-8 items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-semibold transition-colors ${
                      selected
                        ? "border-accent bg-accent-soft text-foreground ring-2 ring-accent/25"
                        : "border-border bg-surface-muted/50 text-muted hover:border-accent/60 hover:text-foreground"
                    }`}
                  >
                    <LanguageIcon language={item.language} size={15} />
                    <span>{item.meta.label}</span>
                    <span className="opacity-70">({item.count})</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Lista / Grade */}
      {isLoading && projects.length === 0 ? (
        <div className="space-y-3 py-10 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm text-muted">
            Carregando seus projetos salvos...
          </p>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-surface-muted/35 p-6 text-center sm:p-8">
          <OctopyBadge
            size={60}
            variant="coding"
            decorative={false}
            className="rounded-2xl shadow-sm"
          />
          <div className="max-w-md space-y-1.5">
            <h3 className="text-base font-bold text-foreground">
              Seu espaço de projetos está pronto!
            </h3>
            <p className="text-xs leading-relaxed text-muted sm:text-sm">
              Escolha um ponto de partida abaixo para abrir o estúdio, testar no
              sandbox e salvar o primeiro projeto no seu perfil.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {QUICK_STARTER_LANGUAGES.map((lang) => {
              const meta = getLanguageMeta(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => onCreateNew(lang)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent"
                >
                  <LanguageIcon language={lang} size={18} />
                  <span>Criar em {meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-border bg-surface-muted/30 p-6 text-center">
          <p className="text-sm font-medium text-foreground">
            Nenhum projeto encontrado com os filtros atuais.
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setLanguageFilter("all");
                setVisibilityFilter("all");
              }}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground hover:border-accent"
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredProjects.map((project) => {
            const meta = getLanguageMeta(project.primary_language);
            const repoHref = toSafeUrl(project.repository_url);
            const liveHref = toSafeUrl(project.live_url);
            const confirmingDelete = confirmDeleteId === project.id;

            return (
              <article
                key={project.id}
                className={`flex flex-col justify-between overflow-hidden rounded-2xl border bg-background/70 transition-colors ${
                  project.is_pinned
                    ? "border-amber-500/45 shadow-xs"
                    : "border-border hover:border-accent/60"
                }`}
              >
                <div>
                  <div className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <LanguageBadge
                          language={project.primary_language}
                          size="xs"
                        />
                        <span className="rounded-lg border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
                          {VISIBILITY_LABELS[project.visibility]}
                        </span>
                        <span className="rounded-lg bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-strong">
                          v{project.version}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={pinningProjectId === project.id || !isOnline}
                        onClick={() => void onTogglePin(project)}
                        aria-label={
                          project.is_pinned
                            ? `Desafixar ${project.title}`
                            : `Fixar ${project.title}`
                        }
                        className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                          project.is_pinned
                            ? "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-300"
                            : "border-border bg-surface text-muted hover:border-accent hover:text-foreground"
                        }`}
                      >
                        {pinningProjectId === project.id
                          ? "..."
                          : project.is_pinned
                            ? "★ Fixado"
                            : "☆ Fixar"}
                      </button>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-foreground">
                        {project.title}
                      </h3>
                      {project.description ? (
                        <p className="mt-1 text-xs leading-relaxed text-muted">
                          {project.description}
                        </p>
                      ) : null}
                    </div>

                    {/* Mini bloco de código */}
                    <div className="codit-code-window">
                      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1 text-[10px] text-slate-400">
                        <span className="font-mono text-slate-200">{meta.fileName}</span>
                        <span>
                          {project.source_code.length.toLocaleString("pt-BR")}{" "}
                          chars
                        </span>
                      </div>
                      <pre className="max-h-24 overflow-hidden px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-200">
                        <code>{getCodeExcerpt(project.source_code)}</code>
                      </pre>
                    </div>

                    {project.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {project.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {repoHref || liveHref ? (
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        {repoHref ? (
                          <a
                            href={repoHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-accent-strong hover:underline"
                          >
                            Repositório ↗
                          </a>
                        ) : null}
                        {liveHref ? (
                          <a
                            href={liveHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-accent-strong hover:underline"
                          >
                            Demo ao vivo ↗
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface/60 px-4 py-3">
                  <span className="text-[11px] text-muted">
                    Atualizado em {formatDatePtBr(project.updated_at)}
                  </span>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {confirmingDelete ? (
                      <>
                        <button
                          type="button"
                          disabled={deletingProjectId === project.id}
                          onClick={() => {
                            setConfirmDeleteId(null);
                            void onDeleteProject(project);
                          }}
                          className="inline-flex min-h-8 items-center justify-center rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                        >
                          {deletingProjectId === project.id
                            ? "Excluindo..."
                            : "Confirmar exclusão"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpenProject(project)}
                          className="inline-flex min-h-8 items-center justify-center rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90"
                        >
                          {meta.supportsLivePreview
                            ? "Abrir & Executar"
                            : "Abrir / Editar"}
                        </button>
                        <button
                          type="button"
                          disabled={
                            duplicatingProjectId === project.id || !isOnline
                          }
                          onClick={() => void onDuplicateProject(project)}
                          className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:border-accent disabled:opacity-60"
                        >
                          {duplicatingProjectId === project.id
                            ? "..."
                            : "Duplicar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(project.id)}
                          className="inline-flex min-h-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-500 transition-opacity hover:opacity-85"
                        >
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
