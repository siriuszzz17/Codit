import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isNativeHandoffRoute } from "@/lib/native-oauth";
import {
  getRuntimeSupabaseConfig,
  SupabaseConfigError,
} from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

export type CoditSupabaseClient = SupabaseClient<Database>;

let cachedClient: CoditSupabaseClient | null = null;
let cachedConfigKey: string | null = null;

export function getSupabaseClient(): CoditSupabaseClient | null {
  const config = getRuntimeSupabaseConfig();
  if (!config) {
    return null;
  }

  const configKey = `${config.url}::${config.anonKey}`;
  if (cachedClient && cachedConfigKey === configKey) {
    return cachedClient;
  }

  const isBrowser = typeof window !== "undefined";
  const detectSession = isBrowser && !isNativeHandoffRoute();

  cachedClient = createClient<Database>(config.url, config.anonKey, {
    auth: {
      flowType: "pkce",
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: detectSession,
      storageKey: "codit-supabase-auth",
    },
  });
  cachedConfigKey = configKey;

  return cachedClient;
}

export function requireSupabaseClient(): CoditSupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new SupabaseConfigError();
  }
  return client;
}

export function resetSupabaseClientForTests(): void {
  cachedClient = null;
  cachedConfigKey = null;
}
