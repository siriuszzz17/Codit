"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import {
  completeOAuthCallbackUrl,
  isPkceVerifierMissingError,
  parseOAuthCallbackUrl,
} from "@/lib/native-oauth";
import { getSupabaseClient } from "@/lib/supabase/client";
import { mapSupabaseAuthError } from "@/lib/supabase/errors";
import { ensureProfile } from "@/modules/profiles/profile-service";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusTitle, setStatusTitle] = useState<string>(
    "Finalizando seu login com segurança...",
  );

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function completeCallback() {
      const currentHref =
        typeof window !== "undefined" ? window.location.href : "";
      const parsedCallback = parseOAuthCallbackUrl(currentHref);

      if (
        typeof window !== "undefined" &&
        (window.location.search || window.location.hash)
      ) {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        );
      }

      if (parsedCallback.kind === "token_hash") {
        setStatusTitle("Confirmando seu e-mail com segurança...");
      }

      if (parsedCallback.kind === "error") {
        if (!cancelled) {
          setErrorMessage(parsedCallback.message);
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

      // Token hash de e-mail sempre deve ser validado via verifyOtp, mesmo se
      // houver estado prévio no navegador.
      if (parsedCallback.kind === "token_hash") {
        try {
          const completed = await completeOAuthCallbackUrl(currentHref, client);
          if (cancelled) {
            return;
          }
          if (completed.user) {
            try {
              await ensureProfile(completed.user, client);
            } catch {
              // AuthProvider sincroniza em seguida se falhar aqui.
            }
            if (!cancelled) {
              router.replace("/conta");
            }
            return;
          }
        } catch (callbackError) {
          if (!cancelled) {
            setErrorMessage(
              callbackError instanceof Error
                ? callbackError.message
                : "Não foi possível confirmar seu e-mail. Solicite um novo link na tela de acesso.",
            );
          }
          return;
        }
      }

      const { data, error } = await client.auth.getSession();
      if (cancelled) {
        return;
      }

      if (error) {
        setErrorMessage(
          mapSupabaseAuthError(error, { operation: "callback.getSession" }),
        );
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

      if (
        parsedCallback.kind === "code" ||
        parsedCallback.kind === "tokens"
      ) {
        try {
          const completed = await completeOAuthCallbackUrl(currentHref, client);
          if (cancelled) {
            return;
          }
          if (completed.user) {
            try {
              await ensureProfile(completed.user, client);
            } catch {
              // Ignora erro não-fatal aqui; AuthProvider reportará se necessário.
            }
            if (!cancelled) {
              router.replace("/conta");
            }
            return;
          }
        } catch (callbackError) {
          const fallbackSession = await client.auth.getSession();
          if (cancelled) {
            return;
          }
          if (fallbackSession.data.session?.user) {
            try {
              await ensureProfile(fallbackSession.data.session.user, client);
            } catch {
              // Não bloqueia redirecionamento.
            }
            if (!cancelled) {
              router.replace("/conta");
            }
            return;
          }

          if (isPkceVerifierMissingError(callbackError)) {
            setErrorMessage(
              "Se você clicou no link de confirmação em outro navegador ou fora do app Codit, seu e-mail pode já estar confirmado. Volte para a tela de login e entre com seu e-mail e senha.",
            );
          } else {
            setErrorMessage(
              callbackError instanceof Error
                ? callbackError.message
                : "Não foi possível confirmar a sessão de retorno.",
            );
          }
          return;
        }
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
            "Não foi possível confirmar a sessão de retorno. Tente entrar novamente na tela de acesso.",
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
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 pt-[calc(2.5rem+var(--codit-safe-top))] pb-[calc(2.5rem+var(--codit-safe-bottom))] text-center">
      <div className="codit-panel w-full space-y-5 p-6 shadow-xs sm:p-8">
        <div className="flex justify-center">
          <OctopyBadge size={56} decorative={false} />
        </div>

        {errorMessage ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="inline-block rounded-lg bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-500">
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
              Voltar para o login
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-border border-t-accent" />
            <h1 className="text-lg font-bold text-foreground">{statusTitle}</h1>
            <p className="text-sm text-muted">
              O Octopy está preparando seu perfil e seus projetos no Codit.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
