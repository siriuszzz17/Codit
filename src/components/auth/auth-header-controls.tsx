"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/modules/auth/auth-provider";

function resolveDisplayLabel(fullName: string | undefined, email: string | undefined): string {
  const trimmedName = fullName?.trim();
  if (trimmedName) {
    const firstWord = trimmedName.split(/\s+/)[0];
    if (firstWord) {
      return firstWord;
    }
  }

  const emailPrefix = email?.split("@")[0]?.trim();
  return emailPrefix || "Minha conta";
}

export function AuthHeaderControls() {
  const { user, profile, isLoading, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  }

  if (isLoading) {
    return (
      <div
        aria-hidden="true"
        className="h-9 w-28 animate-pulse rounded-full border border-border bg-surface-muted"
      />
    );
  }

  if (user) {
    const label = resolveDisplayLabel(
      profile?.full_name ?? (user.user_metadata?.full_name as string | undefined),
      user.email,
    );

    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href="/conta"
          className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-accent-soft px-3.5 py-1.5 text-xs font-semibold text-accent-strong transition-colors hover:border-accent"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-2 w-2 rounded-full bg-accent"
          />
          <span>Olá, {label}</span>
        </Link>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={isSigningOut}
          className="inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSigningOut ? "Saindo..." : "Sair"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link
        href="/auth"
        className="inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent"
      >
        Entrar
      </Link>
      <Link
        href="/auth?mode=signup"
        className="inline-flex min-h-9 items-center justify-center rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90"
      >
        Criar conta
      </Link>
    </div>
  );
}
