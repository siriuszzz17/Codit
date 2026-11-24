import type { Metadata } from "next";
import { Suspense } from "react";
import { MessagesWorkspace } from "@/components/messaging/messages-workspace";

export const metadata: Metadata = {
  title: "Mensagens",
  description:
    "Converse com amigos, crie grupos de até 10 pessoas e faça chamadas de voz com compartilhamento de tela no Codit.",
};

function MessagesLoadingFallback() {
  return (
    <main className="mx-auto flex min-h-[60dvh] w-full max-w-5xl items-center justify-center px-4 py-10">
      <div className="space-y-3 text-center">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="text-sm text-muted">Carregando mensagens...</p>
      </div>
    </main>
  );
}

export default function MensagensPage() {
  return (
    <Suspense fallback={<MessagesLoadingFallback />}>
      <MessagesWorkspace />
    </Suspense>
  );
}
