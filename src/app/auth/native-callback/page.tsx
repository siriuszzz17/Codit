"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import {
  buildNativeAppCallbackUrls,
  isAndroidUserAgent,
} from "@/lib/native-oauth";

function subscribeNoop(): () => void {
  return () => {};
}

function getClientHrefSnapshot(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.href;
}

function getServerHrefSnapshot(): string {
  return "";
}

function getClientAndroidSnapshot(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return isAndroidUserAgent(navigator.userAgent);
}

function getServerAndroidSnapshot(): boolean {
  return false;
}

export default function NativeAuthCallbackPage() {
  const currentHref = useSyncExternalStore(
    subscribeNoop,
    getClientHrefSnapshot,
    getServerHrefSnapshot,
  );
  const isAndroid = useSyncExternalStore(
    subscribeNoop,
    getClientAndroidSnapshot,
    getServerAndroidSnapshot,
  );

  const handoff = useMemo(
    () => buildNativeAppCallbackUrls(currentHref),
    [currentHref],
  );
  const primaryHref = isAndroid
    ? handoff.androidIntentUrl
    : handoff.customSchemeUrl;

  useEffect(() => {
    if (!handoff.hasAuthPayload || typeof window === "undefined") {
      return;
    }

    const timer = setTimeout(() => {
      window.location.replace(primaryHref);
    }, 60);

    return () => {
      clearTimeout(timer);
    };
  }, [handoff.hasAuthPayload, primaryHref]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-full space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-xs sm:p-8">
        <div className="flex justify-center">
          <OctopyBadge size={64} variant="happy" decorative={false} />
        </div>

        {handoff.errorMessage ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="inline-block rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-500">
                Retorno de autenticação
              </span>
              <h1 className="text-xl font-bold text-foreground">
                Não foi possível concluir o login
              </h1>
              <p className="text-sm leading-relaxed text-muted">
                {handoff.errorMessage}
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <a
                href={primaryHref}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
              >
                Voltar para o aplicativo Codit
              </a>
              <Link
                href="/auth"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-surface-muted px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent"
              >
                Entrar pela versão Web
              </Link>
            </div>
          </div>
        ) : handoff.hasAuthPayload ? (
          <div className="space-y-4">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-border border-t-accent" />
            <div className="space-y-2">
              <span className="inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
                Codit Mobile
              </span>
              <h1 className="text-xl font-bold text-foreground">
                Voltando para o aplicativo Codit...
              </h1>
              <p className="text-sm leading-relaxed text-muted">
                Se o aplicativo não abrir automaticamente em instantes, toque no
                botão abaixo para concluir seu acesso com o Octopy.
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <a
                href={primaryHref}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
              >
                Abrir no aplicativo Codit
              </a>
              <a
                href={handoff.customSchemeUrl}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-surface-muted px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent"
              >
                Abrir via link direto
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-foreground">
                Abrir no aplicativo Codit
              </h1>
              <p className="text-sm leading-relaxed text-muted">
                Esta página encaminha o retorno de login do Google diretamente
                para o aplicativo Codit no seu celular.
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <a
                href={primaryHref}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
              >
                Abrir aplicativo Codit
              </a>
              <Link
                href="/auth"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-surface-muted px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent"
              >
                Ir para o login Web
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
