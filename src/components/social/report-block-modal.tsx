"use client";

import { useRef, useState, type FormEvent } from "react";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { emitFriendshipsChanged } from "@/lib/social-events";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ModerationReportReason,
  ModerationTargetType,
} from "@/lib/supabase/database.types";
import {
  blockUser,
  submitModerationReport,
  unblockUser,
} from "@/modules/social/social-service";

export interface ReportBlockModalProps {
  isOpen: boolean;
  viewerId: string;
  targetType: ModerationTargetType;
  targetId: string;
  targetLabel: string;
  blockUserId?: string | undefined;
  isBlocked?: boolean | undefined;
  isOnline: boolean;
  onClose: () => void;
  onBlockedChange?: (blocked: boolean) => void;
}

const REASON_OPTIONS: ReadonlyArray<{
  value: ModerationReportReason;
  label: string;
}> = [
  { value: "spam", label: "Spam ou divulgação abusiva" },
  { value: "harassment", label: "Assédio, ofensa ou intimidação" },
  { value: "inappropriate_content", label: "Conteúdo impróprio ou malicioso" },
  { value: "impersonation", label: "Perfil falso ou falsidade ideológica" },
  { value: "copyright", label: "Violação de direitos autorais" },
  { value: "other", label: "Outro motivo" },
];

export function ReportBlockModal({
  isOpen,
  viewerId,
  targetType,
  targetId,
  targetLabel,
  blockUserId,
  isBlocked = false,
  isOnline,
  onClose,
  onBlockedChange,
}: ReportBlockModalProps) {
  const [reason, setReason] = useState<ModerationReportReason>("harassment");
  const [details, setDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [submittingBlock, setSubmittingBlock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [blockedState, setBlockedState] = useState(isBlocked);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useDialogA11y({ open: isOpen, containerRef: dialogRef, onClose });

  if (!isOpen) {
    return null;
  }

  const canBlock = Boolean(blockUserId && blockUserId !== viewerId);

  async function handleSubmitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFeedback(null);

    if (!isOnline) {
      setError("Conecte-se à internet para enviar a denúncia.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setError("Cliente Supabase não configurado.");
      return;
    }

    setSubmittingReport(true);
    try {
      await submitModerationReport(
        viewerId,
        {
          targetType,
          targetId,
          reason,
          details,
        },
        client,
      );
      setFeedback("Denúncia registrada. Nossa moderação irá analisar o caso.");
      setDetails("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível enviar a denúncia.",
      );
    } finally {
      setSubmittingReport(false);
    }
  }

  async function handleToggleBlock() {
    if (!blockUserId) {
      return;
    }
    setError(null);
    setFeedback(null);

    if (!isOnline) {
      setError("Conecte-se à internet para atualizar o bloqueio.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setError("Cliente Supabase não configurado.");
      return;
    }

    setSubmittingBlock(true);
    try {
      if (blockedState) {
        await unblockUser(viewerId, blockUserId, client);
        setBlockedState(false);
        onBlockedChange?.(false);
        setFeedback("Usuário desbloqueado.");
      } else {
        await blockUser(viewerId, blockUserId, details || undefined, client);
        setBlockedState(true);
        onBlockedChange?.(true);
        emitFriendshipsChanged();
        setFeedback(
          "Usuário bloqueado. Amizades, DMs e chamadas entre vocês foram encerradas.",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível atualizar o bloqueio.",
      );
    } finally {
      setSubmittingBlock(false);
    }
  }

  const targetTitle =
    targetType === "project"
      ? "Denunciar projeto"
      : targetType === "message"
        ? "Denunciar mensagem"
        : "Denunciar ou bloquear usuário";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="codit-report-block-title"
      className="codit-safe-modal fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs"
    >
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0" />

      <div
        ref={dialogRef}
        className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-border bg-surface-elevated shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="codit-report-block-title"
              className="text-base font-bold text-foreground"
            >
              {targetTitle}
            </h2>
            <p className="truncate text-xs text-muted">{targetLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-surface-muted px-3 text-xs font-semibold text-foreground hover:border-accent"
          >
            Fechar
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
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

          <form
            onSubmit={(event) => void handleSubmitReport(event)}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="codit-report-reason"
                className="block text-xs font-semibold text-foreground"
              >
                Motivo da denúncia
              </label>
              <select
                id="codit-report-reason"
                value={reason}
                onChange={(event) =>
                  setReason(event.target.value as ModerationReportReason)
                }
                className="min-h-10 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
              >
                {REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="codit-report-details"
                className="block text-xs font-semibold text-foreground"
              >
                Detalhes adicionais (opcional)
              </label>
              <textarea
                id="codit-report-details"
                rows={3}
                maxLength={1000}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Descreva brevemente o ocorrido..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submittingReport || !isOnline}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {submittingReport ? "Enviando denúncia..." : "Enviar denúncia"}
            </button>
          </form>

          {canBlock ? (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs font-semibold text-foreground">
                Bloqueio bilateral
              </p>
              <p className="text-xs leading-relaxed text-muted">
                Ao bloquear, a amizade é removida e vocês não poderão mais
                trocar mensagens diretas, iniciar chamadas ou interagir em
                projetos.
              </p>
              <button
                type="button"
                disabled={submittingBlock || !isOnline}
                onClick={() => void handleToggleBlock()}
                className={`inline-flex min-h-10 w-full items-center justify-center rounded-xl border px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                  blockedState
                    ? "border-border bg-surface-muted text-foreground hover:border-accent"
                    : "border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500/20"
                }`}
              >
                {submittingBlock
                  ? "Atualizando..."
                  : blockedState
                    ? "Desbloquear usuário"
                    : "Bloquear usuário"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
