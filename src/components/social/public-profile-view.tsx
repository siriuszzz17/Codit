"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { LanguageBadge, LanguageIcon } from "@/components/sandbox/language-icon";
import { FriendshipActionButton } from "@/components/social/friendship-action-button";
import { ProjectViewerModal } from "@/components/social/project-viewer-modal";
import {
  formatDatePtBr,
  getInitials,
  isSafeHttpUrl,
  SANDBOX_VISIBILITY_LABELS,
} from "@/components/social/social-labels";
import {
  emitFriendshipsChanged,
  subscribeFriendshipsChanged,
} from "@/lib/social-events";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useIsOnline } from "@/lib/use-is-online";
import { useAuth } from "@/modules/auth/auth-provider";
import {
  findLanguageForSkill,
  getAccentThemeMeta,
  getAvatarFrameMeta,
  getBannerMeta,
  getOctopyCompanionMeta,
  isAllowedAvatarPath,
} from "@/modules/profiles/profile-themes";
import {
  computeLanguageBreakdown,
  getLanguageMeta,
} from "@/modules/sandbox/language-catalog";
import {
  getPublicProfileBundle,
  mergeSelfPublicProfileFallback,
  SocialServiceError,
  type CommunityProjectCard,
  type PublicProfileBundle,
} from "@/modules/social/social-service";

function formatMemberSince(isoDate: string): string {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) {
    return "Recente";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function toSafeExternalUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function PublicProfileView() {
  const searchParams = useSearchParams();
  const usernameParam = searchParams.get("u");
  const userIdParam = searchParams.get("id");
  const targetKey = `${usernameParam ?? ""}::${userIdParam ?? ""}`;

  const isOnline = useIsOnline();
  const {
    user,
    profile: ownProfile,
    isLoading: isAuthLoading,
    isConfigured,
  } = useAuth();
  const viewerId = user?.id ?? null;

  const [bundle, setBundle] = useState<PublicProfileBundle | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [permissionGrantMissing, setPermissionGrantMissing] = useState(false);
  const [copiedHandle, setCopiedHandle] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] =
    useState<CommunityProjectCard | null>(null);

  const missingParams = !usernameParam?.trim() && !userIdParam?.trim();
  const isFetchingTarget =
    isConfigured &&
    !isAuthLoading &&
    !missingParams &&
    loadedKey !== targetKey;

  useEffect(() => {
    if (!isConfigured || isAuthLoading || missingParams) {
      return;
    }

    let cancelled = false;

    async function fetchBundle() {
      const client = getSupabaseClient();
      if (!client) {
        await Promise.resolve();
        if (!cancelled) {
          setProfileError("Cliente Supabase não configurado.");
          setLoadedKey(targetKey);
        }
        return;
      }

      try {
        const result = await getPublicProfileBundle(
          { username: usernameParam, userId: userIdParam },
          viewerId,
          client,
        );

        if (cancelled) {
          return;
        }

        setBundle(result);
        setProfileError(null);
        setMigrationMissing(false);
        setPermissionGrantMissing(false);
        setLoadedKey(targetKey);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof SocialServiceError) {
          setPermissionGrantMissing(error.isPermissionGrantMissing);
          setMigrationMissing(
            error.isMigrationMissing && !error.isPermissionGrantMissing,
          );
        }
        setBundle(null);
        setProfileError(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar este perfil.",
        );
        setLoadedKey(targetKey);
      }
    }

    void fetchBundle();
    const unsubFriendships = subscribeFriendshipsChanged(() => {
      void fetchBundle();
    });

    return () => {
      cancelled = true;
      unsubFriendships();
    };
  }, [
    isAuthLoading,
    isConfigured,
    missingParams,
    targetKey,
    userIdParam,
    usernameParam,
    viewerId,
  ]);

  async function reloadBundle() {
    if (missingParams) {
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    try {
      const result = await getPublicProfileBundle(
        { username: usernameParam, userId: userIdParam },
        viewerId,
        client,
      );
      setBundle(result);
      setProfileError(null);
      setMigrationMissing(false);
      setPermissionGrantMissing(false);
    } catch (error) {
      if (error instanceof SocialServiceError) {
        setPermissionGrantMissing(error.isPermissionGrantMissing);
        setMigrationMissing(
          error.isMigrationMissing && !error.isPermissionGrantMissing,
        );
      }
      setProfileError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar este perfil.",
      );
    }
  }

  async function handleCopyHandle(username: string) {
    try {
      await navigator.clipboard.writeText(`@${username}`);
      setCopiedHandle(true);
      setTimeout(() => setCopiedHandle(false), 2000);
    } catch {
      setProfileError("Não foi possível copiar o @usuário.");
    }
  }

  function handleProjectMetaChange(
    projectId: string,
    patch: Partial<
      Pick<
        CommunityProjectCard,
        "likesCount" | "commentsCount" | "likedByViewer"
      >
    >,
  ) {
    setBundle((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        projects: current.projects.map((item) =>
          item.project.id === projectId ? { ...item, ...patch } : item,
        ),
      };
    });
    setSelectedProject((current) =>
      current && current.project.id === projectId
        ? { ...current, ...patch }
        : current,
    );
  }

  const displayProfile = bundle
    ? mergeSelfPublicProfileFallback(
        bundle.profile,
        bundle.relation.status === "self" ? ownProfile : null,
        bundle.hasPublicCustomizationColumns,
      )
    : null;

  const banner = displayProfile
    ? getBannerMeta(displayProfile.banner_preset)
    : null;
  const accentTheme = displayProfile
    ? getAccentThemeMeta(displayProfile.accent_theme)
    : null;
  const avatarFrame = displayProfile
    ? getAvatarFrameMeta(displayProfile.avatar_frame)
    : null;
  const companion = displayProfile
    ? getOctopyCompanionMeta(displayProfile.octopy_companion)
    : null;

  const breakdown = bundle
    ? computeLanguageBreakdown(bundle.projects.map((item) => item.project))
    : [];

  const isPixelAvatar =
    Boolean(displayProfile?.avatar_url) &&
    isAllowedAvatarPath(displayProfile?.avatar_url ?? "");
  const showAvatarImage =
    Boolean(displayProfile?.avatar_url) &&
    (isSafeHttpUrl(displayProfile?.avatar_url) || isPixelAvatar) &&
    failedAvatarUrl !== displayProfile?.avatar_url;

  const githubUrl = displayProfile?.github_username
    ? `https://github.com/${encodeURIComponent(displayProfile.github_username)}`
    : null;
  const linkedinUrl = toSafeExternalUrl(displayProfile?.linkedin_url);
  const websiteUrl = toSafeExternalUrl(displayProfile?.website_url);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/comunidade"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent"
        >
          ← Voltar para Comunidade
        </Link>
        <span className="text-xs text-muted">Perfil público na Comunidade</span>
      </div>

      {!isConfigured ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-foreground">
          <p className="font-semibold">Supabase não configurado</p>
          <p className="mt-1 text-xs text-muted">
            Configure <code className="font-mono">.env.local</code> para
            visualizar perfis públicos.
          </p>
        </div>
      ) : missingParams ? (
        <div className="rounded-3xl border border-border bg-surface p-8 text-center">
          <h1 className="text-lg font-bold text-foreground">
            Nenhum perfil especificado
          </h1>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            Pesquise alguém pelo <code className="font-mono">@usuário</code>{" "}
            na Comunidade Codit para visualizar o portfólio.
          </p>
          <Link
            href="/comunidade"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90"
          >
            Ir para a Comunidade
          </Link>
        </div>
      ) : isAuthLoading || isFetchingTarget ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-surface py-12 text-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm text-muted">Carregando perfil...</p>
        </div>
      ) : permissionGrantMissing ? (
        <div
          role="alert"
          className="space-y-3 rounded-2xl border border-amber-500/45 bg-amber-500/10 p-5 text-xs leading-relaxed text-foreground sm:text-sm"
        >
          <p className="font-bold">
            Permissão de acesso às tabelas pendente no Supabase (código 42501)
          </p>
          <p className="text-muted">
            As políticas RLS estão habilitadas, mas faltam os privilégios SQL (
            <code className="font-mono text-foreground">GRANT</code>) nas
            tabelas públicas para os papéis{" "}
            <code className="font-mono text-foreground">anon</code> e{" "}
            <code className="font-mono text-foreground">authenticated</code>.
          </p>
          <p className="text-muted">
            Execute o arquivo{" "}
            <code className="font-mono text-foreground">
              supabase/migrations/20261123000003_fix_grants_rls_and_username_cooldown.sql
            </code>{" "}
            no <strong>SQL Editor</strong> do Supabase e tente novamente.
          </p>
          <button
            type="button"
            onClick={() => void reloadBundle()}
            disabled={!isOnline}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground hover:border-accent disabled:opacity-60"
          >
            Tentar novamente
          </button>
        </div>
      ) : migrationMissing ? (
        <div
          role="alert"
          className="space-y-2 rounded-2xl border border-amber-500/45 bg-amber-500/10 p-5 text-xs leading-relaxed text-foreground sm:text-sm"
        >
          <p className="font-bold">
            Migração da rede social pendente no Supabase
          </p>
          <p className="text-muted">
            Execute{" "}
            <code className="font-mono text-foreground">
              supabase/migrations/20261123000002_add_social_network.sql
            </code>{" "}
            no SQL Editor do Supabase para habilitar os perfis públicos e
            amizades.
          </p>
        </div>
      ) : profileError ? (
        <div className="space-y-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-center">
          <p className="text-sm font-semibold text-foreground">
            {profileError}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void reloadBundle()}
              disabled={!isOnline}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-60"
            >
              Tentar novamente
            </button>
            <Link
              href="/comunidade"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground hover:border-accent"
            >
              Voltar para a busca
            </Link>
          </div>
        </div>
      ) : !bundle ||
        !displayProfile ||
        !banner ||
        !accentTheme ||
        !avatarFrame ||
        !companion ? (
        <div className="space-y-3 rounded-3xl border border-border bg-surface p-8 text-center">
          <h1 className="text-lg font-bold text-foreground">
            Perfil não encontrado
          </h1>
          <p className="text-xs text-muted sm:text-sm">
            Não encontramos nenhum usuário com esse identificador no Codit.
          </p>
          <Link
            href="/comunidade"
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90"
          >
            Buscar outro @usuário
          </Link>
        </div>
      ) : (
        <>
          {bundle.relation.status === "self" &&
          !bundle.hasPublicCustomizationColumns ? (
            <div
              role="status"
              className="space-y-1.5 rounded-2xl border border-amber-500/45 bg-amber-500/10 p-4 text-xs leading-relaxed text-foreground sm:text-sm"
            >
              <p className="font-bold">
                Sincronização de personalizações no perfil público pendente
              </p>
              <p className="text-muted">
                Você está vendo suas personalizações locais aqui porque é o dono
                do perfil. Para que <strong>outros usuários</strong> também
                vejam seu banner, cor, moldura, habilidades e links, execute o
                arquivo{" "}
                <code className="font-mono text-foreground">
                  supabase/migrations/20261124000001_sync_public_profile_customization.sql
                </code>{" "}
                no <strong>SQL Editor</strong> do Supabase e clique em{" "}
                <strong>Salvar personalizações</strong> na aba{" "}
                <Link
                  href="/conta"
                  className="font-semibold text-accent-strong underline"
                >
                  Perfil
                </Link>
                .
              </p>
            </div>
          ) : null}

          {/* Cartão do perfil público com personalização completa */}
          <section
            aria-labelledby="public-profile-title"
            style={accentTheme.cssVars as CSSProperties}
            className="overflow-hidden rounded-3xl border border-border bg-surface shadow-xs"
          >
            {/* Banner personalizável */}
            <div
              className={`relative h-32 w-full overflow-hidden sm:h-40 ${banner.gradientClass}`}
            >
              <div
                aria-hidden="true"
                className={`absolute inset-0 opacity-80 ${banner.patternClass}`}
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent"
              />

              <div className="relative flex h-full flex-col justify-between p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-xs">
                    <span>Perfil Público</span>
                    <span aria-hidden="true" className="opacity-50">
                      ·
                    </span>
                    <span className="text-white/90">{banner.label}</span>
                  </div>
                </div>

                <div className="hidden items-center justify-end sm:flex">
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-black/40 px-2.5 py-1.5 text-white backdrop-blur-xs">
                    <OctopyBadge
                      size={26}
                      variant={displayProfile.octopy_companion}
                      className="rounded-lg"
                    />
                    <div className="text-left leading-tight">
                      <p className="text-[11px] font-semibold">
                        Octopy · {companion.label}
                      </p>
                      <p className="text-[10px] text-white/75">
                        {companion.tagline}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Corpo principal */}
            <div className="px-4 pb-5 sm:px-6 sm:pb-6">
              <div className="-mt-10 flex flex-wrap items-end justify-between gap-4 sm:-mt-12">
                <div className="flex flex-wrap items-end gap-4">
                  <div
                    className={`relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-surface-muted sm:h-24 sm:w-24 ${avatarFrame.wrapperClass}`}
                  >
                    {showAvatarImage && displayProfile.avatar_url ? (
                      <Image
                        src={displayProfile.avatar_url}
                        alt={`Avatar de ${displayProfile.full_name || "Estudante Codit"}`}
                        width={96}
                        height={96}
                        unoptimized
                        onError={() =>
                          setFailedAvatarUrl(displayProfile.avatar_url)
                        }
                        className={`h-full w-full rounded-[20px] ${
                          isPixelAvatar
                            ? "bg-[#141124] object-contain p-1.5"
                            : "object-cover"
                        }`}
                        style={
                          isPixelAvatar
                            ? { imageRendering: "pixelated" }
                            : undefined
                        }
                      />
                    ) : (
                      <span
                        className={`flex h-full w-full items-center justify-center rounded-[20px] text-xl font-bold sm:text-2xl ${accentTheme.softBgClass} ${accentTheme.textClass}`}
                      >
                        {getInitials(
                          displayProfile.full_name,
                          displayProfile.username,
                        )}
                      </span>
                    )}
                  </div>

                  <div className="pb-1 pt-2 sm:pt-12">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1
                        id="public-profile-title"
                        className="text-xl font-bold tracking-tight text-foreground sm:text-2xl"
                      >
                        {displayProfile.full_name || "Estudante Codit"}
                      </h1>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${accentTheme.badgeClass}`}
                      >
                        {accentTheme.label}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-border bg-surface-muted px-2.5 py-0.5 font-mono text-[11px] font-semibold text-accent-strong">
                        @{displayProfile.username}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopyHandle(displayProfile.username)
                        }
                        className="rounded-lg border border-border bg-surface-muted px-2.5 py-0.5 text-[11px] font-semibold text-foreground hover:border-accent"
                      >
                        {copiedHandle ? "Copiado!" : "Copiar @"}
                      </button>
                    </div>

                    {displayProfile.headline ? (
                      <p className="mt-0.5 text-sm font-medium text-muted">
                        {displayProfile.headline}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:pb-1">
                  {bundle.relation.status === "self" ? (
                    <Link
                      href="/conta"
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface-muted px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent sm:text-sm"
                    >
                      Personalizar meu perfil
                    </Link>
                  ) : (
                    <FriendshipActionButton
                      viewerId={viewerId}
                      targetUserId={displayProfile.id}
                      relation={bundle.relation}
                      isOnline={isOnline}
                      onChanged={async () => {
                        await reloadBundle();
                        emitFriendshipsChanged();
                      }}
                      onError={setProfileError}
                    />
                  )}
                </div>
              </div>

              {/* Metadados + Bio + Links + Habilidades */}
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
                  {displayProfile.location ? (
                    <span className="inline-flex items-center gap-1.5 text-foreground">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                        className="text-muted"
                      >
                        <path
                          d="M12 21s-6-5.35-6-10.5a6 6 0 1 1 12 0C18 15.65 12 21 12 21Z"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <circle cx="12" cy="10.5" r="2" fill="currentColor" />
                      </svg>
                      {displayProfile.location}
                    </span>
                  ) : null}

                  <span>
                    Membro desde {formatMemberSince(displayProfile.created_at)}
                  </span>

                  <span className="inline-flex items-center gap-1.5 sm:hidden">
                    <OctopyBadge
                      size={16}
                      variant={displayProfile.octopy_companion}
                      className="rounded-sm"
                    />
                    <span>Octopy · {companion.label}</span>
                  </span>
                </div>

                {displayProfile.bio ? (
                  <p className="max-w-3xl text-sm leading-relaxed text-foreground/90">
                    {displayProfile.bio}
                  </p>
                ) : null}

                {githubUrl || linkedinUrl || websiteUrl ? (
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {githubUrl ? (
                      <a
                        href={githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-border bg-surface-muted/70 px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-accent"
                      >
                        <span>GitHub: @{displayProfile.github_username}</span>
                      </a>
                    ) : null}
                    {linkedinUrl ? (
                      <a
                        href={linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-border bg-surface-muted/70 px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-accent"
                      >
                        <span>LinkedIn</span>
                      </a>
                    ) : null}
                    {websiteUrl ? (
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-border bg-surface-muted/70 px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-accent"
                      >
                        <span>Site / Portfólio</span>
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {displayProfile.skills.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {displayProfile.skills.map((skill) => {
                      const matchedLang = findLanguageForSkill(skill);
                      return (
                        <span
                          key={skill}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${accentTheme.borderClass} ${accentTheme.softBgClass} text-foreground`}
                        >
                          {matchedLang ? (
                            <LanguageIcon language={matchedLang} size={14} />
                          ) : null}
                          <span>{skill}</span>
                        </span>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* Métricas públicas */}
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-surface-muted/50 px-3.5 py-2.5">
                  <p className="text-[11px] font-medium text-muted">Amigos</p>
                  <p className="mt-0.5 text-lg font-bold text-foreground">
                    {bundle.friendCount ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-surface-muted/50 px-3.5 py-2.5">
                  <p className="text-[11px] font-medium text-muted">
                    Projetos visíveis
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-foreground">
                    {bundle.projects.length}
                  </p>
                </div>
                <div className="col-span-2 rounded-2xl border border-border bg-surface-muted/50 px-3.5 py-2.5 sm:col-span-1">
                  <p className="text-[11px] font-medium text-muted">
                    Linguagens nos projetos
                  </p>
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
                            size={16}
                            className="rounded-sm ring-1 ring-surface"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {breakdown.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">
                      Linguagens compartilhadas
                    </span>
                    <span className="text-muted">
                      {bundle.projects.length}{" "}
                      {bundle.projects.length === 1 ? "projeto" : "projetos"}
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

              <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
                {bundle.relation.status === "self"
                  ? "Este é o seu perfil público. Visitantes veem projetos em Portfólio público; amigos aceitos também veem projetos marcados como Somente amigos."
                  : bundle.relation.status === "friends"
                    ? "Vocês são amigos — você pode visualizar projetos marcados como Portfólio público e Somente amigos."
                    : "Você está vendo apenas os projetos em Portfólio público. Adicione como amigo para liberar projetos exclusivos para amigos."}
              </p>
            </div>
          </section>

          {/* Projetos visíveis do usuário */}
          <section
            aria-labelledby="public-profile-projects-title"
            className="space-y-4"
          >
            <h2
              id="public-profile-projects-title"
              className="text-lg font-bold text-foreground"
            >
              Mini-Projetos ({bundle.projects.length})
            </h2>

            {bundle.projects.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center">
                <p className="text-sm font-semibold text-foreground">
                  Nenhum projeto visível para você ainda.
                </p>
                <p className="mt-1 text-xs text-muted">
                  Projetos marcados como privados não aparecem aqui por
                  segurança (<code className="font-mono">RN-204</code>).
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {bundle.projects.map((item) => {
                  const meta = getLanguageMeta(item.project.primary_language);
                  return (
                    <article
                      key={item.project.id}
                      className="flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-surface shadow-xs transition-colors hover:border-accent/60"
                    >
                      <div>
                        <div
                          aria-hidden="true"
                          className="h-1.5 w-full"
                          style={{ backgroundColor: meta.accentHex }}
                        />

                        <div className="space-y-3 p-5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <LanguageBadge
                              language={item.project.primary_language}
                              size="xs"
                            />
                            <span className="rounded-lg border border-border bg-surface-muted px-2 py-0.5 text-[11px] text-muted">
                              {
                                SANDBOX_VISIBILITY_LABELS[
                                  item.project.visibility
                                ]
                              }
                            </span>
                          </div>

                          <div>
                            <h3 className="text-base font-bold text-foreground">
                              {item.project.title}
                            </h3>
                            {item.project.description ? (
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                                {item.project.description}
                              </p>
                            ) : null}
                          </div>

                          <div className="overflow-hidden rounded-xl border border-border/80 bg-[#0d0b19]">
                            <div className="flex items-center justify-between border-b border-white/10 px-3 py-1 text-[10px] text-slate-400">
                              <span className="font-mono">{meta.fileName}</span>
                              <span>
                                {item.project.source_code.length.toLocaleString(
                                  "pt-BR",
                                )}{" "}
                                chars
                              </span>
                            </div>
                            <pre className="max-h-24 overflow-hidden px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-200">
                              <code>
                                {item.project.source_code ||
                                  "// Projeto sem código"}
                              </code>
                            </pre>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 border-t border-border bg-surface-muted/25 px-5 py-4">
                        <div className="flex items-center justify-between text-xs text-muted">
                          <span>
                            Atualizado em {formatDatePtBr(item.project.updated_at)}
                          </span>
                          <span className="flex items-center gap-3">
                            <span>
                              {item.likedByViewer ? "♥" : "♡"} {item.likesCount}
                            </span>
                            <span>💬 {item.commentsCount}</span>
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedProject(item)}
                          className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent"
                        >
                          Visualizar código e interagir
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {selectedProject ? (
        <ProjectViewerModal
          key={selectedProject.project.id}
          item={selectedProject}
          viewerId={viewerId}
          isOnline={isOnline}
          onClose={() => setSelectedProject(null)}
          onProjectMetaChange={handleProjectMetaChange}
          onMigrationMissing={() => setMigrationMissing(true)}
        />
      ) : null}
    </main>
  );
}
