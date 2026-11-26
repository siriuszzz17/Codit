import type { HTMLAttributes } from "react";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className = "", ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-surface-muted/85 motion-reduce:animate-none ${className}`.trim()}
      {...props}
    />
  );
}

export interface SkeletonListProps {
  count?: number;
  label?: string;
  compact?: boolean;
  className?: string;
}

export function SkeletonList({
  count = 3,
  label = "Carregando conteúdo...",
  compact = false,
  className = "",
}: SkeletonListProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`space-y-3 ${className}`.trim()}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={`rounded-2xl border border-border bg-surface ${compact ? "p-3" : "p-4"}`}
        >
          <div className="flex items-center gap-3">
            <Skeleton className={compact ? "h-8 w-8 rounded-full" : "h-10 w-10 rounded-full"} />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
          {!compact ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
