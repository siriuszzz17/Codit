import type { CoditSupabaseClient } from "@/lib/supabase/client";

export async function assertAuthenticatedUserMatches(
  userId: string,
  client: CoditSupabaseClient,
  onUnauthorized: (message: string) => Error,
): Promise<void> {
  if (typeof client.auth?.getSession !== "function") {
    return;
  }

  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.user) {
    throw onUnauthorized(
      "Sua sessão expirou ou você não está autenticado. Entre novamente para continuar.",
    );
  }

  if (data.session.user.id !== userId) {
    throw onUnauthorized(
      "Ação bloqueada: você só pode alterar registros vinculados à sua própria conta autenticada.",
    );
  }
}

export async function assertHasAuthenticatedSession(
  client: CoditSupabaseClient,
  onUnauthorized: (message: string) => Error,
): Promise<void> {
  if (typeof client.auth?.getSession !== "function") {
    return;
  }

  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.user) {
    throw onUnauthorized(
      "Sua sessão expirou ou você não está autenticado. Entre novamente para continuar.",
    );
  }
}
