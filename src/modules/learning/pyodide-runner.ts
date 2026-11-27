import {
  LESSON_ASSERT_TIMEOUT_MS,
  LESSON_RUNNER_SOURCE,
  normalizeRunnerPayload,
  buildTimeoutSummary,
  type AssertRunSummary,
} from "@/modules/learning/assert-runner";
import type { LessonTestCase } from "@/modules/learning/learning-schemas";

export const PYODIDE_CDN_BASE = "https://cdn.jsdelivr.net/pyodide/v0.27.4/full/";

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

export interface RunPythonAssertionsOptions {
  timeoutMs?: number | undefined;
  onProgress?: ((progress: PyodideLoadProgress) => void) | undefined;
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

export function buildPyodideWorkerScript(cdnBase: string = PYODIDE_CDN_BASE): string {
  const safeBase = JSON.stringify(cdnBase);
  return `
var pyodideInstance = null;

function postProgress(stage, percent, label) {
  self.postMessage({ type: "progress", stage: stage, percent: percent, label: label });
}

async function ensurePyodide() {
  if (pyodideInstance) return pyodideInstance;
  postProgress("downloading", 25, "Baixando runtime Python (Pyodide)...");
  importScripts(${safeBase} + "pyodide.js");
  postProgress("initializing", 65, "Inicializando interpretador Python...");
  pyodideInstance = await loadPyodide({ indexURL: ${safeBase} });
  postProgress("ready", 100, "Python pronto.");
  return pyodideInstance;
}

self.onmessage = async function(event) {
  var msg = event.data;
  if (!msg || msg.type !== "run") return;

  var runId = msg.runId;
  var userCode = msg.userCode || "";
  var testCases = Array.isArray(msg.testCases) ? msg.testCases : [];
  var startedAt = Date.now();

  try {
    var pyodide = await ensurePyodide();
    postProgress("running", 100, "Executando testes em Python...");

    pyodide.globals.set("__codit_user_code", userCode);
    pyodide.globals.set("__codit_cases_json", JSON.stringify(testCases));

    var rawJson = await pyodide.runPythonAsync(\`
import io, json, contextlib, traceback

_stdout = io.StringIO()
_stderr = io.StringIO()
_ns = {}
_runtime_error = None
_results = []
_cases = json.loads(__codit_cases_json)

try:
    with contextlib.redirect_stdout(_stdout), contextlib.redirect_stderr(_stderr):
        exec(compile(__codit_user_code, "<codit-lesson>", "exec"), _ns)
except Exception as exc:
    _runtime_error = f"{type(exc).__name__}: {exc}"

for _tc in _cases:
    if _runtime_error is not None:
        _results.append({
            "id": _tc["id"],
            "label": _tc["label"],
            "expression": _tc["expression"],
            "passed": False,
            "expectedFormatted": json.dumps(_tc.get("expected")),
            "actualFormatted": "erro",
            "errorMessage": _runtime_error,
        })
        continue
    try:
        with contextlib.redirect_stdout(_stdout), contextlib.redirect_stderr(_stderr):
            _actual = eval(_tc["expression"], _ns)
        _expected = _tc.get("expected")
        _passed = _actual == _expected
        _results.append({
            "id": _tc["id"],
            "label": _tc["label"],
            "expression": _tc["expression"],
            "passed": bool(_passed),
            "expectedFormatted": json.dumps(_expected),
            "actualFormatted": json.dumps(_actual, default=str),
        })
    except Exception as exc:
        _results.append({
            "id": _tc["id"],
            "label": _tc["label"],
            "expression": _tc["expression"],
            "passed": False,
            "expectedFormatted": json.dumps(_tc.get("expected")),
            "actualFormatted": "erro",
            "errorMessage": f"{type(exc).__name__}: {exc}",
        })

_logs = [line for line in (_stdout.getvalue() + _stderr.getvalue()).splitlines() if line][:40]
json.dumps({
    "results": _results,
    "runtimeError": _runtime_error,
    "consoleLines": _logs,
})
\`);

    var parsed = JSON.parse(rawJson);
    self.postMessage({
      source: ${JSON.stringify(LESSON_RUNNER_SOURCE)},
      runId: runId,
      executionMs: Math.max(1, Date.now() - startedAt),
      timedOut: false,
      runtimeError: parsed.runtimeError || null,
      consoleLines: Array.isArray(parsed.consoleLines) ? parsed.consoleLines : [],
      results: Array.isArray(parsed.results) ? parsed.results : [],
    });
  } catch (err) {
    var message = err && err.message ? String(err.message) : "Falha ao executar Python no Pyodide.";
    postProgress("error", 0, message);
    self.postMessage({
      source: ${JSON.stringify(LESSON_RUNNER_SOURCE)},
      runId: runId,
      executionMs: Math.max(1, Date.now() - startedAt),
      timedOut: false,
      runtimeError: message,
      consoleLines: [],
      results: testCases.map(function(tc) {
        return {
          id: tc.id,
          label: tc.label,
          expression: tc.expression,
          passed: false,
          expectedFormatted: JSON.stringify(tc.expected),
          actualFormatted: "erro",
          errorMessage: message,
        };
      }),
    });
  }
};
`.trim();
}

let sharedWorker: Worker | null = null;
let sharedWorkerUrl: string | null = null;

function getOrCreatePyodideWorker(): Worker {
  if (sharedWorker) {
    return sharedWorker;
  }
  const script = buildPyodideWorkerScript();
  const blob = new Blob([script], { type: "application/javascript" });
  sharedWorkerUrl = URL.createObjectURL(blob);
  sharedWorker = new Worker(sharedWorkerUrl);
  return sharedWorker;
}

function resetPyodideWorker() {
  if (sharedWorker) {
    sharedWorker.terminate();
    sharedWorker = null;
  }
  if (sharedWorkerUrl) {
    URL.revokeObjectURL(sharedWorkerUrl);
    sharedWorkerUrl = null;
  }
}

/**
 * Executa testes de lição Python usando Pyodide carregado sob demanda em Web Worker dedicado.
 */
export async function runPythonLessonAssertions(
  userCode: string,
  testCases: readonly LessonTestCase[],
  options?: RunPythonAssertionsOptions,
): Promise<AssertRunSummary> {
  const runId = createPyodideRunId();
  const timeoutMs = options?.timeoutMs ?? LESSON_ASSERT_TIMEOUT_MS;

  if (
    typeof window === "undefined" ||
    typeof Worker === "undefined" ||
    typeof Blob === "undefined"
  ) {
    return buildTimeoutSummary(runId, testCases, timeoutMs);
  }

  return new Promise((resolve) => {
    const worker = getOrCreatePyodideWorker();
    let settled = false;
    let execTimer: ReturnType<typeof setTimeout> | null = null;

    const startExecTimer = () => {
      if (execTimer !== null) {
        clearTimeout(execTimer);
      }
      execTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resetPyodideWorker();
        resolve(buildTimeoutSummary(runId, testCases, timeoutMs));
      }, timeoutMs);
    };

    const cleanup = () => {
      if (execTimer !== null) {
        clearTimeout(execTimer);
      }
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
    };

    const handleMessage = (event: MessageEvent) => {
      if (settled) return;
      const data = event.data as Record<string, unknown> | null;
      if (data && data.type === "progress") {
        const stage = data.stage as PyodideLoadStage;
        options?.onProgress?.({
          stage,
          percent: typeof data.percent === "number" ? data.percent : 0,
          label: typeof data.label === "string" ? data.label : "",
        });
        if (stage === "running") {
          startExecTimer();
        }
        return;
      }

      const normalized = normalizeRunnerPayload(data, runId, testCases);
      if (!normalized) return;
      settled = true;
      cleanup();
      resolve(normalized);
    };

    const handleError = (event: ErrorEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      resetPyodideWorker();
      const message =
        event.message || "Erro no Web Worker do Pyodide.";
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
    worker.postMessage({
      type: "run",
      runId,
      userCode,
      testCases: testCases.map((tc) => ({
        id: tc.id,
        label: tc.label,
        expression: tc.expression,
        expected: tc.expected,
      })),
    });
  });
}
