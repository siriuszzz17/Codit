import Link from "next/link";
import type { ReactNode } from "react";

export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface EmptyStateCardProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  compact?: boolean;
  className?: string;
}

function ActionControl({
  action,
  variant,
}: {
  action: EmptyStateAction;
  variant: "primary" | "secondary";
}) {
  const classes =
    variant === "primary"
      ? "inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      : "inline-flex items-center justify-center rounded-xl border border-border bg-surface-elevated px-4 py-2 text-xs font-semibold text-foreground transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

  if (action.href) {
    return (
      <Link href={action.href} className={classes}>
        {action.label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={classes}>
      {action.label}
    </button>
  );
}

export function EmptyStateCard({
  title,
  description,
  icon,
  action,
  secondaryAction,
  compact = false,
  className = "",
}: EmptyStateCardProps) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-border bg-surface/85 text-center ${
        compact ? "px-4 py-6" : "px-6 py-10"
      } ${className}`.trim()}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface-muted text-muted"
        >
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted">
        {description}
      </p>
      {action || secondaryAction ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action ? <ActionControl action={action} variant="primary" /> : null}
          {secondaryAction ? (
            <ActionControl action={secondaryAction} variant="secondary" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
