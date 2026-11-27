"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ProjectStudioModal,
  type ProjectStudioSubmitPayload,
} from "@/components/account/project-studio-modal";
import { ProjectsShowcasePanel } from "@/components/account/projects-showcase-panel";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { LanguageIcon } from "@/components/sandbox/language-icon";
import { SkeletonList } from "@/components/ui/skeleton";
import { emitProblemToast } from "@/lib/app-toast";
import { createProblemDetails } from "@/lib/problem-details";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  SandboxLanguage,
  SandboxProjectRow,
} from "@/lib/supabase/database.types";
import { useIsOnline } from "@/lib/use-is-online";
import { useAuth } from "@/modules/auth/auth-provider";
import {
  computeLanguageBreakdown,
  getLanguageMeta,
} from "@/modules/sandbox/language-catalog";
import {
  buildSandboxProblemDetails,
  createSandboxProject,
  listUserSandboxProjects,
  recordSandboxProjectVersion,
  SandboxProjectConflictError,
  softDeleteSandboxProject,
  togglePinSandboxProject,
  updateSandboxProject,
} from "@/modules/sandbox/sandbox-project-service";

const FEATURED_STUDIO_LANGUAGES: readonly SandboxLanguage[] = [
  "html_css_js",
  "python",
  "javascript",
  "typescript",
  "react",
  "sql",
];

function sortProjects(items: SandboxProjectRow[]): SandboxProjectRow[] {
  return [...items].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) {
      return a.is_pinned ? -1 : 1;
    }
    return Date.parse(b.updated_at) - Date.parse(a.updated_at);
  });
}

export function ProjectsWorkspace() {
  const isOnline = useIsOnline();
  const {
    user,
    profile,
    isLoading,
    isConfigured,
    authError,
    refreshProfile,
  } = useAuth();
  const userId = user?.id ?? null;

  const [projects, setProjects] = useState<SandboxProjectRow[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectsMessage, setProjectsMessage] = useState<string | null>(null);
  const [pinningProjectId, setPinningProjectId] = useState<string | null>(null);
  const [duplicatingProjectId, setDuplicatingProjectId] = useState<
    string | null
  >(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(
    null,
  );

  const [studioOpen, setStudioOpen] = useState(false);
  const [studioSessionKey, setStudioSessionKey] = useState(1);
  const [studioInitialLanguage, setStudioInitialLanguage] =
    useState<SandboxLanguage>("html_css_js");
  const [editingProject, setEditingProject] =
    useState<SandboxProjectRow | null>(null);
  const [savingStudio, setSavingStudio] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [studioMessage, setStudioMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    async function fetchInitialProjects(targetUserId: string) {
      const client = getSupabaseClient();
      if (!client) {
        return;
      }

      await Promise.resolve();
      if (cancelled) {
        return;
      }

      setLoadingProjects(true);
      setProjectsError(null);
      try {
        const items = await listUserSandboxProjects(targetUserId, client);
        if (!cancelled) {
          setProjects(items);
        }
      } catch (error) {
        if (!cancelled) {
          setProjectsError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar seus projetos.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingProjects(false);
        }
      }
    }

    void fetchInitialProjects(userId);

    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function loadProjects(targetUserId: string) {
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    setLoadingProjects(true);
    setProjectsError(null);
    try {
      const items = await listUserSandboxProjects(targetUserId, client);
      setProjects(items);
    } catch (error) {
      setProjectsError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar seus projetos.",
      );
    } finally {
      setLoadingProjects(false);
    }
  }

  function openNewProjectStudio(language: SandboxLanguage = "html_css_js") {
    setEditingProject(null);
    setStudioInitialLanguage(language);
    setStudioError(null);
    setStudioMessage(null);
    setStudioSessionKey((current) => current + 1);
    setStudioOpen(true);
  }

  function openEditProjectStudio(project: SandboxProjectRow) {
    setEditingProject(project);
    setStudioInitialLanguage(project.primary_language);
    setStudioError(null);
    setStudioMessage(null);
    setStudioSessionKey((current) => current + 1);
    setStudioOpen(true);
  }

  async function handleSaveStudioProject(payload: ProjectStudioSubmitPayload) {
    if (!userId) {
      return;
    }

    setStudioError(null);
    setStudioMessage(null);
    setProjectsError(null);
    setProjectsMessage(null);

    if (!isOnline) {
      setStudioError(
        "Você está offline. Conecte-se à internet para salvar projetos.",
      );
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setStudioError("Cliente Supabase não configurado.");
      return;
    }

    setSavingStudio(true);
    try {
      if (!profile) {
        await refreshProfile();
      }

      if (editingProject) {
        const updated = await updateSandboxProject(
          userId,
          editingProject.id,
          {
            title: payload.title,
            description: payload.description,
            primaryLanguage: payload.primaryLanguage,
            visibility: payload.visibility,
            sourceCode: payload.sourceCode,
            files: payload.files ?? null,
            isPinned: payload.isPinned,
            tags: payload.tags,
            repositoryUrl: payload.repositoryUrl,
            liveUrl: payload.liveUrl,
            expectedVersion: editingProject.version,
          },
          client,
        );

        void recordSandboxProjectVersion(
          userId,
          updated,
          "Salvamento manual",
          client,
        );

        setProjects((current) =>
          sortProjects(
            current.map((item) => (item.id === updated.id ? updated : item)),
          ),
        );
        setEditingProject(updated);
        setStudioMessage(
          `Projeto "${updated.title}" atualizado (v${updated.version}).`,
        );
      } else {
        const created = await createSandboxProject(
          userId,
          {
            title: payload.title,
            description: payload.description,
            primaryLanguage: payload.primaryLanguage,
            visibility: payload.visibility,
            sourceCode: payload.sourceCode,
            files: payload.files ?? null,
            isPinned: payload.isPinned,
            tags: payload.tags,
            repositoryUrl: payload.repositoryUrl,
            liveUrl: payload.liveUrl,
          },
          client,
        );

        void recordSandboxProjectVersion(
          userId,
          created,
          "Versão inicial",
          client,
        );

        setProjects((current) => sortProjects([created, ...current]));
        setEditingProject(created);
        setStudioMessage(`Projeto "${created.title}" salvo no seu estúdio!`);
        setProjectsMessage(`Projeto "${created.title}" criado com sucesso.`);
      }
    } catch (error) {
      const problem = buildSandboxProblemDetails(
        error,
        "Não foi possível salvar o projeto",
      );
      emitProblemToast(problem);
      if (error instanceof SandboxProjectConflictError) {
        setStudioError(error.message);
        await loadProjects(userId);
      } else {
        setStudioError(problem.detail);
      }
    } finally {
      setSavingStudio(false);
    }
  }

  async function handleAutoSaveStudioProject(
    payload: ProjectStudioSubmitPayload,
    summary = "Auto-save",
  ): Promise<SandboxProjectRow> {
    if (!userId || !editingProject) {
      throw new Error("Projeto ainda não inicializado para auto-save.");
    }
    if (!isOnline) {
      const problem = createProblemDetails({
        type: "https://codit.app/problems/sandbox-offline",
        title: "Sem conexão",
        status: 0,
        detail: "Conecte-se à internet para sincronizar o auto-save.",
      });
      emitProblemToast(problem);
      throw new Error(problem.detail);
    }
    const client = getSupabaseClient();
    if (!client) {
      throw new Error("Cliente Supabase não configurado.");
    }

    const updated = await updateSandboxProject(
      userId,
      editingProject.id,
      {
        title: payload.title,
        description: payload.description,
        primaryLanguage: payload.primaryLanguage,
        visibility: payload.visibility,
        sourceCode: payload.sourceCode,
        files: payload.files ?? null,
        isPinned: payload.isPinned,
        tags: payload.tags,
        repositoryUrl: payload.repositoryUrl,
        liveUrl: payload.liveUrl,
        expectedVersion: editingProject.version,
      },
      client,
    );

    void recordSandboxProjectVersion(userId, updated, summary, client);

    setProjects((current) =>
      sortProjects(
        current.map((item) => (item.id === updated.id ? updated : item)),
      ),
    );
    setEditingProject(updated);
    return updated;
  }

  async function handleReloadEditingProject(): Promise<SandboxProjectRow | null> {
    if (!userId || !editingProject) {
      return null;
    }
    await loadProjects(userId);
    const client = getSupabaseClient();
    if (!client) {
      return null;
    }
    const freshList = await listUserSandboxProjects(userId, client);
    const refreshed =
      freshList.find((item) => item.id === editingProject.id) ?? null;
    if (refreshed) {
      setProjects(freshList);
      setEditingProject(refreshed);
      setStudioError(null);
    }
    return refreshed;
  }

  async function handleTogglePin(project: SandboxProjectRow) {
    if (!userId) {
      return;
    }

    setProjectsError(null);
    setProjectsMessage(null);

    if (!isOnline) {
      setProjectsError(
        "Você está offline. Conecte-se à internet para fixar projetos.",
      );
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setProjectsError("Cliente Supabase não configurado.");
      return;
    }

    setPinningProjectId(project.id);
    try {
      const updated = await togglePinSandboxProject(userId, project, client);
      setProjects((current) =>
        sortProjects(
          current.map((item) => (item.id === updated.id ? updated : item)),
        ),
      );
      setProjectsMessage(
        updated.is_pinned
          ? `Projeto "${updated.title}" fixado no topo.`
          : `Projeto "${updated.title}" desafixado.`,
      );
    } catch (error) {
      if (error instanceof SandboxProjectConflictError) {
        setProjectsError(error.message);
        await loadProjects(userId);
      } else {
        setProjectsError(
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar a fixação do projeto.",
        );
      }
    } finally {
      setPinningProjectId(null);
    }
  }

  async function handleDuplicateProject(project: SandboxProjectRow) {
    if (!userId) {
      return;
    }

    setProjectsError(null);
    setProjectsMessage(null);

    if (!isOnline) {
      setProjectsError(
        "Você está offline. Conecte-se à internet para duplicar projetos.",
      );
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setProjectsError("Cliente Supabase não configurado.");
      return;
    }

    setDuplicatingProjectId(project.id);
    try {
      const copyTitle = `${project.title} (Cópia)`.slice(0, 120);
      const created = await createSandboxProject(
        userId,
        {
          title: copyTitle,
          description: project.description,
          primaryLanguage: project.primary_language,
          sourceCode: project.source_code,
          files: project.files ?? null,
          visibility: "private",
          isPinned: false,
          tags: project.tags,
          repositoryUrl: project.repository_url,
          liveUrl: project.live_url,
        },
        client,
      );

      setProjects((current) => sortProjects([created, ...current]));
      setProjectsMessage(`Cópia "${created.title}" criada.`);
    } catch (error) {
      setProjectsError(
        error instanceof Error
          ? error.message
          : "Não foi possível duplicar o projeto.",
      );
    } finally {
      setDuplicatingProjectId(null);
    }
  }

  async function handleDeleteProject(project: SandboxProjectRow) {
    if (!userId) {
      return;
    }

    setProjectsError(null);
    setProjectsMessage(null);

    if (!isOnline) {
      setProjectsError(
        "Você está offline. Conecte-se à internet para excluir o projeto.",
      );
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setProjectsError("Cliente Supabase não configurado.");
      return;
    }

    setDeletingProjectId(project.id);
    try {
      const removed = await softDeleteSandboxProject(
        userId,
        project.id,
        client,
      );
      if (removed) {
        setProjects((current) =>
          current.filter((item) => item.id !== project.id),
        );
        if (editingProject?.id === project.id) {
          setStudioOpen(false);
          setEditingProject(null);
        }
        setProjectsMessage(`Projeto "${project.title}" removido.`);
      }
    } catch (error) {
      setProjectsError(
        error instanceof Error
          ? error.message
          : "Não foi possível remover o projeto.",
      );
    } finally {
      setDeletingProjectId(null);
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10">
        <SkeletonList count={4} label="Carregando seu estúdio de projetos..." />
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-2xl flex-col items-center justify-center px-4 py-10 text-center">
        <div className="w-full space-y-6 rounded-3xl border border-border bg-surface p-6 shadow-xs sm:p-8">
          <div className="flex justify-center">
            <OctopyBadge
              size={68}
              variant="coding"
              decorative={false}
              className="rounded-2xl shadow-sm"
            />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Seu estúdio de projetos no Codit
            </h1>
            <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted">
              {isConfigured
                ? "Entre ou crie sua conta gratuita para desenvolver mini-projetos em 15 linguagens, executar previews isolados no Sandbox e salvar tudo na nuvem."
                : "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local e faça login para acessar seu estúdio."}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {FEATURED_STUDIO_LANGUAGES.map((lang) => {
              const meta = getLanguageMeta(lang);
              return (
                <span
                  key={lang}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-muted/60 px-3 py-1.5 text-xs font-medium text-foreground"
                >
                  <LanguageIcon language={lang} size={15} />
                  <span>{meta.shortLabel}</span>
                </span>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/auth?mode=signup"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              Criar conta gratuita
            </Link>
            <Link
              href="/auth"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface-muted px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-accent"
            >
              Entrar
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const breakdown = computeLanguageBreakdown(projects);
  const publicCount = projects.filter(
    (item) => item.visibility === "public_portfolio",
  ).length;
  const friendsCount = projects.filter(
    (item) => item.visibility === "friends",
  ).length;
  const pinnedCount = projects.filter((item) => item.is_pinned).length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      {authError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-foreground sm:text-sm"
        >
          <p className="min-w-0 flex-1">{authError}</p>
          <button
            type="button"
            onClick={() => void refreshProfile()}
            disabled={!isOnline}
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent disabled:opacity-60"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {/* Cabeçalho aberto do estúdio de projetos */}
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1
            id="studio-page-title"
            className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            Projetos
          </h1>
          <p className="max-w-2xl text-sm text-muted">
            Desenvolva no Sandbox isolado (Web e Python via Pyodide Worker),
            defina quem pode ver (privado, amigos ou público) e organize seu
            portfólio.
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => void loadProjects(userId)}
            disabled={loadingProjects || !isOnline}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent disabled:opacity-60 sm:text-sm"
          >
            {loadingProjects ? "Atualizando..." : "Atualizar"}
          </button>
          <button
            type="button"
            onClick={() => openNewProjectStudio()}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 sm:text-sm"
          >
            <span>Novo projeto</span>
          </button>
        </div>
      </header>

      {/* Faixa compacta de métricas + atalhos de linguagem */}
      <section
        aria-labelledby="studio-page-title"
        className="codit-panel space-y-4 p-4 shadow-xs sm:p-5"
      >
        <div className="grid grid-cols-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-muted/35 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <div className="px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-muted">
              Total de projetos
            </p>
            <p className="mt-0.5 text-lg font-bold text-foreground">
              {projects.length}
            </p>
          </div>

          <div className="px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-muted">Linguagens</p>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-lg font-bold text-foreground">
                {breakdown.length}
              </p>
              {breakdown.length > 0 ? (
                <div className="flex items-center -space-x-1">
                  {breakdown.slice(0, 4).map((item) => (
                    <LanguageIcon
                      key={item.language}
                      language={item.language}
                      size={15}
                      className="rounded-sm ring-1 ring-surface"
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-muted">
              Na Comunidade
            </p>
            <p className="mt-0.5 text-lg font-bold text-foreground">
              {publicCount + friendsCount}
            </p>
            <p className="text-[10px] text-muted">
              {publicCount} públicos · {friendsCount} amigos
            </p>
          </div>

          <div className="px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-muted">Fixados</p>
            <p className="mt-0.5 text-lg font-bold text-foreground">
              {pinnedCount}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">
            Criar rapidamente em:
          </p>
          <div className="codit-no-scrollbar flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            {FEATURED_STUDIO_LANGUAGES.map((lang) => {
              const meta = getLanguageMeta(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => openNewProjectStudio(lang)}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface-muted/50 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent hover:bg-accent-soft/40"
                >
                  <LanguageIcon language={lang} size={15} />
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {breakdown.length > 0 ? (
          <div className="space-y-1.5 border-t border-border pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">
                Distribuição das linguagens
              </span>
              <span className="text-muted">
                {projects.length}{" "}
                {projects.length === 1 ? "projeto" : "projetos"}
              </span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              {breakdown.map((item) => (
                <div
                  key={item.language}
                  title={`${item.meta.label}: ${item.percent}%`}
                  style={{
                    width: `${item.percent}%`,
                    backgroundColor: item.meta.accentHex,
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <ProjectsShowcasePanel
        hideTopHeader
        projects={projects}
        isLoading={loadingProjects}
        isOnline={isOnline}
        error={projectsError}
        message={projectsMessage}
        deletingProjectId={deletingProjectId}
        pinningProjectId={pinningProjectId}
        duplicatingProjectId={duplicatingProjectId}
        onCreateNew={openNewProjectStudio}
        onOpenProject={openEditProjectStudio}
        onTogglePin={handleTogglePin}
        onDuplicateProject={handleDuplicateProject}
        onDeleteProject={handleDeleteProject}
        onRefresh={() => loadProjects(userId)}
      />

      {studioOpen ? (
        <ProjectStudioModal
          key={studioSessionKey}
          userId={userId}
          editingProject={editingProject}
          initialLanguage={studioInitialLanguage}
          isSaving={savingStudio}
          isOnline={isOnline}
          error={studioError}
          message={studioMessage}
          onClose={() => setStudioOpen(false)}
          onSubmit={handleSaveStudioProject}
          onAutoSave={handleAutoSaveStudioProject}
          onReloadProject={handleReloadEditingProject}
        />
      ) : null}
    </main>
  );
}
