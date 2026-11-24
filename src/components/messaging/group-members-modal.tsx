"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { UserAvatar } from "@/components/social/user-avatar";
import {
  MAX_GROUP_MEMBERS,
  MAX_GROUP_TITLE_LENGTH,
} from "@/modules/messaging/messaging-schemas";
import type { ConversationSummary } from "@/modules/messaging/messaging-service";
import type { FriendshipListItem } from "@/modules/social/social-service";

export interface GroupMembersModalProps {
  isOpen: boolean;
  summary: ConversationSummary;
  currentUserId: string;
  friends: FriendshipListItem[];
  isOnline: boolean;
  onClose: () => void;
  onRenameGroup: (title: string) => Promise<void>;
  onAddMembers: (memberIds: string[]) => Promise<void>;
  onRemoveMember: (targetUserId: string) => Promise<void>;
  onLeaveGroup: () => Promise<void>;
}

export function GroupMembersModal({
  isOpen,
  summary,
  currentUserId,
  friends,
  isOnline,
  onClose,
  onRenameGroup,
  onAddMembers,
  onRemoveMember,
  onLeaveGroup,
}: GroupMembersModalProps) {
  const [titleInput, setTitleInput] = useState(
    summary.conversation.title ?? summary.displayTitle,
  );
  const [selectedNewIds, setSelectedNewIds] = useState<string[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalNotice, setModalNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const isOwner = summary.currentMember.role === "owner";
  const activeMemberIds = new Set(summary.members.map((m) => m.member.user_id));
  const remainingSlots = Math.max(
    0,
    MAX_GROUP_MEMBERS - summary.activeMemberCount,
  );
  const availableFriends = friends.filter(
    ({ profile }) => !activeMemberIds.has(profile.id),
  );

  function toggleNewFriend(friendId: string) {
    setModalError(null);
    setSelectedNewIds((current) => {
      if (current.includes(friendId)) {
        return current.filter((item) => item !== friendId);
      }
      if (current.length >= remainingSlots) {
        setModalError(
          `Este grupo só possui ${remainingSlots} vaga(s) restante(s) até o limite de ${MAX_GROUP_MEMBERS} pessoas.`,
        );
        return current;
      }
      return [...current, friendId];
    });
  }

  async function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isOnline) {
      setModalError("Conecte-se à internet para renomear o grupo.");
      return;
    }

    const trimmed = titleInput.trim();
    if (!trimmed) {
      setModalError("Informe um nome válido para o grupo.");
      return;
    }

    setBusyAction("rename");
    setModalError(null);
    setModalNotice(null);
    try {
      await onRenameGroup(trimmed);
      setModalNotice("Nome do grupo atualizado.");
    } catch (error) {
      setModalError(
        error instanceof Error
          ? error.message
          : "Não foi possível renomear o grupo.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAddSubmit() {
    if (!isOnline) {
      setModalError("Conecte-se à internet para adicionar membros.");
      return;
    }
    if (selectedNewIds.length === 0) {
      setModalError("Selecione pelo menos 1 amigo para adicionar.");
      return;
    }

    setBusyAction("add");
    setModalError(null);
    setModalNotice(null);
    try {
      await onAddMembers(selectedNewIds);
      setSelectedNewIds([]);
      setModalNotice("Amigos adicionados ao grupo!");
    } catch (error) {
      setModalError(
        error instanceof Error
          ? error.message
          : "Não foi possível adicionar membros ao grupo.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemove(targetUserId: string) {
    if (!isOnline) {
      setModalError("Conecte-se à internet para remover participantes.");
      return;
    }

    setBusyAction(`remove:${targetUserId}`);
    setModalError(null);
    setModalNotice(null);
    try {
      await onRemoveMember(targetUserId);
      setModalNotice("Participante removido do grupo.");
    } catch (error) {
      setModalError(
        error instanceof Error
          ? error.message
          : "Não foi possível remover este participante.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleLeave() {
    if (!isOnline) {
      setModalError("Conecte-se à internet para sair do grupo.");
      return;
    }

    setBusyAction("leave");
    setModalError(null);
    try {
      await onLeaveGroup();
    } catch (error) {
      setModalError(
        error instanceof Error ? error.message : "Não foi possível sair do grupo.",
      );
      setBusyAction(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="codit-group-members-title"
      className="codit-safe-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs"
    >
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0" />

      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2
              id="codit-group-members-title"
              className="text-base font-bold text-foreground sm:text-lg"
            >
              Participantes do grupo
            </h2>
            <p className="text-xs text-muted">
              {summary.activeMemberCount} de {MAX_GROUP_MEMBERS} pessoas ativas
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface-muted px-3 text-xs font-semibold text-foreground hover:border-accent"
          >
            Fechar
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {modalError ? (
            <p
              role="alert"
              className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
            >
              {modalError}
            </p>
          ) : null}

          {modalNotice ? (
            <p
              role="status"
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
            >
              {modalNotice}
            </p>
          ) : null}

          {isOwner ? (
            <form
              onSubmit={(event) => void handleRenameSubmit(event)}
              className="space-y-2 rounded-2xl border border-border bg-surface-muted/35 p-3.5"
            >
              <label
                htmlFor="codit-group-rename-input"
                className="block text-xs font-semibold text-foreground"
              >
                Renomear grupo
              </label>
              <div className="flex gap-2">
                <input
                  id="codit-group-rename-input"
                  type="text"
                  maxLength={MAX_GROUP_TITLE_LENGTH}
                  value={titleInput}
                  onChange={(event) => setTitleInput(event.target.value)}
                  className="min-h-9 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={busyAction !== null || !isOnline}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {busyAction === "rename" ? "..." : "Salvar"}
                </button>
              </div>
            </form>
          ) : null}

          <div className="space-y-2.5">
            <h3 className="text-xs font-bold tracking-wide text-foreground uppercase">
              Membros ({summary.activeMemberCount}/{MAX_GROUP_MEMBERS})
            </h3>
            <ul className="space-y-2">
              {summary.members.map(({ member, profile }) => {
                const isSelf = member.user_id === currentUserId;
                return (
                  <li
                    key={member.user_id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-muted/35 p-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <UserAvatar
                        name={profile.full_name}
                        username={profile.username}
                        avatarUrl={profile.avatar_url}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/comunidade/perfil?u=${encodeURIComponent(profile.username)}`}
                            onClick={onClose}
                            className="truncate text-xs font-bold text-foreground hover:underline sm:text-sm"
                          >
                            {profile.full_name}
                          </Link>
                          {member.role === "owner" ? (
                            <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-strong">
                              Admin
                            </span>
                          ) : null}
                          {isSelf ? (
                            <span className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                              Você
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate font-mono text-[11px] text-accent-strong">
                          @{profile.username}
                        </p>
                      </div>
                    </div>

                    {isOwner && !isSelf ? (
                      <button
                        type="button"
                        disabled={busyAction !== null || !isOnline}
                        onClick={() => void handleRemove(member.user_id)}
                        className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-xl border border-red-500/35 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-red-500/20 disabled:opacity-60"
                      >
                        {busyAction === `remove:${member.user_id}`
                          ? "..."
                          : "Remover"}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-2.5 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold tracking-wide text-foreground uppercase">
                Adicionar amigos
              </h3>
              <span className="text-[11px] text-muted">
                Vagas: {remainingSlots}
              </span>
            </div>

            {remainingSlots === 0 ? (
              <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs text-foreground">
                Este grupo atingiu o limite máximo de {MAX_GROUP_MEMBERS} pessoas.
              </p>
            ) : availableFriends.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-surface-muted/35 p-3.5 text-center text-xs text-muted">
                Todos os seus amigos aceitos já estão neste grupo (ou adicione
                novos amigos pelo menu Amigos).
              </p>
            ) : (
              <div className="space-y-2.5">
                <ul className="max-h-44 space-y-2 overflow-y-auto pr-1">
                  {availableFriends.map(({ profile }) => {
                    const checked = selectedNewIds.includes(profile.id);
                    const disabled =
                      !checked && selectedNewIds.length >= remainingSlots;
                    return (
                      <li key={profile.id}>
                        <label
                          className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2 transition-colors ${
                            checked
                              ? "border-accent bg-accent-soft/45"
                              : disabled
                                ? "cursor-not-allowed border-border/60 opacity-55"
                                : "border-border bg-surface-muted/30 hover:border-accent/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleNewFriend(profile.id)}
                            className="h-4 w-4 accent-accent"
                          />
                          <UserAvatar
                            name={profile.full_name}
                            username={profile.username}
                            avatarUrl={profile.avatar_url}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-foreground">
                              {profile.full_name}
                            </p>
                            <p className="truncate font-mono text-[11px] text-accent-strong">
                              @{profile.username}
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  disabled={
                    selectedNewIds.length === 0 ||
                    busyAction !== null ||
                    !isOnline
                  }
                  onClick={() => void handleAddSubmit()}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {busyAction === "add"
                    ? "Adicionando..."
                    : `Adicionar selecionados (${selectedNewIds.length})`}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-muted/35 px-5 py-3.5">
          {confirmLeave ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-foreground">
                Sair deste grupo?
              </span>
              <button
                type="button"
                disabled={busyAction !== null || !isOnline}
                onClick={() => void handleLeave()}
                className="inline-flex min-h-9 items-center justify-center rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busyAction === "leave" ? "Saindo..." : "Confirmar saída"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-red-500/20"
            >
              Sair do grupo
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface px-4 py-1.5 text-xs font-semibold text-foreground hover:border-accent"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
