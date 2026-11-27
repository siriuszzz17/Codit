import {
  LESSON_RUNNER_SOURCE,
  buildTimeoutSummary,
  normalizeRunnerPayload,
  type AssertRunSummary,
} from "@/modules/learning/assert-runner";
import type { LessonTestCase } from "@/modules/learning/learning-schemas";

export const PYODIDE_CDN_BASE = "https://cdn.jsdelivr.net/pyodide/v0.27.4/full/";
export const PYODIDE_WORKER_URL = "/workers/pyodide-runner.worker.js";
export const PYODIDE_SANDBOX_SOURCE = "codit-pyodide-sandbox";
/** RN-202: Watchdog obrigatório de 5s com worker.terminate(). */
export const PYODIDE_EXECUTION_TIMEOUT_MS = 5000;
/** Orçamento de download/boot inicial do WASM antes do código começar a rodar. */
export const PYODIDE_BOOTSTRAP_TIMEOUT_MS = 45000;
/** Limite máximo de captura de stdout/stderr por execução (16 KB). */
export const PYODIDE_MAX_OUTPUT_BYTES = 16 * 1024;

export type PyodideLoadStage =
  | "idle"
  | "downloading"
  | "initializing"
  | "running"
  | "ready"
  | "error";

export interface PyodideLoadProgress {
  stage: PyodideLoadStage;
  percent: number;
  label: string;
}

export interface PyodideExecResult {
  runId: string;
  stdout: string;
  stderr: string;
  truncated: boolean;
  executionMs: number;
  timedOut: boolean;
  runtimeError: string | null;
}

export interface PyodideWorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(
    type: "message" | "error",
    listener: (event: MessageEvent | ErrorEvent) => void,
  ): void;
  removeEventListener(
    type: "message" | "error",
    listener: (event: MessageEvent | ErrorEvent) => void,
  ): void;
}

export interface RunPythonOptions {
  timeoutMs?: number | undefined;
  cdnBase?: string | undefined;
  onProgress?: ((progress: PyodideLoadProgress) => void) | undefined;
  workerFactory?: (() => PyodideWorkerLike) | undefined;
}

function createPyodideRunId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `pyrun_${globalThis.crypto.randomUUID()}`;
  }
  return `pyrun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function truncateOutputToByteLimit(
  value: string,
  maxBytes: number = PYODIDE_MAX_OUTPUT_BYTES,
): { text: string; truncated: boolean } {
  if (typeof TextEncoder !== "undefined") {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(value);
    if (encoded.byteLength <= maxBytes) {
      return { text: value, truncated: false };
    }
    const decoder = new TextDecoder("utf-8", { fatal: false });
    return {
      text: decoder.decode(encoded.slice(0, maxBytes)),
      truncated: true,
    };
  }
  if (value.length <= maxBytes) {
    return { text: value, truncated: false };
  }
  return { text: value.slice(0, maxBytes), truncated: true };
}

let sharedWorker: PyodideWorkerLike | null = null;

function defaultWorkerFactory(): PyodideWorkerLike {
  return new Worker(PYODIDE_WORKER_URL) as unknown as PyodideWorkerLike;
}

function getOrCreateSharedWorker(
  factory?: () => PyodideWorkerLike,
): { worker: PyodideWorkerLike; isShared: boolean } {
  if (factory) {
    return { worker: factory(), isShared: false };
  }
  if (!sharedWorker) {
    sharedWorker = defaultWorkerFactory();
  }
  return { worker: sharedWorker, isShared: true };
}

export function resetPyodideWorker(): void {
  if (sharedWorker) {
    sharedWorker.terminate();
    sharedWorker = null;
  }
}

function terminateWorkerInstance(
  worker: PyodideWorkerLike,
  isShared: boolean,
): void {
  worker.terminate();
  if (isShared && sharedWorker === worker) {
    sharedWorker = null;
  }
}

/**
 * Executa código Python arbitrário em Web Worker dedicado (Pyodide WASM)
 * com captura de stdout/stderr (máx. 16 KB) e watchdog de 5s (RN-202).
 */
export async function runPythonCode(
  code: string,
  options?: RunPythonOptions,
): Promise<PyodideExecResult> {
  const runId = createPyodideRunId();
  const timeoutMs = options?.timeoutMs ?? PYODIDE_EXECUTION_TIMEOUT_MS;

  if (!options?.workerFactory && (typeof window === "undefined" || typeof Worker === "undefined")) {
    return {
      runId,
      stdout: "",
      stderr: "Web Worker indisponível neste ambiente.",
      truncated: false,
      executionMs: 0,
      timedOut: false,
      runtimeError: "Web Worker indisponível neste ambiente.",
    };
  }

  return new Promise((resolve) => {
    const { worker, isShared } = getOrCreateSharedWorker(options?.workerFactory);
    let settled = false;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (watchdogTimer !== null) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
    };

    const armWatchdog = (ms: number) => {
      if (watchdogTimer !== null) {
        clearTimeout(watchdogTimer);
      }
      watchdogTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        terminateWorkerInstance(worker, isShared);
        const message = `Tempo limite excedido (${Math.round(timeoutMs / 1000)}s). Worker Python encerrado (RN-202).`;
        options?.onProgress?.({ stage: "error", percent: 0, label: message });
        resolve({
          runId,
          stdout: "",
          stderr: message,
          truncated: false,
          executionMs: timeoutMs,
          timedOut: true,
          runtimeError: message,
        });
      }, ms);
    };

    const handleMessage = (event: MessageEvent | ErrorEvent) => {
      if (settled) return;
      const data = (event as MessageEvent).data as Record<string, unknown> | null;
      if (!data || typeof data !== "object") return;

      if (data.type === "progress" && (!data.runId || data.runId === runId)) {
        const stage = data.stage as PyodideLoadStage;
        options?.onProgress?.({
          stage,
          percent: typeof data.percent === "number" ? data.percent : 0,
          label: typeof data.label === "string" ? data.label : "",
        });
        if (stage === "downloading" || stage === "initializing") {
          armWatchdog(PYODIDE_BOOTSTRAP_TIMEOUT_MS);
        } else if (stage === "running") {
          armWatchdog(timeoutMs);
        }
        return;
      }

      if (data.source !== PYODIDE_SANDBOX_SOURCE || data.runId !== runId) {
        return;
      }

      settled = true;
      cleanup();
      const stdoutCap = truncateOutputToByteLimit(
        typeof data.stdout === "string" ? data.stdout : "",
        PYODIDE_MAX_OUTPUT_BYTES,
      );
      const stderrCap = truncateOutputToByteLimit(
        typeof data.stderr === "string" ? data.stderr : "",
        PYODIDE_MAX_OUTPUT_BYTES,
      );

      resolve({
        runId,
        stdout: stdoutCap.text,
        stderr: stderrCap.text,
        truncated: Boolean(data.truncated || stdoutCap.truncated || stderrCap.truncated),
        executionMs:
          typeof data.executionMs === "number" && Number.isFinite(data.executionMs)
            ? Math.max(0, Math.round(data.executionMs))
            : 0,
        timedOut: false,
        runtimeError:
          typeof data.runtimeError === "string" && data.runtimeError.trim()
            ? data.runtimeError
            : null,
      });
    };

    const handleError = (event: MessageEvent | ErrorEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      terminateWorkerInstance(worker, isShared);
      const errEvent = event as ErrorEvent;
      const message = errEvent.message || "Erro no Web Worker do Pyodide.";
      options?.onProgress?.({ stage: "error", percent: 0, label: message });
      resolve({
        runId,
        stdout: "",
        stderr: message,
        truncated: false,
        executionMs: 0,
        timedOut: false,
        runtimeError: message,
      });
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    armWatchdog(timeoutMs);

    worker.postMessage({
      type: "exec",
      runId,
      code,
      cdnBase: options?.cdnBase ?? PYODIDE_CDN_BASE,
    });
  });
}

/**
 * Executa asserts de lição Python no Web Worker dedicado (Pyodide),
 * reaproveitando o contrato AssertRunSummary e encerrando loops infinitos em 5s (RN-202).
 */
export async function runPythonLessonAssertions(
  userCode: string,
  testCases: readonly LessonTestCase[],
  options?: RunPythonOptions,
): Promise<AssertRunSummary> {
  const runId = createPyodideRunId();
  const timeoutMs = options?.timeoutMs ?? PYODIDE_EXECUTION_TIMEOUT_MS;

  if (!options?.workerFactory && (typeof window === "undefined" || typeof Worker === "undefined")) {
    return buildTimeoutSummary(runId, testCases, timeoutMs);
  }

  return new Promise((resolve) => {
    const { worker, isShared } = getOrCreateSharedWorker(options?.workerFactory);
    let settled = false;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (watchdogTimer !== null) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
    };

    const armWatchdog = (ms: number) => {
      if (watchdogTimer !== null) {
        clearTimeout(watchdogTimer);
      }
      watchdogTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        terminateWorkerInstance(worker, isShared);
        options?.onProgress?.({
          stage: "error",
          percent: 0,
          label: `Tempo limite excedido (${Math.round(timeoutMs / 1000)}s).`,
        });
        resolve(buildTimeoutSummary(runId, testCases, timeoutMs));
      }, ms);
    };

    const handleMessage = (event: MessageEvent | ErrorEvent) => {
      if (settled) return;
      const data = (event as MessageEvent).data as Record<string, unknown> | null;
      if (!data || typeof data !== "object") return;

      if (data.type === "progress" && (!data.runId || data.runId === runId)) {
        const stage = data.stage as PyodideLoadStage;
        options?.onProgress?.({
          stage,
          percent: typeof data.percent === "number" ? data.percent : 0,
          label: typeof data.label === "string" ? data.label : "",
        });
        if (stage === "downloading" || stage === "initializing") {
          armWatchdog(PYODIDE_BOOTSTRAP_TIMEOUT_MS);
        } else if (stage === "running") {
          armWatchdog(timeoutMs);
        }
        return;
      }

      if (data.source !== LESSON_RUNNER_SOURCE) {
        return;
      }

      const normalized = normalizeRunnerPayload(data, runId, testCases);
      if (!normalized) return;
      settled = true;
      cleanup();
      resolve(normalized);
    };

    const handleError = (event: MessageEvent | ErrorEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      terminateWorkerInstance(worker, isShared);
      const errEvent = event as ErrorEvent;
      const message = errEvent.message || "Erro no Web Worker do Pyodide.";
      options?.onProgress?.({ stage: "error", percent: 0, label: message });
      resolve({
        runId,
        passed: false,
        passedCount: 0,
        totalCount: testCases.length,
        executionMs: 0,
        timedOut: false,
        runtimeError: message,
        consoleLines: [],
        results: testCases.map((tc) => ({
          id: tc.id,
          label: tc.label,
          expression: tc.expression,
          passed: false,
          expectedFormatted: JSON.stringify(tc.expected),
          actualFormatted: "erro",
          errorMessage: message,
        })),
      });
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    armWatchdog(timeoutMs);

    worker.postMessage({
      type: "run",
      runId,
      userCode,
      cdnBase: options?.cdnBase ?? PYODIDE_CDN_BASE,
      testCases: testCases.map((tc) => ({
        id: tc.id,
        label: tc.label,
        expression: tc.expression,
        expected: tc.expected,
      })),
    });
  });
}
