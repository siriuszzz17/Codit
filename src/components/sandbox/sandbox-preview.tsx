"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LanguageBadge } from "@/components/sandbox/language-icon";
import type { SandboxLanguage } from "@/lib/supabase/database.types";
import { getLanguageMeta } from "@/modules/sandbox/language-catalog";
import {
  buildSandboxedPreviewDocument,
  SANDBOX_EXECUTION_TIMEOUT_MS,
} from "@/modules/sandbox/sandbox-runner";

interface ConsoleEntry {
  id: number;
  level: "log" | "info" | "warn" | "error";
  text: string;
}

interface SandboxPreviewProps {
  language: SandboxLanguage;
  sourceCode: string;
  projectTitle?: string;
}

function getRuntimeLabel(language: SandboxLanguage): string {
  const meta = getLanguageMeta(language);
  if (meta.supportsLivePreview) {
    return "Sandbox Iframe Isolado";
  }
  if (meta.defaultRuntimeTarget === "client_pyodide") {
    return "Pyodide WASM (Fase 3+)";
  }
  if (meta.defaultRuntimeTarget === "client_iframe") {
    return "Inspeção Estática (Build em breve)";
  }
  return "Sandbox Remoto (Fase 5)";
}

function downloadSourceFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function SandboxPreview({
  language,
  sourceCode,
  projectTitle = "",
}: SandboxPreviewProps) {
  const meta = getLanguageMeta(language);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const nextLogIdRef = useRef(1);

  const [executedCode, setExecutedCode] = useState(sourceCode);
  const [runCounter, setRunCounter] = useState(1);
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [readyRunId, setReadyRunId] = useState<string | null>(null);
  const [timedOutRunId, setTimedOutRunId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Debounce automático quando usuário edita código no estúdio
  useEffect(() => {
    if (!meta.supportsLivePreview) {
      return;
    }

    const timer = window.setTimeout(() => {
      setExecutedCode((previous) => {
        if (previous === sourceCode) {
          return previous;
        }
        setLogs([]);
        setReadyRunId(null);
        setTimedOutRunId(null);
        setRunCounter((current) => current + 1);
        return sourceCode;
      });
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [meta.supportsLivePreview, sourceCode]);

  const activeRunId = `codit-run-${runCounter}`;
  const isTimedOut = timedOutRunId === activeRunId;
  const isReady = readyRunId === activeRunId;

  const srcDoc = useMemo(() => {
    if (!meta.supportsLivePreview) {
      return "";
    }
    return buildSandboxedPreviewDocument(language, executedCode, activeRunId);
  }, [activeRunId, executedCode, language, meta.supportsLivePreview]);

  useEffect(() => {
    if (!meta.supportsLivePreview) {
      return;
    }

    let gotReady = false;
    const timeoutId = window.setTimeout(() => {
      if (!gotReady) {
        setTimedOutRunId(activeRunId);
      }
    }, SANDBOX_EXECUTION_TIMEOUT_MS);

    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const data = event.data as
        | {
            source?: string;
            runId?: string;
            type?: string;
            level?: "log" | "info" | "warn" | "error";
            text?: string;
          }
        | undefined;

      if (!data || data.source !== "codit-sandbox" || data.runId !== activeRunId) {
        return;
      }

      if (data.type === "ready") {
        gotReady = true;
        window.clearTimeout(timeoutId);
        setReadyRunId(activeRunId);
        return;
      }

      if (data.type === "log" && typeof data.text === "string") {
        const level =
          data.level === "warn" ||
          data.level === "error" ||
          data.level === "info"
            ? data.level
            : "log";
        const entryId = nextLogIdRef.current;
        nextLogIdRef.current += 1;
        const text = data.text;
        setLogs((current) => [...current.slice(-59), { id: entryId, level, text }]);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
    };
  }, [activeRunId, meta.supportsLivePreview]);

  function handleRerun() {
    setLogs([]);
    setReadyRunId(null);
    setTimedOutRunId(null);
    setExecutedCode(sourceCode);
    setRunCounter((current) => current + 1);
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(sourceCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  if (!meta.supportsLivePreview) {
    const lineCount = sourceCode ? sourceCode.split(/\r?\n/).length : 0;
    const lines = sourceCode.split(/\r?\n/);

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-[#0f0d1d] text-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/5 px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <LanguageBadge language={language} size="xs" showFileName />
            <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
              {getRuntimeLabel(language)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleCopyCode()}
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-white/15"
            >
              {copied ? "Copiado!" : "Copiar"}
            </button>
            <button
              type="button"
              onClick={() => downloadSourceFile(meta.fileName, sourceCode)}
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-white/15"
            >
              Baixar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3.5 font-mono text-xs leading-relaxed">
          {sourceCode.trim() ? (
            <div className="space-y-0.5">
              {lines.map((line, index) => (
                <div key={`${index}-${line.length}`} className="flex gap-3">
                  <span className="w-7 shrink-0 select-none text-right text-slate-500">
                    {index + 1}
                  </span>
                  <span className="whitespace-pre-wrap break-all text-slate-200">
                    {line || " "}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-slate-400">
              Escreva seu código em {meta.label} no editor ao lado.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/5 px-3.5 py-2 text-[11px] text-slate-300">
          <span>
            {lineCount} {lineCount === 1 ? "linha" : "linhas"} ·{" "}
            {sourceCode.length.toLocaleString("pt-BR")} caracteres
          </span>
          <span className="text-slate-400">
            Código salvo com segurança na sua conta para estudo e portfólio.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted/70 px-3.5 py-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${
              isTimedOut
                ? "bg-red-500"
                : isReady
                  ? "bg-emerald-500"
                  : "animate-pulse bg-amber-500"
            }`}
          />
          <span className="text-xs font-semibold text-foreground">
            {isTimedOut
              ? "Execução interrompida (tempo limite)"
              : isReady
                ? "Sandbox isolado pronto"
                : "Executando..."}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleCopyCode()}
            className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-accent"
          >
            {copied ? "Copiado!" : "Copiar"}
          </button>
          <button
            type="button"
            onClick={handleRerun}
            className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            Executar novamente
          </button>
        </div>
      </div>

      <div className="relative min-h-[220px] flex-1 bg-white">
        {isTimedOut ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 bg-[#141228] p-5 text-center text-white">
            <p className="text-sm font-semibold text-amber-300">
              Execução encerrada pelo watchdog de segurança (4s)
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-slate-300">
              Verifique se há algum loop infinito no seu código e clique em
              &ldquo;Executar novamente&rdquo; para reiniciar o sandbox isolado.
            </p>
            <button
              type="button"
              onClick={handleRerun}
              className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground"
            >
              Reiniciar sandbox
            </button>
          </div>
        ) : (
          <iframe
            key={activeRunId}
            ref={iframeRef}
            title={`Pré-visualização isolada: ${projectTitle || meta.label}`}
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            className="h-full min-h-[220px] w-full border-0"
          />
        )}
      </div>

      <div className="border-t border-border bg-[#0e0c1a] text-slate-200">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[11px]">
          <span className="font-mono font-semibold text-slate-300">
            Console ({logs.length})
          </span>
          {logs.length > 0 ? (
            <button
              type="button"
              onClick={() => setLogs([])}
              className="text-slate-400 hover:text-white"
            >
              Limpar
            </button>
          ) : null}
        </div>
        <div className="max-h-28 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
          {logs.length === 0 ? (
            <p className="text-slate-500">
              Nenhuma saída registrada. Use console.log(...) para depurar.
            </p>
          ) : (
            <ul className="space-y-1">
              {logs.map((entry) => (
                <li
                  key={entry.id}
                  className={
                    entry.level === "error"
                      ? "text-red-400"
                      : entry.level === "warn"
                        ? "text-amber-300"
                        : "text-emerald-300"
                  }
                >
                  <span className="mr-1.5 opacity-60">
                    [{entry.level}]
                  </span>
                  <span className="break-all">{entry.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
