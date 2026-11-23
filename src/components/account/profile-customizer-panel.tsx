"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { LanguageIcon } from "@/components/sandbox/language-icon";
import type {
  OctopyCompanionMood,
  ProfileAccentTheme,
  ProfileAvatarFrame,
  ProfileBannerPreset,
} from "@/lib/supabase/database.types";
import {
  CURATED_AVATAR_PRESETS,
  findLanguageForSkill,
  OCTOPY_COMPANION_IDS,
  OCTOPY_COMPANION_OPTIONS,
  PROFILE_ACCENT_IDS,
  PROFILE_ACCENT_THEMES,
  PROFILE_AVATAR_FRAME_IDS,
  PROFILE_AVATAR_FRAMES,
  PROFILE_BANNER_IDS,
  PROFILE_BANNERS,
  SUGGESTED_PROFILE_SKILLS,
} from "@/modules/profiles/profile-themes";
import {
  formatDateTimePtBr,
  getUsernameChangeEligibility,
} from "@/modules/social/social-schemas";

export interface ProfileDraftState {
  fullName: string;
  username: string;
  headline: string;
  location: string;
  bio: string;
  githubUsername: string;
  linkedinUrl: string;
  websiteUrl: string;
  avatarUrl: string;
  bannerPreset: ProfileBannerPreset;
  accentTheme: ProfileAccentTheme;
  avatarFrame: ProfileAvatarFrame;
  octopyCompanion: OctopyCompanionMood;
  skills: string[];
  showEmail: boolean;
}

interface ProfileCustomizerPanelProps {
  draft: ProfileDraftState;
  currentUsername: string;
  usernameChangedAt: string | null;
  user: User;
  isSaving: boolean;
  isOnline: boolean;
  hasUnsavedChanges: boolean;
  error: string | null;
  message: string | null;
  onChangeDraft: (updater: (current: ProfileDraftState) => ProfileDraftState) => void;
  onDiscard: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

function getGoogleAvatarFromUser(user: User): string | null {
  const metadata = user.user_metadata ?? {};
  const raw =
    typeof metadata.avatar_url === "string"
      ? metadata.avatar_url
      : typeof metadata.picture === "string"
        ? metadata.picture
        : "";
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function ProfileCustomizerPanel({
  draft,
  currentUsername,
  usernameChangedAt,
  user,
  isSaving,
  isOnline,
  hasUnsavedChanges,
  error,
  message,
  onChangeDraft,
  onDiscard,
  onSave,
}: ProfileCustomizerPanelProps) {
  const [skillInput, setSkillInput] = useState("");
  const googleAvatarUrl = getGoogleAvatarFromUser(user);
  const trimmedGithub = draft.githubUsername.trim().replace(/^@+/, "");
  const usernameEligibility = getUsernameChangeEligibility(usernameChangedAt);
  const isUsernameLocked =
    Boolean(currentUsername) &&
    !usernameEligibility.canChange &&
    usernameEligibility.nextAllowedAt !== null;

  function addSkill(rawLabel: string) {
    const cleaned = rawLabel.trim();
    if (!cleaned || cleaned.length > 32) {
      return;
    }

    onChangeDraft((current) => {
      if (current.skills.length >= 12) {
        return current;
      }
      const exists = current.skills.some(
        (item) => item.toLowerCase() === cleaned.toLowerCase(),
      );
      if (exists) {
        return current;
      }
      return {
        ...current,
        skills: [...current.skills, cleaned],
      };
    });
    setSkillInput("");
  }

  function removeSkill(label: string) {
    onChangeDraft((current) => ({
      ...current,
      skills: current.skills.filter((item) => item !== label),
    }));
  }

  function toggleSuggestedSkill(label: string) {
    const exists = draft.skills.some(
      (item) => item.toLowerCase() === label.toLowerCase(),
    );
    if (exists) {
      onChangeDraft((current) => ({
        ...current,
        skills: current.skills.filter(
          (item) => item.toLowerCase() !== label.toLowerCase(),
        ),
      }));
    } else {
      addSkill(label);
    }
  }

  function handleSkillKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addSkill(skillInput);
    }
  }

  return (
    <form
      onSubmit={(event) => void onSave(event)}
      className="space-y-6 rounded-3xl border border-border bg-surface p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground sm:text-xl">
            Personalizar Perfil
          </h2>
          <p className="text-xs text-muted sm:text-sm">
            Veja suas mudanças em tempo real no cartão acima e salve quando
            ficar do seu jeito.
          </p>
        </div>

        {hasUnsavedChanges ? (
          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
            Alterações não salvas
          </span>
        ) : null}
      </div>

      {/* 1. Capa, Tema de Destaque, Moldura e Octopy */}
      <div className="space-y-5">
        <div className="space-y-2.5">
          <h3 className="text-sm font-bold text-foreground">
            1. Capa do perfil
          </h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {PROFILE_BANNER_IDS.map((bannerId) => {
              const banner = PROFILE_BANNERS[bannerId];
              const selected = draft.bannerPreset === bannerId;
              return (
                <button
                  key={bannerId}
                  type="button"
                  onClick={() =>
                    onChangeDraft((current) => ({
                      ...current,
                      bannerPreset: bannerId,
                    }))
                  }
                  className={`group overflow-hidden rounded-2xl border text-left transition-all ${
                    selected
                      ? "border-accent ring-2 ring-accent/35"
                      : "border-border hover:border-accent/60"
                  }`}
                >
                  <div
                    className={`relative h-14 w-full ${banner.gradientClass}`}
                  >
                    <div
                      aria-hidden="true"
                      className={`absolute inset-0 opacity-80 ${banner.patternClass}`}
                    />
                    {selected ? (
                      <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
                        Ativa
                      </span>
                    ) : null}
                  </div>
                  <div className="bg-surface-muted/40 px-3 py-2">
                    <p className="text-xs font-bold text-foreground">
                      {banner.label}
                    </p>
                    <p className="text-[11px] text-muted">
                      {banner.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-2.5">
            <h3 className="text-sm font-bold text-foreground">
              2. Cor de destaque
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PROFILE_ACCENT_IDS.map((themeId) => {
                const theme = PROFILE_ACCENT_THEMES[themeId];
                const selected = draft.accentTheme === themeId;
                return (
                  <button
                    key={themeId}
                    type="button"
                    onClick={() =>
                      onChangeDraft((current) => ({
                        ...current,
                        accentTheme: themeId,
                      }))
                    }
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all ${
                      selected
                        ? "border-accent bg-accent-soft/40 text-foreground ring-2 ring-accent/30"
                        : "border-border bg-surface-muted/40 text-muted hover:border-accent/60 hover:text-foreground"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 rounded-full border border-white/30 shadow-xs"
                      style={{ backgroundColor: theme.swatchHex }}
                    />
                    <span className="truncate">{theme.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-sm font-bold text-foreground">
              3. Moldura do avatar
            </h3>
            <div className="flex flex-wrap gap-2">
              {PROFILE_AVATAR_FRAME_IDS.map((frameId) => {
                const frame = PROFILE_AVATAR_FRAMES[frameId];
                const selected = draft.avatarFrame === frameId;
                return (
                  <button
                    key={frameId}
                    type="button"
                    onClick={() =>
                      onChangeDraft((current) => ({
                        ...current,
                        avatarFrame: frameId,
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                      selected
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface-muted/50 text-foreground hover:border-accent/60"
                    }`}
                  >
                    {frame.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <h3 className="text-sm font-bold text-foreground">
            4. Humor do companheiro Octopy
          </h3>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {OCTOPY_COMPANION_IDS.map((moodId) => {
              const mood = OCTOPY_COMPANION_OPTIONS[moodId];
              const selected = draft.octopyCompanion === moodId;
              return (
                <button
                  key={moodId}
                  type="button"
                  onClick={() =>
                    onChangeDraft((current) => ({
                      ...current,
                      octopyCompanion: moodId,
                    }))
                  }
                  className={`flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all ${
                    selected
                      ? "border-accent bg-accent-soft/45 ring-2 ring-accent/30"
                      : "border-border bg-surface-muted/40 hover:border-accent/60"
                  }`}
                >
                  <OctopyBadge
                    size={36}
                    variant={moodId}
                    className="shrink-0 rounded-xl"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground">
                      {mood.label}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {mood.tagline}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. Avatar */}
      <div className="space-y-3 border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              5. Foto ou Avatar
            </h3>
            <p className="text-xs text-muted">
              Escolha um avatar pixel-art do Octopy, importe do GitHub/Google ou
              informe uma URL HTTPS.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {googleAvatarUrl ? (
              <button
                type="button"
                onClick={() =>
                  onChangeDraft((current) => ({
                    ...current,
                    avatarUrl: googleAvatarUrl,
                  }))
                }
                className="rounded-xl border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent"
              >
                Usar foto do Google
              </button>
            ) : null}

            {trimmedGithub ? (
              <button
                type="button"
                onClick={() =>
                  onChangeDraft((current) => ({
                    ...current,
                    avatarUrl: `https://avatars.githubusercontent.com/${encodeURIComponent(trimmedGithub)}`,
                  }))
                }
                className="rounded-xl border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent"
              >
                Usar foto do GitHub
              </button>
            ) : null}

            <button
              type="button"
              onClick={() =>
                onChangeDraft((current) => ({
                  ...current,
                  avatarUrl: "",
                }))
              }
              className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-foreground"
            >
              Usar iniciais
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {CURATED_AVATAR_PRESETS.map((preset) => {
            const selected = draft.avatarUrl === preset.src;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  onChangeDraft((current) => ({
                    ...current,
                    avatarUrl: preset.src,
                  }))
                }
                className={`flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all ${
                  selected
                    ? "border-accent bg-accent-soft/45 ring-2 ring-accent/30"
                    : "border-border bg-surface-muted/40 hover:border-accent/60"
                }`}
              >
                <OctopyBadge
                  size={36}
                  variant={preset.variant}
                  className="shrink-0 rounded-xl"
                />
                <span className="text-xs font-semibold text-foreground">
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="codit-profile-avatar-url"
            className="block text-xs font-semibold text-foreground"
          >
            URL personalizada da imagem (opcional)
          </label>
          <input
            id="codit-profile-avatar-url"
            type="text"
            value={draft.avatarUrl}
            onChange={(event) =>
              onChangeDraft((current) => ({
                ...current,
                avatarUrl: event.target.value,
              }))
            }
            placeholder="https://... ou selecione um avatar acima"
            className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* 6. Identidade e Links */}
      <div className="space-y-4 border-t border-border pt-5">
        <h3 className="text-sm font-bold text-foreground">
          6. Identidade, Bio &amp; Links
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="codit-profile-fullname"
              className="block text-xs font-semibold text-foreground"
            >
              Nome completo
            </label>
            <input
              id="codit-profile-fullname"
              type="text"
              required
              maxLength={120}
              value={draft.fullName}
              onChange={(event) =>
                onChangeDraft((current) => ({
                  ...current,
                  fullName: event.target.value,
                }))
              }
              placeholder="Seu nome"
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="codit-profile-username"
              className="block text-xs font-semibold text-foreground"
            >
              @usuário na Comunidade Codit
            </label>
            <div
              className={`flex min-h-11 items-center rounded-xl border border-border px-3.5 ${
                isUsernameLocked
                  ? "cursor-not-allowed bg-surface-muted/60 opacity-80"
                  : "bg-background focus-within:border-accent"
              }`}
            >
              <span
                aria-hidden="true"
                className="pr-1 font-mono text-sm text-muted"
              >
                @
              </span>
              <input
                id="codit-profile-username"
                type="text"
                maxLength={30}
                disabled={isUsernameLocked}
                value={isUsernameLocked ? currentUsername : draft.username}
                onChange={(event) =>
                  onChangeDraft((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
                placeholder="ex.: maria.dev"
                className="w-full bg-transparent py-2.5 font-mono text-sm text-foreground focus:outline-none disabled:cursor-not-allowed"
              />
            </div>
            {isUsernameLocked &&
            usernameEligibility.nextAllowedAt &&
            usernameEligibility.lastChangedAt ? (
              <p className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-foreground">
                Última alteração em{" "}
                <strong>
                  {formatDateTimePtBr(usernameEligibility.lastChangedAt)}
                </strong>
                . Você poderá alterar seu{" "}
                <code className="font-mono">@usuário</code> novamente em{" "}
                <strong>
                  {formatDateTimePtBr(usernameEligibility.nextAllowedAt)}
                </strong>{" "}
                (faltam {usernameEligibility.remainingDays}{" "}
                {usernameEligibility.remainingDays === 1 ? "dia" : "dias"}).
              </p>
            ) : usernameEligibility.isFirstDefinition ? (
              <p className="text-[11px] text-muted">
                Primeira definição liberada agora (3–30 caracteres: letras
                minúsculas, números, ponto ou sublinhado). Após escolher seu
                @usuário, novas alterações terão intervalo mínimo de 30 dias.
              </p>
            ) : (
              <p className="text-[11px] text-muted">
                Alteração de @usuário liberada (3–30 caracteres: letras
                minúsculas, números, ponto ou sublinhado). Após salvar um novo
                @, a próxima mudança será liberada em 30 dias.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="codit-profile-headline"
              className="block text-xs font-semibold text-foreground"
            >
              Título / Foco atual
            </label>
            <input
              id="codit-profile-headline"
              type="text"
              maxLength={120}
              value={draft.headline}
              onChange={(event) =>
                onChangeDraft((current) => ({
                  ...current,
                  headline: event.target.value,
                }))
              }
              placeholder="Ex.: Estudante Full-Stack | Python & IA"
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="codit-profile-location"
              className="block text-xs font-semibold text-foreground"
            >
              Localização (opcional)
            </label>
            <input
              id="codit-profile-location"
              type="text"
              maxLength={80}
              value={draft.location}
              onChange={(event) =>
                onChangeDraft((current) => ({
                  ...current,
                  location: event.target.value,
                }))
              }
              placeholder="Ex.: São Paulo, Brasil"
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="codit-profile-github"
              className="block text-xs font-semibold text-foreground"
            >
              Usuário no GitHub (sem @)
            </label>
            <input
              id="codit-profile-github"
              type="text"
              maxLength={39}
              value={draft.githubUsername}
              onChange={(event) =>
                onChangeDraft((current) => ({
                  ...current,
                  githubUsername: event.target.value,
                }))
              }
              placeholder="ex.: octopy-dev"
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="codit-profile-linkedin"
              className="block text-xs font-semibold text-foreground"
            >
              URL do LinkedIn (opcional)
            </label>
            <input
              id="codit-profile-linkedin"
              type="url"
              maxLength={300}
              value={draft.linkedinUrl}
              onChange={(event) =>
                onChangeDraft((current) => ({
                  ...current,
                  linkedinUrl: event.target.value,
                }))
              }
              placeholder="https://linkedin.com/in/seu-perfil"
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="codit-profile-website"
              className="block text-xs font-semibold text-foreground"
            >
              Site ou portfólio (opcional)
            </label>
            <input
              id="codit-profile-website"
              type="url"
              maxLength={300}
              value={draft.websiteUrl}
              onChange={(event) =>
                onChangeDraft((current) => ({
                  ...current,
                  websiteUrl: event.target.value,
                }))
              }
              placeholder="https://seuportfolio.dev"
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="codit-profile-bio"
                className="block text-xs font-semibold text-foreground"
              >
                Bio / Objetivo de carreira
              </label>
              <span className="text-[11px] text-muted">
                {draft.bio.length}/500
              </span>
            </div>
            <textarea
              id="codit-profile-bio"
              rows={3}
              maxLength={500}
              value={draft.bio}
              onChange={(event) =>
                onChangeDraft((current) => ({
                  ...current,
                  bio: event.target.value,
                }))
              }
              placeholder="Conte o que você está construindo, suas trilhas favoritas e objetivos na área tech..."
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="inline-flex cursor-pointer items-center gap-2.5 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={draft.showEmail}
                onChange={(event) =>
                  onChangeDraft((current) => ({
                    ...current,
                    showEmail: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-border accent-accent"
              />
              <span>Exibir meu e-mail no cartão principal do perfil</span>
            </label>
          </div>
        </div>
      </div>

      {/* 7. Habilidades */}
      <div className="space-y-3 border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              7. Habilidades &amp; Tecnologias ({draft.skills.length}/12)
            </h3>
            <p className="text-xs text-muted">
              Tecnologias reconhecidas ganham automaticamente o ícone da
              linguagem no seu perfil.
            </p>
          </div>
        </div>

        {draft.skills.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {draft.skills.map((skill) => {
              const lang = findLanguageForSkill(skill);
              return (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft/50 px-2.5 py-1 text-xs font-semibold text-foreground"
                >
                  {lang ? <LanguageIcon language={lang} size={14} /> : null}
                  <span>{skill}</span>
                  <button
                    type="button"
                    aria-label={`Remover habilidade ${skill}`}
                    onClick={() => removeSkill(skill)}
                    className="ml-1 rounded-full px-1 text-muted transition-colors hover:bg-black/10 hover:text-foreground dark:hover:bg-white/10"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            maxLength={32}
            value={skillInput}
            onChange={(event) => setSkillInput(event.target.value)}
            onKeyDown={handleSkillKeyDown}
            placeholder="Adicionar habilidade (ex.: Python, React, Docker)..."
            className="min-h-10 flex-1 rounded-xl border border-border bg-background px-3.5 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            disabled={!skillInput.trim() || draft.skills.length >= 12}
            onClick={() => addSkill(skillInput)}
            className="min-h-10 rounded-xl border border-border bg-surface-muted px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_PROFILE_SKILLS.map((item) => {
            const active = draft.skills.some(
              (skill) => skill.toLowerCase() === item.label.toLowerCase(),
            );
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => toggleSuggestedSkill(item.label)}
                disabled={!active && draft.skills.length >= 12}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface-muted/50 text-muted hover:border-accent/60 hover:text-foreground disabled:opacity-45"
                }`}
              >
                {item.language ? (
                  <LanguageIcon language={item.language} size={13} />
                ) : null}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
        >
          {error}
        </p>
      ) : null}

      {message ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
        >
          {message}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2.5 border-t border-border pt-4 sm:flex-row sm:justify-end">
        {hasUnsavedChanges ? (
          <button
            type="button"
            onClick={onDiscard}
            disabled={isSaving}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface-muted px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-accent disabled:opacity-60"
          >
            Descartar alterações
          </button>
        ) : null}

        <button
          type="submit"
          disabled={isSaving || !isOnline}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Salvando personalizações..." : "Salvar personalizações"}
        </button>
      </div>
    </form>
  );
}
