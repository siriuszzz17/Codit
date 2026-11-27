import { SANDBOX_EXECUTION_TIMEOUT_MS } from "@/modules/sandbox/sandbox-runner";
import type { LessonTestCase } from "@/modules/learning/learning-schemas";

export const LESSON_RUNNER_SOURCE = "codit-lesson-runner";
export const LESSON_ASSERT_TIMEOUT_MS = SANDBOX_EXECUTION_TIMEOUT_MS;

export interface AssertCaseResult {
  id: string;
  label: string;
  expression: string;
  passed: boolean;
  expectedFormatted: string;
  actualFormatted: string;
  errorMessage?: string;
}

export interface AssertRunSummary {
  runId: string;
  passed: boolean;
  passedCount: number;
  totalCount: number;
  executionMs: number;
  timedOut: boolean;
  runtimeError: string | null;
  consoleLines: string[];
  results: AssertCaseResult[];
}

function escapeScriptCloseTag(source: string): string {
  return source.replace(/<\/(script)/gi, "<\\/$1");
}

function createRunId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `run_${globalThis.crypto.randomUUID()}`;
  }
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Monta o script de avaliação isolado usado dentro do Web Worker ou do iframe sandboxed.
 * Usa comparação estrutural profunda determinística (JSON-safe + NaN/Object/Array)
 * e executa sem eval()/new Function() para compatibilidade estrita com CSP sem 'unsafe-eval'.
 */
export function buildAssertHarnessCode(
  userCode: string,
  testCases: readonly LessonTestCase[],
  runId: string,
  postExpr: string,
): string {
  const serializedRunId = JSON.stringify(runId);
  const serializedCases = JSON.stringify(
    testCases.map((tc) => ({
      id: tc.id,
      label: tc.label,
      expression: tc.expression,
      expected: tc.expected,
    })),
  );

  const caseEvaluators = testCases
    .map((tc) => {
      const id = JSON.stringify(tc.id);
      const label = JSON.stringify(tc.label);
      const exprText = JSON.stringify(tc.expression);
      const expected = JSON.stringify(tc.expected);
      return `      (function() {
        var __expected = ${expected};
        try {
          var __actual = (${tc.expression});
          var __ok = __coditDeepEqual(__actual, __expected);
          return {
            id: ${id},
            label: ${label},
            expression: ${exprText},
            passed: __ok,
            expectedFormatted: __coditFormatValue(__expected),
            actualFormatted: __coditFormatValue(__actual)
          };
        } catch (err) {
          return {
            id: ${id},
            label: ${label},
            expression: ${exprText},
            passed: false,
            expectedFormatted: __coditFormatValue(__expected),
            actualFormatted: "erro",
            errorMessage: err && err.message ? String(err.message) : String(err)
          };
        }
      })()`;
    })
    .join(",\n");

  return `
(function() {
  var RUN_ID = ${serializedRunId};
  var CASES = ${serializedCases};
  var consoleLines = [];
  var MAX_LOGS = 40;

  function formatValue(val) {
    if (typeof val === "string") return JSON.stringify(val);
    if (typeof val === "undefined") return "undefined";
    if (typeof val === "number" && Number.isNaN(val)) return "NaN";
    try {
      return JSON.stringify(val);
    } catch (_) {
      return String(val);
    }
  }

  function deepEqual(a, b) {
    if (Object.is(a, b)) return true;
    if (
      typeof a === "number" &&
      typeof b === "number" &&
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      Math.abs(a - b) <= 1e-9
    ) {
      return true;
    }
    if (typeof a !== typeof b || a === null || b === null) return false;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (var i = 0; i < a.length; i += 1) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    if (typeof a === "object") {
      var keysA = Object.keys(a);
      var keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      for (var j = 0; j < keysA.length; j += 1) {
        var k = keysA[j];
        if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
        if (!deepEqual(a[k], b[k])) return false;
      }
      return true;
    }
    return false;
  }

  var safeConsole = {
    log: function() {
      if (consoleLines.length >= MAX_LOGS) return;
      var parts = [];
      for (var i = 0; i < arguments.length; i += 1) {
        parts.push(typeof arguments[i] === "string" ? arguments[i] : formatValue(arguments[i]));
      }
      consoleLines.push(parts.join(" "));
    },
    warn: function() {
      if (consoleLines.length >= MAX_LOGS) return;
      var parts = [];
      for (var i = 0; i < arguments.length; i += 1) {
        parts.push(typeof arguments[i] === "string" ? arguments[i] : formatValue(arguments[i]));
      }
      consoleLines.push("[aviso] " + parts.join(" "));
    },
    error: function() {
      if (consoleLines.length >= MAX_LOGS) return;
      var parts = [];
      for (var i = 0; i < arguments.length; i += 1) {
        parts.push(typeof arguments[i] === "string" ? arguments[i] : formatValue(arguments[i]));
      }
      consoleLines.push("[erro] " + parts.join(" "));
    }
  };

  var start = Date.now();
  var results = [];
  var runtimeError = null;

  try {
    var evaluated = (function(console, __coditDeepEqual, __coditFormatValue) {
${userCode}
      return [
${caseEvaluators}
      ];
    })(safeConsole, deepEqual, formatValue);

    if (Array.isArray(evaluated)) {
      results = evaluated;
    } else {
      runtimeError = "O código retornou antes da avaliação dos casos de teste.";
      results = CASES.map(function(tc) {
        return {
          id: tc.id,
          label: tc.label,
          expression: tc.expression,
          passed: false,
          expectedFormatted: formatValue(tc.expected),
          actualFormatted: "não executado",
          errorMessage: runtimeError
        };
      });
    }
  } catch (err) {
    runtimeError = err && err.message ? String(err.message) : String(err);
    results = CASES.map(function(tc) {
      return {
        id: tc.id,
        label: tc.label,
        expression: tc.expression,
        passed: false,
        expectedFormatted: formatValue(tc.expected),
        actualFormatted: "não executado",
        errorMessage: runtimeError
      };
    });
  }

  var executionMs = Math.max(0, Date.now() - start);
  ${postExpr}({
    source: ${JSON.stringify(LESSON_RUNNER_SOURCE)},
    runId: RUN_ID,
    executionMs: executionMs,
    runtimeError: runtimeError,
    consoleLines: consoleLines,
    results: results
  });
})();
`.trim();
}

export function buildAssertWorkerScript(
  userCode: string,
  testCases: readonly LessonTestCase[],
  runId: string,
): string {
  return buildAssertHarnessCode(userCode, testCases, runId, "self.postMessage");
}

export function buildAssertIframeDocument(
  userCode: string,
  testCases: readonly LessonTestCase[],
  runId: string,
): string {
  const harness = escapeScriptCloseTag(
    buildAssertHarnessCode(
      userCode,
      testCases,
      runId,
      '(function(p){ if (window.parent && window.parent !== window) window.parent.postMessage(p, "*"); })',
    ),
  );

  const serializedRunId = JSON.stringify(runId);
  const serializedCases = escapeScriptCloseTag(
    JSON.stringify(
      testCases.map((tc) => ({
        id: tc.id,
        label: tc.label,
        expression: tc.expression,
        expected: tc.expected,
      })),
    ),
  );

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline';" />
  </head>
  <body>
    <script>
      window.addEventListener("error", function(ev) {
        var msg = ev && ev.message ? String(ev.message) : "Erro de sintaxe ao executar o código.";
        var cases = ${serializedCases};
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            source: ${JSON.stringify(LESSON_RUNNER_SOURCE)},
            runId: ${serializedRunId},
            executionMs: 0,
            runtimeError: msg,
            consoleLines: [],
            results: cases.map(function(tc) {
              return {
                id: tc.id,
                label: tc.label,
                expression: tc.expression,
                passed: false,
                expectedFormatted: JSON.stringify(tc.expected),
                actualFormatted: "não executado",
                errorMessage: msg
              };
            })
          }, "*");
        }
      });
    </script>
    <script>
${harness}
    </script>
  </body>
</html>`;
}

export function buildTimeoutSummary(
  runId: string,
  testCases: readonly LessonTestCase[],
  timeoutMs: number,
): AssertRunSummary {
  const message = `Tempo limite excedido (${Math.round(timeoutMs / 1000)}s). Verifique possíveis loops infinitos no seu código.`;
  return {
    runId,
    passed: false,
    passedCount: 0,
    totalCount: testCases.length,
    executionMs: timeoutMs,
    timedOut: true,
    runtimeError: message,
    consoleLines: [],
    results: testCases.map((tc) => ({
      id: tc.id,
      label: tc.label,
      expression: tc.expression,
      passed: false,
      expectedFormatted: JSON.stringify(tc.expected),
      actualFormatted: "timeout",
      errorMessage: message,
    })),
  };
}

export function normalizeRunnerPayload(
  raw: unknown,
  expectedRunId: string,
  testCases: readonly LessonTestCase[],
): AssertRunSummary | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const payload = raw as Record<string, unknown>;
  if (
    payload.source !== LESSON_RUNNER_SOURCE ||
    payload.runId !== expectedRunId
  ) {
    return null;
  }

  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  const results: AssertCaseResult[] = rawResults
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item, idx) => {
      const fallback = testCases[idx];
      return {
        id: typeof item.id === "string" ? item.id : (fallback?.id ?? `c${idx + 1}`),
        label: typeof item.label === "string" ? item.label : (fallback?.label ?? `Caso ${idx + 1}`),
        expression:
          typeof item.expression === "string"
            ? item.expression
            : (fallback?.expression ?? ""),
        passed: Boolean(item.passed),
        expectedFormatted:
          typeof item.expectedFormatted === "string" ? item.expectedFormatted : "",
        actualFormatted:
          typeof item.actualFormatted === "string" ? item.actualFormatted : "",
        ...(typeof item.errorMessage === "string" && item.errorMessage
          ? { errorMessage: item.errorMessage }
          : {}),
      };
    });

  const passedCount = results.filter((item) => item.passed).length;
  const totalCount = testCases.length;
  const runtimeError =
    typeof payload.runtimeError === "string" && payload.runtimeError.trim()
      ? payload.runtimeError
      : null;

  return {
    runId: expectedRunId,
    passed: runtimeError === null && totalCount > 0 && passedCount === totalCount,
    passedCount,
    totalCount,
    executionMs:
      typeof payload.executionMs === "number" && Number.isFinite(payload.executionMs)
        ? Math.max(0, Math.round(payload.executionMs))
        : 0,
    timedOut: false,
    runtimeError,
    consoleLines: Array.isArray(payload.consoleLines)
      ? payload.consoleLines.filter((line): line is string => typeof line === "string")
      : [],
    results,
  };
}

function runWithWebWorker(
  userCode: string,
  testCases: readonly LessonTestCase[],
  runId: string,
  timeoutMs: number,
): Promise<AssertRunSummary> {
  return new Promise((resolve) => {
    const workerScript = buildAssertWorkerScript(userCode, testCases, runId);
    const blob = new Blob([workerScript], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(blobUrl);

    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(blobUrl);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(buildTimeoutSummary(runId, testCases, timeoutMs));
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent) => {
      if (settled) return;
      const normalized = normalizeRunnerPayload(event.data, runId, testCases);
      if (!normalized) return;
      settled = true;
      cleanup();
      resolve(normalized);
    };

    worker.onerror = (event: ErrorEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      const message = event.message || "Erro inesperado ao executar o código.";
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
  });
}

function runWithSandboxedIframe(
  userCode: string,
  testCases: readonly LessonTestCase[],
  runId: string,
  timeoutMs: number,
): Promise<AssertRunSummary> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.display = "none";

    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", handleMessage);
      iframe.remove();
    };

    const handleMessage = (event: MessageEvent) => {
      if (settled) return;
      const normalized = normalizeRunnerPayload(event.data, runId, testCases);
      if (!normalized) return;
      settled = true;
      cleanup();
      resolve(normalized);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(buildTimeoutSummary(runId, testCases, timeoutMs));
    }, timeoutMs);

    window.addEventListener("message", handleMessage);
    iframe.srcdoc = buildAssertIframeDocument(userCode, testCases, runId);
    document.body.appendChild(iframe);
  });
}

/**
 * Executa os casos de teste de uma lição JavaScript com isolamento e timeout (4s).
 * Prioriza Web Worker isolado (permite encerrar loops infinitos via worker.terminate())
 * com fallback automático para iframe sandboxed via postMessage.
 */
export async function runLessonAssertions(
  userCode: string,
  testCases: readonly LessonTestCase[],
  timeoutMs: number = LESSON_ASSERT_TIMEOUT_MS,
): Promise<AssertRunSummary> {
  const runId = createRunId();

  if (typeof window === "undefined") {
    return buildTimeoutSummary(runId, testCases, timeoutMs);
  }

  if (
    typeof Worker !== "undefined" &&
    typeof Blob !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  ) {
    try {
      return await runWithWebWorker(userCode, testCases, runId, timeoutMs);
    } catch {
      // Fallback para iframe sandboxed caso Blob Worker seja bloqueado pelo ambiente
    }
  }

  return runWithSandboxedIframe(userCode, testCases, runId, timeoutMs);
}
