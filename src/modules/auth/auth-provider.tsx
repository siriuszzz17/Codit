"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { mapSupabaseAuthError } from "@/lib/supabase/errors";
import { signOutUser } from "@/modules/auth/auth-service";
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
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(configured);
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
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    let cancelled = false;

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
        setUser(data.session?.user ?? null);

        if (data.session?.user) {
          await syncUserProfile(data.session.user);
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
      subscription.unsubscribe();
    };
  }, [syncUserProfile]);

  const refreshProfile = useCallback(async () => {
    return syncUserProfile(user);
  }, [syncUserProfile, user]);

  const signOut = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

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
