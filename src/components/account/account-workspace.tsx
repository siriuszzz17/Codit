"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ProfileCustomizerPanel,
  type ProfileDraftState,
} from "@/components/account/profile-customizer-panel";
import { ProfileHeroCard } from "@/components/account/profile-hero-card";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ProfileRow,
  SandboxProjectRow,
} from "@/lib/supabase/database.types";
import { useIsOnline } from "@/lib/use-is-online";
import { useAuth } from "@/modules/auth/auth-provider";
import { DEFAULT_PROFILE_CUSTOMIZATION } from "@/modules/profiles/profile-themes";
import { updateProfile } from "@/modules/profiles/profile-service";
import { listUserSandboxProjects } from "@/modules/sandbox/sandbox-project-service";

export function AccountWorkspace() {
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

  const [profileDraftOverride, setProfileDraftOverride] =
    useState<ProfileDraftState | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [projects, setProjects] = useState<SandboxProjectRow[]>([]);

  const baseProfileDraft = useMemo<ProfileDraftState>(() => {
    const metadataFullName =
      typeof user?.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : "";
    return {
      fullName: profile?.full_name ?? metadataFullName,
      username: profile?.username ?? "",
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
      username: baseProfileDraft.username,
      username_changed_at: null,
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
      username:
        activeDraft.username.trim().replace(/^@+/, "") || baseRow.username,
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

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    async function fetchSummaryProjects(targetUserId: string) {
      const client = getSupabaseClient();
      if (!client) {
        return;
      }

      try {
        const items = await listUserSandboxProjects(targetUserId, client);
        if (!cancelled) {
          setProjects(items);
        }
      } catch {
        // Métricas de projetos são complementares nesta página de perfil.
      }
    }

    void fetchSummaryProjects(userId);

    return () => {
      cancelled = true;
    };
  }, [userId]);

  function handleChangeDraft(
    updater: (current: ProfileDraftState) => ProfileDraftState,
  ) {
    setProfileError(null);
    setProfileMessage(null);
    setProfileDraftOverride((current) => updater(current ?? baseProfileDraft));
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) {
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
      const resolvedCurrentProfile = profile ?? (await refreshProfile());

      await updateProfile(
        userId,
        {
          fullName: activeDraft.fullName,
          username: activeDraft.username,
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
        {
          currentProfile: resolvedCurrentProfile,
        },
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

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-6xl items-center justify-center px-4 py-10">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm text-muted">
            Carregando seu perfil no Codit...
          </p>
        </div>
      </main>
    );
  }

  if (!user || !previewProfile) {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-lg flex-col items-center justify-center px-4 py-10 text-center">
        <div className="w-full space-y-5 rounded-3xl border border-border bg-surface p-6 shadow-xs sm:p-8">
          <div className="flex justify-center">
            <OctopyBadge size={64} decorative={false} />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">
              Entre para acessar e personalizar seu perfil
            </h1>
            <p className="text-sm leading-relaxed text-muted">
              {isConfigured
                ? "Faça login ou crie sua conta gratuita para escolher seu @usuário, tema visual, habilidades e avatar do Octopy."
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

      <ProfileHeroCard
        profile={previewProfile}
        userEmail={user.email ?? ""}
        projects={projects}
        isEditingPreview={profileDraftOverride !== null}
      />

      <div className="codit-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 shadow-xs sm:px-5">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-foreground sm:text-sm">
            Estúdio de código em espaço dedicado
          </p>
          <p className="text-xs text-muted">
            Crie, edite e execute seus projetos na aba exclusiva de Projetos.
          </p>
        </div>
        <Link
          href="/projetos"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-accent-soft px-4 py-2 text-xs font-semibold text-accent-strong transition-colors hover:border-accent"
        >
          Abrir projetos ({projects.length})
        </Link>
      </div>

      <ProfileCustomizerPanel
        draft={activeDraft}
        currentUsername={profile?.username ?? ""}
        usernameChangedAt={profile?.username_changed_at ?? null}
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
    </main>
  );
}
