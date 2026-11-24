"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { LanguageIcon } from "@/components/sandbox/language-icon";
import type { ProfileRow, SandboxProjectRow } from "@/lib/supabase/database.types";
import {
  findLanguageForSkill,
  getAccentThemeMeta,
  getAvatarFrameMeta,
  getBannerMeta,
  getOctopyCompanionMeta,
  isAllowedAvatarPath,
} from "@/modules/profiles/profile-themes";
import { computeLanguageBreakdown } from "@/modules/sandbox/language-catalog";

interface ProfileHeroCardProps {
  profile: ProfileRow;
  userEmail: string;
  projects: readonly SandboxProjectRow[];
  isEditingPreview?: boolean;
}

function getInitials(name: string | undefined, email: string | undefined): string {
  const source = (name || email || "C").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function formatMemberSince(isoDate: string): string {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) {
    return "Recente";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function toSafeExternalUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function ProfileHeroCard({
  profile,
  userEmail,
  projects,
  isEditingPreview = false,
}: ProfileHeroCardProps) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  const banner = getBannerMeta(profile.banner_preset);
  const accentTheme = getAccentThemeMeta(profile.accent_theme);
  const avatarFrame = getAvatarFrameMeta(profile.avatar_frame);
  const companion = getOctopyCompanionMeta(profile.octopy_companion);
  const breakdown = computeLanguageBreakdown(projects);

  const showAvatarImage =
    Boolean(profile.avatar_url) && failedAvatarUrl !== profile.avatar_url;
  const isPixelAvatar =
    Boolean(profile.avatar_url) &&
    isAllowedAvatarPath(profile.avatar_url ?? "");

  const githubUrl = profile.github_username
    ? `https://github.com/${encodeURIComponent(profile.github_username)}`
    : null;
  const linkedinUrl = toSafeExternalUrl(profile.linkedin_url);
  const websiteUrl = toSafeExternalUrl(profile.website_url);

  const publicCount = projects.filter(
    (project) => project.visibility === "public_portfolio",
  ).length;
  const pinnedCount = projects.filter((project) => project.is_pinned).length;

  return (
    <section
      aria-labelledby="profile-section-title"
      style={accentTheme.cssVars as CSSProperties}
      className="overflow-hidden rounded-3xl border border-border bg-surface shadow-xs"
    >
      {/* Banner personalizável */}
      <div
        className={`relative h-32 w-full overflow-hidden sm:h-40 ${banner.gradientClass}`}
      >
        <div
          aria-hidden="true"
          className={`absolute inset-0 opacity-80 ${banner.patternClass}`}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent"
        />

        <div className="relative flex h-full flex-col justify-between p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-xs">
              <span>{profile.role === "admin" ? "Admin" : "Estudante"}</span>
              <span aria-hidden="true" className="opacity-50">
                ·
              </span>
              <span className="text-white/90">{banner.label}</span>
            </div>

            {isEditingPreview ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/50 bg-emerald-500/25 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-xs">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 animate-pulse rounded-full bg-emerald-300"
                />
                Pré-visualização ao vivo
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-xs">
                Perfil &amp; Identidade
              </span>
            )}
          </div>

          <div className="flex items-center justify-end">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-black/40 px-2.5 py-1 text-white backdrop-blur-xs sm:py-1.5">
              <OctopyBadge
                size={24}
                variant={profile.octopy_companion}
                className="rounded-lg"
              />
              <div className="text-left leading-tight">
                <p className="text-[11px] font-semibold">
                  Octopy · {companion.label}
                </p>
                <p className="hidden text-[10px] text-white/75 sm:block">
                  {companion.tagline}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Corpo principal */}
      <div className="px-4 pb-5 sm:px-6 sm:pb-6">
        <div className="-mt-10 flex flex-wrap items-end justify-between gap-4 sm:-mt-12">
          <div className="flex flex-wrap items-end gap-4">
            <div
              className={`relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-surface-muted sm:h-24 sm:w-24 ${avatarFrame.wrapperClass}`}
            >
              {showAvatarImage && profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={`Avatar de ${profile.full_name || "Estudante Codit"}`}
                  width={96}
                  height={96}
                  unoptimized
                  onError={() => setFailedAvatarUrl(profile.avatar_url)}
                  className={`h-full w-full rounded-[20px] ${
                    isPixelAvatar
                      ? "bg-[#141124] object-contain p-1.5"
                      : "object-cover"
                  }`}
                  style={
                    isPixelAvatar ? { imageRendering: "pixelated" } : undefined
                  }
                />
              ) : (
                <span
                  className={`flex h-full w-full items-center justify-center rounded-[20px] text-xl font-bold sm:text-2xl ${accentTheme.softBgClass} ${accentTheme.textClass}`}
                >
                  {getInitials(profile.full_name, userEmail)}
                </span>
              )}
            </div>

            <div className="min-w-0 pb-1 pt-2 sm:pt-12">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  id="profile-section-title"
                  className="break-words text-xl font-bold tracking-tight text-foreground sm:text-2xl"
                >
                  {profile.full_name || "Estudante Codit"}
                </h1>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${accentTheme.badgeClass}`}
                >
                  {accentTheme.label}
                </span>
                {profile.username ? (
                  <Link
                    href={`/comunidade/perfil?u=${encodeURIComponent(profile.username)}`}
                    className="inline-flex items-center rounded-full border border-border bg-surface-muted px-2.5 py-0.5 font-mono text-[11px] font-semibold text-accent-strong transition-colors hover:border-accent"
                  >
                    @{profile.username}
                  </Link>
                ) : null}
              </div>

              <p className="mt-0.5 text-sm font-medium text-muted">
                {profile.headline ||
                  "Adicione seu título ou objetivo na seção Personalizar perfil abaixo"}
              </p>
            </div>
          </div>

          {/* Ações rápidas do perfil */}
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:pb-1">
            <Link
              href="/projetos"
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 sm:text-sm"
            >
              Meus Projetos ({projects.length})
            </Link>
            {profile.username ? (
              <Link
                href={`/comunidade/perfil?u=${encodeURIComponent(profile.username)}`}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface-muted px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent sm:text-sm"
              >
                Ver perfil público
              </Link>
            ) : null}
          </div>
        </div>

        {/* Metadados + Bio + Links */}
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
            {profile.location ? (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="text-muted"
                >
                  <path
                    d="M12 21s-6-5.35-6-10.5a6 6 0 1 1 12 0C18 15.65 12 21 12 21Z"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <circle cx="12" cy="10.5" r="2" fill="currentColor" />
                </svg>
                {profile.location}
              </span>
            ) : null}

            <span>Membro desde {formatMemberSince(profile.created_at)}</span>

            <span>
              {profile.show_email ? userEmail : "E-mail oculto no cartão"}
            </span>
          </div>

          {profile.bio ? (
            <p className="max-w-3xl text-sm leading-relaxed text-foreground/90">
              {profile.bio}
            </p>
          ) : null}

          {githubUrl || linkedinUrl || websiteUrl ? (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {githubUrl ? (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-border bg-surface-muted/70 px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-accent"
                >
                  <span>GitHub: @{profile.github_username}</span>
                </a>
              ) : null}
              {linkedinUrl ? (
                <a
                  href={linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-border bg-surface-muted/70 px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-accent"
                >
                  <span>LinkedIn</span>
                </a>
              ) : null}
              {websiteUrl ? (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-border bg-surface-muted/70 px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-accent"
                >
                  <span>Site / Portfólio</span>
                </a>
              ) : null}
            </div>
          ) : null}

          {profile.skills.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {profile.skills.map((skill) => {
                const matchedLang = findLanguageForSkill(skill);
                return (
                  <span
                    key={skill}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${accentTheme.borderClass} ${accentTheme.softBgClass} text-foreground`}
                  >
                    {matchedLang ? (
                      <LanguageIcon language={matchedLang} size={14} />
                    ) : null}
                    <span>{skill}</span>
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Métricas e Distribuição de Linguagens */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface-muted/50 px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-muted">
              Projetos salvos
            </p>
            <p className="mt-0.5 text-lg font-bold text-foreground">
              {projects.length}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-muted/50 px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-muted">
              Linguagens usadas
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-lg font-bold text-foreground">
                {breakdown.length}
              </p>
              {breakdown.length > 0 ? (
                <div className="flex items-center -space-x-1">
                  {breakdown.slice(0, 4).map((item) => (
                    <LanguageIcon
                      key={item.language}
                      language={item.language}
                      size={16}
                      className="rounded-sm ring-1 ring-surface"
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface-muted/50 px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-muted">
              Portfólio público
            </p>
            <p className="mt-0.5 text-lg font-bold text-foreground">
              {publicCount}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-muted/50 px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-muted">Fixados</p>
            <p className="mt-0.5 text-lg font-bold text-foreground">
              {pinnedCount}
            </p>
          </div>
        </div>

        {breakdown.length > 0 ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">
                Linguagens dos seus projetos
              </span>
              <span className="text-muted">
                {projects.length}{" "}
                {projects.length === 1 ? "projeto" : "projetos"}
              </span>
            </div>

            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
              {breakdown.map((item) => (
                <div
                  key={item.language}
                  title={`${item.meta.label}: ${item.percent}%`}
                  style={{
                    width: `${item.percent}%`,
                    backgroundColor: item.meta.accentHex,
                  }}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5 text-xs">
              {breakdown.map((item) => (
                <div
                  key={item.language}
                  className="inline-flex items-center gap-1.5 text-muted"
                >
                  <LanguageIcon language={item.language} size={14} />
                  <span className="font-medium text-foreground">
                    {item.meta.label}
                  </span>
                  <span>
                    {item.percent}% ({item.count})
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
