"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  buildSafeHtmlPreviewDoc,
  formatDatePtBr,
  SANDBOX_LANGUAGE_LABELS,
  SANDBOX_VISIBILITY_LABELS,
} from "@/components/social/social-labels";
import { UserAvatar } from "@/components/social/user-avatar";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { SandboxProjectRow } from "@/lib/supabase/database.types";
import {
  cloneProjectToMySandbox,
  createProjectComment,
  deleteProjectComment,
  listProjectComments,
  SocialServiceError,
  toggleProjectLike,
  type CommunityProjectCard,
  type ProjectCommentWithAuthor,
} from "@/modules/social/social-service";

export interface ProjectViewerModalProps {
  item: CommunityProjectCard;
  viewerId: string | null;
  isOnline: boolean;
  onClose: () => void;
  onProjectMetaChange?: (
    projectId: string,
    patch: Partial<
      Pick<
        CommunityProjectCard,
        "likesCount" | "commentsCount" | "likedByViewer"
      >
    >,
  ) => void;
  onMigrationMissing?: () => void;
}

export function ProjectViewerModal({
  item,
  viewerId,
  isOnline,
  onClose,
  onProjectMetaChange,
  onMigrationMissing,
}: ProjectViewerModalProps) {
  const { project, author } = item;
  const canPreviewHtml = project.primary_language === "html_css_js";

  const [viewMode, setViewMode] = useState<"code" | "preview">("code");
  const [likesCount, setLikesCount] = useState(item.likesCount);
  const [likedByViewer, setLikedByViewer] = useState(item.likedByViewer);
  const [togglingLike, setTogglingLike] = useState(false);

  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [clonedProject, setClonedProject] = useState<SandboxProjectRow | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const [comments, setComments] = useState<ProjectCommentWithAuthor[]>([]);
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(
    null,
  );

  const loadingComments = loadedProjectId !== project.id;
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useDialogA11y({
    open: true,
    containerRef: dialogRef,
    onClose,
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchComments() {
      const client = getSupabaseClient();
      if (!client) {
        if (!cancelled) {
          setCommentsError("Cliente Supabase não configurado.");
          setLoadedProjectId(project.id);
        }
        return;
      }

      try {
        const list = await listProjectComments(project.id, client);
        if (!cancelled) {
          setComments(list);
          setCommentsError(null);
          setLoadedProjectId(project.id);
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof SocialServiceError && error.isMigrationMissing) {
            onMigrationMissing?.();
          }
          setCommentsError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os comentários.",
          );
          setLoadedProjectId(project.id);
        }
      }
    }

    void fetchComments();

    return () => {
      cancelled = true;
    };
  }, [onMigrationMissing, project.id]);

  async function handleToggleLike() {
    setActionError(null);
    if (!viewerId) {
      setActionError("Entre na sua conta para curtir projetos da comunidade.");
      return;
    }
    if (!isOnline) {
      setActionError("Conecte-se à internet para curtir este projeto.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setActionError("Cliente Supabase não configurado.");
      return;
    }

    setTogglingLike(true);
    try {
      const result = await toggleProjectLike(
        viewerId,
        project.id,
        likedByViewer,
        client,
      );
      const nextCount = Math.max(
        0,
        likesCount + (result.liked === likedByViewer ? 0 : result.liked ? 1 : -1),
      );
      setLikedByViewer(result.liked);
      setLikesCount(nextCount);
      onProjectMetaChange?.(project.id, {
        likedByViewer: result.liked,
        likesCount: nextCount,
      });
    } catch (error) {
      if (error instanceof SocialServiceError && error.isMigrationMissing) {
        onMigrationMissing?.();
      }
      setActionError(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar sua curtida.",
      );
    } finally {
      setTogglingLike(false);
    }
  }

  async function handleCopyCode() {
    setCopyFeedback(null);
    setActionError(null);
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        throw new Error("Clipboard indisponível");
      }
      await navigator.clipboard.writeText(project.source_code);
      setCopyFeedback("Código copiado!");
    } catch {
      setActionError(
        "Não foi possível copiar automaticamente. Selecione o código abaixo manualmente.",
      );
    }
  }

  async function handleCloneProject() {
    setActionError(null);
    setClonedProject(null);
    if (!viewerId) {
      setActionError("Entre na sua conta para clonar projetos para sua área.");
      return;
    }
    if (!isOnline) {
      setActionError("Conecte-se à internet para clonar este mini-projeto.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setActionError("Cliente Supabase não configurado.");
      return;
    }

    setCloning(true);
    try {
      const created = await cloneProjectToMySandbox(viewerId, project, client);
      setClonedProject(created);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Não foi possível clonar o mini-projeto.",
      );
    } finally {
      setCloning(false);
    }
  }

  async function handleSubmitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommentsError(null);

    if (!viewerId) {
      setCommentsError("Entre na sua conta para comentar neste projeto.");
      return;
    }
    if (!isOnline) {
      setCommentsError("Conecte-se à internet para enviar seu comentário.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setCommentsError("Cliente Supabase não configurado.");
      return;
    }

    setSubmittingComment(true);
    try {
      const created = await createProjectComment(
        viewerId,
        project.id,
        commentInput,
        client,
      );
      const nextComments = [...comments, created];
      setComments(nextComments);
      setCommentInput("");
      onProjectMetaChange?.(project.id, {
        commentsCount: nextComments.length,
      });
    } catch (error) {
      if (error instanceof SocialServiceError && error.isMigrationMissing) {
        onMigrationMissing?.();
      }
      setCommentsError(
        error instanceof Error
          ? error.message
          : "Não foi possível publicar o comentário.",
      );
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!isOnline) {
      setCommentsError("Conecte-se à internet para excluir o comentário.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setCommentsError("Cliente Supabase não configurado.");
      return;
    }

    setDeletingCommentId(commentId);
    setCommentsError(null);
    try {
      const removed = await deleteProjectComment(commentId, client);
      if (removed) {
        const nextComments = comments.filter(
          (entry) => entry.comment.id !== commentId,
        );
        setComments(nextComments);
        onProjectMetaChange?.(project.id, {
          commentsCount: nextComments.length,
        });
      }
    } catch (error) {
      setCommentsError(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o comentário.",
      );
    } finally {
      setDeletingCommentId(null);
    }
  }

  const authorProfileHref = author?.username
    ? `/comunidade/perfil?u=${encodeURIComponent(author.username)}`
    : `/comunidade/perfil?id=${encodeURIComponent(project.user_id)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="codit-project-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 px-0 pb-0 pt-[max(0.75rem,var(--codit-safe-top))] backdrop-blur-xs sm:items-center sm:p-4"
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0"
      />

      <div
        ref={dialogRef}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface-elevated shadow-xl sm:rounded-2xl"
      >
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden"
        />
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-strong">
                {SANDBOX_LANGUAGE_LABELS[project.primary_language]}
              </span>
              <span className="rounded-md border border-border bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted">
                {SANDBOX_VISIBILITY_LABELS[project.visibility]}
              </span>
              <span className="text-[11px] text-muted">
                Atualizado em {formatDatePtBr(project.updated_at)}
              </span>
            </div>

            <h2
              id="codit-project-modal-title"
              className="text-lg font-bold text-foreground sm:text-xl"
            >
              {project.title}
            </h2>

            <Link
              href={authorProfileHref}
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-xl py-1 text-xs text-muted transition-colors hover:text-foreground"
            >
              <UserAvatar
                name={author?.full_name ?? "Estudante Codit"}
                username={author?.username}
                avatarUrl={author?.avatar_url}
                size="sm"
              />
              <span>
                <strong className="font-semibold text-foreground">
                  {author?.full_name ?? "Estudante Codit"}
                </strong>
                {author?.username ? (
                  <span className="ml-1.5 font-mono text-accent-strong">
                    @{author.username}
                  </span>
                ) : null}
              </span>
            </Link>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar visualização do projeto"
            className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-muted px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent"
          >
            Fechar
          </button>
        </div>

        {/* Corpo rolável */}
        <div className="flex-1 space-y-5 overflow-y-auto px-4 pt-4 pb-[calc(1rem+var(--codit-safe-bottom))] sm:px-5 sm:pt-5 sm:pb-[calc(1.25rem+var(--codit-safe-bottom))]">
          {project.description ? (
            <p className="text-sm leading-relaxed text-muted">
              {project.description}
            </p>
          ) : null}

          {/* Barra de ações */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleToggleLike()}
              disabled={togglingLike || !isOnline}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                likedByViewer
                  ? "border-accent bg-accent-soft text-accent-strong"
                  : "border-border bg-surface-muted text-foreground hover:border-accent"
              }`}
            >
              <span aria-hidden="true">{likedByViewer ? "♥" : "♡"}</span>
              <span>
                {likedByViewer ? "Curtido" : "Curtir"} ({likesCount})
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleCopyCode()}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface-muted px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent"
            >
              {copyFeedback ?? "Copiar código"}
            </button>

            {viewerId && viewerId !== project.user_id ? (
              <button
                type="button"
                onClick={() => void handleCloneProject()}
                disabled={cloning || !isOnline}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {cloning ? "Clonando..." : "Clonar para meus projetos"}
              </button>
            ) : null}
          </div>

          {actionError ? (
            <p
              role="alert"
              className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
            >
              {actionError}
            </p>
          ) : null}

          {clonedProject ? (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-foreground"
            >
              <span>
                Cópia privada{" "}
                <strong className="font-semibold">{clonedProject.title}</strong>{" "}
                salva nos seus mini-projetos!
              </span>
              <Link
                href="/projetos"
                onClick={onClose}
                className="font-semibold text-accent-strong underline"
              >
                Abrir em Meus Projetos
              </Link>
            </div>
          ) : null}

          {/* Código-fonte e Prévia isolada */}
          <div className="space-y-3">
            {canPreviewHtml ? (
              <div
                role="tablist"
                aria-label="Modo de visualização do projeto"
                className="inline-flex gap-1 rounded-xl border border-border bg-surface-muted p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "code"}
                  onClick={() => setViewMode("code")}
                  className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    viewMode === "code"
                      ? "bg-surface text-foreground shadow-xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  Código-fonte
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "preview"}
                  onClick={() => setViewMode("preview")}
                  className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    viewMode === "preview"
                      ? "bg-surface text-foreground shadow-xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  Prévia isolada
                </button>
              </div>
            ) : null}

            {canPreviewHtml && viewMode === "preview" ? (
              <div className="space-y-2">
                <iframe
                  title={`Prévia isolada de ${project.title}`}
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                  srcDoc={buildSafeHtmlPreviewDoc(project.source_code)}
                  className="h-80 w-full rounded-xl border border-border bg-white"
                />
                <p className="text-[11px] text-muted">
                  Prévia executada exclusivamente no seu navegador em{" "}
                  <code className="font-mono">iframe</code> sandboxed sem acesso
                  à sua sessão (<code className="font-mono">RN-201</code>).
                </p>
              </div>
            ) : (
              <pre className="max-h-80 overflow-auto rounded-xl border border-border bg-background p-4 font-mono text-xs leading-relaxed text-foreground">
                <code>{project.source_code || "// Sem código-fonte cadastrado."}</code>
              </pre>
            )}
          </div>

          {/* Comentários */}
          <section
            aria-labelledby="codit-project-comments-title"
            className="space-y-3 border-t border-border pt-4"
          >
            <h3
              id="codit-project-comments-title"
              className="text-sm font-bold text-foreground"
            >
              Comentários ({loadingComments ? "..." : comments.length})
            </h3>

            {commentsError ? (
              <p
                role="alert"
                className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
              >
                {commentsError}
              </p>
            ) : null}

            {viewerId ? (
              <form
                onSubmit={(event) => void handleSubmitComment(event)}
                className="space-y-2"
              >
                <label
                  htmlFor="codit-project-comment-input"
                  className="sr-only"
                >
                  Adicionar comentário
                </label>
                <textarea
                  id="codit-project-comment-input"
                  rows={2}
                  maxLength={500}
                  value={commentInput}
                  onChange={(event) => setCommentInput(event.target.value)}
                  placeholder="Deixe um feedback construtivo ou elogio sobre este código..."
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none sm:text-sm"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">
                    {commentInput.trim().length}/500 caracteres
                  </span>
                  <button
                    type="submit"
                    disabled={
                      submittingComment ||
                      !isOnline ||
                      commentInput.trim().length === 0
                    }
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submittingComment ? "Publicando..." : "Comentar"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="rounded-xl border border-border bg-surface-muted/60 px-3.5 py-2.5 text-xs text-muted">
                <Link
                  href="/auth"
                  onClick={onClose}
                  className="font-semibold text-accent-strong hover:underline"
                >
                  Entre na sua conta
                </Link>{" "}
                para curtir, comentar ou clonar este mini-projeto.
              </p>
            )}

            {loadingComments ? (
              <p className="py-3 text-xs text-muted">
                Carregando comentários...
              </p>
            ) : comments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-surface-muted/40 px-3.5 py-4 text-center text-xs text-muted">
                Ainda não há comentários neste projeto. Seja a primeira pessoa a
                comentar!
              </p>
            ) : (
              <ul className="space-y-2.5">
                {comments.map((entry) => {
                  const canDelete =
                    Boolean(viewerId) &&
                    (entry.comment.user_id === viewerId ||
                      project.user_id === viewerId);
                  const commenterHref = entry.author?.username
                    ? `/comunidade/perfil?u=${encodeURIComponent(entry.author.username)}`
                    : `/comunidade/perfil?id=${encodeURIComponent(entry.comment.user_id)}`;

                  return (
                    <li
                      key={entry.comment.id}
                      className="rounded-xl border border-border bg-surface-muted/50 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={commenterHref}
                          onClick={onClose}
                          className="flex items-center gap-2 text-xs"
                        >
                          <UserAvatar
                            name={entry.author?.full_name ?? "Estudante Codit"}
                            username={entry.author?.username}
                            avatarUrl={entry.author?.avatar_url}
                            size="sm"
                          />
                          <div>
                            <p className="font-semibold text-foreground hover:underline">
                              {entry.author?.full_name ?? "Estudante Codit"}
                            </p>
                            <p className="text-[11px] text-muted">
                              {entry.author?.username ? (
                                <span className="font-mono text-accent-strong">
                                  @{entry.author.username}
                                </span>
                              ) : null}{" "}
                              · {formatDatePtBr(entry.comment.created_at)}
                            </p>
                          </div>
                        </Link>

                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() =>
                              void handleDeleteComment(entry.comment.id)
                            }
                            disabled={deletingCommentId === entry.comment.id}
                            className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-500 transition-opacity hover:opacity-85 disabled:opacity-60"
                          >
                            {deletingCommentId === entry.comment.id
                              ? "Excluindo..."
                              : "Excluir"}
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground sm:text-sm">
                        {entry.comment.content}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
