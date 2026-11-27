"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { LanguageBadge, LanguageIcon } from "@/components/sandbox/language-icon";
import {
  mapSandboxLanguageToEditor,
  SandboxCodeEditor,
} from "@/components/sandbox/sandbox-code-editor";
import { SandboxPreview } from "@/components/sandbox/sandbox-preview";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { emitAppToast, emitProblemToast } from "@/lib/app-toast";
import { createProblemDetails } from "@/lib/problem-details";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  SandboxLanguage,
  SandboxProjectFilesJson,
  SandboxProjectRow,
  SandboxProjectVersionRow,
  SandboxVisibility,
} from "@/lib/supabase/database.types";
import {
  getLanguageMeta,
  isStarterCodeSample,
  LANGUAGE_CATALOG,
  ORDERED_SANDBOX_LANGUAGES,
} from "@/modules/sandbox/language-catalog";
import {
  formatCodeWithPrettier,
  type PrettierTargetLanguage,
} from "@/modules/sandbox/prettier-formatter";
import {
  compileProjectFilesToSource,
  getDefaultActiveTab,
  getStarterFilesForLanguage,
  isMultiFileWebLanguage,
  resolveProjectFiles,
  SANDBOX_FILE_TABS,
  type SandboxFileKey,
  type SandboxProjectFiles,
} from "@/modules/sandbox/sandbox-files";
import {
  buildSandboxProblemDetails,
  listSandboxProjectVersions,
  SandboxProjectConflictError,
} from "@/modules/sandbox/sandbox-project-service";

export interface ProjectStudioSubmitPayload {
  title: string;
  description: string;
  primaryLanguage: SandboxLanguage;
  visibility: SandboxVisibility;
  sourceCode: string;
  files?: SandboxProjectFilesJson | null;
  isPinned: boolean;
  tags: string[];
  repositoryUrl: string;
  liveUrl: string;
}

type AutoSaveStatus = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

interface ProjectStudioModalProps {
  userId?: string | null;
  editingProject: SandboxProjectRow | null;
  initialLanguage?: SandboxLanguage;
  isSaving: boolean;
  isOnline: boolean;
  error: string | null;
  message: string | null;
  onClose: () => void;
  onSubmit: (payload: ProjectStudioSubmitPayload) => Promise<void>;
  onAutoSave?: (
    payload: ProjectStudioSubmitPayload,
    summary?: string,
  ) => Promise<SandboxProjectRow>;
  onReloadProject?: () => Promise<SandboxProjectRow | null>;
}

const VISIBILITY_OPTIONS: ReadonlyArray<{
  id: SandboxVisibility;
  label: string;
  hint: string;
}> = [
  { id: "private", label: "Privado", hint: "Visível apenas para você" },
  {
    id: "friends",
    label: "Somente amigos",
    hint: "Visível na Comunidade apenas para amigos aceitos",
  },
  { id: "unlisted", label: "Não listado", hint: "Acesso apenas por link" },
  {
    id: "public_portfolio",
    label: "Portfólio público",
    hint: "Destaque no seu portfólio e na Comunidade",
  },
];

const AUTO_SAVE_DEBOUNCE_MS = 1500;

function formatVersionTimestamp(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

export function ProjectStudioModal({
  userId = null,
  editingProject,
  initialLanguage = "html_css_js",
  isSaving,
  isOnline,
  error,
  message,
  onClose,
  onSubmit,
  onAutoSave,
  onReloadProject,
}: ProjectStudioModalProps) {
  const startingLanguage = editingProject?.primary_language ?? initialLanguage;
  const startingCode =
    editingProject?.source_code ?? LANGUAGE_CATALOG[startingLanguage].starterCode;
  const startingFiles = useMemo(
    () =>
      isMultiFileWebLanguage(startingLanguage)
        ? resolveProjectFiles(
            startingLanguage,
            startingCode,
            editingProject?.files ?? null,
          )
        : getStarterFilesForLanguage("html_css_js"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [title, setTitle] = useState(editingProject?.title ?? "");
  const [description, setDescription] = useState(
    editingProject?.description ?? "",
  );
  const [language, setLanguage] = useState<SandboxLanguage>(startingLanguage);
  const [visibility, setVisibility] = useState<SandboxVisibility>(
    editingProject?.visibility ?? "private",
  );
  const [sourceCode, setSourceCode] = useState(startingCode);
  const [files, setFiles] = useState<SandboxProjectFiles>(startingFiles);
  const [activeTab, setActiveTab] = useState<SandboxFileKey>(
    getDefaultActiveTab(startingLanguage),
  );
  const [isPinned, setIsPinned] = useState(editingProject?.is_pinned ?? false);
  const [tags, setTags] = useState<string[]>(editingProject?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState(
    editingProject?.repository_url ?? "",
  );
  const [liveUrl, setLiveUrl] = useState(editingProject?.live_url ?? "");
  const [mobilePane, setMobilePane] = useState<"editor" | "preview">("editor");
  const [confirmTemplateSwap, setConfirmTemplateSwap] = useState(false);
  const [showOptionalDetails, setShowOptionalDetails] = useState(
    Boolean(
      editingProject?.description ||
        (editingProject?.tags && editingProject.tags.length > 0) ||
        editingProject?.repository_url ||
        editingProject?.live_url,
    ),
  );
  const [runTrigger, setRunTrigger] = useState(0);
  const [isFormatting, setIsFormatting] = useState(false);

  // Auto-save & Histórico de versões
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>(
    editingProject ? "saved" : "idle",
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<SandboxProjectVersionRow[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(
    null,
  );

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const isMultiFile = isMultiFileWebLanguage(language);
  const meta = getLanguageMeta(language);

  const effectiveSourceCode = useMemo(() => {
    if (isMultiFile) {
      return compileProjectFilesToSource(language, files);
    }
    return sourceCode;
  }, [files, isMultiFile, language, sourceCode]);

  const currentPayload = useMemo<ProjectStudioSubmitPayload>(
    () => ({
      title,
      description,
      primaryLanguage: language,
      visibility,
      sourceCode: effectiveSourceCode,
      files: isMultiFile ? files : null,
      isPinned,
      tags,
      repositoryUrl,
      liveUrl,
    }),
    [
      description,
      effectiveSourceCode,
      files,
      isMultiFile,
      isPinned,
      language,
      liveUrl,
      repositoryUrl,
      tags,
      title,
      visibility,
    ],
  );

  const payloadSignature = useMemo(
    () => JSON.stringify(currentPayload),
    [currentPayload],
  );
  const lastSavedSignatureRef = useRef<string>(payloadSignature);
  const autoSaveInFlightRef = useRef(false);

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

  // Auto-save com debounce de 1.5s para projetos já persistidos
  useEffect(() => {
    if (!editingProject || !onAutoSave || !isOnline || isSaving) {
      return;
    }
    if (!title.trim()) {
      return;
    }
    if (autoSaveStatus === "conflict") {
      return;
    }
    if (payloadSignature === lastSavedSignatureRef.current) {
      return;
    }

    setAutoSaveStatus("dirty");

    const timer = window.setTimeout(() => {
      if (autoSaveInFlightRef.current) {
        return;
      }
      autoSaveInFlightRef.current = true;
      setAutoSaveStatus("saving");
      const snapshotSignature = payloadSignature;

      void onAutoSave(currentPayload, "Auto-save")
        .then(() => {
          lastSavedSignatureRef.current = snapshotSignature;
          setAutoSaveStatus("saved");
        })
        .catch((err: unknown) => {
          const problem = buildSandboxProblemDetails(
            err,
            "Falha no auto-save do projeto",
          );
          emitProblemToast(problem);
          if (err instanceof SandboxProjectConflictError) {
            setAutoSaveStatus("conflict");
          } else {
            setAutoSaveStatus("error");
          }
        })
        .finally(() => {
          autoSaveInFlightRef.current = false;
        });
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    autoSaveStatus,
    currentPayload,
    editingProject,
    isOnline,
    isSaving,
    onAutoSave,
    payloadSignature,
    title,
  ]);

  const loadVersionHistory = useCallback(async () => {
    if (!editingProject || !userId) {
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      return;
    }
    setLoadingVersions(true);
    try {
      const items = await listSandboxProjectVersions(
        userId,
        editingProject.id,
        20,
        client,
      );
      setVersions(items);
    } catch (err) {
      emitProblemToast(
        buildSandboxProblemDetails(
          err,
          "Não foi possível carregar o histórico de versões",
        ),
      );
    } finally {
      setLoadingVersions(false);
    }
  }, [editingProject, userId]);

  function handleToggleHistory() {
    setHistoryOpen((current) => {
      const next = !current;
      if (next) {
        void loadVersionHistory();
      }
      return next;
    });
  }

  function handleSelectLanguage(nextLanguage: SandboxLanguage) {
    setLanguage(nextLanguage);
    setConfirmTemplateSwap(false);

    if (isMultiFileWebLanguage(nextLanguage)) {
      setActiveTab(getDefaultActiveTab(nextLanguage));
      if (!editingProject && isStarterCodeSample(effectiveSourceCode)) {
        const nextFiles = getStarterFilesForLanguage(nextLanguage);
        setFiles(nextFiles);
        setSourceCode(compileProjectFilesToSource(nextLanguage, nextFiles));
      } else if (!isMultiFile) {
        setFiles(resolveProjectFiles(nextLanguage, sourceCode, null));
      }
    } else if (!editingProject && isStarterCodeSample(effectiveSourceCode)) {
      setSourceCode(LANGUAGE_CATALOG[nextLanguage].starterCode);
    }
  }

  function applyLanguageTemplate() {
    if (isMultiFile) {
      const starterFiles = getStarterFilesForLanguage(language);
      setFiles(starterFiles);
      setSourceCode(compileProjectFilesToSource(language, starterFiles));
      setActiveTab(getDefaultActiveTab(language));
    } else {
      setSourceCode(meta.starterCode);
    }
    setConfirmTemplateSwap(false);
    setRunTrigger((current) => current + 1);
  }

  function handleRequestTemplate() {
    if (isStarterCodeSample(effectiveSourceCode)) {
      applyLanguageTemplate();
      return;
    }
    setConfirmTemplateSwap(true);
  }

  function updateFileContent(tabKey: SandboxFileKey, nextContent: string) {
    setFiles((current) => {
      if (current[tabKey] === nextContent) {
        return current;
      }
      return {
        ...current,
        [tabKey]: nextContent,
      };
    });
  }

  const handleRunPreviewNow = useCallback(() => {
    setRunTrigger((current) => current + 1);
  }, []);

  const canFormatCurrentEditor = useMemo(() => {
    if (isMultiFile) {
      return true;
    }
    return (
      language === "javascript" ||
      language === "nodejs" ||
      language === "html" ||
      language === "css" ||
      language === "html_css_js"
    );
  }, [isMultiFile, language]);

  const handleFormatCurrentCode = useCallback(async () => {
    if (!canFormatCurrentEditor || isFormatting) {
      return;
    }

    let targetLang: PrettierTargetLanguage = "javascript";
    let rawCode = sourceCode;

    if (isMultiFile) {
      const tabMeta = SANDBOX_FILE_TABS.find((t) => t.key === activeTab);
      targetLang = tabMeta?.editorLanguage ?? "html";
      rawCode = files[activeTab];
    } else if (language === "html" || language === "html_css_js") {
      targetLang = "html";
    } else if (language === "css") {
      targetLang = "css";
    }

    setIsFormatting(true);
    try {
      const formatted = await formatCodeWithPrettier(rawCode, targetLang);
      if (isMultiFile) {
        updateFileContent(activeTab, formatted);
      } else {
        setSourceCode(formatted);
      }
      emitAppToast({
        tone: "success",
        title: "Código formatado",
        detail: isMultiFile
          ? `${activeTab} formatado com Prettier.`
          : `${meta.fileName} formatado com Prettier.`,
        durationMs: 2500,
      });
    } catch (err) {
      emitProblemToast(
        createProblemDetails({
          type: "https://codit.app/problems/sandbox-format-error",
          title: "Erro ao formatar com Prettier",
          status: 422,
          detail:
            err instanceof Error
              ? err.message
              : "Verifique a sintaxe do código antes de formatar.",
        }),
      );
    } finally {
      setIsFormatting(false);
    }
  }, [
    activeTab,
    canFormatCurrentEditor,
    files,
    isFormatting,
    isMultiFile,
    language,
    meta.fileName,
    sourceCode,
  ]);

  async function handleRestoreVersion(snapshot: SandboxProjectVersionRow) {
    if (!editingProject) {
      return;
    }
    setRestoringVersionId(snapshot.id);
    try {
      const nextLang = snapshot.primary_language;
      const nextIsMultiFile = isMultiFileWebLanguage(nextLang);
      const restoredFiles = nextIsMultiFile
        ? resolveProjectFiles(nextLang, snapshot.source_code, snapshot.files)
        : files;
      const restoredSource = nextIsMultiFile
        ? compileProjectFilesToSource(nextLang, restoredFiles)
        : snapshot.source_code;

      setLanguage(nextLang);
      setTitle(snapshot.title);
      if (nextIsMultiFile) {
        setFiles(restoredFiles);
        setActiveTab(getDefaultActiveTab(nextLang));
      }
      setSourceCode(restoredSource);
      setRunTrigger((current) => current + 1);

      if (onAutoSave && isOnline) {
        const restoredPayload: ProjectStudioSubmitPayload = {
          ...currentPayload,
          title: snapshot.title,
          primaryLanguage: nextLang,
          sourceCode: restoredSource,
          files: nextIsMultiFile ? restoredFiles : null,
        };
        setAutoSaveStatus("saving");
        await onAutoSave(restoredPayload, `Restaurado da v${snapshot.version}`);
        lastSavedSignatureRef.current = JSON.stringify(restoredPayload);
        setAutoSaveStatus("saved");
        await loadVersionHistory();
      }

      emitAppToast({
        tone: "success",
        title: `Versão v${snapshot.version} restaurada`,
        detail: "O código anterior foi restaurado e salvo como nova versão.",
      });
      setHistoryOpen(false);
    } catch (err) {
      const problem = buildSandboxProblemDetails(
        err,
        "Não foi possível restaurar a versão",
      );
      emitProblemToast(problem);
      if (err instanceof SandboxProjectConflictError) {
        setAutoSaveStatus("conflict");
      }
    } finally {
      setRestoringVersionId(null);
    }
  }

  async function handleResolveConflictReload() {
    if (!onReloadProject) {
      return;
    }
    const fresh = await onReloadProject();
    if (!fresh) {
      return;
    }
    const nextIsMulti = isMultiFileWebLanguage(fresh.primary_language);
    const nextFiles = nextIsMulti
      ? resolveProjectFiles(fresh.primary_language, fresh.source_code, fresh.files ?? null)
      : files;
    const nextSource = nextIsMulti
      ? compileProjectFilesToSource(fresh.primary_language, nextFiles)
      : fresh.source_code;

    setTitle(fresh.title);
    setDescription(fresh.description ?? "");
    setLanguage(fresh.primary_language);
    setVisibility(fresh.visibility);
    setIsPinned(fresh.is_pinned);
    setTags(fresh.tags);
    setRepositoryUrl(fresh.repository_url ?? "");
    setLiveUrl(fresh.live_url ?? "");
    if (nextIsMulti) {
      setFiles(nextFiles);
    }
    setSourceCode(nextSource);

    const reloadedPayload: ProjectStudioSubmitPayload = {
      title: fresh.title,
      description: fresh.description ?? "",
      primaryLanguage: fresh.primary_language,
      visibility: fresh.visibility,
      sourceCode: nextSource,
      files: nextIsMulti ? nextFiles : null,
      isPinned: fresh.is_pinned,
      tags: fresh.tags,
      repositoryUrl: fresh.repository_url ?? "",
      liveUrl: fresh.live_url ?? "",
    };
    lastSavedSignatureRef.current = JSON.stringify(reloadedPayload);
    setAutoSaveStatus("saved");
    setRunTrigger((current) => current + 1);
    emitAppToast({
      tone: "info",
      title: `Projeto recarregado (v${fresh.version})`,
      detail: "A versão mais recente do servidor foi carregada no estúdio.",
    });
  }

  function addTag(rawTag: string) {
    const cleaned = rawTag.replace(/^#+/, "").trim();
    if (!cleaned || cleaned.length > 24 || tags.length >= 6) {
      return;
    }
    const duplicate = tags.some(
      (item) => item.toLowerCase() === cleaned.toLowerCase(),
    );
    if (duplicate) {
      setTagInput("");
      return;
    }
    setTags((current) => [...current, cleaned]);
    setTagInput("");
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagInput);
    }
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const snapshotSig = payloadSignature;
    await onSubmit(currentPayload);
    lastSavedSignatureRef.current = snapshotSig;
    if (editingProject) {
      setAutoSaveStatus("saved");
    }
  }

  const activeCodeForStats = isMultiFile ? files[activeTab] : sourceCode;
  const lineCount = activeCodeForStats
    ? activeCodeForStats.split(/\r?\n/).length
    : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-0 backdrop-blur-xs sm:p-4"
    >
      <div
        ref={dialogRef}
        className="relative flex h-dvh w-full max-w-6xl flex-col overflow-hidden rounded-none border-0 bg-surface-elevated shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl sm:border sm:border-border"
      >
        {/* Cabeçalho do Estúdio */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-muted/60 pb-3 pt-[calc(0.75rem+var(--codit-safe-top))] pl-[calc(1rem+var(--codit-safe-left))] pr-[calc(1rem+var(--codit-safe-right))] sm:pt-3 sm:pl-[calc(1.5rem+var(--codit-safe-left))] sm:pr-[calc(1.5rem+var(--codit-safe-right))]">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <LanguageIcon language={language} size={28} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="studio-modal-title"
                  className="truncate text-base font-bold text-foreground sm:text-lg"
                >
                  {editingProject
                    ? `Estúdio: ${editingProject.title}`
                    : "Novo Mini-Projeto Codit"}
                </h2>
                {editingProject ? (
                  <span
                    role="status"
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                      autoSaveStatus === "conflict"
                        ? "border-red-500/50 bg-red-500/15 text-red-600 dark:text-red-300"
                        : autoSaveStatus === "saving"
                          ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : autoSaveStatus === "error"
                            ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300"
                            : autoSaveStatus === "dirty"
                              ? "border-border bg-surface text-muted"
                              : "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    }`}
                  >
                    {autoSaveStatus === "saving"
                      ? "Salvando..."
                      : autoSaveStatus === "conflict"
                        ? "Conflito"
                        : autoSaveStatus === "error"
                          ? "Erro ao salvar"
                          : autoSaveStatus === "dirty"
                            ? "Alterações pendentes"
                            : "Salvo"}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-xs text-muted">
                {editingProject
                  ? `Editando versão v${editingProject.version} · Ctrl+Enter executa · Shift+Alt+F formata`
                  : "Escolha uma linguagem, escreva seu código e teste no Sandbox (Ctrl+Enter)"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {editingProject && autoSaveStatus === "conflict" && onReloadProject ? (
              <button
                type="button"
                onClick={() => void handleResolveConflictReload()}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-500/50 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/25 dark:text-red-300"
              >
                Recarregar v+
              </button>
            ) : null}

            {editingProject && userId ? (
              <button
                type="button"
                onClick={handleToggleHistory}
                aria-expanded={historyOpen}
                className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  historyOpen
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-foreground hover:border-accent"
                }`}
              >
                Histórico
              </button>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent"
            >
              Fechar
            </button>
          </div>
        </header>

        {/* Drawer de Histórico de Versões */}
        {historyOpen && editingProject ? (
          <aside
            aria-label="Histórico de versões do projeto"
            className="border-b border-border bg-surface-muted/75 px-4 py-3 sm:px-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-foreground">
                  Histórico de versões (snapshots recentes)
                </h3>
                <p className="text-[11px] text-muted">
                  Restaure uma versão anterior sem perder o histórico atual.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadVersionHistory()}
                  disabled={loadingVersions}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground hover:border-accent disabled:opacity-60"
                >
                  {loadingVersions ? "Atualizando..." : "Atualizar"}
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted hover:text-foreground"
                >
                  Ocultar
                </button>
              </div>
            </div>

            <div className="mt-2.5 max-h-44 overflow-y-auto">
              {loadingVersions ? (
                <p className="py-3 text-xs text-muted">
                  Carregando snapshots salvos...
                </p>
              ) : versions.length === 0 ? (
                <p className="py-3 text-xs text-muted">
                  Nenhum snapshot anterior registrado ainda. Cada salvamento ou
                  auto-save grava uma versão aqui.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                  {versions.map((snapshot) => {
                    const isCurrent = snapshot.version === editingProject.version;
                    return (
                      <li
                        key={snapshot.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-foreground">
                              v{snapshot.version}
                            </span>
                            {isCurrent ? (
                              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                                Atual
                              </span>
                            ) : null}
                            <span className="text-[11px] text-muted">
                              {formatVersionTimestamp(snapshot.created_at)}
                            </span>
                          </div>
                          <p className="truncate text-[11px] text-muted">
                            {snapshot.summary || snapshot.title} ·{" "}
                            {snapshot.source_code.length.toLocaleString("pt-BR")}{" "}
                            caracteres
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={
                            isCurrent ||
                            restoringVersionId === snapshot.id ||
                            isSaving
                          }
                          onClick={() => void handleRestoreVersion(snapshot)}
                          className="rounded-lg border border-border bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {restoringVersionId === snapshot.id
                            ? "Restaurando..."
                            : "Restaurar"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        ) : null}

        <form
          onSubmit={(event) => void handleFormSubmit(event)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="space-y-5">
              {/* Seletor visual de linguagens com ícones */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-foreground">
                    Linguagem / Stack do projeto
                  </label>
                  <LanguageBadge language={language} size="xs" showFileName />
                </div>

                <div className="codit-no-scrollbar flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:overflow-visible lg:grid-cols-8">
                  {ORDERED_SANDBOX_LANGUAGES.map((langId) => {
                    const item = LANGUAGE_CATALOG[langId];
                    const selected = language === langId;
                    return (
                      <button
                        key={langId}
                        type="button"
                        onClick={() => handleSelectLanguage(langId)}
                        className={`flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all ${
                          selected
                            ? "border-accent bg-accent-soft/50 text-foreground ring-2 ring-accent/30"
                            : "border-border bg-surface-muted/40 text-muted hover:border-accent/60 hover:text-foreground"
                        }`}
                      >
                        <LanguageIcon language={langId} size={18} />
                        <span className="truncate text-[11px] font-semibold">
                          {item.shortLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Metadados essenciais + Visibilidade */}
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="codit-studio-title"
                    className="block text-xs font-semibold text-foreground"
                  >
                    Título do projeto
                  </label>
                  <input
                    id="codit-studio-title"
                    type="text"
                    required
                    maxLength={120}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Ex.: Calculadora de IMC ou API REST em Python"
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-base text-foreground focus:border-accent focus:outline-none sm:text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs font-semibold text-foreground">
                    Visibilidade e destaque
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {VISIBILITY_OPTIONS.map((option) => {
                      const selected = visibility === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          title={option.hint}
                          onClick={() => setVisibility(option.id)}
                          className={`min-h-9 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            selected
                              ? "border-accent bg-accent text-accent-foreground"
                              : "border-border bg-surface-muted/50 text-foreground hover:border-accent/60"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => setIsPinned((current) => !current)}
                      aria-pressed={isPinned}
                      className={`min-h-9 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        isPinned
                          ? "border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-300"
                          : "border-border bg-surface-muted/50 text-muted hover:border-accent/60 hover:text-foreground"
                      }`}
                    >
                      {isPinned ? "★ Fixado" : "☆ Fixar"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Detalhes opcionais recolhíveis para priorizar código + preview */}
              <div className="rounded-2xl border border-border bg-surface-muted/35">
                <button
                  type="button"
                  onClick={() => setShowOptionalDetails((current) => !current)}
                  aria-expanded={showOptionalDetails}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-xs font-semibold text-foreground"
                >
                  <span>
                    Detalhes e links opcionais (descrição, tags, GitHub e demo)
                  </span>
                  <span className="text-muted">
                    {showOptionalDetails ? "Ocultar" : "Expandir"}
                  </span>
                </button>

                {showOptionalDetails ? (
                  <div className="space-y-3.5 border-t border-border p-4">
                    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="codit-studio-description"
                          className="block text-xs font-semibold text-foreground"
                        >
                          Descrição curta (opcional)
                        </label>
                        <input
                          id="codit-studio-description"
                          type="text"
                          maxLength={500}
                          value={description}
                          onChange={(event) =>
                            setDescription(event.target.value)
                          }
                          placeholder="O que este projeto faz e o que você praticou?"
                          className="min-h-10 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-base text-foreground focus:border-accent focus:outline-none sm:text-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="codit-studio-tag-input"
                          className="block text-xs font-semibold text-foreground"
                        >
                          Tags ({tags.length}/6)
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="codit-studio-tag-input"
                            type="text"
                            maxLength={24}
                            value={tagInput}
                            onChange={(event) =>
                              setTagInput(event.target.value)
                            }
                            onKeyDown={handleTagKeyDown}
                            placeholder="ex.: frontend, algoritmo"
                            className="min-h-10 flex-1 rounded-xl border border-border bg-background px-3 py-1.5 text-base text-foreground focus:border-accent focus:outline-none sm:text-xs"
                          />
                          <button
                            type="button"
                            disabled={!tagInput.trim() || tags.length >= 6}
                            onClick={() => addTag(tagInput)}
                            className="min-h-10 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent disabled:opacity-50"
                          >
                            + Tag
                          </button>
                        </div>
                        {tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground"
                              >
                                <span>#{tag}</span>
                                <button
                                  type="button"
                                  aria-label={`Remover tag ${tag}`}
                                  onClick={() =>
                                    setTags((current) =>
                                      current.filter((item) => item !== tag),
                                    )
                                  }
                                  className="text-muted hover:text-foreground"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="codit-studio-repo"
                          className="block text-xs font-semibold text-foreground"
                        >
                          Link do repositório GitHub (opcional)
                        </label>
                        <input
                          id="codit-studio-repo"
                          type="url"
                          maxLength={300}
                          value={repositoryUrl}
                          onChange={(event) =>
                            setRepositoryUrl(event.target.value)
                          }
                          placeholder="https://github.com/usuario/projeto"
                          className="min-h-10 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-base text-foreground focus:border-accent focus:outline-none sm:text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label
                          htmlFor="codit-studio-live"
                          className="block text-xs font-semibold text-foreground"
                        >
                          Link da demo / deploy (opcional)
                        </label>
                        <input
                          id="codit-studio-live"
                          type="url"
                          maxLength={300}
                          value={liveUrl}
                          onChange={(event) => setLiveUrl(event.target.value)}
                          placeholder="https://meu-projeto.vercel.app"
                          className="min-h-10 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-base text-foreground focus:border-accent focus:outline-none sm:text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Alternador mobile Editor / Preview */}
              <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-surface-muted p-1 lg:hidden">
                <button
                  type="button"
                  onClick={() => setMobilePane("editor")}
                  className={`min-h-9 rounded-lg text-xs font-semibold ${
                    mobilePane === "editor"
                      ? "bg-surface text-foreground shadow-xs"
                      : "text-muted"
                  }`}
                >
                  Editor ({isMultiFile ? activeTab : meta.fileName})
                </button>
                <button
                  type="button"
                  onClick={() => setMobilePane("preview")}
                  className={`min-h-9 rounded-lg text-xs font-semibold ${
                    mobilePane === "preview"
                      ? "bg-surface text-foreground shadow-xs"
                      : "text-muted"
                  }`}
                >
                  {meta.supportsLivePreview ? "Executar Preview" : "Visualizar"}
                </button>
              </div>

              {/* Editor CodeMirror 6 + Sandbox Preview lado a lado */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div
                  className={`flex min-h-[340px] flex-col overflow-hidden rounded-2xl border border-border bg-surface-solid sm:min-h-[400px] ${
                    mobilePane === "editor" ? "flex" : "hidden lg:flex"
                  }`}
                >
                  {/* Barra de abas multi-arquivo (HTML/CSS/JS) ou nome de arquivo único */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted/70 px-3 py-2">
                    {isMultiFile ? (
                      <div
                        role="tablist"
                        aria-label="Arquivos do projeto"
                        className="flex flex-wrap items-center gap-1"
                      >
                        {SANDBOX_FILE_TABS.map((tab) => {
                          const selected = activeTab === tab.key;
                          const hasContent = files[tab.key].trim().length > 0;
                          return (
                            <button
                              key={tab.key}
                              type="button"
                              role="tab"
                              aria-selected={selected}
                              onClick={() => setActiveTab(tab.key)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
                                selected
                                  ? "border-accent bg-surface text-foreground shadow-xs"
                                  : "border-transparent text-muted hover:border-border hover:text-foreground"
                              }`}
                            >
                              <span>{tab.label}</span>
                              {hasContent ? (
                                <span
                                  aria-hidden="true"
                                  className="h-1.5 w-1.5 rounded-full bg-signal"
                                />
                              ) : null}
                            </button>
                          );
                        })}
                        <span className="ml-1 text-[11px] text-muted">
                          {lineCount} {lineCount === 1 ? "linha" : "linhas"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <LanguageIcon language={language} size={16} />
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {meta.fileName}
                        </span>
                        <span className="text-[11px] text-muted">
                          · {lineCount} linhas
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      {canFormatCurrentEditor ? (
                        <button
                          type="button"
                          title="Formatar código (Shift+Alt+F)"
                          disabled={isFormatting}
                          onClick={() => void handleFormatCurrentCode()}
                          className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-accent disabled:opacity-50"
                        >
                          {isFormatting ? "Formatando..." : "Formatar"}
                        </button>
                      ) : null}

                      {meta.supportsLivePreview ? (
                        <button
                          type="button"
                          title="Executar preview agora (Ctrl+Enter)"
                          onClick={handleRunPreviewNow}
                          className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground transition-opacity hover:opacity-90"
                        >
                          Executar
                        </button>
                      ) : null}

                      {confirmTemplateSwap ? (
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-amber-500">Substituir?</span>
                          <button
                            type="button"
                            onClick={applyLanguageTemplate}
                            className="rounded-md bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-600 dark:text-amber-300"
                          >
                            Sim
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmTemplateSwap(false)}
                            className="rounded-md border border-border px-2 py-0.5 text-muted"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleRequestTemplate}
                          className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-accent"
                        >
                          Modelo
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Instâncias isoladas do CodeMirror 6 por aba preservam histórico local (undo/redo) */}
                  {isMultiFile ? (
                    <div className="flex min-h-[280px] flex-1 flex-col sm:min-h-[340px]">
                      {SANDBOX_FILE_TABS.map((tab) => (
                        <div
                          key={tab.key}
                          role="tabpanel"
                          aria-label={tab.label}
                          className={
                            activeTab === tab.key
                              ? "flex min-h-[280px] flex-1 flex-col sm:min-h-[340px]"
                              : "hidden"
                          }
                        >
                          <SandboxCodeEditor
                            value={files[tab.key]}
                            language={tab.editorLanguage}
                            ariaLabel={`Editor de código ${tab.label}`}
                            minHeight="300px"
                            onChange={(nextVal) =>
                              updateFileContent(tab.key, nextVal)
                            }
                            onRunShortcut={handleRunPreviewNow}
                            onFormatShortcut={() => void handleFormatCurrentCode()}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex min-h-[280px] flex-1 flex-col sm:min-h-[340px]">
                      <SandboxCodeEditor
                        value={sourceCode}
                        language={mapSandboxLanguageToEditor(language)}
                        ariaLabel={`Código-fonte em ${meta.label}`}
                        minHeight="300px"
                        onChange={setSourceCode}
                        onRunShortcut={handleRunPreviewNow}
                        onFormatShortcut={
                          canFormatCurrentEditor
                            ? () => void handleFormatCurrentCode()
                            : undefined
                        }
                      />
                    </div>
                  )}
                </div>

                <div
                  className={`min-h-[340px] sm:min-h-[400px] ${
                    mobilePane === "preview" ? "block" : "hidden lg:block"
                  }`}
                >
                  <SandboxPreview
                    language={language}
                    sourceCode={effectiveSourceCode}
                    projectTitle={title}
                    runTrigger={runTrigger}
                    isVisible={mobilePane === "preview" || true}
                  />
                </div>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
                >
                  {error}
                </p>
              ) : null}

              {message ? (
                <p
                  role="status"
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
                >
                  {message}
                </p>
              ) : null}
            </div>
          </div>

          {/* Rodapé fixo com ação de salvar */}
          <div className="flex shrink-0 flex-col-reverse gap-2.5 border-t border-border bg-surface pt-3 pb-[calc(0.75rem+var(--codit-safe-bottom))] pl-[calc(1rem+var(--codit-safe-left))] pr-[calc(1rem+var(--codit-safe-right))] sm:flex-row sm:items-center sm:justify-between sm:pl-[calc(1.5rem+var(--codit-safe-left))] sm:pr-[calc(1.5rem+var(--codit-safe-right))]">
            <p className="text-[11px] text-muted">
              Máximo de 200.000 caracteres · Isolado no seu{" "}
              <code className="font-mono">user_id</code> com lock de versão.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface-muted px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-accent"
              >
                Cancelar / Fechar
              </button>
              <button
                type="submit"
                disabled={isSaving || !isOnline}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving
                  ? "Salvando projeto..."
                  : editingProject
                    ? `Atualizar projeto (v${editingProject.version})`
                    : "Salvar mini-projeto"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
