"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  acceptFriendRequest,
  removeFriendship,
  sendFriendRequest,
  type SocialRelationSummary,
} from "@/modules/social/social-service";

export interface FriendshipActionButtonProps {
  viewerId: string | null;
  targetUserId: string;
  relation: SocialRelationSummary;
  isOnline: boolean;
  onChanged: () => Promise<void> | void;
  onError?: (message: string) => void;
}

export function FriendshipActionButton({
  viewerId,
  targetUserId,
  relation,
  isOnline,
  onChanged,
  onError,
}: FriendshipActionButtonProps) {
  const [busyAction, setBusyAction] = useState<
    "add" | "accept" | "remove" | null
  >(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  if (relation.status === "self") {
    return (
      <span className="inline-flex min-h-10 items-center rounded-xl border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-accent-strong">
        Seu perfil
      </span>
    );
  }

  if (!viewerId) {
    return (
      <Link
        href="/auth"
        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface-muted px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent"
      >
        Entrar para adicionar
      </Link>
    );
  }

  async function handleSendRequest() {
    if (!viewerId || !isOnline) {
      onError?.("Conecte-se à internet para enviar solicitação de amizade.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      onError?.("Cliente Supabase não configurado.");
      return;
    }

    setBusyAction("add");
    try {
      await sendFriendRequest(viewerId, targetUserId, client);
      await onChanged();
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a solicitação de amizade.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAcceptRequest() {
    if (!viewerId || !relation.friendshipId || !isOnline) {
      onError?.("Conecte-se à internet para aceitar esta solicitação.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      onError?.("Cliente Supabase não configurado.");
      return;
    }

    setBusyAction("accept");
    try {
      await acceptFriendRequest(viewerId, relation.friendshipId, client);
      await onChanged();
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : "Não foi possível aceitar a solicitação.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemoveFriendship() {
    if (!viewerId || !relation.friendshipId || !isOnline) {
      onError?.("Conecte-se à internet para atualizar esta amizade.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      onError?.("Cliente Supabase não configurado.");
      return;
    }

    setBusyAction("remove");
    try {
      await removeFriendship(viewerId, relation.friendshipId, client);
      setConfirmingRemove(false);
      await onChanged();
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a amizade.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  if (relation.status === "none") {
    return (
      <button
        type="button"
        onClick={() => void handleSendRequest()}
        disabled={busyAction !== null || !isOnline}
        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busyAction === "add" ? "Enviando..." : "Adicionar amigo"}
      </button>
    );
  }

  if (relation.status === "outgoing_pending") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-10 items-center rounded-xl border border-border bg-surface-muted px-3 py-1.5 text-xs font-medium text-muted">
          Pedido enviado
        </span>
        <button
          type="button"
          onClick={() => void handleRemoveFriendship()}
          disabled={busyAction !== null || !isOnline}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent disabled:opacity-60"
        >
          {busyAction === "remove" ? "Cancelando..." : "Cancelar"}
        </button>
      </div>
    );
  }

  if (relation.status === "incoming_pending") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleAcceptRequest()}
          disabled={busyAction !== null || !isOnline}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busyAction === "accept" ? "Aceitando..." : "Aceitar pedido"}
        </button>
        <button
          type="button"
          onClick={() => void handleRemoveFriendship()}
          disabled={busyAction !== null || !isOnline}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-foreground disabled:opacity-60"
        >
          Recusar
        </button>
      </div>
    );
  }

  // relation.status === "friends"
  if (confirmingRemove) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleRemoveFriendship()}
          disabled={busyAction !== null || !isOnline}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-500 transition-opacity hover:opacity-85 disabled:opacity-60"
        >
          {busyAction === "remove" ? "Removendo..." : "Confirmar remoção"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmingRemove(false)}
          disabled={busyAction !== null}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent"
        >
          Manter
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex min-h-10 items-center rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        Amigos
      </span>
      <button
        type="button"
        onClick={() => setConfirmingRemove(true)}
        disabled={!isOnline}
        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-red-500/40 hover:text-red-500 disabled:opacity-60"
      >
        Desfazer
      </button>
    </div>
  );
}
