/**
 * Codit — Dedicated Pyodide Web Worker (RN-202)
 * Carrega Pyodide sob demanda (nunca na main thread), captura stdout/stderr
 * com limite de 16 KB e suporta modo sandbox ("exec") e asserts de lição ("run").
 */

var PYODIDE_CDN_BASE = "https://cdn.jsdelivr.net/pyodide/v0.27.4/full/";
var MAX_OUTPUT_BYTES = 16 * 1024;
var LESSON_RUNNER_SOURCE = "codit-lesson-runner";
var SANDBOX_RUNNER_SOURCE = "codit-pyodide-sandbox";

var pyodideInstance = null;

function postProgress(runId, stage, percent, label) {
  self.postMessage({
    type: "progress",
    runId: runId,
    stage: stage,
    percent: percent,
    label: label,
  });
}

function truncateUtf8(text, maxBytes) {
  var value = typeof text === "string" ? text : "";
  if (typeof TextEncoder !== "undefined") {
    var encoder = new TextEncoder();
    var bytes = encoder.encode(value);
    if (bytes.byteLength <= maxBytes) {
      return { text: value, truncated: false };
    }
    var decoder = new TextDecoder("utf-8", { fatal: false });
    return {
      text: decoder.decode(bytes.slice(0, maxBytes)),
      truncated: true,
    };
  }
  if (value.length <= maxBytes) {
    return { text: value, truncated: false };
  }
  return { text: value.slice(0, maxBytes), truncated: true };
}

async function ensurePyodide(runId, cdnBase) {
  if (pyodideInstance) {
    return pyodideInstance;
  }
  var base = typeof cdnBase === "string" && cdnBase ? cdnBase : PYODIDE_CDN_BASE;
  postProgress(runId, "downloading", 25, "Baixando runtime Python (Pyodide)...");
  importScripts(base + "pyodide.js");
  postProgress(runId, "initializing", 65, "Inicializando interpretador Python (WASM)...");
  pyodideInstance = await loadPyodide({ indexURL: base });
  postProgress(runId, "ready", 100, "Python pronto.");
  return pyodideInstance;
}

async function handleExecMessage(msg) {
  var runId = msg.runId;
  var code = typeof msg.code === "string" ? msg.code : "";
  var startedAt = Date.now();

  try {
    var pyodide = await ensurePyodide(runId, msg.cdnBase);
    postProgress(runId, "running", 100, "Executando código Python...");

    pyodide.globals.set("__codit_exec_code", code);
    pyodide.globals.set("__codit_max_bytes", MAX_OUTPUT_BYTES);

    var rawJson = await pyodide.runPythonAsync(`
import io, json, contextlib, traceback

class _CappedIO(io.StringIO):
    def __init__(self, max_bytes):
        super().__init__()
        self._max_bytes = max_bytes
        self._bytes = 0
        self.truncated = False

    def write(self, s):
        if not isinstance(s, str):
            s = str(s)
        encoded = s.encode("utf-8", errors="replace")
        remaining = self._max_bytes - self._bytes
        if remaining <= 0:
            self.truncated = True
            return len(s)
        if len(encoded) > remaining:
            self.truncated = True
            chunk = encoded[:remaining].decode("utf-8", errors="ignore")
            self._bytes = self._max_bytes
            super().write(chunk)
            return len(s)
        self._bytes += len(encoded)
        return super().write(s)

_stdout = _CappedIO(int(__codit_max_bytes))
_stderr = _CappedIO(int(__codit_max_bytes))
_ns = {"__name__": "__main__"}
_runtime_error = None

try:
    with contextlib.redirect_stdout(_stdout), contextlib.redirect_stderr(_stderr):
        exec(compile(__codit_exec_code, "<codit-sandbox>", "exec"), _ns)
except Exception as exc:
    _runtime_error = f"{type(exc).__name__}: {exc}"
    _stderr.write(traceback.format_exc())

json.dumps({
    "stdout": _stdout.getvalue(),
    "stderr": _stderr.getvalue(),
    "truncated": bool(_stdout.truncated or _stderr.truncated),
    "runtimeError": _runtime_error,
})
`);

    var parsed = JSON.parse(rawJson);
    var outCap = truncateUtf8(parsed.stdout || "", MAX_OUTPUT_BYTES);
    var errCap = truncateUtf8(parsed.stderr || "", MAX_OUTPUT_BYTES);

    self.postMessage({
      source: SANDBOX_RUNNER_SOURCE,
      runId: runId,
      stdout: outCap.text,
      stderr: errCap.text,
      truncated: Boolean(parsed.truncated || outCap.truncated || errCap.truncated),
      executionMs: Math.max(1, Date.now() - startedAt),
      timedOut: false,
      runtimeError: parsed.runtimeError || null,
    });
  } catch (err) {
    var message =
      err && err.message
        ? String(err.message)
        : "Falha ao executar código Python no Pyodide.";
    postProgress(runId, "error", 0, message);
    self.postMessage({
      source: SANDBOX_RUNNER_SOURCE,
      runId: runId,
      stdout: "",
      stderr: message,
      truncated: false,
      executionMs: Math.max(1, Date.now() - startedAt),
      timedOut: false,
      runtimeError: message,
    });
  }
}

async function handleLessonRunMessage(msg) {
  var runId = msg.runId;
  var userCode = typeof msg.userCode === "string" ? msg.userCode : "";
  var testCases = Array.isArray(msg.testCases) ? msg.testCases : [];
  var startedAt = Date.now();

  try {
    var pyodide = await ensurePyodide(runId, msg.cdnBase);
    postProgress(runId, "running", 100, "Executando testes em Python...");

    pyodide.globals.set("__codit_user_code", userCode);
    pyodide.globals.set("__codit_cases_json", JSON.stringify(testCases));
    pyodide.globals.set("__codit_max_bytes", MAX_OUTPUT_BYTES);

    var rawJson = await pyodide.runPythonAsync(`
import io, json, contextlib

class _CappedIO(io.StringIO):
    def __init__(self, max_bytes):
        super().__init__()
        self._max_bytes = max_bytes
        self._bytes = 0
        self.truncated = False

    def write(self, s):
        if not isinstance(s, str):
            s = str(s)
        encoded = s.encode("utf-8", errors="replace")
        remaining = self._max_bytes - self._bytes
        if remaining <= 0:
            self.truncated = True
            return len(s)
        if len(encoded) > remaining:
            self.truncated = True
            chunk = encoded[:remaining].decode("utf-8", errors="ignore")
            self._bytes = self._max_bytes
            super().write(chunk)
            return len(s)
        self._bytes += len(encoded)
        return super().write(s)

_stdout = _CappedIO(int(__codit_max_bytes))
_stderr = _CappedIO(int(__codit_max_bytes))
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
        if (
            isinstance(_actual, (int, float))
            and not isinstance(_actual, bool)
            and isinstance(_expected, (int, float))
            and not isinstance(_expected, bool)
        ):
            _passed = abs(float(_actual) - float(_expected)) <= 1e-9
        else:
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

_combined = _stdout.getvalue() + _stderr.getvalue()
_logs = [line for line in _combined.splitlines() if line][:40]
if _stdout.truncated or _stderr.truncated:
    _logs.append("[aviso] Saída truncada no limite de 16 KB.")

json.dumps({
    "results": _results,
    "runtimeError": _runtime_error,
    "consoleLines": _logs,
})
`);

    var parsed = JSON.parse(rawJson);
    self.postMessage({
      source: LESSON_RUNNER_SOURCE,
      runId: runId,
      executionMs: Math.max(1, Date.now() - startedAt),
      timedOut: false,
      runtimeError: parsed.runtimeError || null,
      consoleLines: Array.isArray(parsed.consoleLines) ? parsed.consoleLines : [],
      results: Array.isArray(parsed.results) ? parsed.results : [],
    });
  } catch (err) {
    var message =
      err && err.message
        ? String(err.message)
        : "Falha ao executar Python no Pyodide.";
    postProgress(runId, "error", 0, message);
    self.postMessage({
      source: LESSON_RUNNER_SOURCE,
      runId: runId,
      executionMs: Math.max(1, Date.now() - startedAt),
      timedOut: false,
      runtimeError: message,
      consoleLines: [],
      results: testCases.map(function (tc) {
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
}

self.onmessage = function (event) {
  var msg = event && event.data;
  if (!msg || typeof msg !== "object") {
    return;
  }
  if (msg.type === "exec") {
    void handleExecMessage(msg);
    return;
  }
  if (msg.type === "run") {
    void handleLessonRunMessage(msg);
  }
};
