"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import {
  APP_COLOR_MODES,
  APP_THEMES,
  isDefaultAppearance,
  WALLPAPER_INTENSITIES,
  WALLPAPER_PRESETS,
} from "@/modules/theme/appearance-catalog";
import { useAppearance } from "@/modules/theme/appearance-provider";

function AppearanceControlsBody({ compact = false }: { compact?: boolean }) {
  const { prefs, isSyncing, updateAppearance, resetAppearance } =
    useAppearance();
  const usingDefault = isDefaultAppearance(prefs);

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {/* Modo claro / escuro */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">
            Modo de iluminação
          </span>
          {isSyncing ? (
            <span className="text-[11px] text-muted">Salvando...</span>
          ) : null}
        </div>
        <div
          role="radiogroup"
          aria-label="Modo de iluminação"
          className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-surface-muted/70 p-1"
        >
          {APP_COLOR_MODES.map((item) => {
            const active = prefs.colorMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => updateAppearance({ colorMode: item.id })}
                className={`min-h-9 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Temas globais */}
      <div className="space-y-2">
        <span className="block text-xs font-semibold text-foreground">
          Tema de cores
        </span>
        <div
          className={`grid gap-2 ${
            compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
          }`}
        >
          {APP_THEMES.map((theme) => {
            const active = prefs.appTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => updateAppearance({ appTheme: theme.id })}
                aria-pressed={active}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-accent bg-accent-soft/65 text-foreground"
                    : "border-border bg-surface-muted/40 text-muted hover:border-accent/50 hover:text-foreground"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-4 w-4 shrink-0 overflow-hidden rounded-full border border-black/10 dark:border-white/20"
                >
                  <span
                    className="h-full w-1/2"
                    style={{ backgroundColor: theme.swatchHex }}
                  />
                  <span
                    className="h-full w-1/2"
                    style={{ backgroundColor: theme.secondaryHex }}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {theme.label}
                  </span>
                  {!compact ? (
                    <span className="block truncate text-[11px] text-muted">
                      {theme.description}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Papéis de parede leves (CSS + SVG inline) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">
            Papel de parede
          </span>
          <span className="text-[11px] text-muted">
            Leve, vetorial e offline
          </span>
        </div>
        <div
          className={`grid gap-2 ${
            compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"
          }`}
        >
          {WALLPAPER_PRESETS.map((preset) => {
            const active = prefs.wallpaperPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => updateAppearance({ wallpaperPreset: preset.id })}
                aria-pressed={active}
                className={`group overflow-hidden rounded-xl border text-left transition-colors ${
                  active
                    ? "border-accent ring-2 ring-accent/30"
                    : "border-border hover:border-accent/60"
                }`}
              >
                <div
                  aria-hidden="true"
                  className={`relative h-12 w-full border-b border-border/70 bg-background ${preset.previewClass}`}
                >
                  {active ? (
                    <span className="absolute right-1.5 top-1.5 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                      Ativo
                    </span>
                  ) : null}
                </div>
                <div className="bg-surface px-2.5 py-2">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {preset.label}
                  </p>
                  {!compact ? (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted">
                      {preset.description}
                    </p>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Intensidade do papel de parede */}
      {prefs.wallpaperPreset !== "minimal_paper" ? (
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-foreground">
            Presença do papel de parede
          </span>
          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-surface-muted/70 p-1">
            {WALLPAPER_INTENSITIES.map((item) => {
              const active = prefs.wallpaperIntensity === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    updateAppearance({ wallpaperIntensity: item.id })
                  }
                  aria-pressed={active}
                  className={`min-h-8 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-surface text-foreground shadow-xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-[11px] text-muted">
          Salvo automaticamente no dispositivo e na conta.
        </span>
        <button
          type="button"
          onClick={resetAppearance}
          disabled={usingDefault}
          className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border bg-surface-muted px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Restaurar original
        </button>
      </div>
    </div>
  );
}

export function AppearanceInlinePanel() {
  return <AppearanceControlsBody compact={false} />;
}

export function AppearanceNavbarControl() {
  const { prefs } = useAppearance();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const hasCustomLook = !isDefaultAppearance(prefs);

  useDialogA11y({
    open,
    containerRef: dialogRef,
    onClose: () => setOpen(false),
  });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Personalizar tema e papel de parede"
        title="Tema e papel de parede"
        className={`relative inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors ${
          open
            ? "border-accent bg-accent-soft text-accent-strong"
            : "border-border bg-surface-muted/70 text-foreground hover:border-accent"
        }`}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5Z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        <span className="hidden lg:inline">Aparência</span>
        {hasCustomLook ? (
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-accent"
          />
        ) : null}
      </button>

      {open && typeof document !== "undefined" ? createPortal((
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Aparência e papéis de parede"
          className="codit-safe-modal fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs md:items-start md:justify-end md:bg-transparent md:backdrop-blur-none"
        >
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="absolute inset-0"
          />

          <div
            ref={dialogRef}
            className="relative z-10 max-h-[calc(100dvh-var(--codit-safe-top)-var(--codit-safe-bottom)-1.5rem)] w-full overflow-y-auto rounded-t-3xl border border-border bg-surface-elevated p-5 pb-[calc(1.25rem+var(--codit-safe-bottom))] shadow-2xl md:mt-16 md:mr-6 md:max-h-[calc(100dvh-5.5rem)] md:w-[390px] md:rounded-2xl md:pb-5"
          >
            <div className="mb-4 flex items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  Aparência do aplicativo
                </h2>
                <p className="text-xs text-muted">
                  Escolha um tema e papel de parede sem pesar o app.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border bg-surface-muted px-2.5 text-xs font-semibold text-foreground hover:border-accent"
              >
                Fechar
              </button>
            </div>

            <AppearanceControlsBody compact />
          </div>
        </div>
      ), document.body) : null}
    </div>
  );
}
