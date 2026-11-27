export const PYODIDE_WORKER_URL = "/workers/pyodide-runner.worker.js";
export const PYODIDE_TIMEOUT_MS = 5000;
export const PYODIDE_INIT_TIMEOUT_MS = 45000;
export const PYODIDE_MAX_OUTPUT_BYTES = 16 * 1024;
const PYODIDE_TRUNCATION_SUFFIX = "\n[saída truncada em 16 KB por segurança]";

export type PyodideRuntimeStage =
  | "idle"
  | "downloading"
  | "initializing"
  | "ready"
  | "running";

export interface PythonAssertionSpec {
  id: string;
  label: string;
  expression: string;
}

export interface PythonAssertionResult {
  id: string;
  label: string;
  passed: boolean;
  message: string;
}

export interface PyodideProgressEvent {
  runId: string;
  stage: Exclude<PyodideRuntimeStage, "idle">;
  progress: number;
  message: string;
}

export interface PyodideRunOptions {
  assertions?: ReadonlyArray<PythonAssertionSpec>;
  timeoutMs?: number;
  initTimeoutMs?: number;
  indexUrl?: string;
  onProgress?: (event: PyodideProgressEvent) => void;
}

export interface PyodideRunResult {
  runId: string;
  ok: boolean;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  truncated: boolean;
  durationMs: number;
  assertions: PythonAssertionResult[];
  error: string | null;
}

export interface WorkerLike {
  postMessage: (message: unknown) => void;
  terminate: () => void;
  addEventListener: (
    type: "message" | "error",
    listener: (event: MessageEvent | ErrorEvent) => void,
  ) => void;
  removeEventListener: (
    type: "message" | "error",
    listener: (event: MessageEvent | ErrorEvent) => void,
  ) => void;
}

export type WorkerFactory = (url: string) => WorkerLike;

interface WorkerStatusMessage {
  type: "status";
  runId: string;
  stage: Exclude<PyodideRuntimeStage, "idle">;
  progress: number;
  message: string;
}

interface WorkerResultMessage {
  type: "result";
  runId: string;
  ok: boolean;
  stdout?: string;
  stderr?: string;
  truncated?: boolean;
  durationMs?: number;
  assertions?: PythonAssertionResult[];
  error?: string | null;
}

type WorkerOutgoingMessage = WorkerStatusMessage | WorkerResultMessage;

export function truncateUtf8Output(
  value: string,
  maxBytes: number = PYODIDE_MAX_OUTPUT_BYTES,
): { text: string; truncated: boolean } {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(value);
  if (encoded.byteLength <= maxBytes) {
    return { text: value, truncated: false };
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });
  const sliced = decoder.decode(encoded.slice(0, maxBytes));
  return {
    text: `${sliced}${PYODIDE_TRUNCATION_SUFFIX}`,
    truncated: true,
  };
}

function defaultWorkerFactory(url: string): WorkerLike {
  if (typeof Worker === "undefined") {
    throw new Error(
      "Web Workers não estão disponíveis neste ambiente para executar Python.",
    );
  }
  return new Worker(url);
}

export class PyodideRunner {
  private readonly workerUrl: string;
  private readonly workerFactory: WorkerFactory;
  private worker: WorkerLike | null = null;
  private runSequence = 0;

  constructor(options?: {
    workerUrl?: string;
    workerFactory?: WorkerFactory;
  }) {
    this.workerUrl = options?.workerUrl ?? PYODIDE_WORKER_URL;
    this.workerFactory = options?.workerFactory ?? defaultWorkerFactory;
  }

  private getOrCreateWorker(): WorkerLike {
    if (!this.worker) {
      this.worker = this.workerFactory(this.workerUrl);
    }
    return this.worker;
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  public async run(
    code: string,
    options?: PyodideRunOptions,
  ): Promise<PyodideRunResult> {
    this.runSequence += 1;
    const runId = `py-run-${this.runSequence}`;
    const timeoutMs = Math.max(
      100,
      options?.timeoutMs ?? PYODIDE_TIMEOUT_MS,
    );
    const initTimeoutMs = Math.max(
      timeoutMs,
      options?.initTimeoutMs ?? PYODIDE_INIT_TIMEOUT_MS,
    );
    const startedAt = Date.now();

    let worker: WorkerLike;
    try {
      worker = this.getOrCreateWorker();
    } catch (error) {
      return {
        runId,
        ok: false,
        timedOut: false,
        stdout: "",
        stderr: "",
        truncated: false,
        durationMs: 0,
        assertions: [],
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível iniciar o Web Worker Python.",
      };
    }

    return new Promise<PyodideRunResult>((resolve) => {
      let settled = false;
      let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

      const clearWatchdog = () => {
        if (watchdogTimer !== null) {
          clearTimeout(watchdogTimer);
          watchdogTimer = null;
        }
      };

      const finish = (result: PyodideRunResult) => {
        if (settled) {
          return;
        }
        settled = true;
        clearWatchdog();
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
        resolve(result);
      };

      const armWatchdog = (ms: number, isInitPhase: boolean) => {
        clearWatchdog();
        watchdogTimer = setTimeout(() => {
          this.terminate();
          finish({
            runId,
            ok: false,
            timedOut: true,
            stdout: "",
            stderr: "",
            truncated: false,
            durationMs: Date.now() - startedAt,
            assertions: [],
            error: isInitPhase
              ? `Tempo limite excedido ao baixar ou inicializar o runtime Python (${Math.round(ms / 1000)}s). Verifique sua conexão e tente novamente.`
              : `Execução interrompida pelo watchdog de segurança (${Math.round(ms / 1000)}s). Verifique loops infinitos no código Python.`,
          });
        }, ms);
      };

      const handleMessage = (event: MessageEvent | ErrorEvent) => {
        const messageEvent = event as MessageEvent<WorkerOutgoingMessage>;
        const data = messageEvent.data;
        if (!data || typeof data !== "object" || data.runId !== runId) {
          return;
        }

        if (data.type === "status") {
          if (data.stage === "downloading" || data.stage === "initializing") {
            armWatchdog(initTimeoutMs, true);
          } else {
            armWatchdog(timeoutMs, false);
          }
          options?.onProgress?.({
            runId: data.runId,
            stage: data.stage,
            progress: data.progress,
            message: data.message,
          });
          return;
        }

        if (data.type === "result") {
          const safeStdout = truncateUtf8Output(data.stdout ?? "");
          const safeStderr = truncateUtf8Output(data.stderr ?? "");
          const truncated =
            Boolean(data.truncated) ||
            safeStdout.truncated ||
            safeStderr.truncated;

          finish({
            runId,
            ok: Boolean(data.ok),
            timedOut: false,
            stdout: safeStdout.text,
            stderr: safeStderr.text,
            truncated,
            durationMs:
              typeof data.durationMs === "number"
                ? data.durationMs
                : Date.now() - startedAt,
            assertions: Array.isArray(data.assertions) ? data.assertions : [],
            error: data.error ?? null,
          });
        }
      };

      const handleError = (event: MessageEvent | ErrorEvent) => {
        const errorEvent = event as ErrorEvent;
        this.terminate();
        finish({
          runId,
          ok: false,
          timedOut: false,
          stdout: "",
          stderr: "",
          truncated: false,
          durationMs: Date.now() - startedAt,
          assertions: [],
          error:
            errorEvent?.message ||
            "Falha inesperada no Web Worker do Python (Pyodide).",
        });
      };

      armWatchdog(timeoutMs, false);

      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);

      worker.postMessage({
        type: "run",
        runId,
        code,
        assertions: options?.assertions ?? [],
        ...(options?.indexUrl ? { indexUrl: options.indexUrl } : {}),
      });
    });
  }
}

export function createPyodideRunner(options?: {
  workerUrl?: string;
  workerFactory?: WorkerFactory;
}): PyodideRunner {
  return new PyodideRunner(options);
}

let sharedRunner: PyodideRunner | null = null;

export async function runPythonInWorker(
  code: string,
  options?: PyodideRunOptions,
): Promise<PyodideRunResult> {
  if (!sharedRunner) {
    sharedRunner = new PyodideRunner();
  }
  return sharedRunner.run(code, options);
}
