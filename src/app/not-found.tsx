import Link from "next/link";
import { OctopyBadge } from "@/components/brand/octopy-badge";

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-full space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-xs sm:p-8">
        <div className="flex justify-center">
          <OctopyBadge size={56} />
        </div>

        <div className="space-y-2">
          <p className="font-mono text-xs font-semibold tracking-wider text-accent-strong uppercase">
            Erro 404
          </p>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Página não encontrada
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            O endereço acessado não existe ou ainda não foi publicado nesta
            etapa do Codit.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          Voltar para a página inicial
        </Link>
      </div>
    </main>
  );
}
