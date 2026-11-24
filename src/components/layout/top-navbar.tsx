"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthHeaderControls } from "@/components/auth/auth-header-controls";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { FriendshipsDrawer } from "@/components/social/friendships-drawer";
import {
  isNavItemActive,
  PRIMARY_NAV_ITEMS,
  shouldShowTopNavbar,
  type NavIconKey,
} from "@/lib/navigation";
import {
  subscribeFriendshipsChanged,
  subscribeMessagesChanged,
  subscribeOpenFriendshipsDrawer,
  type FriendshipsDrawerTab,
} from "@/lib/social-events";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useIsOnline } from "@/lib/use-is-online";
import { useAuth } from "@/modules/auth/auth-provider";
import { listUserConversations } from "@/modules/messaging/messaging-service";
import { useVoiceCall } from "@/modules/messaging/voice-call-provider";
import {
  listUserFriendships,
  SocialServiceError,
  type UserFriendshipsBundle,
} from "@/modules/social/social-service";

const EMPTY_FRIENDSHIPS: UserFriendshipsBundle = {
  raw: [],
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
};

function NavItemIcon({
  icon,
  size = 16,
}: {
  icon: NavIconKey;
  size?: number;
}) {
  switch (icon) {
    case "home":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5Z" />
        </svg>
      );
    case "projects":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
    case "community":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
        </svg>
      );
    case "messages":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "profile":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M20 21a8 8 0 0 0-16 0" />
        </svg>
      );
  }
}

export function TopNavbar() {
  const pathname = usePathname();
  const isOnline = useIsOnline();
  const { user, isLoading: isAuthLoading, isConfigured } = useAuth();
  const { activeCall } = useVoiceCall();
  const userId = user?.id ?? null;

  const [friendshipsBundle, setFriendshipsBundle] =
    useState<UserFriendshipsBundle>(EMPTY_FRIENDSHIPS);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [loadingFriendships, setLoadingFriendships] = useState(false);
  const [friendshipsError, setFriendshipsError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [permissionGrantMissing, setPermissionGrantMissing] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<FriendshipsDrawerTab>("friends");

  const incomingCountRef = useRef(0);
  useEffect(() => {
    incomingCountRef.current = friendshipsBundle.incomingRequests.length;
  }, [friendshipsBundle.incomingRequests.length]);

  useEffect(() => {
    if (!isConfigured || isAuthLoading) {
      return;
    }

    let cancelled = false;

    async function loadFriendships() {
      if (!userId) {
        await Promise.resolve();
        if (!cancelled) {
          setFriendshipsBundle(EMPTY_FRIENDSHIPS);
          setFriendshipsError(null);
          setMigrationMissing(false);
          setPermissionGrantMissing(false);
          setLoadingFriendships(false);
        }
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        return;
      }

      await Promise.resolve();
      if (cancelled) {
        return;
      }

      setLoadingFriendships(true);
      try {
        const bundle = await listUserFriendships(userId, client);
        if (cancelled) {
          return;
        }
        setFriendshipsBundle(bundle);
        setFriendshipsError(null);
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
        setFriendshipsError(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar suas amizades.",
        );
      } finally {
        if (!cancelled) {
          setLoadingFriendships(false);
        }
      }
    }

    void loadFriendships();
    const unsubscribe = subscribeFriendshipsChanged(() => {
      void loadFriendships();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isAuthLoading, isConfigured, userId]);

  useEffect(() => {
    if (!isConfigured || isAuthLoading) {
      return;
    }

    let cancelled = false;

    async function loadUnreadCount() {
      if (!userId) {
        await Promise.resolve();
        if (!cancelled) {
          setUnreadMessagesCount(0);
        }
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        return;
      }

      try {
        const summaries = await listUserConversations(userId, client);
        if (cancelled) {
          return;
        }
        const totalUnread = summaries.reduce(
          (sum, item) => sum + item.unreadCount,
          0,
        );
        setUnreadMessagesCount(totalUnread);
      } catch {
        // Silencioso antes da aplicação da migração de mensagens.
      }
    }

    void loadUnreadCount();
    const unsubMessages = subscribeMessagesChanged(() => {
      void loadUnreadCount();
    });
    const unsubFriends = subscribeFriendshipsChanged(() => {
      void loadUnreadCount();
    });

    return () => {
      cancelled = true;
      unsubMessages();
      unsubFriends();
    };
  }, [isAuthLoading, isConfigured, userId]);

  async function refreshFriendshipsNow() {
    if (!userId || !isConfigured) {
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    setLoadingFriendships(true);
    setFriendshipsError(null);
    try {
      const bundle = await listUserFriendships(userId, client);
      setFriendshipsBundle(bundle);
      setMigrationMissing(false);
      setPermissionGrantMissing(false);
    } catch (error) {
      if (error instanceof SocialServiceError) {
        setPermissionGrantMissing(error.isPermissionGrantMissing);
        setMigrationMissing(
          error.isMigrationMissing && !error.isPermissionGrantMissing,
        );
      }
      setFriendshipsError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar suas amizades.",
      );
    } finally {
      setLoadingFriendships(false);
    }
  }

  useEffect(() => {
    return subscribeOpenFriendshipsDrawer((requestedTab) => {
      const nextTab =
        requestedTab ?? (incomingCountRef.current > 0 ? "requests" : "friends");
      setDrawerTab(nextTab);
      setDrawerOpen(true);
    });
  }, []);

  function handleOpenDrawer() {
    const defaultTab: FriendshipsDrawerTab =
      friendshipsBundle.incomingRequests.length > 0 ? "requests" : "friends";
    setDrawerTab(defaultTab);
    setDrawerOpen(true);
    if (userId && isOnline && isConfigured) {
      void refreshFriendshipsNow();
    }
  }

  if (!shouldShowTopNavbar(pathname)) {
    return null;
  }

  const incomingCount = friendshipsBundle.incomingRequests.length;

  return (
    <>
      <header className="codit-safe-top codit-safe-x sticky top-0 z-40 border-b border-border/80 bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6 md:h-16">
          {/* Identidade Codit */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 rounded-xl focus:outline-none"
          >
            <OctopyBadge size={36} className="shrink-0 rounded-xl shadow-xs" />
            <div className="leading-tight">
              <p className="text-base font-bold tracking-tight text-foreground">
                Codit
              </p>
              <p className="hidden text-[11px] font-medium text-muted lg:block">
                Estúdio &amp; Comunidade
              </p>
            </div>
          </Link>

          {/* Navegação principal desktop */}
          <nav
            aria-label="Navegação principal"
            className="hidden items-center gap-1 rounded-2xl border border-border/80 bg-surface-muted/70 p-1 md:flex"
          >
            {PRIMARY_NAV_ITEMS.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              const isMessages = item.icon === "messages";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={item.description}
                  className={`relative inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? "bg-surface text-accent-strong shadow-xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <NavItemIcon icon={item.icon} />
                  <span>{item.label}</span>
                  {isMessages && activeCall ? (
                    <span
                      aria-label="Chamada de voz ativa"
                      className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"
                    />
                  ) : isMessages && userId && unreadMessagesCount > 0 ? (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                      {unreadMessagesCount > 9 ? "9+" : unreadMessagesCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {/* Ações à direita: Amizades + Conta */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleOpenDrawer}
              aria-expanded={drawerOpen}
              aria-label={
                incomingCount > 0
                  ? `Amizades (${incomingCount} solicitações pendentes)`
                  : "Gerenciar amizades"
              }
              title="Amizades"
              className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-border bg-surface-muted/80 px-2.5 text-foreground transition-colors hover:border-accent hover:text-accent-strong"
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
                aria-hidden="true"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span className="ml-1.5 hidden text-xs font-semibold lg:inline">
                Amigos
              </span>
              {userId && incomingCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground shadow-xs">
                  {incomingCount > 9 ? "9+" : incomingCount}
                </span>
              ) : null}
            </button>

            <AuthHeaderControls />
          </div>
        </div>
      </header>

      {/* Navegação principal fixa inferior no mobile */}
      <nav
        aria-label="Navegação móvel"
        className="codit-safe-bottom codit-safe-x fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-surface/95 backdrop-blur-md md:hidden"
      >
        <div className="grid grid-cols-5 gap-1 px-2 py-1.5">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const isMessages = item.icon === "messages";
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-semibold transition-colors ${
                  active
                    ? "bg-accent-soft text-accent-strong"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1 h-0.5 w-6 rounded-full bg-accent"
                  />
                ) : null}
                <NavItemIcon icon={item.icon} size={18} />
                <span className="truncate">{item.shortLabel}</span>
                {isMessages && activeCall ? (
                  <span
                    aria-label="Chamada de voz ativa"
                    className="absolute right-2 top-1.5 h-2 w-2 animate-pulse rounded-full bg-emerald-500"
                  />
                ) : isMessages && userId && unreadMessagesCount > 0 ? (
                  <span className="absolute right-1.5 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                    {unreadMessagesCount > 9 ? "9+" : unreadMessagesCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      <FriendshipsDrawer
        isOpen={drawerOpen}
        activeTab={drawerTab}
        friendshipsBundle={friendshipsBundle}
        isLoading={loadingFriendships}
        error={friendshipsError}
        migrationMissing={migrationMissing}
        permissionGrantMissing={permissionGrantMissing}
        onSelectTab={setDrawerTab}
        onClose={() => setDrawerOpen(false)}
        onRefresh={refreshFriendshipsNow}
      />
    </>
  );
}
