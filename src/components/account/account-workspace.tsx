"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import {
  formatDatePtBr,
  SANDBOX_LANGUAGE_LABELS,
  SANDBOX_VISIBILITY_LABELS,
} from "@/components/social/social-labels";
import { UserAvatar } from "@/components/social/user-avatar";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  SandboxLanguage,
  SandboxProjectRow,
  SandboxVisibility,
} from "@/lib/supabase/database.types";
import { useIsOnline } from "@/lib/use-is-online";
import { useAuth } from "@/modules/auth/auth-provider";
import { updateProfile } from "@/modules/profiles/profile-service";
import {
  createSandboxProject,
  listUserSandboxProjects,
  SandboxProjectConflictError,
  softDeleteSandboxProject,
  updateSandboxProject,
} from "@/modules/sandbox/sandbox-project-service";

export function AccountWorkspace() {
  const isOnline = useIsOnline();
  const { user, profile, isLoading, isConfigured, authError, refreshProfile, signOut } =
    useAuth();

  // Estado do formulário de perfil (`profiles`)
  const [profileFormOverride, setProfileFormOverride] = useState<{
    fullName: string;
    username: string;
    githubUsername: string;
    bio: string;
  } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Estado dos mini-projetos (`sandbox_projects`)
  const [projects, setProjects] = useState<SandboxProjectRow[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectsMessage, setProjectsMessage] = useState<string | null>(null);

  // Formulário de criação/edição de mini-projeto
  const [editingProject, setEditingProject] =
    useState<SandboxProjectRow | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectLanguage, setProjectLanguage] =
    useState<SandboxLanguage>("html_css_js");
  const [projectVisibility, setProjectVisibility] =
    useState<SandboxVisibility>("private");
  const [projectSourceCode, setProjectSourceCode] = useState(
    "<h1>Olá, Codit!</h1>\n<p>Meu primeiro mini-projeto com o Octopy.</p>",
  );
  const [savingProject, setSavingProject] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(
    null,
  );

  const activeFullName =
    profileFormOverride?.fullName ??
    profile?.full_name ??
    (user?.user_metadata?.full_name as string | undefined) ??
    "";
  const activeUsername =
    profileFormOverride?.username ?? profile?.username ?? "";
  const activeGithubUsername =
    profileFormOverride?.githubUsername ?? profile?.github_username ?? "";
  const activeBio = profileFormOverride?.bio ?? profile?.bio ?? "";

  const loadProjects = useCallback(async (userId: string) => {
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    setLoadingProjects(true);
    setProjectsError(null);
    try {
      const items = await listUserSandboxProjects(userId, client);
      setProjects(items);
    } catch (error) {
      setProjectsError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar seus mini-projetos.",
      );
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    let cancelled = false;

    async function fetchInitialProjects(targetUserId: string) {
      const client = getSupabaseClient();
      if (!client) {
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
              : "Não foi possível carregar seus mini-projetos.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingProjects(false);
        }
      }
    }

    void fetchInitialProjects(user.id);

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      return;
    }

    setProfileMessage(null);
    setProfileError(null);

    if (!isOnline) {
      setProfileError(
        "Você está offline. Conecte-se à internet para salvar seu perfil.",
      );
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setProfileError("Cliente Supabase não configurado.");
      return;
    }

    setSavingProfile(true);
    try {
      await updateProfile(
        user.id,
        {
          fullName: activeFullName,
          username: activeUsername,
          githubUsername: activeGithubUsername,
          bio: activeBio,
        },
        client,
      );
      await refreshProfile();
      setProfileFormOverride(null);
      setProfileMessage("Perfil atualizado com sucesso na tabela profiles.");
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar seu perfil.",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  function startCreateProject() {
    setEditingProject(null);
    setProjectTitle("");
    setProjectDescription("");
    setProjectLanguage("html_css_js");
    setProjectVisibility("private");
    setProjectSourceCode(
      "<h1>Olá, Codit!</h1>\n<p>Meu primeiro mini-projeto com o Octopy.</p>",
    );
    setProjectsError(null);
    setProjectsMessage(null);
  }

  function startEditProject(project: SandboxProjectRow) {
    setEditingProject(project);
    setProjectTitle(project.title);
    setProjectDescription(project.description ?? "");
    setProjectLanguage(project.primary_language);
    setProjectVisibility(project.visibility);
    setProjectSourceCode(project.source_code);
    setProjectsError(null);
    setProjectsMessage(null);
  }

  async function handleSaveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      return;
    }

    setProjectsError(null);
    setProjectsMessage(null);

    if (!isOnline) {
      setProjectsError(
        "Você está offline. Conecte-se à internet para salvar mini-projetos.",
      );
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setProjectsError("Cliente Supabase não configurado.");
      return;
    }

    setSavingProject(true);
    try {
      if (editingProject) {
        const updated = await updateSandboxProject(
          user.id,
          editingProject.id,
          {
            title: projectTitle,
            description: projectDescription,
            primaryLanguage: projectLanguage,
            visibility: projectVisibility,
            sourceCode: projectSourceCode,
            expectedVersion: editingProject.version,
          },
          client,
        );
        setProjects((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
        setEditingProject(updated);
        setProjectsMessage(
          `Mini-projeto "${updated.title}" salvo (versão v${updated.version}).`,
        );
      } else {
        const created = await createSandboxProject(
          user.id,
          {
            title: projectTitle,
            description: projectDescription,
            primaryLanguage: projectLanguage,
            visibility: projectVisibility,
            sourceCode: projectSourceCode,
          },
          client,
        );
        setProjects((current) => [created, ...current]);
        setEditingProject(null);
        setProjectTitle("");
        setProjectDescription("");
        setProjectsMessage(
          `Mini-projeto "${created.title}" criado em sandbox_projects.`,
        );
      }
    } catch (error) {
      if (error instanceof SandboxProjectConflictError) {
        setProjectsError(error.message);
        await loadProjects(user.id);
      } else {
        setProjectsError(
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o mini-projeto.",
        );
      }
    } finally {
      setSavingProject(false);
    }
  }

  async function handleDeleteProject(project: SandboxProjectRow) {
    if (!user) {
      return;
    }

    setProjectsError(null);
    setProjectsMessage(null);

    if (!isOnline) {
      setProjectsError(
        "Você está offline. Conecte-se à internet para excluir o mini-projeto.",
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
        user.id,
        project.id,
        client,
      );
      if (removed) {
        setProjects((current) =>
          current.filter((item) => item.id !== project.id),
        );
        if (editingProject?.id === project.id) {
          startCreateProject();
        }
        setProjectsMessage(`Mini-projeto "${project.title}" removido.`);
      }
    } catch (error) {
      setProjectsError(
        error instanceof Error
          ? error.message
          : "Não foi possível remover o mini-projeto.",
      );
    } finally {
      setDeletingProjectId(null);
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-4xl items-center justify-center px-4 py-10">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm text-muted">
            Carregando sua área no Codit...
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 py-10 text-center">
        <div className="w-full space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-xs sm:p-8">
          <div className="flex justify-center">
            <OctopyBadge size={64} decorative={false} />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">
              Entre para acessar sua conta
            </h1>
            <p className="text-sm leading-relaxed text-muted">
              {isConfigured
                ? "Faça login ou crie sua conta gratuita para gerenciar seu perfil e salvar mini-projetos no Supabase."
                : "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local e faça login para acessar seus dados."}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/auth"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              Ir para login / cadastro
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface-muted px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent"
            >
              Voltar ao início
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-5 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <Link href="/" className="flex items-center gap-3">
          <OctopyBadge size={40} className="shrink-0 rounded-xl shadow-xs" />
          <div>
            <p className="text-base font-bold tracking-tight text-foreground sm:text-lg">
              Codit
            </p>
            <p className="text-xs text-muted">Minha conta e mini-projetos</p>
          </div>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/comunidade"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-accent-soft px-3.5 py-2 text-xs font-semibold text-accent-strong transition-colors hover:border-accent sm:text-sm"
          >
            Comunidade
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:border-accent sm:text-sm"
          >
            Início
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface-muted px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent sm:text-sm"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="flex-1 space-y-6 py-6 sm:space-y-8">
        {authError ? (
          <div
            role="alert"
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-foreground sm:text-sm"
          >
            {authError}
          </div>
        ) : null}

        {/* Bloco 1: Perfil (`profiles`) */}
        <section
          aria-labelledby="profile-section-title"
          className="rounded-2xl border border-border bg-surface p-5 shadow-xs sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <UserAvatar
                name={profile?.full_name ?? user.email ?? "Estudante Codit"}
                username={profile?.username}
                avatarUrl={profile?.avatar_url}
                size="md"
              />
              <div>
                <h1
                  id="profile-section-title"
                  className="text-lg font-bold text-foreground sm:text-xl"
                >
                  Meu Perfil
                </h1>
                <p className="text-xs text-muted">
                  {user.email}
                  {profile?.username ? (
                    <span className="ml-2 font-mono font-semibold text-accent-strong">
                      @{profile.username}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {profile?.username ? (
                <Link
                  href={`/comunidade/perfil?u=${encodeURIComponent(profile.username)}`}
                  className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-accent-strong transition-colors hover:border-accent"
                >
                  Ver meu perfil (@{profile.username})
                </Link>
              ) : null}
              <span className="inline-flex items-center rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-semibold text-accent-strong">
                Papel: {profile?.role === "admin" ? "Admin" : "Estudante"}
              </span>
            </div>
          </div>

          <form
            onSubmit={(event) => void handleSaveProfile(event)}
            className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="codit-profile-fullname"
                className="block text-xs font-semibold text-foreground"
              >
                Nome completo
              </label>
              <input
                id="codit-profile-fullname"
                type="text"
                value={activeFullName}
                onChange={(event) =>
                  setProfileFormOverride({
                    fullName: event.target.value,
                    username: activeUsername,
                    githubUsername: activeGithubUsername,
                    bio: activeBio,
                  })
                }
                placeholder="Seu nome"
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="codit-profile-username"
                className="block text-xs font-semibold text-foreground"
              >
                @usuário no Codit
              </label>
              <div className="flex min-h-11 items-center rounded-xl border border-border bg-background px-3.5 focus-within:border-accent">
                <span aria-hidden="true" className="pr-1 font-mono text-sm text-muted">
                  @
                </span>
                <input
                  id="codit-profile-username"
                  type="text"
                  value={activeUsername}
                  onChange={(event) =>
                    setProfileFormOverride({
                      fullName: activeFullName,
                      username: event.target.value,
                      githubUsername: activeGithubUsername,
                      bio: activeBio,
                    })
                  }
                  placeholder="ex.: maria.dev"
                  className="w-full bg-transparent py-2.5 font-mono text-sm text-foreground focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-muted">
                Usado para amigos encontrarem você na Comunidade (letras
                minúsculas, números, ponto ou sublinhado).
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="codit-profile-github"
                className="block text-xs font-semibold text-foreground"
              >
                Usuário no GitHub (opcional)
              </label>
              <input
                id="codit-profile-github"
                type="text"
                value={activeGithubUsername}
                onChange={(event) =>
                  setProfileFormOverride({
                    fullName: activeFullName,
                    username: activeUsername,
                    githubUsername: event.target.value,
                    bio: activeBio,
                  })
                }
                placeholder="ex.: octopy-dev"
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="codit-profile-bio"
                className="block text-xs font-semibold text-foreground"
              >
                Objetivo de carreira / Bio
              </label>
              <textarea
                id="codit-profile-bio"
                rows={2}
                value={activeBio}
                onChange={(event) =>
                  setProfileFormOverride({
                    fullName: activeFullName,
                    username: activeUsername,
                    githubUsername: activeGithubUsername,
                    bio: event.target.value,
                  })
                }
                placeholder="Conte o que você está aprendendo no Codit..."
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
              />
            </div>

            {profileError ? (
              <p
                role="alert"
                className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground sm:col-span-2"
              >
                {profileError}
              </p>
            ) : null}

            {profileMessage ? (
              <p
                role="status"
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground sm:col-span-2"
              >
                {profileMessage}
              </p>
            ) : null}

            <div className="flex justify-end sm:col-span-2">
              <button
                type="submit"
                disabled={savingProfile || !isOnline}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingProfile ? "Salvando perfil..." : "Salvar perfil"}
              </button>
            </div>
          </form>
        </section>

        {/* Bloco 2: Mini-Projetos (`sandbox_projects`) */}
        <section
          aria-labelledby="projects-section-title"
          className="grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_1fr]"
        >
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2
                  id="projects-section-title"
                  className="text-lg font-bold text-foreground"
                >
                  {editingProject
                    ? `Editando: ${editingProject.title}`
                    : "Novo Mini-Projeto"}
                </h2>
                <p className="text-xs text-muted">
                  Persistência isolada por usuário em{" "}
                  <code className="font-mono">sandbox_projects</code>
                </p>
              </div>
              {editingProject ? (
                <button
                  type="button"
                  onClick={startCreateProject}
                  className="rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent"
                >
                  Novo
                </button>
              ) : null}
            </div>

            <form
              onSubmit={(event) => void handleSaveProject(event)}
              className="mt-4 space-y-4"
            >
              <div className="space-y-1.5">
                <label
                  htmlFor="codit-project-title"
                  className="block text-xs font-semibold text-foreground"
                >
                  Título do mini-projeto
                </label>
                <input
                  id="codit-project-title"
                  type="text"
                  required
                  value={projectTitle}
                  onChange={(event) => setProjectTitle(event.target.value)}
                  placeholder="Ex.: Calculadora de IMC em JS"
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="codit-project-language"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Linguagem
                  </label>
                  <select
                    id="codit-project-language"
                    value={projectLanguage}
                    onChange={(event) =>
                      setProjectLanguage(event.target.value as SandboxLanguage)
                    }
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
                  >
                    {Object.entries(SANDBOX_LANGUAGE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="codit-project-visibility"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Visibilidade
                  </label>
                  <select
                    id="codit-project-visibility"
                    value={projectVisibility}
                    onChange={(event) =>
                      setProjectVisibility(
                        event.target.value as SandboxVisibility,
                      )
                    }
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
                  >
                    {Object.entries(SANDBOX_VISIBILITY_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-muted">
                Projetos em <strong>Portfólio público</strong> aparecem para toda
                a Comunidade; <strong>Somente amigos</strong> fica visível apenas
                para seus amigos aceitos.
              </p>

              <div className="space-y-1.5">
                <label
                  htmlFor="codit-project-description"
                  className="block text-xs font-semibold text-foreground"
                >
                  Descrição curta (opcional)
                </label>
                <input
                  id="codit-project-description"
                  type="text"
                  value={projectDescription}
                  onChange={(event) =>
                    setProjectDescription(event.target.value)
                  }
                  placeholder="O que este projeto demonstra no seu portfólio?"
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="codit-project-source"
                  className="block text-xs font-semibold text-foreground"
                >
                  Código-fonte inicial
                </label>
                <textarea
                  id="codit-project-source"
                  rows={6}
                  value={projectSourceCode}
                  onChange={(event) => setProjectSourceCode(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 font-mono text-xs leading-relaxed text-foreground focus:border-accent focus:outline-none"
                />
              </div>

              {projectsError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
                >
                  {projectsError}
                </p>
              ) : null}

              {projectsMessage ? (
                <p
                  role="status"
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
                >
                  {projectsMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={savingProject || !isOnline}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingProject
                  ? "Salvando mini-projeto..."
                  : editingProject
                    ? `Atualizar projeto (v${editingProject.version})`
                    : "Salvar mini-projeto"}
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-foreground">
                Meus Mini-Projetos ({projects.length})
              </h2>
              <button
                type="button"
                onClick={() => void loadProjects(user.id)}
                disabled={loadingProjects || !isOnline}
                className="rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent disabled:opacity-60"
              >
                {loadingProjects ? "Atualizando..." : "Atualizar"}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {loadingProjects && projects.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">
                  Carregando mini-projetos...
                </p>
              ) : projects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-surface-muted/40 p-5 text-center text-sm text-muted">
                  Você ainda não salvou nenhum mini-projeto. Crie o primeiro ao
                  lado para testarmos sua persistência!
                </div>
              ) : (
                projects.map((project) => (
                  <article
                    key={project.id}
                    className="space-y-2.5 rounded-xl border border-border bg-surface-muted/50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">
                          {project.title}
                        </h3>
                        {project.description ? (
                          <p className="mt-0.5 text-xs text-muted">
                            {project.description}
                          </p>
                        ) : null}
                      </div>
                      <span className="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-strong">
                        v{project.version}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      <span className="rounded-md border border-border bg-surface px-2 py-0.5 font-medium text-foreground">
                        {SANDBOX_LANGUAGE_LABELS[project.primary_language]}
                      </span>
                      <span className="rounded-md border border-border bg-surface px-2 py-0.5">
                        {SANDBOX_VISIBILITY_LABELS[project.visibility]}
                      </span>
                      <span>
                        Atualizado em {formatDatePtBr(project.updated_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => startEditProject(project)}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteProject(project)}
                        disabled={deletingProjectId === project.id}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-500 transition-opacity hover:opacity-85 disabled:opacity-60"
                      >
                        {deletingProjectId === project.id
                          ? "Excluindo..."
                          : "Excluir"}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
