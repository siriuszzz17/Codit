"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import {
  ProfileCustomizerPanel,
  type ProfileDraftState,
} from "@/components/account/profile-customizer-panel";
import { ProfileHeroCard } from "@/components/account/profile-hero-card";
import {
  ProjectStudioModal,
  type ProjectStudioSubmitPayload,
} from "@/components/account/project-studio-modal";
import { ProjectsShowcasePanel } from "@/components/account/projects-showcase-panel";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ProfileRow,
  SandboxLanguage,
  SandboxProjectRow,
} from "@/lib/supabase/database.types";
import { useIsOnline } from "@/lib/use-is-online";
import { useAuth } from "@/modules/auth/auth-provider";
import { DEFAULT_PROFILE_CUSTOMIZATION } from "@/modules/profiles/profile-themes";
import { updateProfile } from "@/modules/profiles/profile-service";
import {
  createSandboxProject,
  listUserSandboxProjects,
  SandboxProjectConflictError,
  softDeleteSandboxProject,
  togglePinSandboxProject,
  updateSandboxProject,
} from "@/modules/sandbox/sandbox-project-service";

type AccountTab = "projetos" | "personalizar";

function subscribeTabQuery(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener("popstate", onStoreChange);
  return () => {
    window.removeEventListener("popstate", onStoreChange);
  };
}

function getTabQuerySnapshot(): AccountTab {
  if (typeof window === "undefined") {
    return "projetos";
  }
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "personalizar" ? "personalizar" : "projetos";
}

function getServerTabQuerySnapshot(): AccountTab {
  return "projetos";
}

export function AccountWorkspace() {
  const isOnline = useIsOnline();
  const {
    user,
    profile,
    isLoading,
    isConfigured,
    authError,
    refreshProfile,
    signOut,
  } = useAuth();

  const urlTab = useSyncExternalStore(
    subscribeTabQuery,
    getTabQuerySnapshot,
    getServerTabQuerySnapshot,
  );
  const [selectedTab, setSelectedTab] = useState<AccountTab | null>(null);
  const activeTab: AccountTab = selectedTab ?? urlTab;

  // Estado de edição do perfil
  const [profileDraftOverride, setProfileDraftOverride] =
    useState<ProfileDraftState | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Estado dos projetos
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

  // Estado do modal/estúdio de projeto
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioSessionKey, setStudioSessionKey] = useState(1);
  const [studioInitialLanguage, setStudioInitialLanguage] =
    useState<SandboxLanguage>("html_css_js");
  const [editingProject, setEditingProject] =
    useState<SandboxProjectRow | null>(null);
  const [savingStudio, setSavingStudio] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [studioMessage, setStudioMessage] = useState<string | null>(null);

  const baseProfileDraft = useMemo<ProfileDraftState>(() => {
    const metadataFullName =
      typeof user?.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : "";
    return {
      fullName: profile?.full_name ?? metadataFullName,
      headline: profile?.headline ?? "",
      location: profile?.location ?? "",
      bio: profile?.bio ?? "",
      githubUsername: profile?.github_username ?? "",
      linkedinUrl: profile?.linkedin_url ?? "",
      websiteUrl: profile?.website_url ?? "",
      avatarUrl: profile?.avatar_url ?? "",
      bannerPreset:
        profile?.banner_preset ?? DEFAULT_PROFILE_CUSTOMIZATION.banner_preset,
      accentTheme:
        profile?.accent_theme ?? DEFAULT_PROFILE_CUSTOMIZATION.accent_theme,
      avatarFrame:
        profile?.avatar_frame ?? DEFAULT_PROFILE_CUSTOMIZATION.avatar_frame,
      octopyCompanion:
        profile?.octopy_companion ??
        DEFAULT_PROFILE_CUSTOMIZATION.octopy_companion,
      skills: profile?.skills ?? DEFAULT_PROFILE_CUSTOMIZATION.skills,
      showEmail:
        profile?.show_email ?? DEFAULT_PROFILE_CUSTOMIZATION.show_email,
    };
  }, [profile, user]);

  const activeDraft = profileDraftOverride ?? baseProfileDraft;

  const previewProfile = useMemo<ProfileRow | null>(() => {
    if (!user) {
      return null;
    }

    const baseRow: ProfileRow = profile ?? {
      id: user.id,
      email: user.email ?? "",
      full_name: baseProfileDraft.fullName || "Estudante Codit",
      avatar_url: baseProfileDraft.avatarUrl || null,
      role: "student",
      bio: null,
      github_username: null,
      headline: null,
      location: null,
      website_url: null,
      linkedin_url: null,
      banner_preset: DEFAULT_PROFILE_CUSTOMIZATION.banner_preset,
      accent_theme: DEFAULT_PROFILE_CUSTOMIZATION.accent_theme,
      avatar_frame: DEFAULT_PROFILE_CUSTOMIZATION.avatar_frame,
      octopy_companion: DEFAULT_PROFILE_CUSTOMIZATION.octopy_companion,
      skills: [],
      show_email: false,
      created_at: user.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (!profileDraftOverride) {
      return baseRow;
    }

    return {
      ...baseRow,
      full_name: activeDraft.fullName.trim() || baseRow.full_name,
      headline: activeDraft.headline.trim() || null,
      location: activeDraft.location.trim() || null,
      bio: activeDraft.bio.trim() || null,
      github_username: activeDraft.githubUsername.trim() || null,
      linkedin_url: activeDraft.linkedinUrl.trim() || null,
      website_url: activeDraft.websiteUrl.trim() || null,
      avatar_url: activeDraft.avatarUrl.trim() || null,
      banner_preset: activeDraft.bannerPreset,
      accent_theme: activeDraft.accentTheme,
      avatar_frame: activeDraft.avatarFrame,
      octopy_companion: activeDraft.octopyCompanion,
      skills: activeDraft.skills,
      show_email: activeDraft.showEmail,
    };
  }, [activeDraft, baseProfileDraft, profile, profileDraftOverride, user]);

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
          : "Não foi possível carregar seus projetos.",
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
              : "Não foi possível carregar seus projetos.",
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

  function handleSelectTab(nextTab: AccountTab) {
    setSelectedTab(nextTab);
    setProfileError(null);
    setProfileMessage(null);
  }

  function handleChangeDraft(
    updater: (current: ProfileDraftState) => ProfileDraftState,
  ) {
    setProfileError(null);
    setProfileMessage(null);
    setProfileDraftOverride((current) => updater(current ?? baseProfileDraft));
  }

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
      if (!profile) {
        await refreshProfile();
      }

      await updateProfile(
        user.id,
        {
          fullName: activeDraft.fullName,
          headline: activeDraft.headline,
          location: activeDraft.location,
          bio: activeDraft.bio,
          githubUsername: activeDraft.githubUsername.replace(/^@+/, ""),
          linkedinUrl: activeDraft.linkedinUrl,
          websiteUrl: activeDraft.websiteUrl,
          avatarUrl: activeDraft.avatarUrl,
          bannerPreset: activeDraft.bannerPreset,
          accentTheme: activeDraft.accentTheme,
          avatarFrame: activeDraft.avatarFrame,
          octopyCompanion: activeDraft.octopyCompanion,
          skills: activeDraft.skills,
          showEmail: activeDraft.showEmail,
        },
        client,
      );
      await refreshProfile();
      setProfileDraftOverride(null);
      setProfileMessage("Personalizações salvas com sucesso no seu perfil!");
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
    if (!user) {
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
          user.id,
          editingProject.id,
          {
            title: payload.title,
            description: payload.description,
            primaryLanguage: payload.primaryLanguage,
            visibility: payload.visibility,
            sourceCode: payload.sourceCode,
            isPinned: payload.isPinned,
            tags: payload.tags,
            repositoryUrl: payload.repositoryUrl,
            liveUrl: payload.liveUrl,
            expectedVersion: editingProject.version,
          },
          client,
        );

        setProjects((current) =>
          current
            .map((item) => (item.id === updated.id ? updated : item))
            .sort((a, b) => {
              if (a.is_pinned !== b.is_pinned) {
                return a.is_pinned ? -1 : 1;
              }
              return Date.parse(b.updated_at) - Date.parse(a.updated_at);
            }),
        );
        setEditingProject(updated);
        setStudioMessage(
          `Projeto "${updated.title}" atualizado (v${updated.version}).`,
        );
      } else {
        const created = await createSandboxProject(
          user.id,
          {
            title: payload.title,
            description: payload.description,
            primaryLanguage: payload.primaryLanguage,
            visibility: payload.visibility,
            sourceCode: payload.sourceCode,
            isPinned: payload.isPinned,
            tags: payload.tags,
            repositoryUrl: payload.repositoryUrl,
            liveUrl: payload.liveUrl,
          },
          client,
        );

        setProjects((current) =>
          [created, ...current].sort((a, b) => {
            if (a.is_pinned !== b.is_pinned) {
              return a.is_pinned ? -1 : 1;
            }
            return Date.parse(b.updated_at) - Date.parse(a.updated_at);
          }),
        );
        setEditingProject(created);
        setStudioMessage(
          `Projeto "${created.title}" salvo no seu perfil!`,
        );
        setProjectsMessage(`Projeto "${created.title}" criado com sucesso.`);
      }
    } catch (error) {
      if (error instanceof SandboxProjectConflictError) {
        setStudioError(error.message);
        await loadProjects(user.id);
      } else {
        setStudioError(
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o projeto.",
        );
      }
    } finally {
      setSavingStudio(false);
    }
  }

  async function handleTogglePin(project: SandboxProjectRow) {
    if (!user) {
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
      const updated = await togglePinSandboxProject(user.id, project, client);
      setProjects((current) =>
        current
          .map((item) => (item.id === updated.id ? updated : item))
          .sort((a, b) => {
            if (a.is_pinned !== b.is_pinned) {
              return a.is_pinned ? -1 : 1;
            }
            return Date.parse(b.updated_at) - Date.parse(a.updated_at);
          }),
      );
      setProjectsMessage(
        updated.is_pinned
          ? `Projeto "${updated.title}" fixado no topo.`
          : `Projeto "${updated.title}" desafixado.`,
      );
    } catch (error) {
      if (error instanceof SandboxProjectConflictError) {
        setProjectsError(error.message);
        await loadProjects(user.id);
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
    if (!user) {
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
        user.id,
        {
          title: copyTitle,
          description: project.description,
          primaryLanguage: project.primary_language,
          sourceCode: project.source_code,
          visibility: "private",
          isPinned: false,
          tags: project.tags,
          repositoryUrl: project.repository_url,
          liveUrl: project.live_url,
        },
        client,
      );

      setProjects((current) => [created, ...current]);
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
    if (!user) {
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
        user.id,
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
      <main className="mx-auto flex min-h-dvh w-full max-w-4xl items-center justify-center px-4 py-10">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm text-muted">
            Carregando seu perfil e projetos no Codit...
          </p>
        </div>
      </main>
    );
  }

  if (!user || !previewProfile) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 py-10 text-center">
        <div className="w-full space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-xs sm:p-8">
          <div className="flex justify-center">
            <OctopyBadge size={64} decorative={false} />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">
              Entre para acessar seu perfil e projetos
            </h1>
            <p className="text-sm leading-relaxed text-muted">
              {isConfigured
                ? "Faça login ou crie sua conta gratuita para personalizar seu perfil e salvar seus projetos na nuvem."
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
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <Link href="/" className="flex items-center gap-3">
          <OctopyBadge size={40} className="shrink-0 rounded-xl shadow-xs" />
          <div>
            <p className="text-base font-bold tracking-tight text-foreground sm:text-lg">
              Codit
            </p>
            <p className="text-xs text-muted">Perfil e Projetos</p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
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

        <ProfileHeroCard
          profile={previewProfile}
          userEmail={user.email ?? ""}
          projects={projects}
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          isEditingPreview={
            activeTab === "personalizar" && profileDraftOverride !== null
          }
        />

        {activeTab === "projetos" ? (
          <ProjectsShowcasePanel
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
            onRefresh={() => loadProjects(user.id)}
          />
        ) : (
          <ProfileCustomizerPanel
            draft={activeDraft}
            user={user}
            isSaving={savingProfile}
            isOnline={isOnline}
            hasUnsavedChanges={profileDraftOverride !== null}
            error={profileError}
            message={profileMessage}
            onChangeDraft={handleChangeDraft}
            onDiscard={() => {
              setProfileDraftOverride(null);
              setProfileError(null);
              setProfileMessage(null);
            }}
            onSave={handleSaveProfile}
          />
        )}
      </main>

      {studioOpen ? (
        <ProjectStudioModal
          key={studioSessionKey}
          editingProject={editingProject}
          initialLanguage={studioInitialLanguage}
          isSaving={savingStudio}
          isOnline={isOnline}
          error={studioError}
          message={studioMessage}
          onClose={() => setStudioOpen(false)}
          onSubmit={handleSaveStudioProject}
        />
      ) : null}
    </div>
  );
}
