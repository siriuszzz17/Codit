"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { LanguageBadge, LanguageIcon } from "@/components/sandbox/language-icon";
import { SandboxPreview } from "@/components/sandbox/sandbox-preview";
import type {
  SandboxLanguage,
  SandboxProjectRow,
  SandboxVisibility,
} from "@/lib/supabase/database.types";
import {
  getLanguageMeta,
  isStarterCodeSample,
  LANGUAGE_CATALOG,
  ORDERED_SANDBOX_LANGUAGES,
} from "@/modules/sandbox/language-catalog";

export interface ProjectStudioSubmitPayload {
  title: string;
  description: string;
  primaryLanguage: SandboxLanguage;
  visibility: SandboxVisibility;
  sourceCode: string;
  isPinned: boolean;
  tags: string[];
  repositoryUrl: string;
  liveUrl: string;
}

interface ProjectStudioModalProps {
  editingProject: SandboxProjectRow | null;
  initialLanguage?: SandboxLanguage;
  isSaving: boolean;
  isOnline: boolean;
  error: string | null;
  message: string | null;
  onClose: () => void;
  onSubmit: (payload: ProjectStudioSubmitPayload) => Promise<void>;
}

const VISIBILITY_OPTIONS: ReadonlyArray<{
  id: SandboxVisibility;
  label: string;
  hint: string;
}> = [
  { id: "private", label: "Privado", hint: "Visível apenas para você" },
  { id: "unlisted", label: "Não listado", hint: "Acesso apenas por link" },
  {
    id: "public_portfolio",
    label: "Portfólio público",
    hint: "Destaque no seu portfólio",
  },
];

export function ProjectStudioModal({
  editingProject,
  initialLanguage = "html_css_js",
  isSaving,
  isOnline,
  error,
  message,
  onClose,
  onSubmit,
}: ProjectStudioModalProps) {
  const startingLanguage = editingProject?.primary_language ?? initialLanguage;
  const startingCode =
    editingProject?.source_code ?? LANGUAGE_CATALOG[startingLanguage].starterCode;

  const [title, setTitle] = useState(editingProject?.title ?? "");
  const [description, setDescription] = useState(
    editingProject?.description ?? "",
  );
  const [language, setLanguage] = useState<SandboxLanguage>(startingLanguage);
  const [visibility, setVisibility] = useState<SandboxVisibility>(
    editingProject?.visibility ?? "private",
  );
  const [sourceCode, setSourceCode] = useState(startingCode);
  const [isPinned, setIsPinned] = useState(editingProject?.is_pinned ?? false);
  const [tags, setTags] = useState<string[]>(editingProject?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState(
    editingProject?.repository_url ?? "",
  );
  const [liveUrl, setLiveUrl] = useState(editingProject?.live_url ?? "");
  const [mobilePane, setMobilePane] = useState<"editor" | "preview">("editor");
  const [confirmTemplateSwap, setConfirmTemplateSwap] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const meta = getLanguageMeta(language);

  useEffect(() => {
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  function handleSelectLanguage(nextLanguage: SandboxLanguage) {
    setLanguage(nextLanguage);
    setConfirmTemplateSwap(false);
    if (!editingProject && isStarterCodeSample(sourceCode)) {
      setSourceCode(LANGUAGE_CATALOG[nextLanguage].starterCode);
    }
  }

  function applyLanguageTemplate() {
    setSourceCode(meta.starterCode);
    setConfirmTemplateSwap(false);
  }

  function handleRequestTemplate() {
    if (isStarterCodeSample(sourceCode)) {
      applyLanguageTemplate();
      return;
    }
    setConfirmTemplateSwap(true);
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

  function handleCodeKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Tab") {
      return;
    }
    event.preventDefault();
    const element = event.currentTarget;
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    const updated = `${sourceCode.slice(0, start)}  ${sourceCode.slice(end)}`;
    setSourceCode(updated);

    window.requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = start + 2;
        textareaRef.current.selectionEnd = start + 2;
      }
    });
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      title,
      description,
      primaryLanguage: language,
      visibility,
      sourceCode,
      isPinned,
      tags,
      repositoryUrl,
      liveUrl,
    });
  }

  const lineCount = sourceCode ? sourceCode.split(/\r?\n/).length : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 backdrop-blur-xs sm:p-4"
    >
      <div className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl">
        {/* Cabeçalho do Estúdio */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-muted/60 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <LanguageIcon language={language} size={28} />
            <div>
              <h2
                id="studio-modal-title"
                className="text-base font-bold text-foreground sm:text-lg"
              >
                {editingProject
                  ? `Estúdio: ${editingProject.title}`
                  : "Novo Mini-Projeto Codit"}
              </h2>
              <p className="text-xs text-muted">
                {editingProject
                  ? `Editando versão v${editingProject.version} · Persistência segura por usuário`
                  : "Escolha uma linguagem, escreva seu código e teste no Sandbox"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent"
          >
            Fechar
          </button>
        </header>

        <form
          onSubmit={(event) => void handleFormSubmit(event)}
          className="flex flex-1 flex-col overflow-y-auto p-4 sm:p-6"
        >
          <div className="space-y-5">
            {/* Seletor visual de linguagens com ícones */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-foreground">
                  Linguagem / Stack do projeto
                </label>
                <LanguageBadge language={language} size="xs" showFileName />
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
                {ORDERED_SANDBOX_LANGUAGES.map((langId) => {
                  const item = LANGUAGE_CATALOG[langId];
                  const selected = language === langId;
                  return (
                    <button
                      key={langId}
                      type="button"
                      onClick={() => handleSelectLanguage(langId)}
                      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all ${
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

            {/* Metadados do projeto */}
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
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </div>

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
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="O que este projeto faz e o que você praticou?"
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.2fr_1fr]">
              {/* Visibilidade + Fixar */}
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-foreground">
                  Visibilidade &amp; Destaque
                </span>
                <div className="flex flex-wrap items-center gap-2">
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
                    {isPinned ? "★ Fixado no topo" : "☆ Fixar projeto"}
                  </button>
                </div>
              </div>

              {/* Tags */}
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
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder="ex.: frontend, algoritmo"
                    className="min-h-9 flex-1 rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!tagInput.trim() || tags.length >= 6}
                    onClick={() => addTag(tagInput)}
                    className="min-h-9 rounded-xl border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent disabled:opacity-50"
                  >
                    + Tag
                  </button>
                </div>
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
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

            {/* Links externos opcionais */}
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
                  onChange={(event) => setRepositoryUrl(event.target.value)}
                  placeholder="https://github.com/usuario/projeto"
                  className="min-h-10 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-foreground focus:border-accent focus:outline-none"
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
                  className="min-h-10 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-foreground focus:border-accent focus:outline-none"
                />
              </div>
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
                Editor ({meta.fileName})
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

            {/* Editor + Sandbox Preview lado a lado */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div
                className={`flex flex-col overflow-hidden rounded-2xl border border-border bg-background ${
                  mobilePane === "editor" ? "flex" : "hidden lg:flex"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted/70 px-3.5 py-2">
                  <div className="flex items-center gap-2">
                    <LanguageIcon language={language} size={16} />
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {meta.fileName}
                    </span>
                    <span className="text-[11px] text-muted">
                      · {lineCount} linhas
                    </span>
                  </div>

                  {confirmTemplateSwap ? (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-amber-500">Substituir código?</span>
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
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRequestTemplate}
                      className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-accent"
                    >
                      Carregar modelo
                    </button>
                  )}
                </div>

                <textarea
                  ref={textareaRef}
                  aria-label={`Código-fonte em ${meta.label}`}
                  rows={14}
                  value={sourceCode}
                  onChange={(event) => setSourceCode(event.target.value)}
                  onKeyDown={handleCodeKeyDown}
                  spellCheck={false}
                  className="min-h-[320px] w-full flex-1 resize-y bg-[#0c0a18] p-3.5 font-mono text-xs leading-relaxed text-slate-100 focus:outline-none"
                />
              </div>

              <div
                className={`min-h-[360px] ${
                  mobilePane === "preview" ? "block" : "hidden lg:block"
                }`}
              >
                <SandboxPreview
                  language={language}
                  sourceCode={sourceCode}
                  projectTitle={title}
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

          {/* Rodapé com ação de salvar */}
          <div className="mt-5 flex flex-col-reverse gap-2.5 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
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
