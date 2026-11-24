"use client";

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
import { getSupabaseClient } from "@/lib/supabase/client";
import { useIsOnline } from "@/lib/use-is-online";
import { useAuth } from "@/modules/auth/auth-provider";
import {
  DEFAULT_APPEARANCE_PREFS,
  type AppAppearancePrefs,
} from "@/modules/theme/appearance-catalog";
import {
  applyAppearanceToDocument,
  fetchUserAppearance,
  normalizeAppearancePrefs,
  persistUserAppearance,
  readLocalAppearance,
  writeLocalAppearance,
} from "@/modules/theme/appearance-service";

export interface AppearanceContextValue {
  prefs: AppAppearancePrefs;
  isSyncing: boolean;
  updateAppearance: (patch: Partial<AppAppearancePrefs>) => void;
  resetAppearance: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { user, isConfigured } = useAuth();
  const isOnline = useIsOnline();
  const userId = user?.id ?? null;

  const [prefs, setPrefs] = useState<AppAppearancePrefs>(() => {
    return readLocalAppearance(null) ?? { ...DEFAULT_APPEARANCE_PREFS };
  });
  const [isSyncing, setIsSyncing] = useState(false);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    applyAppearanceToDocument(prefs);
  }, [prefs]);

  useEffect(() => {
    if (!userId || !isConfigured) {
      loadedUserIdRef.current = null;
      return;
    }

    if (loadedUserIdRef.current === userId) {
      return;
    }

    const client = getSupabaseClient();
    if (!client || !user) {
      return;
    }

    let cancelled = false;
    loadedUserIdRef.current = userId;

    void fetchUserAppearance(user, client).then((remotePrefs) => {
      if (!cancelled) {
        setPrefs(remotePrefs);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isConfigured, user, userId]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  const schedulePersistence = useCallback(
    (nextPrefs: AppAppearancePrefs) => {
      writeLocalAppearance(nextPrefs, userId);

      if (!userId || !isConfigured || !isOnline) {
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        return;
      }

      if (persistTimerRef.current !== null) {
        clearTimeout(persistTimerRef.current);
      }

      persistTimerRef.current = setTimeout(() => {
        setIsSyncing(true);
        void persistUserAppearance(userId, nextPrefs, client)
          .catch(() => undefined)
          .finally(() => {
            setIsSyncing(false);
          });
      }, 500);
    },
    [isConfigured, isOnline, userId],
  );

  const updateAppearance = useCallback(
    (patch: Partial<AppAppearancePrefs>) => {
      setPrefs((current) => {
        const next = normalizeAppearancePrefs({ ...current, ...patch });
        schedulePersistence(next);
        return next;
      });
    },
    [schedulePersistence],
  );

  const resetAppearance = useCallback(() => {
    const next = { ...DEFAULT_APPEARANCE_PREFS };
    setPrefs(next);
    schedulePersistence(next);
  }, [schedulePersistence]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      prefs,
      isSyncing,
      updateAppearance,
      resetAppearance,
    }),
    [isSyncing, prefs, resetAppearance, updateAppearance],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error(
      "useAppearance deve ser utilizado dentro de <AppearanceProvider>.",
    );
  }
  return context;
}
