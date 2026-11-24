"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { LanguageBadge, LanguageIcon } from "@/components/sandbox/language-icon";
import { FriendshipActionButton } from "@/components/social/friendship-action-button";
import { ProjectViewerModal } from "@/components/social/project-viewer-modal";
import {
  formatDatePtBr,
  SANDBOX_LANGUAGE_LABELS,
  SANDBOX_VISIBILITY_LABELS,
} from "@/components/social/social-labels";
import { UserAvatar } from "@/components/social/user-avatar";
import {
  emitFriendshipsChanged,
  emitOpenFriendshipsDrawer,
  subscribeFriendshipsChanged,
} from "@/lib/social-events";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  PublicProfileRow,
  SandboxLanguage,
} from "@/lib/supabase/database.types";
import { useIsOnline } from "@/lib/use-is-online";
import { useAuth } from "@/modules/auth/auth-provider";
import {
  findLanguageForSkill,
  getAccentThemeMeta,
} from "@/modules/profiles/profile-themes";
import { getLanguageMeta } from "@/modules/sandbox/language-catalog";
import { formatHandle } from "@/modules/social/social-schemas";
import {
  listCommunityProjects,
  listUserFriendships,
  resolveRelationStatus,
  searchCommunityUsers,
  SocialServiceError,
  type CommunityProjectCard,
  type UserFriendshipsBundle,
} from "@/modules/social/social-service";

type CommunityTab = "feed" | "people";
type FeedScope = "all" | "friends";

const EMPTY_FRIENDSHIPS: UserFriendshipsBundle = {
  raw: [],
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
};

export function CommunityHub() {
  const isOnline = useIsOnline();
  const {
    user,
    profile,
    isLoading: isAuthLoading,
    isConfigured,
  } = useAuth();
  const userId = user?.id ?? null;

  const [activeTab, setActiveTab] = useState<CommunityTab>("feed");
  const [searchInput, setSearchInput] = useState("");
  const [feedScope, setFeedScope] = useState<FeedScope>("all");
  const [feedLanguage, setFeedLanguage] = useState<SandboxLanguage | "all">(
    "all",
  );
  const [feedTextFilter, setFeedTextFilter] = useState("");

  const [initialLoading, setInitialLoading] = useState<boolean>(isConfigured);
  const [feedLoading, setFeedLoading] = useState(false);
  const [peopleLoading, setPeopleLoading] = useState(false);

  const [feedProjects, setFeedProjects] = useState<CommunityProjectCard[]>([]);
  const [peopleResults, setPeopleResults] = useState<PublicProfileRow[]>([]);
  const [friendshipsBundle, setFriendshipsBundle] =
    useState<UserFriendshipsBundle>(EMPTY_FRIENDSHIPS);

  const [selectedProject, setSelectedProject] =
    useState<CommunityProjectCard | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [permissionGrantMissing, setPermissionGrantMissing] = useState(false);
  const [copiedOwnHandle, setCopiedOwnHandle] = useState(false);

  const searchInputRef = useRef(searchInput);
  const feedScopeRef = useRef(feedScope);
  const feedLanguageRef = useRef(feedLanguage);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    searchInputRef.current = searchInput;
  }, [searchInput]);

  useEffect(() => {
    feedScopeRef.current = feedScope;
  }, [feedScope]);

  useEffect(() => {
    feedLanguageRef.current = feedLanguage;
  }, [feedLanguage]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isConfigured || isAuthLoading) {
      return;
    }

    let cancelled = false;

    async function syncWorkspace() {
      const client = getSupabaseClient();
      if (!client) {
        await Promise.resolve();
        if (!cancelled) {
          setInitialLoading(false);
        }
        return;
      }

      try {
        const [projectsData, usersData, friendshipsData] = await Promise.all([
          listCommunityProjects(
            {
              viewerId: userId,
              scope: feedScopeRef.current,
              language: feedLanguageRef.current,
            },
            client,
          ),
          searchCommunityUsers(searchInputRef.current, { limit: 24 }, client),
          userId
            ? listUserFriendships(userId, client)
            : Promise.resolve(EMPTY_FRIENDSHIPS),
        ]);

        if (cancelled) {
          return;
        }

        setFeedProjects(projectsData);
        setPeopleResults(usersData);
        setFriendshipsBundle(friendshipsData);
        setSocialError(null);
        setMigrationMissing(false);
        setPermissionGrantMissing(false);
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
        setSocialError(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar a Comunidade Codit.",
        );
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
        }
      }
    }

    void syncWorkspace();
    const unsubFriendships = subscribeFriendshipsChanged(() => {
      void syncWorkspace();
    });

    return () => {
      cancelled = true;
      unsubFriendships();
    };
  }, [isAuthLoading, isConfigured, userId]);

  async function reloadFeed(
    nextScope: FeedScope,
    nextLanguage: SandboxLanguage | "all",
  ) {
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    setFeedLoading(true);
    setSocialError(null);
    try {
      const projectsData = await listCommunityProjects(
        {
          viewerId: userId,
          scope: nextScope,
          language: nextLanguage,
        },
        client,
      );
      setFeedProjects(projectsData);
      setMigrationMissing(false);
      setPermissionGrantMissing(false);
    } catch (error) {
      if (error instanceof SocialServiceError) {
        setPermissionGrantMissing(error.isPermissionGrantMissing);
        setMigrationMissing(
          error.isMigrationMissing && !error.isPermissionGrantMissing,
        );
      }
      setSocialError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o feed de projetos.",
      );
    } finally {
      setFeedLoading(false);
    }
  }

  async function runPeopleSearch(query: string) {
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    setPeopleLoading(true);
    setSocialError(null);
    try {
      const usersData = await searchCommunityUsers(query, { limit: 24 }, client);
      setPeopleResults(usersData);
      setMigrationMissing(false);
      setPermissionGrantMissing(false);
    } catch (error) {
      if (error instanceof SocialServiceError) {
        setPermissionGrantMissing(error.isPermissionGrantMissing);
        setMigrationMissing(
          error.isMigrationMissing && !error.isPermissionGrantMissing,
        );
      }
      setSocialError(
        error instanceof Error
          ? error.message
          : "Não foi possível pesquisar perfis no momento.",
      );
    } finally {
      setPeopleLoading(false);
    }
  }

  async function reloadFriendshipsAndFeed() {
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    setSocialError(null);
    try {
      const [friendshipsData, projectsData] = await Promise.all([
        userId
          ? listUserFriendships(userId, client)
          : Promise.resolve(EMPTY_FRIENDSHIPS),
        listCommunityProjects(
          {
            viewerId: userId,
            scope: feedScope,
            language: feedLanguage,
          },
          client,
        ),
      ]);
      setFriendshipsBundle(friendshipsData);
      setFeedProjects(projectsData);
      setMigrationMissing(false);
      setPermissionGrantMissing(false);
    } catch (error) {
      if (error instanceof SocialServiceError) {
        setPermissionGrantMissing(error.isPermissionGrantMissing);
        setMigrationMissing(
          error.isMigrationMissing && !error.isPermissionGrantMissing,
        );
      }
      setSocialError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a comunidade.",
      );
    }
  }

  function handleSearchChange(nextValue: string) {
    setSearchInput(nextValue);
    if (activeTab !== "people") {
      return;
    }

    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void runPeopleSearch(nextValue);
    }, 320);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setActiveTab("people");
    void runPeopleSearch(searchInput);
  }

  function handleFeedScopeChange(nextScope: FeedScope) {
    setFeedScope(nextScope);
    void reloadFeed(nextScope, feedLanguage);
  }

  function handleFeedLanguageChange(nextLanguage: SandboxLanguage | "all") {
    setFeedLanguage(nextLanguage);
    void reloadFeed(feedScope, nextLanguage);
  }

  async function handleCopyOwnHandle() {
    if (!profile?.username) {
      return;
    }
    try {
      await navigator.clipboard.writeText(formatHandle(profile.username));
      setCopiedOwnHandle(true);
      setTimeout(() => setCopiedOwnHandle(false), 2000);
    } catch {
      setSocialError("Não foi possível copiar seu @usuário.");
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
    setFeedProjects((current) =>
      current.map((item) =>
        item.project.id === projectId ? { ...item, ...patch } : item,
      ),
    );
    setSelectedProject((current) =>
      current && current.project.id === projectId
        ? { ...current, ...patch }
        : current,
    );
  }

  const filteredFeedProjects = useMemo(() => {
    const query = feedTextFilter.trim().toLowerCase().replace(/^@+/, "");
    if (!query) {
      return feedProjects;
    }

    return feedProjects.filter((item) => {
      const titleMatch = item.project.title.toLowerCase().includes(query);
      const descMatch = (item.project.description ?? "")
        .toLowerCase()
        .includes(query);
      const authorNameMatch = (item.author?.full_name ?? "")
        .toLowerCase()
        .includes(query);
      const authorHandleMatch = (item.author?.username ?? "")
        .toLowerCase()
        .includes(query);
      return titleMatch || descMatch || authorNameMatch || authorHandleMatch;
    });
  }, [feedProjects, feedTextFilter]);

  const ownHandle = formatHandle(profile?.username);
  const incomingCount = friendshipsBundle.incomingRequests.length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Hero da Comunidade + Busca por @ */}
      <section className="space-y-5 rounded-3xl border border-border bg-surface p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <span className="inline-flex items-center rounded-full bg-accent-soft px-3 py-0.5 text-[11px] font-semibold text-accent-strong">
              Comunidade Codit
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Descubra projetos e conecte-se por @
            </h1>
            <p className="max-w-2xl text-xs leading-relaxed text-muted sm:text-sm">
              Explore mini-projetos da comunidade, interaja com curtidas e
              comentários, clone ideias para seu estúdio e encontre colegas pelo{" "}
              <code className="font-mono">@usuário</code>.
            </p>
          </div>

          {userId && profile?.username ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-muted/60 p-3">
              <UserAvatar
                name={profile.full_name}
                username={profile.username}
                avatarUrl={profile.avatar_url}
                size="sm"
              />
              <div className="min-w-0 text-xs">
                <p className="text-[11px] text-muted">Seu @público</p>
                <p className="truncate font-mono font-bold text-accent-strong">
                  {ownHandle}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleCopyOwnHandle()}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground hover:border-accent"
                >
                  {copiedOwnHandle ? "Copiado!" : "Copiar @"}
                </button>
                <Link
                  href={`/comunidade/perfil?u=${encodeURIComponent(profile.username)}`}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl bg-accent px-3 py-1 text-[11px] font-semibold text-accent-foreground hover:opacity-90"
                >
                  Ver perfil
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    emitOpenFriendshipsDrawer(
                      incomingCount > 0 ? "requests" : "friends",
                    )
                  }
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground hover:border-accent"
                >
                  <span>Amigos ({friendshipsBundle.friends.length})</span>
                  {incomingCount > 0 ? (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                      +{incomingCount}
                    </span>
                  ) : null}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <label htmlFor="codit-community-search" className="sr-only">
            Pesquisar pessoas por @usuário ou nome
          </label>
          <input
            id="codit-community-search"
            type="search"
            value={searchInput}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Pesquisar pessoas por @usuário ou nome (ex.: @octopy)..."
            className="min-h-11 flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!isConfigured || !isOnline}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            >
              Buscar @
            </button>
            {searchInput ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  void runPeopleSearch("");
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm font-medium text-foreground hover:border-accent"
              >
                Limpar
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {!isConfigured ? (
        <div
          role="status"
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-foreground"
        >
          <p className="font-semibold">Configuração do Supabase pendente</p>
          <p className="mt-1 text-xs leading-relaxed text-muted sm:text-sm">
            Configure{" "}
            <code className="font-mono text-foreground">
              NEXT_PUBLIC_SUPABASE_URL
            </code>{" "}
            e{" "}
            <code className="font-mono text-foreground">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            em <code className="font-mono">.env.local</code> para carregar
            perfis e projetos da Comunidade.
          </p>
        </div>
      ) : null}

      {permissionGrantMissing ? (
        <div
          role="alert"
          className="space-y-2.5 rounded-2xl border border-amber-500/45 bg-amber-500/10 p-5 text-xs leading-relaxed text-foreground sm:text-sm"
        >
          <p className="font-bold">
            Permissão de acesso às tabelas pendente no Supabase (código 42501)
          </p>
          <p className="text-muted">
            As políticas RLS estão ativas, mas faltam os privilégios{" "}
            <code className="font-mono text-foreground">
              GRANT SELECT / INSERT / UPDATE / DELETE
            </code>{" "}
            nas tabelas sociais para os papéis{" "}
            <code className="font-mono text-foreground">anon</code> e{" "}
            <code className="font-mono text-foreground">authenticated</code>.
          </p>
          <p className="text-muted">
            Execute o arquivo{" "}
            <code className="font-mono text-foreground">
              supabase/migrations/20261123000003_fix_grants_rls_and_username_cooldown.sql
            </code>{" "}
            no <strong>SQL Editor</strong> do painel Supabase e recarregue.
          </p>
          <button
            type="button"
            onClick={() => {
              void reloadFriendshipsAndFeed();
              void runPeopleSearch(searchInput);
            }}
            disabled={!isConfigured || !isOnline}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground hover:border-accent disabled:opacity-60"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {migrationMissing ? (
        <div
          role="alert"
          className="space-y-2 rounded-2xl border border-amber-500/45 bg-amber-500/10 p-5 text-xs leading-relaxed text-foreground sm:text-sm"
        >
          <p className="font-bold">
            Migração da rede social pendente no Supabase
          </p>
          <p className="text-muted">
            As tabelas ou colunas sociais (
            <code className="font-mono text-foreground">public_profiles</code>,{" "}
            <code className="font-mono text-foreground">friendships</code>,{" "}
            <code className="font-mono text-foreground">project_likes</code>,{" "}
            <code className="font-mono text-foreground">project_comments</code>{" "}
            e <code className="font-mono text-foreground">profiles.username</code>
            ) ainda não foram aplicadas neste projeto Supabase.
          </p>
          <p className="text-muted">
            Execute o arquivo{" "}
            <code className="font-mono text-foreground">
              supabase/migrations/20261123000002_add_social_network.sql
            </code>{" "}
            no <strong>SQL Editor</strong> do painel Supabase e recarregue esta
            página.
          </p>
        </div>
      ) : null}

      {socialError && !migrationMissing && !permissionGrantMissing ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-medium text-foreground sm:text-sm"
        >
          <p className="min-w-0 flex-1">{socialError}</p>
          <button
            type="button"
            onClick={() => {
              void reloadFriendshipsAndFeed();
              void runPeopleSearch(searchInput);
            }}
            disabled={!isConfigured || !isOnline}
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent disabled:opacity-60"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {/* Abas focadas exclusivamente em Comunidade */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav
          aria-label="Seções da comunidade"
          className="grid w-full grid-cols-2 gap-1.5 rounded-2xl border border-border bg-surface p-1.5 sm:max-w-md"
        >
          <button
            type="button"
            onClick={() => setActiveTab("feed")}
            className={`min-h-10 rounded-xl px-4 py-2 text-xs font-semibold transition-colors sm:text-sm ${
              activeTab === "feed"
                ? "bg-accent text-accent-foreground shadow-xs"
                : "text-muted hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            Feed de Projetos ({feedProjects.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("people")}
            className={`min-h-10 rounded-xl px-4 py-2 text-xs font-semibold transition-colors sm:text-sm ${
              activeTab === "people"
                ? "bg-accent text-accent-foreground shadow-xs"
                : "text-muted hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            Explorar Pessoas ({peopleResults.length})
          </button>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/projetos"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent"
          >
            + Publicar meu projeto
          </Link>
        </div>
      </div>

      {initialLoading || isAuthLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-surface py-12 text-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm text-muted">
            Carregando perfis e projetos da Comunidade...
          </p>
        </div>
      ) : activeTab === "feed" ? (
        <section aria-label="Feed de mini-projetos" className="space-y-4">
          {/* Barra de filtros do feed */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleFeedScopeChange("all")}
                className={`min-h-10 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                  feedScope === "all"
                    ? "bg-accent-soft text-accent-strong"
                    : "border border-border bg-surface-muted text-muted hover:text-foreground"
                }`}
              >
                Todos visíveis
              </button>
              <button
                type="button"
                onClick={() => handleFeedScopeChange("friends")}
                disabled={!userId}
                className={`min-h-10 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  feedScope === "friends"
                    ? "bg-accent-soft text-accent-strong"
                    : "border border-border bg-surface-muted text-muted hover:text-foreground"
                }`}
              >
                Somente amigos
              </button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="codit-feed-language" className="sr-only">
                Filtrar por linguagem
              </label>
              <select
                id="codit-feed-language"
                value={feedLanguage}
                onChange={(event) =>
                  handleFeedLanguageChange(
                    event.target.value as SandboxLanguage | "all",
                  )
                }
                className="min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:border-accent focus:outline-none"
              >
                <option value="all">Todas as linguagens</option>
                {Object.entries(SANDBOX_LANGUAGE_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>

              <label htmlFor="codit-feed-filter" className="sr-only">
                Filtrar feed por título ou @autor
              </label>
              <input
                id="codit-feed-filter"
                type="search"
                value={feedTextFilter}
                onChange={(event) => setFeedTextFilter(event.target.value)}
                placeholder="Filtrar feed por título ou @..."
                className="min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />

              <button
                type="button"
                onClick={() => void reloadFeed(feedScope, feedLanguage)}
                disabled={feedLoading || !isConfigured || !isOnline}
                className="min-h-10 rounded-xl border border-border bg-surface-muted px-3.5 py-2 text-xs font-semibold text-foreground hover:border-accent disabled:opacity-60"
              >
                {feedLoading ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>

          {filteredFeedProjects.length === 0 ? (
            <div className="space-y-2 rounded-3xl border border-dashed border-border bg-surface p-8 text-center">
              <p className="text-sm font-semibold text-foreground">
                {feedScope === "friends"
                  ? "Nenhum projeto de amigos para exibir ainda."
                  : "Nenhum mini-projeto encontrado com os filtros atuais."}
              </p>
              <p className="text-xs text-muted">
                {feedScope === "friends"
                  ? "Adicione colegas na aba Explorar Pessoas ou no ícone de Amizades no topo para ver projetos exclusivos."
                  : "Publique um mini-projeto na página Projetos com visibilidade Portfólio público ou Somente amigos."}
              </p>
              <div className="pt-2">
                <Link
                  href="/projetos"
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90"
                >
                  Ir para Projetos
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredFeedProjects.map((item) => {
                const meta = getLanguageMeta(item.project.primary_language);
                const authorHref = item.author?.username
                  ? `/comunidade/perfil?u=${encodeURIComponent(item.author.username)}`
                  : `/comunidade/perfil?id=${encodeURIComponent(item.project.user_id)}`;

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
                            {SANDBOX_VISIBILITY_LABELS[item.project.visibility]}
                          </span>
                        </div>

                        <div>
                          <h2 className="text-base font-bold text-foreground">
                            {item.project.title}
                          </h2>
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
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={authorHref}
                          className="flex min-w-0 items-center gap-2 text-xs hover:underline"
                        >
                          <UserAvatar
                            name={item.author?.full_name ?? "Estudante Codit"}
                            username={item.author?.username}
                            avatarUrl={item.author?.avatar_url}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">
                              {item.author?.full_name ?? "Estudante Codit"}
                            </p>
                            <p className="truncate font-mono text-[11px] text-accent-strong">
                              {item.author?.username
                                ? `@${item.author.username}`
                                : formatDatePtBr(item.project.updated_at)}
                            </p>
                          </div>
                        </Link>

                        <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                          <span>
                            {item.likedByViewer ? "♥" : "♡"} {item.likesCount}
                          </span>
                          <span>💬 {item.commentsCount}</span>
                        </div>
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
      ) : (
        <section aria-label="Pessoas e busca por @" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted sm:text-sm">
              {searchInput.trim()
                ? `Resultados para "${searchInput.trim()}"`
                : "Membros recentes da Comunidade Codit"}
            </p>
            <button
              type="button"
              onClick={() => void runPeopleSearch(searchInput)}
              disabled={peopleLoading || !isConfigured || !isOnline}
              className="min-h-9 rounded-xl border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground hover:border-accent disabled:opacity-60"
            >
              {peopleLoading ? "Buscando..." : "Atualizar lista"}
            </button>
          </div>

          {peopleResults.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center">
              <p className="text-sm font-semibold text-foreground">
                Nenhuma pessoa encontrada.
              </p>
              <p className="mt-1 text-xs text-muted">
                Tente buscar por outro <code className="font-mono">@usuário</code>{" "}
                ou nome completo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {peopleResults.map((person) => {
                const relation = resolveRelationStatus(
                  userId,
                  person.id,
                  friendshipsBundle.raw,
                );
                const profileHref = `/comunidade/perfil?u=${encodeURIComponent(person.username)}`;
                const accentTheme = getAccentThemeMeta(person.accent_theme);

                return (
                  <article
                    key={person.id}
                    className="flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-surface shadow-xs transition-colors hover:border-accent/60"
                  >
                    <div>
                      <div
                        aria-hidden="true"
                        className="h-1.5 w-full"
                        style={{ backgroundColor: accentTheme.swatchHex }}
                      />

                      <div className="space-y-3 p-5">
                        <div className="flex items-start gap-3">
                          <UserAvatar
                            name={person.full_name}
                            username={person.username}
                            avatarUrl={person.avatar_url}
                            size="md"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <Link
                              href={profileHref}
                              className="block truncate text-sm font-bold text-foreground hover:underline sm:text-base"
                            >
                              {person.full_name}
                            </Link>
                            <p className="truncate font-mono text-xs font-semibold text-accent-strong">
                              @{person.username}
                            </p>
                            {person.headline ? (
                              <p className="truncate text-xs font-medium text-foreground/85">
                                {person.headline}
                              </p>
                            ) : null}
                            {person.bio ? (
                              <p className="line-clamp-2 text-xs leading-relaxed text-muted">
                                {person.bio}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {person.skills.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {person.skills.slice(0, 4).map((skill) => {
                              const matchedLang = findLanguageForSkill(skill);
                              return (
                                <span
                                  key={skill}
                                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium text-foreground ${accentTheme.borderClass} ${accentTheme.softBgClass}`}
                                >
                                  {matchedLang ? (
                                    <LanguageIcon
                                      language={matchedLang}
                                      size={12}
                                    />
                                  ) : null}
                                  <span>{skill}</span>
                                </span>
                              );
                            })}
                            {person.skills.length > 4 ? (
                              <span className="text-[11px] font-medium text-muted">
                                +{person.skills.length - 4}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-muted/25 px-5 py-3">
                      <Link
                        href={profileHref}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent"
                      >
                        Ver perfil e projetos
                      </Link>
                      <FriendshipActionButton
                        viewerId={userId}
                        targetUserId={person.id}
                        relation={relation}
                        isOnline={isOnline}
                        onChanged={async () => {
                          await reloadFriendshipsAndFeed();
                          emitFriendshipsChanged();
                        }}
                        onError={setSocialError}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {selectedProject ? (
        <ProjectViewerModal
          key={selectedProject.project.id}
          item={selectedProject}
          viewerId={userId}
          isOnline={isOnline}
          onClose={() => setSelectedProject(null)}
          onProjectMetaChange={handleProjectMetaChange}
          onMigrationMissing={() => setMigrationMissing(true)}
        />
      ) : null}
    </main>
  );
}
