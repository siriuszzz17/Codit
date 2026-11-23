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
      <div
        aria-hidden="true"
        className="h-10 w-24 animate-pulse rounded-xl border border-border bg-surface-muted"
      />
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
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Link
          href="/conta"
          title="Abrir Meu Perfil"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface-muted/80 px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent"
        >
          {showAvatar && avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={20}
              height={20}
              unoptimized
              onError={() => setFailedAvatarUrl(avatarUrl)}
              className={`h-5 w-5 rounded-md ${
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
          <span className="max-w-[76px] truncate sm:max-w-28">{label}</span>
        </Link>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={isSigningOut}
          aria-label={isSigningOut ? "Saindo da conta" : "Sair"}
          title="Sair"
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:px-3"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="sm:hidden"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="hidden sm:inline">
            {isSigningOut ? "Saindo..." : "Sair"}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Link
        href="/auth"
        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent"
      >
        Entrar
      </Link>
      <Link
        href="/auth?mode=signup"
        className="hidden min-h-10 items-center justify-center rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 sm:inline-flex"
      >
        Criar conta
      </Link>
    </div>
  );
}
