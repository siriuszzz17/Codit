"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/modules/auth/auth-provider";
import { isAllowedAvatarPath } from "@/modules/profiles/profile-themes";

function resolveDisplayLabel(
  fullName: string | undefined,
  email: string | undefined,
): string {
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
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

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
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href="/comunidade"
          className="inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent"
        >
          Comunidade
        </Link>
        <div
          aria-hidden="true"
          className="h-9 w-28 animate-pulse rounded-full border border-border bg-surface-muted"
        />
      </div>
    );
  }

  if (user) {
    const label = resolveDisplayLabel(
      profile?.full_name ?? (user.user_metadata?.full_name as string | undefined),
      user.email,
    );
    const avatarUrl = profile?.avatar_url ?? null;
    const isPixelAvatar =
      Boolean(avatarUrl) && isAllowedAvatarPath(avatarUrl ?? "");
    const showAvatar = Boolean(avatarUrl) && failedAvatarUrl !== avatarUrl;

    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href="/comunidade"
          className="inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent"
        >
          Comunidade
        </Link>
        <Link
          href="/conta"
          className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong transition-colors hover:border-accent"
        >
          {showAvatar && avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={20}
              height={20}
              unoptimized
              onError={() => setFailedAvatarUrl(avatarUrl)}
              className={`h-5 w-5 rounded-full ${
                isPixelAvatar
                  ? "bg-[#141124] object-contain p-0.5"
                  : "object-cover"
              }`}
              style={isPixelAvatar ? { imageRendering: "pixelated" } : undefined}
            />
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex h-2 w-2 rounded-full bg-accent"
            />
          )}
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
        href="/comunidade"
        className="inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent"
      >
        Comunidade
      </Link>
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
