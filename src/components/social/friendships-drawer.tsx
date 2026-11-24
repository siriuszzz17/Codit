"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { FriendshipActionButton } from "@/components/social/friendship-action-button";
import { UserAvatar } from "@/components/social/user-avatar";
import {
  emitFriendshipsChanged,
  type FriendshipsDrawerTab,
} from "@/lib/social-events";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { PublicProfileRow } from "@/lib/supabase/database.types";
import { useIsOnline } from "@/lib/use-is-online";
import { useAuth } from "@/modules/auth/auth-provider";
import { formatHandle } from "@/modules/social/social-schemas";
import {
  acceptFriendRequest,
  removeFriendship,
  resolveRelationStatus,
  searchCommunityUsers,
  SocialServiceError,
  type UserFriendshipsBundle,
} from "@/modules/social/social-service";

export interface FriendshipsDrawerProps {
  isOpen: boolean;
  activeTab: FriendshipsDrawerTab;
  friendshipsBundle: UserFriendshipsBundle;
  isLoading: boolean;
  error: string | null;
  migrationMissing: boolean;
  permissionGrantMissing: boolean;
  onSelectTab: (tab: FriendshipsDrawerTab) => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export function FriendshipsDrawer({
  isOpen,
  activeTab,
  friendshipsBundle,
  isLoading,
  error,
  migrationMissing,
  permissionGrantMissing,
  onSelectTab,
  onClose,
  onRefresh,
}: FriendshipsDrawerProps) {
  const isOnline = useIsOnline();
  const { user, profile, isConfigured } = useAuth();
  const userId = user?.id ?? null;

  const [copiedOwnHandle, setCopiedOwnHandle] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [peopleQuery, setPeopleQuery] = useState("");
  const [peopleResults, setPeopleResults] = useState<PublicProfileRow[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [hasLoadedPeople, setHasLoadedPeople] = useState(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !isOpen ||
      activeTab !== "find" ||
      !userId ||
      !isConfigured ||
      hasLoadedPeople
    ) {
      return;
    }

    let cancelled = false;

    async function fetchInitialPeople() {
      const client = getSupabaseClient();
      if (!client) {
        return;
      }

      await Promise.resolve();
      if (cancelled) {
        return;
      }
      setPeopleLoading(true);
      setPeopleError(null);
      try {
        const usersData = await searchCommunityUsers("", { limit: 16 }, client);
        if (!cancelled) {
          setPeopleResults(usersData);
          setHasLoadedPeople(true);
        }
      } catch (err) {
        if (!cancelled) {
          setPeopleError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar usuários.",
          );
        }
      } finally {
        if (!cancelled) {
          setPeopleLoading(false);
        }
      }
    }

    void fetchInitialPeople();

    return () => {
      cancelled = true;
    };
  }, [activeTab, hasLoadedPeople, isConfigured, isOpen, userId]);

  if (!isOpen) {
    return null;
  }

  const incomingCount = friendshipsBundle.incomingRequests.length;
  const outgoingCount = friendshipsBundle.outgoingRequests.length;
  const totalRequests = incomingCount + outgoingCount;
  const ownHandle = formatHandle(profile?.username);

  async function runPeopleSearch(query: string) {
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    setPeopleLoading(true);
    setPeopleError(null);
    try {
      const usersData = await searchCommunityUsers(
        query,
        { limit: 16 },
        client,
      );
      setPeopleResults(usersData);
      setHasLoadedPeople(true);
    } catch (err) {
      if (err instanceof SocialServiceError) {
        setPeopleError(err.message);
      } else {
        setPeopleError("Não foi possível pesquisar usuários agora.");
      }
    } finally {
      setPeopleLoading(false);
    }
  }

  function handlePeopleSearchChange(nextValue: string) {
    setPeopleQuery(nextValue);
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void runPeopleSearch(nextValue);
    }, 320);
  }

  function handlePeopleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    void runPeopleSearch(peopleQuery);
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
      setActionError("Não foi possível copiar seu @usuário.");
    }
  }

  async function handleAcceptIncoming(friendshipId: string, fullName: string) {
    if (!userId || !isOnline) {
      setActionError("Conecte-se à internet para aceitar esta solicitação.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    setBusyRequestId(friendshipId);
    setActionError(null);
    setActionMessage(null);
    try {
      await acceptFriendRequest(userId, friendshipId, client);
      setActionMessage(`Agora você e ${fullName} são amigos no Codit!`);
      await onRefresh();
      emitFriendshipsChanged();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Não foi possível aceitar a solicitação.",
      );
    } finally {
      setBusyRequestId(null);
    }
  }

  async function handleRemoveRequest(
    friendshipId: string,
    feedbackText: string,
  ) {
    if (!userId || !isOnline) {
      setActionError("Conecte-se à internet para atualizar a solicitação.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    setBusyRequestId(friendshipId);
    setActionError(null);
    setActionMessage(null);
    try {
      await removeFriendship(userId, friendshipId, client);
      setActionMessage(feedbackText);
      await onRefresh();
      emitFriendshipsChanged();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Não foi possível atualizar esta solicitação.",
      );
    } finally {
      setBusyRequestId(null);
    }
  }

  async function handleFriendshipMutation() {
    setActionError(null);
    await onRefresh();
    emitFriendshipsChanged();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="codit-friendships-drawer-title"
      className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-xs"
    >
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0" />

      <aside className="codit-safe-x relative z-10 flex h-full w-full max-w-md flex-col overflow-hidden border-l border-border bg-surface shadow-2xl md:my-4 md:mr-4 md:h-auto md:rounded-2xl md:border">
        {/* Cabeçalho do painel */}
        <div className="codit-safe-top flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5 md:py-5">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-accent-soft text-accent-strong"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <h2
                id="codit-friendships-drawer-title"
                className="text-base font-bold text-foreground sm:text-lg"
              >
                Amizades
              </h2>
            </div>
            <p className="text-xs text-muted">
              Gerencie amigos, pedidos recebidos e busca rápida por @.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel de amizades"
            className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-muted px-3 text-xs font-semibold text-foreground transition-colors hover:border-accent"
          >
            Fechar
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="codit-safe-bottom flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {!userId ? (
            <div className="space-y-4 rounded-2xl border border-border bg-surface-muted/45 p-6 text-center">
              <div className="flex justify-center">
                <OctopyBadge
                  size={52}
                  variant="happy"
                  decorative={false}
                  className="rounded-2xl shadow-xs"
                />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-foreground">
                  Conecte-se com colegas no Codit
                </h3>
                <p className="text-xs leading-relaxed text-muted">
                  Entre na sua conta para adicionar amigos por{" "}
                  <code className="font-mono">@usuário</code>, aceitar
                  solicitações e visualizar mini-projetos exclusivos para amigos.
                </p>
              </div>
              <div className="flex flex-col gap-2.5 pt-1">
                <Link
                  href="/auth"
                  onClick={onClose}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
                >
                  Entrar / Criar conta
                </Link>
                <Link
                  href="/comunidade"
                  onClick={onClose}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent"
                >
                  Explorar Comunidade
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Faixa com @ do próprio usuário + Atualizar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface-muted/50 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] text-muted">Seu @usuário</p>
                  <p className="truncate font-mono text-xs font-bold text-accent-strong">
                    {ownHandle || "Defina seu @ no Perfil"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {profile?.username ? (
                    <button
                      type="button"
                      onClick={() => void handleCopyOwnHandle()}
                      className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground hover:border-accent"
                    >
                      {copiedOwnHandle ? "Copiado!" : "Copiar @"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void onRefresh()}
                    disabled={isLoading || !isOnline || !isConfigured}
                    className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground hover:border-accent disabled:opacity-60"
                  >
                    {isLoading ? "..." : "Atualizar"}
                  </button>
                </div>
              </div>

              {!isConfigured ? (
                <div
                  role="status"
                  className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-foreground"
                >
                  Configure{" "}
                  <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
                  <code className="font-mono">
                    NEXT_PUBLIC_SUPABASE_ANON_KEY
                  </code>{" "}
                  no <code className="font-mono">.env.local</code> para carregar
                  suas amizades.
                </div>
              ) : null}

              {permissionGrantMissing ? (
                <div
                  role="alert"
                  className="space-y-2 rounded-xl border border-amber-500/45 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-foreground"
                >
                  <p className="font-bold">
                    Permissão SQL pendente no Supabase (42501)
                  </p>
                  <p className="text-muted">
                    Execute{" "}
                    <code className="font-mono text-foreground">
                      supabase/migrations/20261123000003_fix_grants_rls_and_username_cooldown.sql
                    </code>{" "}
                    no SQL Editor do Supabase e clique em atualizar.
                  </p>
                </div>
              ) : null}

              {migrationMissing ? (
                <div
                  role="alert"
                  className="space-y-1.5 rounded-xl border border-amber-500/45 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-foreground"
                >
                  <p className="font-bold">
                    Migração social pendente no Supabase
                  </p>
                  <p className="text-muted">
                    Execute{" "}
                    <code className="font-mono text-foreground">
                      supabase/migrations/20261123000002_add_social_network.sql
                    </code>{" "}
                    no SQL Editor do Supabase.
                  </p>
                </div>
              ) : null}

              {(error || actionError) &&
              !permissionGrantMissing &&
              !migrationMissing ? (
                <p
                  role="alert"
                  className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
                >
                  {actionError ?? error}
                </p>
              ) : null}

              {actionMessage ? (
                <p
                  role="status"
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
                >
                  {actionMessage}
                </p>
              ) : null}

              {/* Abas do painel de amizades */}
              <div
                role="tablist"
                aria-label="Seções de amizades"
                className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-surface-muted p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "friends"}
                  onClick={() => onSelectTab("friends")}
                  className={`min-h-9 rounded-xl px-2 py-1.5 text-xs font-semibold transition-colors ${
                    activeTab === "friends"
                      ? "bg-surface text-foreground shadow-xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  Amigos ({friendshipsBundle.friends.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "requests"}
                  onClick={() => onSelectTab("requests")}
                  className={`inline-flex min-h-9 items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition-colors ${
                    activeTab === "requests"
                      ? "bg-surface text-foreground shadow-xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <span>Pedidos</span>
                  {incomingCount > 0 ? (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                      {incomingCount}
                    </span>
                  ) : totalRequests > 0 ? (
                    <span className="text-[11px] opacity-75">
                      ({totalRequests})
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "find"}
                  onClick={() => onSelectTab("find")}
                  className={`min-h-9 rounded-xl px-2 py-1.5 text-xs font-semibold transition-colors ${
                    activeTab === "find"
                      ? "bg-surface text-foreground shadow-xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  Adicionar @
                </button>
              </div>

              {activeTab === "friends" ? (
                friendshipsBundle.friends.length === 0 ? (
                  <div className="space-y-3 rounded-2xl border border-dashed border-border bg-surface-muted/35 p-6 text-center">
                    <p className="text-sm font-semibold text-foreground">
                      Você ainda não adicionou amigos no Codit.
                    </p>
                    <p className="text-xs text-muted">
                      Pesquise colegas por <code className="font-mono">@</code>{" "}
                      para trocar feedbacks e ver projetos de amigos.
                    </p>
                    <button
                      type="button"
                      onClick={() => onSelectTab("find")}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90"
                    >
                      Procurar pessoas por @
                    </button>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {friendshipsBundle.friends.map(
                      ({ friendship, profile: friend }) => {
                        const profileHref = `/comunidade/perfil?u=${encodeURIComponent(friend.username)}`;
                        return (
                          <li
                            key={friendship.id}
                            className="space-y-3 rounded-2xl border border-border bg-surface-muted/35 p-3.5"
                          >
                            <div className="flex items-start gap-3">
                              <UserAvatar
                                name={friend.full_name}
                                username={friend.username}
                                avatarUrl={friend.avatar_url}
                                size="sm"
                              />
                              <div className="min-w-0 flex-1">
                                <Link
                                  href={profileHref}
                                  onClick={onClose}
                                  className="block truncate text-sm font-bold text-foreground hover:underline"
                                >
                                  {friend.full_name}
                                </Link>
                                <p className="truncate font-mono text-xs font-semibold text-accent-strong">
                                  @{friend.username}
                                </p>
                                {friend.bio ? (
                                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                                    {friend.bio}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
                              <Link
                                href={profileHref}
                                onClick={onClose}
                                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent"
                              >
                                Ver perfil e projetos
                              </Link>
                              <FriendshipActionButton
                                viewerId={userId}
                                targetUserId={friend.id}
                                relation={{
                                  status: "friends",
                                  friendshipId: friendship.id,
                                }}
                                isOnline={isOnline}
                                onChanged={handleFriendshipMutation}
                                onError={setActionError}
                              />
                            </div>
                          </li>
                        );
                      },
                    )}
                  </ul>
                )
              ) : activeTab === "requests" ? (
                <div className="space-y-5">
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold tracking-wide text-foreground uppercase">
                      Pedidos recebidos ({incomingCount})
                    </h3>
                    {incomingCount === 0 ? (
                      <p className="rounded-xl border border-dashed border-border bg-surface-muted/35 p-4 text-center text-xs text-muted">
                        Nenhuma solicitação pendente para você no momento.
                      </p>
                    ) : (
                      <ul className="space-y-2.5">
                        {friendshipsBundle.incomingRequests.map(
                          ({ friendship, profile: sender }) => (
                            <li
                              key={friendship.id}
                              className="space-y-3 rounded-2xl border border-border bg-surface-muted/40 p-3.5"
                            >
                              <div className="flex items-center gap-3">
                                <UserAvatar
                                  name={sender.full_name}
                                  username={sender.username}
                                  avatarUrl={sender.avatar_url}
                                  size="sm"
                                />
                                <div className="min-w-0 flex-1">
                                  <Link
                                    href={`/comunidade/perfil?u=${encodeURIComponent(sender.username)}`}
                                    onClick={onClose}
                                    className="block truncate text-sm font-bold text-foreground hover:underline"
                                  >
                                    {sender.full_name}
                                  </Link>
                                  <p className="truncate font-mono text-xs text-accent-strong">
                                    @{sender.username}
                                  </p>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={
                                    busyRequestId === friendship.id || !isOnline
                                  }
                                  onClick={() =>
                                    void handleAcceptIncoming(
                                      friendship.id,
                                      sender.full_name,
                                    )
                                  }
                                  className="inline-flex min-h-9 flex-1 items-center justify-center rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-60"
                                >
                                  {busyRequestId === friendship.id
                                    ? "..."
                                    : "Aceitar"}
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    busyRequestId === friendship.id || !isOnline
                                  }
                                  onClick={() =>
                                    void handleRemoveRequest(
                                      friendship.id,
                                      `Solicitação de ${sender.full_name} recusada.`,
                                    )
                                  }
                                  className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-foreground disabled:opacity-60"
                                >
                                  Recusar
                                </button>
                              </div>
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-2.5 border-t border-border pt-4">
                    <h3 className="text-xs font-bold tracking-wide text-foreground uppercase">
                      Pedidos enviados ({outgoingCount})
                    </h3>
                    {outgoingCount === 0 ? (
                      <p className="rounded-xl border border-dashed border-border bg-surface-muted/35 p-4 text-center text-xs text-muted">
                        Nenhuma solicitação enviada aguardando resposta.
                      </p>
                    ) : (
                      <ul className="space-y-2.5">
                        {friendshipsBundle.outgoingRequests.map(
                          ({ friendship, profile: recipient }) => (
                            <li
                              key={friendship.id}
                              className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border bg-surface-muted/40 p-3.5"
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                <UserAvatar
                                  name={recipient.full_name}
                                  username={recipient.username}
                                  avatarUrl={recipient.avatar_url}
                                  size="sm"
                                />
                                <div className="min-w-0">
                                  <Link
                                    href={`/comunidade/perfil?u=${encodeURIComponent(recipient.username)}`}
                                    onClick={onClose}
                                    className="block truncate text-sm font-bold text-foreground hover:underline"
                                  >
                                    {recipient.full_name}
                                  </Link>
                                  <p className="truncate font-mono text-xs text-accent-strong">
                                    @{recipient.username}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={
                                  busyRequestId === friendship.id || !isOnline
                                }
                                onClick={() =>
                                  void handleRemoveRequest(
                                    friendship.id,
                                    `Solicitação para ${recipient.full_name} cancelada.`,
                                  )
                                }
                                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent disabled:opacity-60"
                              >
                                Cancelar
                              </button>
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <form
                    onSubmit={handlePeopleSearchSubmit}
                    className="flex gap-2"
                  >
                    <label
                      htmlFor="codit-drawer-people-search"
                      className="sr-only"
                    >
                      Buscar pessoas por @usuário ou nome
                    </label>
                    <input
                      id="codit-drawer-people-search"
                      type="search"
                      value={peopleQuery}
                      onChange={(event) =>
                        handlePeopleSearchChange(event.target.value)
                      }
                      placeholder="Buscar por @usuário ou nome..."
                      className="min-h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none sm:text-sm"
                    />
                    <button
                      type="submit"
                      disabled={peopleLoading || !isConfigured || !isOnline}
                      className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {peopleLoading ? "..." : "Buscar"}
                    </button>
                  </form>

                  {peopleError ? (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-foreground"
                    >
                      {peopleError}
                    </p>
                  ) : null}

                  {peopleLoading && peopleResults.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted">
                      Buscando pessoas no Codit...
                    </div>
                  ) : peopleResults.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-surface-muted/35 p-5 text-center text-xs text-muted">
                      Nenhuma pessoa encontrada para essa busca.
                    </div>
                  ) : (
                    <ul className="space-y-2.5">
                      {peopleResults.map((person) => {
                        const relation = resolveRelationStatus(
                          userId,
                          person.id,
                          friendshipsBundle.raw,
                        );
                        const profileHref = `/comunidade/perfil?u=${encodeURIComponent(person.username)}`;
                        return (
                          <li
                            key={person.id}
                            className="space-y-3 rounded-2xl border border-border bg-surface-muted/35 p-3.5"
                          >
                            <div className="flex items-start gap-2.5">
                              <UserAvatar
                                name={person.full_name}
                                username={person.username}
                                avatarUrl={person.avatar_url}
                                size="sm"
                              />
                              <div className="min-w-0 flex-1">
                                <Link
                                  href={profileHref}
                                  onClick={onClose}
                                  className="block truncate text-sm font-bold text-foreground hover:underline"
                                >
                                  {person.full_name}
                                </Link>
                                <p className="truncate font-mono text-xs text-accent-strong">
                                  @{person.username}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
                              <Link
                                href={profileHref}
                                onClick={onClose}
                                className="text-xs font-semibold text-muted hover:text-foreground hover:underline"
                              >
                                Ver perfil
                              </Link>
                              <FriendshipActionButton
                                viewerId={userId}
                                targetUserId={person.id}
                                relation={relation}
                                isOnline={isOnline}
                                onChanged={handleFriendshipMutation}
                                onError={setActionError}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
