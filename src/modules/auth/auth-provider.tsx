"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  closeCapacitorOAuthBrowser,
  completeOAuthCallbackUrl,
  isCapacitorNative,
  isNativeHandoffPath,
  isSupportedNativeCallbackUrl,
  subscribeCapacitorOAuthCallback,
  subscribeDesktopOAuthCallback,
} from "@/lib/native-oauth";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { mapSupabaseAuthError } from "@/lib/supabase/errors";
import { signOutUser } from "@/modules/auth/auth-service";
import { unregisterCurrentAndroidPushDevice } from "@/modules/notifications/push-notification-service";
import { ensureProfile, ProfileServiceError } from "@/modules/profiles/profile-service";

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: ProfileRow | null;
  isLoading: boolean;
  isConfigured: boolean;
  authError: string | null;
  refreshProfile: () => Promise<ProfileRow | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const skipAuthInit = isNativeHandoffPath(pathname);
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(
    configured && !skipAuthInit,
  );
  const [authError, setAuthError] = useState<string | null>(null);

  const syncUserProfile = useCallback(async (targetUser: User | null) => {
    if (!targetUser) {
      setProfile(null);
      return null;
    }

    const client = getSupabaseClient();
    if (!client) {
      return null;
    }

    try {
      const ensured = await ensureProfile(targetUser, client);
      setProfile(ensured);
      setAuthError(null);
      return ensured;
    } catch (error) {
      if (error instanceof ProfileServiceError) {
        setAuthError(error.message);
      } else {
        setAuthError(
          "Sessão autenticada, mas não foi possível sincronizar o perfil no banco de dados.",
        );
      }
      return null;
    }
  }, []);

  useEffect(() => {
    if (skipAuthInit) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    let cancelled = false;
    let unsubDesktop: () => void = () => {};
    let unsubCapacitor: () => void = () => {};

    async function handleNativeCallbackUrl(rawUrl: string) {
      if (!client || cancelled || !isSupportedNativeCallbackUrl(rawUrl)) {
        return;
      }

      if (isCapacitorNative()) {
        await closeCapacitorOAuthBrowser();
      }

      setIsLoading(true);
      setAuthError(null);

      try {
        const result = await completeOAuthCallbackUrl(rawUrl, client);
        if (cancelled) {
          return;
        }

        if (result.session || result.user) {
          setSession(result.session);
          setUser(result.user);
          if (result.user) {
            await syncUserProfile(result.user);
          }
          if (!cancelled && pathnameRef.current !== "/conta") {
            router.replace("/conta");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setAuthError(
            error instanceof Error
              ? error.message
              : "Não foi possível concluir o login externo.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    async function loadInitialSession() {
      if (!client) {
        return;
      }

      try {
        const { data, error } = await client.auth.getSession();
        if (cancelled) {
          return;
        }

        if (error) {
          setAuthError(mapSupabaseAuthError(error));
          setSession(null);
          setUser(null);
          setProfile(null);
          setIsLoading(false);
          return;
        }

        setSession(data.session);

        let activeSession = data.session;
        const expiresAtMs = activeSession?.expires_at
          ? activeSession.expires_at * 1000
          : null;
        const isExpiringOrExpired =
          expiresAtMs !== null && expiresAtMs <= Date.now() + 30_000;
        const browserOnline =
          typeof navigator === "undefined" ? true : navigator.onLine;

        if (activeSession && isExpiringOrExpired && browserOnline) {
          const refreshed = await client.auth.refreshSession();
          if (cancelled) {
            return;
          }
          if (refreshed.error || !refreshed.data.session) {
            await client.auth.signOut({ scope: "local" }).catch(() => undefined);
            setAuthError("Sua sessão expirou. Entre novamente para continuar.");
            setSession(null);
            setUser(null);
            setProfile(null);
            setIsLoading(false);
            return;
          }
          activeSession = refreshed.data.session;
          setSession(activeSession);
        }

        setUser(activeSession?.user ?? null);

        if (activeSession?.user) {
          await syncUserProfile(activeSession.user);
        } else {
          setProfile(null);
        }
      } catch (error) {
        if (!cancelled) {
          setAuthError(mapSupabaseAuthError(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialSession();

    void subscribeDesktopOAuthCallback((url) => {
      void handleNativeCallbackUrl(url);
    }).then((cleanup) => {
      if (cancelled) {
        cleanup();
      } else {
        unsubDesktop = cleanup;
      }
    });

    void subscribeCapacitorOAuthCallback((url) => {
      void handleNativeCallbackUrl(url);
    }).then((cleanup) => {
      if (cancelled) {
        cleanup();
      } else {
        unsubCapacitor = cleanup;
      }
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) {
        return;
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        void syncUserProfile(nextSession.user);
      } else {
        setProfile(null);
      }

      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      unsubDesktop();
      unsubCapacitor();
      subscription.unsubscribe();
    };
  }, [router, skipAuthInit, syncUserProfile]);

  const refreshProfile = useCallback(async () => {
    return syncUserProfile(user);
  }, [syncUserProfile, user]);

  const signOut = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    await unregisterCurrentAndroidPushDevice(client);
    await signOutUser(client);
    setSession(null);
    setUser(null);
    setProfile(null);
    setAuthError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      isLoading,
      isConfigured: configured,
      authError,
      refreshProfile,
      signOut,
    }),
    [
      user,
      session,
      profile,
      isLoading,
      configured,
      authError,
      refreshProfile,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser utilizado dentro de <AuthProvider>.");
  }
  return context;
}
