"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LanguageBadge } from "@/components/sandbox/language-icon";
import type { SandboxLanguage } from "@/lib/supabase/database.types";
import { getLanguageMeta } from "@/modules/sandbox/language-catalog";
import {
  createPyodideRunner,
  PYODIDE_TIMEOUT_MS,
  type PyodideProgressEvent,
  type PyodideRunResult,
  type PyodideRunner,
  type PythonAssertionSpec,
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
  pythonAssertions?: ReadonlyArray<PythonAssertionSpec>;
  onPythonResult?: (result: PyodideRunResult) => void;
}

function getRuntimeLabel(language: SandboxLanguage): string {
  const meta = getLanguageMeta(language);
  if (meta.supportsLivePreview) {
    return "Sandbox Iframe Isolado";
  }
  if (meta.defaultRuntimeTarget === "client_pyodide") {
    return "Pyodide WASM (Web Worker)";
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
  pythonAssertions,
  onPythonResult,
}: SandboxPreviewProps) {
  const meta = getLanguageMeta(language);
  const isPython = language === "python";
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const nextLogIdRef = useRef(1);
  const pyodideRunnerRef = useRef<PyodideRunner | null>(null);

  const [executedCode, setExecutedCode] = useState(sourceCode);
  const [runCounter, setRunCounter] = useState(1);
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [readyRunId, setReadyRunId] = useState<string | null>(null);
  const [timedOutRunId, setTimedOutRunId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [pyRunning, setPyRunning] = useState(false);
  const [pyProgress, setPyProgress] = useState<PyodideProgressEvent | null>(
    null,
  );
  const [pyResult, setPyResult] = useState<PyodideRunResult | null>(null);

  useEffect(() => {
    return () => {
      pyodideRunnerRef.current?.terminate();
      pyodideRunnerRef.current = null;
    };
  }, []);

  async function handleRunPython() {
    if (pyRunning) {
      return;
    }

    if (!pyodideRunnerRef.current) {
      pyodideRunnerRef.current = createPyodideRunner();
    }

    setPyRunning(true);
    setPyProgress({
      runId: "pending",
      stage: "downloading",
      progress: 10,
      message: "Preparando Web Worker Python (Pyodide)...",
    });

    try {
      const result = await pyodideRunnerRef.current.run(sourceCode, {
        assertions: pythonAssertions,
        timeoutMs: PYODIDE_TIMEOUT_MS,
        onProgress: (event) => {
          setPyProgress(event);
        },
      });
      setPyResult(result);
      onPythonResult?.(result);
    } finally {
      setPyRunning(false);
    }
  }

  function handleTerminatePythonWorker() {
    pyodideRunnerRef.current?.terminate();
    pyodideRunnerRef.current = null;
    setPyRunning(false);
    setPyProgress(null);
  }

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

  if (isPython) {
    const lineCount = sourceCode ? sourceCode.split(/\r?\n/).length : 0;
    const progressPercent = pyProgress
      ? Math.min(100, Math.max(0, pyProgress.progress))
      : 0;

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-[#0f0d1d] text-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/5 px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <LanguageBadge language={language} size="xs" showFileName />
            <span className="rounded-full border border-sky-400/30 bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-medium text-sky-200">
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
            {pyRunning ? (
              <button
                type="button"
                onClick={handleTerminatePythonWorker}
                className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                Interromper
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleRunPython()}
                className="rounded-lg bg-accent px-3 py-1 text-[11px] font-semibold text-accent-foreground transition-opacity hover:opacity-90"
              >
                Executar Python
              </button>
            )}
          </div>
        </div>

        {pyRunning && pyProgress ? (
          <div className="space-y-1.5 border-b border-white/10 bg-sky-950/40 px-3.5 py-2.5">
            <div className="flex items-center justify-between text-[11px] text-sky-200">
              <span>{pyProgress.message}</span>
              <span className="font-mono font-semibold">{progressPercent}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Progresso do runtime Pyodide"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
            >
              <div
                className="h-full rounded-full bg-sky-400 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex-1 space-y-3 overflow-auto p-3.5 font-mono text-xs leading-relaxed">
          {!pyResult && !pyRunning ? (
            <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2.5 text-center text-slate-300">
              <p className="text-sm font-semibold text-white">
                Python isolado sob demanda (Web Worker)
              </p>
              <p className="max-w-sm font-sans text-xs leading-relaxed text-slate-400">
                Clique em &ldquo;Executar Python&rdquo; para baixar o Pyodide WASM
                em segundo plano sem travar a interface. Limite de 5s e 16 KB de saída.
              </p>
            </div>
          ) : null}

          {pyResult?.timedOut ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-amber-200">
              <p className="font-sans text-xs font-semibold">
                Execução interrompida pelo watchdog de segurança (5s)
              </p>
              <p className="mt-1 font-sans text-xs text-amber-100/80">
                {pyResult.error}
              </p>
            </div>
          ) : null}

          {pyResult && !pyResult.timedOut ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <span
                  className={
                    pyResult.ok
                      ? "font-semibold text-emerald-300"
                      : "font-semibold text-red-300"
                  }
                >
                  {pyResult.ok ? "Execução concluída" : "Execução com erro"}
                </span>
                <span>{pyResult.durationMs} ms</span>
              </div>

              {pyResult.stdout ? (
                <div className="space-y-1">
                  <p className="font-sans text-[11px] font-semibold text-slate-400">
                    Saída (stdout)
                  </p>
                  <pre className="whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/35 p-3 text-emerald-300">
                    {pyResult.stdout}
                  </pre>
                </div>
              ) : null}

              {pyResult.stderr || pyResult.error ? (
                <div className="space-y-1">
                  <p className="font-sans text-[11px] font-semibold text-red-300">
                    Erros (stderr)
                  </p>
                  <pre className="whitespace-pre-wrap break-words rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-red-300">
                    {pyResult.stderr || pyResult.error}
                  </pre>
                </div>
              ) : null}

              {!pyResult.stdout && !pyResult.stderr && !pyResult.error ? (
                <p className="font-sans text-xs text-slate-400">
                  Código executado sem saídas. Use <code>print(...)</code> para exibir valores.
                </p>
              ) : null}

              {pyResult.assertions.length > 0 ? (
                <div className="space-y-1.5 border-t border-white/10 pt-2.5">
                  <p className="font-sans text-[11px] font-semibold text-slate-300">
                    Validação de critérios (
                    {pyResult.assertions.filter((a) => a.passed).length}/
                    {pyResult.assertions.length})
                  </p>
                  <ul className="space-y-1">
                    {pyResult.assertions.map((item) => (
                      <li
                        key={item.id}
                        className={`rounded-lg border px-2.5 py-1.5 font-sans text-xs ${
                          item.passed
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                            : "border-red-500/30 bg-red-500/10 text-red-200"
                        }`}
                      >
                        <span className="font-semibold">
                          {item.passed ? "OK" : "Falhou"}:
                        </span>{" "}
                        {item.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/5 px-3.5 py-2 text-[11px] text-slate-300">
          <span>
            {lineCount} {lineCount === 1 ? "linha" : "linhas"} ·{" "}
            {sourceCode.length.toLocaleString("pt-BR")} caracteres
          </span>
          <span className="text-slate-400">
            {pyResult?.truncated
              ? "Saída limitada a 16 KB (RN-202)"
              : "Watchdog ativo: 5s · Worker isolado"}
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
