"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LanguageBadge } from "@/components/sandbox/language-icon";
import type { SandboxLanguage } from "@/lib/supabase/database.types";
import { getLanguageMeta } from "@/modules/sandbox/language-catalog";
import {
  PYODIDE_EXECUTION_TIMEOUT_MS,
  runPythonCode,
  type PyodideExecResult,
  type PyodideLoadProgress,
} from "@/modules/sandbox/pyodide-runner";
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
  runTrigger?: number;
  isVisible?: boolean;
}

function getRuntimeLabel(language: SandboxLanguage): string {
  const meta = getLanguageMeta(language);
  if (meta.supportsLivePreview) {
    return "Sandbox Iframe Isolado";
  }
  if (meta.defaultRuntimeTarget === "client_pyodide") {
    return "Pyodide WASM (Worker 5s)";
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
  runTrigger = 0,
  isVisible = true,
}: SandboxPreviewProps) {
  const meta = getLanguageMeta(language);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const nextLogIdRef = useRef(1);
  const lastExecutedRef = useRef<{ language: SandboxLanguage; sourceCode: string }>({
    language,
    sourceCode,
  });
  const lastRunTriggerRef = useRef(runTrigger);

  const [executedPayload, setExecutedPayload] = useState<{
    language: SandboxLanguage;
    sourceCode: string;
  }>({
    language,
    sourceCode,
  });
  const [runCounter, setRunCounter] = useState(1);
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [readyRunId, setReadyRunId] = useState<string | null>(null);
  const [timedOutRunId, setTimedOutRunId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isPythonPyodide = meta.defaultRuntimeTarget === "client_pyodide";
  const [pythonRunning, setPythonRunning] = useState(false);
  const [pythonProgress, setPythonProgress] =
    useState<PyodideLoadProgress | null>(null);
  const [pythonResult, setPythonResult] = useState<PyodideExecResult | null>(
    null,
  );

  async function handleRunPython() {
    if (pythonRunning) return;
    setPythonRunning(true);
    setPythonResult(null);
    try {
      const result = await runPythonCode(sourceCode, {
        timeoutMs: PYODIDE_EXECUTION_TIMEOUT_MS,
        onProgress: (progress) => setPythonProgress(progress),
      });
      setPythonResult(result);
    } finally {
      setPythonRunning(false);
    }
  }

  // Execução imediata quando acionada por atalho (Ctrl+Enter) ou botão externo
  useEffect(() => {
    if (!meta.supportsLivePreview) {
      return;
    }
    if (runTrigger === lastRunTriggerRef.current) {
      return;
    }
    lastRunTriggerRef.current = runTrigger;
    lastExecutedRef.current = { language, sourceCode };
    setLogs([]);
    setReadyRunId(null);
    setTimedOutRunId(null);
    setExecutedPayload({ language, sourceCode });
    setRunCounter((current) => current + 1);
  }, [language, meta.supportsLivePreview, runTrigger, sourceCode]);

  // Debounce automático quando usuário edita código ou troca linguagem no estúdio
  useEffect(() => {
    if (!meta.supportsLivePreview) {
      return;
    }

    if (
      lastExecutedRef.current.language === language &&
      lastExecutedRef.current.sourceCode === sourceCode
    ) {
      return;
    }

    const delayMs = lastExecutedRef.current.language !== language ? 0 : 450;
    const timer = window.setTimeout(() => {
      lastExecutedRef.current = { language, sourceCode };
      setLogs([]);
      setReadyRunId(null);
      setTimedOutRunId(null);
      setExecutedPayload({ language, sourceCode });
      setRunCounter((current) => current + 1);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [language, meta.supportsLivePreview, sourceCode]);

  const activeRunId = `codit-run-${runCounter}`;
  const isTimedOut = timedOutRunId === activeRunId;
  const isReady = readyRunId === activeRunId;

  const srcDoc = useMemo(() => {
    if (!meta.supportsLivePreview) {
      return "";
    }
    return buildSandboxedPreviewDocument(
      executedPayload.language,
      executedPayload.sourceCode,
      activeRunId,
    );
  }, [
    activeRunId,
    executedPayload.language,
    executedPayload.sourceCode,
    meta.supportsLivePreview,
  ]);

  useEffect(() => {
    if (!meta.supportsLivePreview) {
      return;
    }

    let gotReady = false;
    const timeoutId = isVisible
      ? window.setTimeout(() => {
          if (!gotReady) {
            setTimedOutRunId(activeRunId);
          }
        }, SANDBOX_EXECUTION_TIMEOUT_MS)
      : null;

    function handleMessage(event: MessageEvent) {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (iframeWindow && event.source !== iframeWindow) {
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
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
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
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener("message", handleMessage);
    };
  }, [activeRunId, isVisible, meta.supportsLivePreview]);

  function handleIframeLoad() {
    setReadyRunId(activeRunId);
    try {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: "codit-sandbox-host",
          type: "ping",
          runId: activeRunId,
        },
        "*",
      );
    } catch {
      // Ignora em ambientes sem contentWindow acessível
    }
  }

  function handleRerun() {
    lastExecutedRef.current = { language, sourceCode };
    setLogs([]);
    setReadyRunId(null);
    setTimedOutRunId(null);
    setExecutedPayload({ language, sourceCode });
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

  if (!meta.supportsLivePreview && isPythonPyodide) {
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-[#0f0d1d] text-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/5 px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <LanguageBadge language={language} size="xs" showFileName />
            <span className="rounded-full border border-sky-400/35 bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-medium text-sky-200">
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
            <button
              type="button"
              onClick={() => void handleRunPython()}
              disabled={pythonRunning}
              className="rounded-lg bg-accent px-3 py-1 text-[11px] font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pythonRunning ? "Executando..." : "Executar Python"}
            </button>
          </div>
        </div>

        {pythonProgress && pythonProgress.stage !== "ready" ? (
          <div
            role="status"
            className="space-y-1.5 border-b border-white/10 bg-white/5 px-3.5 py-2.5 text-xs"
          >
            <div className="flex items-center justify-between gap-2 text-slate-200">
              <span>{pythonProgress.label}</span>
              <span className="font-mono text-[11px] text-sky-300">
                {pythonProgress.percent}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-sky-400 transition-all duration-300"
                style={{ width: `${pythonProgress.percent}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-auto p-3.5 font-mono text-xs leading-relaxed">
          {!pythonResult ? (
            <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-center text-slate-400">
              <p className="text-xs font-semibold text-slate-200">
                Python isolado sob demanda (Web Worker + Pyodide WASM)
              </p>
              <p className="max-w-sm text-[11px] leading-relaxed">
                Clique em &ldquo;Executar Python&rdquo; para carregar o runtime
                no Worker dedicado e capturar stdout/stderr (máx. 16 KB, timeout
                5s).
              </p>
            </div>
          ) : pythonResult.timedOut ? (
            <div
              role="alert"
              className="space-y-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3.5 text-amber-200"
            >
              <p className="font-semibold">
                Execução encerrada pelo watchdog de segurança (5s · RN-202)
              </p>
              <p className="text-[11px] text-amber-100/90">
                {pythonResult.runtimeError}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pythonResult.stdout ? (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                    stdout
                  </p>
                  <pre className="whitespace-pre-wrap break-words rounded-xl bg-black/35 p-3 text-emerald-200">
                    {pythonResult.stdout}
                  </pre>
                </div>
              ) : null}

              {pythonResult.stderr ? (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-red-300">
                    stderr
                  </p>
                  <pre className="whitespace-pre-wrap break-words rounded-xl bg-red-950/40 p-3 text-red-200">
                    {pythonResult.stderr}
                  </pre>
                </div>
              ) : null}

              {!pythonResult.stdout && !pythonResult.stderr ? (
                <p className="text-slate-400">
                  Execução concluída sem saída no console. Use{" "}
                  <code className="text-slate-200">print(...)</code> para
                  imprimir valores.
                </p>
              ) : null}

              {pythonResult.truncated ? (
                <p className="text-[11px] text-amber-300">
                  Saída truncada no limite de 16 KB.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/5 px-3.5 py-2 text-[11px] text-slate-300">
          <span>
            {pythonResult
              ? `Última execução: ${pythonResult.executionMs}ms`
              : "Runtime sob demanda (0 KB até executar)"}
          </span>
          <span className="text-slate-400">
            Isolado em Web Worker · Watchdog 5s
          </span>
        </div>
      </div>
    );
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
            onLoad={handleIframeLoad}
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
