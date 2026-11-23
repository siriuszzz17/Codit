"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { getSupabaseClient } from "@/lib/supabase/client";
import { mapSupabaseAuthError } from "@/lib/supabase/errors";
import { ensureProfile } from "@/modules/profiles/profile-service";

function extractCallbackError(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  );

  const rawError =
    searchParams.get("error_description") ||
    hashParams.get("error_description") ||
    searchParams.get("error") ||
    hashParams.get("error");

  return rawError ? rawError.trim() : null;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function completeCallback() {
      const providerError = extractCallbackError();
      if (providerError) {
        if (!cancelled) {
          setErrorMessage(mapSupabaseAuthError({ message: providerError }));
        }
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        if (!cancelled) {
          setErrorMessage(
            "O Supabase ainda não foi configurado neste ambiente (.env.local).",
          );
        }
        return;
      }

      const { data, error } = await client.auth.getSession();
      if (cancelled) {
        return;
      }

      if (error) {
        setErrorMessage(mapSupabaseAuthError(error));
        return;
      }

      if (data.session?.user) {
        try {
          await ensureProfile(data.session.user, client);
        } catch {
          // Não bloqueia redirecionamento se o perfil sincronizar no provider.
        }
        if (!cancelled) {
          router.replace("/conta");
        }
        return;
      }

      const authListener = client.auth.onAuthStateChange(
        (event, nextSession) => {
          if (cancelled) {
            return;
          }
          if (
            (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
            nextSession?.user
          ) {
            void (async () => {
              try {
                await ensureProfile(nextSession.user, client);
              } catch {
                // Ignora erro não-fatal aqui; AuthProvider reportará se necessário.
              }
              if (!cancelled) {
                router.replace("/conta");
              }
            })();
          }
        },
      );
      subscription = authListener.data.subscription;

      timeoutId = setTimeout(() => {
        if (!cancelled) {
          setErrorMessage(
            "Não foi possível confirmar a sessão de retorno. Tente entrar novamente.",
          );
        }
      }, 6000);
    }

    void completeCallback();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      subscription?.unsubscribe();
    };
  }, [router]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-full space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-xs sm:p-8">
        <div className="flex justify-center">
          <OctopyBadge size={60} decorative={false} />
        </div>

        {errorMessage ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="inline-block rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-500">
                Falha na autenticação
              </span>
              <h1 className="text-xl font-bold text-foreground">
                Não foi possível concluir seu acesso
              </h1>
              <p className="text-sm leading-relaxed text-muted">
                {errorMessage}
              </p>
            </div>

            <Link
              href="/auth"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              Voltar para a tela de login
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-border border-t-accent" />
            <h1 className="text-lg font-bold text-foreground">
              Finalizando seu login com segurança...
            </h1>
            <p className="text-sm text-muted">
              O Octopy está preparando seu perfil e seus mini-projetos no Codit.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
