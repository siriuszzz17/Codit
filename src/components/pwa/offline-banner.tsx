"use client";

import { useSyncExternalStore } from "react";

function subscribeOnlineStatus(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);

  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getOnlineSnapshot(): boolean {
  if (typeof navigator === "undefined") {
    return true;
  }
  return navigator.onLine;
}

function getServerOnlineSnapshot(): boolean {
  return true;
}

export function OfflineBanner() {
  const isOnline = useSyncExternalStore(
    subscribeOnlineStatus,
    getOnlineSnapshot,
    getServerOnlineSnapshot,
  );

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="codit-safe-x border-b border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-center text-xs font-medium text-foreground sm:text-sm"
    >
      Você está sem conexão com a internet. Recursos que dependem do servidor
      aguardam reconexão automática.
    </div>
  );
}
