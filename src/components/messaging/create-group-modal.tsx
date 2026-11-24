"use client";

import { useEffect, useState, type FormEvent } from "react";
import { UserAvatar } from "@/components/social/user-avatar";
import {
  MAX_GROUP_INVITEES,
  MAX_GROUP_MEMBERS,
  MAX_GROUP_TITLE_LENGTH,
} from "@/modules/messaging/messaging-schemas";
import type { FriendshipListItem } from "@/modules/social/social-service";

export interface CreateGroupModalProps {
  isOpen: boolean;
  friends: FriendshipListItem[];
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onCreateGroup: (title: string, memberIds: string[]) => Promise<void>;
  onOpenFindFriends: () => void;
}

export function CreateGroupModal({
  isOpen,
  friends,
  isSubmitting,
  error,
  onClose,
  onCreateGroup,
  onOpenFindFriends,
}: CreateGroupModalProps) {
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

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

  const totalMembers = selectedIds.length + 1;
  const limitReached = selectedIds.length >= MAX_GROUP_INVITEES;
  const normalizedSearch = search.trim().toLowerCase().replace(/^@+/, "");

  const filteredFriends = friends.filter(({ profile }) => {
    if (!normalizedSearch) {
      return true;
    }
    return (
      profile.username.toLowerCase().includes(normalizedSearch) ||
      profile.full_name.toLowerCase().includes(normalizedSearch)
    );
  });

  function toggleFriend(friendId: string) {
    setLocalError(null);
    setSelectedIds((current) => {
      if (current.includes(friendId)) {
        return current.filter((item) => item !== friendId);
      }
      if (current.length >= MAX_GROUP_INVITEES) {
        setLocalError(
          `Um grupo no Codit comporta no máximo ${MAX_GROUP_MEMBERS} pessoas (você + ${MAX_GROUP_INVITEES} amigos).`,
        );
        return current;
      }
      return [...current, friendId];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setLocalError("Informe um nome para o grupo.");
      return;
    }
    if (selectedIds.length === 0) {
      setLocalError("Selecione pelo menos 1 amigo aceito para criar o grupo.");
      return;
    }

    await onCreateGroup(trimmedTitle, selectedIds);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="codit-create-group-title"
      className="codit-safe-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs"
    >
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0" />

      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <h2
              id="codit-create-group-title"
              className="text-base font-bold text-foreground sm:text-lg"
            >
              Novo grupo com amigos
            </h2>
            <p className="text-xs text-muted">
              Apenas amigos aceitos podem participar. Limite máximo de{" "}
              <strong className="text-foreground">
                {MAX_GROUP_MEMBERS} pessoas
              </strong>{" "}
              no grupo.
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

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="space-y-1.5">
              <label
                htmlFor="codit-group-name-input"
                className="block text-xs font-semibold text-foreground"
              >
                Nome do grupo
              </label>
              <input
                id="codit-group-name-input"
                type="text"
                maxLength={MAX_GROUP_TITLE_LENGTH}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: Grupo TCC Python, Clube React..."
                className="min-h-10 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none sm:text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">
                Selecionar amigos ({selectedIds.length}/{MAX_GROUP_INVITEES})
              </p>
              <span
                className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-semibold ${
                  limitReached
                    ? "border-amber-500/40 bg-amber-500/10 text-foreground"
                    : "border-border bg-surface-muted text-accent-strong"
                }`}
              >
                Total no grupo: {totalMembers}/{MAX_GROUP_MEMBERS} pessoas
              </span>
            </div>

            {friends.length === 0 ? (
              <div className="space-y-3 rounded-2xl border border-dashed border-border bg-surface-muted/35 p-5 text-center">
                <p className="text-sm font-semibold text-foreground">
                  Você ainda não tem amigos aceitos para convidar.
                </p>
                <p className="text-xs text-muted">
                  Adicione colegas por <code className="font-mono">@usuário</code>{" "}
                  para conversar ou criar grupos de até {MAX_GROUP_MEMBERS}{" "}
                  pessoas.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenFindFriends();
                  }}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90"
                >
                  Adicionar amigos por @
                </button>
              </div>
            ) : (
              <>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filtrar amigos por nome ou @usuário..."
                  aria-label="Filtrar amigos"
                  className="min-h-9 w-full rounded-xl border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />

                <ul className="max-h-60 space-y-2 overflow-y-auto pr-1">
                  {filteredFriends.length === 0 ? (
                    <li className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
                      Nenhum amigo corresponde à busca.
                    </li>
                  ) : (
                    filteredFriends.map(({ profile }) => {
                      const checked = selectedIds.includes(profile.id);
                      const disabled = !checked && limitReached;
                      return (
                        <li key={profile.id}>
                          <label
                            className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-2.5 transition-colors ${
                              checked
                                ? "border-accent bg-accent-soft/45"
                                : disabled
                                  ? "cursor-not-allowed border-border/60 bg-surface-muted/30 opacity-55"
                                  : "border-border bg-surface-muted/35 hover:border-accent/60"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleFriend(profile.id)}
                              className="h-4 w-4 rounded border-border accent-accent"
                            />
                            <UserAvatar
                              name={profile.full_name}
                              username={profile.username}
                              avatarUrl={profile.avatar_url}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold text-foreground sm:text-sm">
                                {profile.full_name}
                              </p>
                              <p className="truncate font-mono text-[11px] text-accent-strong">
                                @{profile.username}
                              </p>
                            </div>
                          </label>
                        </li>
                      );
                    })
                  )}
                </ul>
              </>
            )}

            {localError || error ? (
              <p
                role="alert"
                className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
              >
                {localError ?? error}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-muted/35 px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground hover:border-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || friends.length === 0}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-60"
            >
              {isSubmitting ? "Criando grupo..." : "Criar grupo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
