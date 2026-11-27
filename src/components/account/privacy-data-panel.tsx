"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { CURRENT_PRIVACY_VERSION } from "@/modules/auth/auth-schemas";
import {
  listBlockedUsers,
  unblockUser,
  type BlockedUserItem,
} from "@/modules/social/social-service";

export interface PrivacyDataPanelProps {
  userId: string;
  profile: ProfileRow;
  isOnline: boolean;
  onRefreshProfile: () => Promise<ProfileRow | null>;
  onSignOut: () => Promise<void>;
}

export function PrivacyDataPanel({
  userId,
  profile,
  isOnline,
  onRefreshProfile,
  onSignOut,
}: PrivacyDataPanelProps) {
  const router = useRouter();
  const [acceptingTerms, setAcceptingTerms] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserItem[]>([]);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [confirmUsername, setConfirmUsername] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  useDialogA11y({
    open: deleteModalOpen,
    containerRef: deleteDialogRef,
    onClose: () => {
      if (!deletingAccount) {
        setDeleteModalOpen(false);
      }
    },
  });

  useEffect(() => {
    let cancelled = false;
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    void listBlockedUsers(userId, client)
      .then((list) => {
        if (!cancelled) {
          setBlockedUsers(list);
        }
      })
      .catch(() => {
        // Silencia se migration de user_blocks ainda não foi aplicada.
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function handleAcceptTerms() {
    if (!isOnline) {
      setError("Conecte-se à internet para registrar seu aceite.");
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      setError("Cliente Supabase não configurado.");
      return;
    }
    setAcceptingTerms(true);
    setError(null);
    setFeedback(null);
    try {
      const { error: rpcError } = await client.rpc("accept_privacy_terms", {
        p_version: CURRENT_PRIVACY_VERSION,
      });
      if (rpcError) {
        throw new Error(rpcError.message);
      }
      await onRefreshProfile();
      setFeedback("Aceite da Política de Privacidade registrado com sucesso.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível registrar o aceite dos termos.",
      );
    } finally {
      setAcceptingTerms(false);
    }
  }

  async function handleExportData() {
    if (!isOnline) {
      setError("Conecte-se à internet para exportar seus dados.");
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      setError("Cliente Supabase não configurado.");
      return;
    }
    setExporting(true);
    setError(null);
    setFeedback(null);
    try {
      const { data, error: rpcError } = await client.rpc(
        "export_my_account_data",
      );
      if (rpcError || !data) {
        throw new Error(
          rpcError?.message ?? "Não foi possível gerar a exportação JSON.",
        );
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `codit-dados-${profile.username || "conta"}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setFeedback("Exportação JSON baixada com sucesso.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível exportar seus dados agora.",
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleUnblock(targetId: string) {
    if (!isOnline) {
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      return;
    }
    setUnblockingId(targetId);
    setError(null);
    try {
      await unblockUser(userId, targetId, client);
      setBlockedUsers((cur) =>
        cur.filter((item) => item.block.blocked_id !== targetId),
      );
      setFeedback("Usuário desbloqueado.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível desbloquear o usuário.",
      );
    } finally {
      setUnblockingId(null);
    }
  }

  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isOnline) {
      setError("Conecte-se à internet para excluir sua conta.");
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      setError("Cliente Supabase não configurado.");
      return;
    }
    setDeletingAccount(true);
    setError(null);
    try {
      const { error: rpcError } = await client.rpc("delete_my_account", {
        p_confirm_username: confirmUsername.trim(),
      });
      if (rpcError) {
        throw new Error(rpcError.message);
      }
      await onSignOut().catch(() => undefined);
      router.push("/");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível excluir sua conta.",
      );
      setDeletingAccount(false);
    }
  }

  const normalizedExpected = profile.username.toLowerCase();
  const normalizedTyped = confirmUsername.trim().replace(/^@+/, "").toLowerCase();
  const canConfirmDelete =
    normalizedExpected.length > 0 && normalizedTyped === normalizedExpected;

  return (
    <section
      aria-labelledby="codit-privacy-lgpd-title"
      className="codit-panel space-y-5 p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2
            id="codit-privacy-lgpd-title"
            className="text-base font-bold text-foreground sm:text-lg"
          >
            Privacidade, Moderação e Dados (LGPD)
          </h2>
          <p className="text-xs text-muted sm:text-sm">
            Controle seus termos, exporte todos os seus dados em JSON ou exclua
            definitivamente sua conta.
          </p>
        </div>
        <Link
          href="/privacidade"
          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface-muted px-3.5 py-1.5 text-xs font-semibold text-foreground hover:border-accent"
        >
          Ler Política de Privacidade
        </Link>
      </div>

      {!profile.terms_accepted_at ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/45 bg-amber-500/10 p-4 text-xs text-foreground"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold">
              Confirme o aceite da Política de Privacidade (v.
              {CURRENT_PRIVACY_VERSION})
            </p>
            <p className="text-muted">
              Registre seu consentimento de primeiro acesso conforme a LGPD.
            </p>
          </div>
          <button
            type="button"
            disabled={acceptingTerms || !isOnline}
            onClick={() => void handleAcceptTerms()}
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-xl bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {acceptingTerms ? "Registrando..." : "Aceitar termos"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted">
          Termos aceitos em{" "}
          <strong className="text-foreground">
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
            }).format(Date.parse(profile.terms_accepted_at))}
          </strong>{" "}
          · Versão{" "}
          <code className="font-mono text-foreground">
            {profile.privacy_version ?? CURRENT_PRIVACY_VERSION}
          </code>
        </p>
      )}

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
        >
          {error}
        </p>
      ) : null}

      {feedback ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
        >
          {feedback}
        </p>
      ) : null}

      {blockedUsers.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="text-xs font-bold text-foreground">
            Usuários bloqueados ({blockedUsers.length})
          </h3>
          <ul className="space-y-2">
            {blockedUsers.map(({ block, profile: blockedProfile }) => (
              <li
                key={block.blocked_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted/40 px-3.5 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">
                    {blockedProfile?.full_name ?? "Usuário"}
                  </p>
                  {blockedProfile?.username ? (
                    <p className="font-mono text-[11px] text-muted">
                      @{blockedProfile.username}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={unblockingId === block.blocked_id || !isOnline}
                  onClick={() => void handleUnblock(block.blocked_id)}
                  className="shrink-0 rounded-lg border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground hover:border-accent disabled:opacity-60"
                >
                  {unblockingId === block.blocked_id
                    ? "Desbloqueando..."
                    : "Desbloquear"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          type="button"
          disabled={exporting || !isOnline}
          onClick={() => void handleExportData()}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface-muted px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent disabled:opacity-60"
        >
          {exporting ? "Gerando JSON..." : "Exportar meus dados (JSON)"}
        </button>

        <button
          type="button"
          disabled={!isOnline}
          onClick={() => {
            setConfirmUsername("");
            setError(null);
            setDeleteModalOpen(true);
          }}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-60"
        >
          Excluir minha conta definitivamente
        </button>
      </div>

      {deleteModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="codit-delete-account-title"
          className="codit-safe-modal fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs"
        >
          <div
            aria-hidden="true"
            onClick={() => {
              if (!deletingAccount) {
                setDeleteModalOpen(false);
              }
            }}
            className="fixed inset-0"
          />
          <div
            ref={deleteDialogRef}
            className="relative z-10 w-full max-w-md space-y-4 rounded-3xl border border-red-500/40 bg-surface-elevated p-5 shadow-2xl"
          >
            <div className="space-y-1">
              <h3
                id="codit-delete-account-title"
                className="text-base font-bold text-foreground"
              >
                Excluir conta permanentemente
              </h3>
              <p className="text-xs leading-relaxed text-muted">
                Esta ação é irreversível. Seu perfil, perfil público, projetos
                do Sandbox, progresso nas trilhas, mensagens e dispositivos de
                push serão removidos definitivamente.
              </p>
            </div>

            <form
              onSubmit={(event) => void handleDeleteAccount(event)}
              className="space-y-3"
            >
              <div className="space-y-1.5">
                <label
                  htmlFor="codit-confirm-delete-username"
                  className="block text-xs font-semibold text-foreground"
                >
                  Digite{" "}
                  <code className="font-mono text-red-500">
                    @{profile.username}
                  </code>{" "}
                  para confirmar
                </label>
                <input
                  id="codit-confirm-delete-username"
                  type="text"
                  value={confirmUsername}
                  onChange={(event) => setConfirmUsername(event.target.value)}
                  placeholder={`@${profile.username}`}
                  className="min-h-10 w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={deletingAccount}
                  onClick={() => setDeleteModalOpen(false)}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface-muted px-4 py-2 text-xs font-semibold text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={deletingAccount || !canConfirmDelete}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {deletingAccount ? "Excluindo..." : "Confirmar exclusão"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
