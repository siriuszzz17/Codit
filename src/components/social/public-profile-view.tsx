"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { FriendshipActionButton } from "@/components/social/friendship-action-button";
import { ProjectViewerModal } from "@/components/social/project-viewer-modal";
import {
  formatDatePtBr,
  SANDBOX_LANGUAGE_LABELS,
  SANDBOX_VISIBILITY_LABELS,
} from "@/components/social/social-labels";
import { UserAvatar } from "@/components/social/user-avatar";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useIsOnline } from "@/lib/use-is-online";
import { useAuth } from "@/modules/auth/auth-provider";
import {
  getPublicProfileBundle,
  SocialServiceError,
  type CommunityProjectCard,
  type PublicProfileBundle,
} from "@/modules/social/social-service";

export function PublicProfileView() {
  const searchParams = useSearchParams();
  const usernameParam = searchParams.get("u");
  const userIdParam = searchParams.get("id");
  const targetKey = `${usernameParam ?? ""}::${userIdParam ?? ""}`;

  const isOnline = useIsOnline();
  const { user, isLoading: isAuthLoading, isConfigured } = useAuth();

  const [bundle, setBundle] = useState<PublicProfileBundle | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [copiedHandle, setCopiedHandle] = useState(false);
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

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    let cancelled = false;
    const viewerId = user?.id ?? null;

    async function fetchBundle() {
      try {
        const result = await getPublicProfileBundle(
          { username: usernameParam, userId: userIdParam },
          viewerId,
          client ?? undefined,
        );

        if (cancelled) {
          return;
        }

        setBundle(result);
        setProfileError(null);
        setMigrationMissing(false);
        setLoadedKey(targetKey);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof SocialServiceError && error.isMigrationMissing) {
          setMigrationMissing(true);
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

    return () => {
      cancelled = true;
    };
  }, [
    isAuthLoading,
    isConfigured,
    missingParams,
    targetKey,
    user?.id,
    userIdParam,
    usernameParam,
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
        user?.id ?? null,
        client,
      );
      setBundle(result);
      setProfileError(null);
      setMigrationMissing(false);
    } catch (error) {
      if (error instanceof SocialServiceError && error.isMigrationMissing) {
        setMigrationMissing(true);
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

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-5 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <Link href="/comunidade" className="flex items-center gap-3">
          <OctopyBadge size={40} className="shrink-0 rounded-xl shadow-xs" />
          <div>
            <p className="text-base font-bold tracking-tight text-foreground sm:text-lg">
              Codit
            </p>
            <p className="text-xs text-muted">Perfil na Comunidade</p>
          </div>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/comunidade"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent sm:text-sm"
          >
            Voltar para Comunidade
          </Link>
          {user ? (
            <Link
              href="/conta"
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent-soft px-3.5 py-2 text-xs font-semibold text-accent-strong transition-colors hover:border hover:border-accent sm:text-sm"
            >
              Minha conta
            </Link>
          ) : (
            <Link
              href="/auth"
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90 sm:text-sm"
            >
              Entrar
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 space-y-6 py-6 sm:space-y-8">
        {!isConfigured ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-foreground">
            <p className="font-semibold">Supabase não configurado</p>
            <p className="mt-1 text-xs text-muted">
              Configure <code className="font-mono">.env.local</code> para
              visualizar perfis públicos.
            </p>
          </div>
        ) : missingParams ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
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
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface py-12 text-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-border border-t-accent" />
            <p className="text-sm text-muted">Carregando perfil...</p>
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
            <Link
              href="/comunidade"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground hover:border-accent"
            >
              Voltar para a busca
            </Link>
          </div>
        ) : !bundle ? (
          <div className="space-y-3 rounded-2xl border border-border bg-surface p-8 text-center">
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
            {/* Cartão do perfil */}
            <section className="space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-xs sm:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <UserAvatar
                    name={bundle.profile.full_name}
                    username={bundle.profile.username}
                    avatarUrl={bundle.profile.avatar_url}
                    size="lg"
                  />
                  <div className="min-w-0 space-y-1.5">
                    <h1 className="text-xl font-bold text-foreground sm:text-2xl">
                      {bundle.profile.full_name}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-accent-strong">
                        @{bundle.profile.username}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopyHandle(bundle.profile.username)
                        }
                        className="rounded-lg border border-border bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-foreground hover:border-accent"
                      >
                        {copiedHandle ? "Copiado!" : "Copiar @"}
                      </button>
                    </div>
                    {bundle.profile.bio ? (
                      <p className="max-w-2xl text-sm leading-relaxed text-muted">
                        {bundle.profile.bio}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {bundle.relation.status === "self" ? (
                    <Link
                      href="/conta"
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface-muted px-4 py-2 text-xs font-semibold text-foreground hover:border-accent"
                    >
                      Editar meu perfil
                    </Link>
                  ) : (
                    <FriendshipActionButton
                      viewerId={user?.id ?? null}
                      targetUserId={bundle.profile.id}
                      relation={bundle.relation}
                      isOnline={isOnline}
                      onChanged={reloadBundle}
                      onError={setProfileError}
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4 text-xs text-muted">
                {bundle.friendCount !== null ? (
                  <span className="rounded-xl border border-border bg-surface-muted px-3 py-1.5 font-medium text-foreground">
                    Amigos: {bundle.friendCount}
                  </span>
                ) : null}
                <span className="rounded-xl border border-border bg-surface-muted px-3 py-1.5 font-medium text-foreground">
                  Projetos visíveis: {bundle.projects.length}
                </span>
                {bundle.profile.github_username ? (
                  <a
                    href={`https://github.com/${encodeURIComponent(bundle.profile.github_username)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-border bg-surface-muted px-3 py-1.5 font-mono font-medium text-accent-strong transition-colors hover:border-accent"
                  >
                    GitHub: @{bundle.profile.github_username}
                  </a>
                ) : null}
              </div>

              <p className="text-xs text-muted">
                {bundle.relation.status === "self"
                  ? "Este é o seu perfil. Visitantes veem projetos em Portfólio público; amigos aceitos também veem projetos marcados como Somente amigos."
                  : bundle.relation.status === "friends"
                    ? "Vocês são amigos — você pode visualizar projetos marcados como Portfólio público e Somente amigos."
                    : "Você está vendo apenas os projetos em Portfólio público. Adicione como amigo para liberar projetos exclusivos para amigos."}
              </p>
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
                <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
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
                  {bundle.projects.map((item) => (
                    <article
                      key={item.project.id}
                      className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-5 shadow-xs"
                    >
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-strong">
                            {
                              SANDBOX_LANGUAGE_LABELS[
                                item.project.primary_language
                              ]
                            }
                          </span>
                          <span className="rounded-md border border-border bg-surface-muted px-2 py-0.5 text-[11px] text-muted">
                            {SANDBOX_VISIBILITY_LABELS[item.project.visibility]}
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-foreground">
                          {item.project.title}
                        </h3>

                        {item.project.description ? (
                          <p className="line-clamp-2 text-xs leading-relaxed text-muted">
                            {item.project.description}
                          </p>
                        ) : null}

                        <pre className="max-h-24 overflow-hidden rounded-xl border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-muted">
                          <code>
                            {item.project.source_code || "// Projeto sem código"}
                          </code>
                        </pre>
                      </div>

                      <div className="space-y-3 border-t border-border pt-3">
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
                          className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-border bg-surface-muted px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent"
                        >
                          Visualizar código e interagir
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {selectedProject ? (
        <ProjectViewerModal
          key={selectedProject.project.id}
          item={selectedProject}
          viewerId={user?.id ?? null}
          isOnline={isOnline}
          onClose={() => setSelectedProject(null)}
          onProjectMetaChange={handleProjectMetaChange}
          onMigrationMissing={() => setMigrationMissing(true)}
        />
      ) : null}
    </div>
  );
}
