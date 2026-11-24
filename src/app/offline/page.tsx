import Link from "next/link";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { ReloadButton } from "@/components/pwa/reload-button";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-lg flex-col items-center justify-center px-4 py-8 text-center">
      <div className="codit-panel w-full space-y-5 p-6 shadow-xs sm:p-8">
        <div className="flex justify-center">
          <OctopyBadge size={60} decorative={false} />
        </div>

        <div className="space-y-2">
          <span className="inline-block rounded-lg bg-surface-muted px-2.5 py-1 text-xs font-semibold text-accent-strong">
            Sem conexão
          </span>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Você está offline no momento
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            O aplicativo continua disponível no dispositivo, mas recursos que
            dependem do servidor aguardam conexão com a internet.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <ReloadButton />
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface-muted px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </main>
  );
}
