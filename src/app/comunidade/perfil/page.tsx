import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicProfileView } from "@/components/social/public-profile-view";

export const metadata: Metadata = {
  title: "Perfil na Comunidade",
  description:
    "Visualize perfil, amizades e mini-projetos compartilhados na Comunidade Codit.",
};

function ProfileLoadingFallback() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl items-center justify-center px-4 py-10">
      <div className="space-y-3 text-center">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="text-sm text-muted">Carregando perfil...</p>
      </div>
    </main>
  );
}

export default function ComunidadePerfilPage() {
  return (
    <Suspense fallback={<ProfileLoadingFallback />}>
      <PublicProfileView />
    </Suspense>
  );
}
