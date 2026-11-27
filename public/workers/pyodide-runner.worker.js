/**
 * Dedicated Web Worker for isolated Python execution via Pyodide WASM (RN-201, RN-202).
 * Loaded lazily on demand; never runs on the main UI thread.
 */

const DEFAULT_PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.4/full/";
const MAX_OUTPUT_BYTES = 16 * 1024; // 16 KB cap (RN-202)
const TRUNCATION_NOTICE = "\n[saída truncada em 16 KB por segurança]";

let pyodideInstance = null;
let pyodideLoadPromise = null;

function utf8ByteLength(value) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}

function createCappedBuffer() {
  let content = "";
  let totalBytes = 0;
  let truncated = false;

  return {
    append(chunk) {
      if (truncated) {
        return;
      }
      const line = `${String(chunk)}\n`;
      const chunkBytes = utf8ByteLength(line);
      if (totalBytes + chunkBytes <= MAX_OUTPUT_BYTES) {
        content += line;
        totalBytes += chunkBytes;
        return;
      }

      const remaining = Math.max(0, MAX_OUTPUT_BYTES - totalBytes);
      if (remaining > 0) {
        content += line.slice(0, remaining);
        totalBytes = MAX_OUTPUT_BYTES;
      }
      truncated = true;
    },
    getValue() {
      return truncated ? `${content}${TRUNCATION_NOTICE}` : content;
    },
    isTruncated() {
      return truncated;
    },
  };
}

function postStatus(runId, stage, progress, message) {
  self.postMessage({
    type: "status",
    runId,
    stage,
    progress,
    message,
  });
}

async function ensurePyodide(runId, indexUrl) {
  if (pyodideInstance) {
    return pyodideInstance;
  }

  if (!pyodideLoadPromise) {
    const resolvedIndexUrl =
      typeof indexUrl === "string" && indexUrl.startsWith("https://")
        ? indexUrl
        : DEFAULT_PYODIDE_INDEX_URL;

    pyodideLoadPromise = (async () => {
      postStatus(
        runId,
        "downloading",
        20,
        "Baixando runtime Python (Pyodide WASM)...",
      );

      if (typeof self.loadPyodide !== "function") {
        importScripts(`${resolvedIndexUrl}pyodide.js`);
      }

      postStatus(
        runId,
        "initializing",
        65,
        "Inicializando interpretador Python isolado...",
      );

      const instance = await self.loadPyodide({
        indexURL: resolvedIndexUrl,
      });

      pyodideInstance = instance;
      postStatus(runId, "ready", 100, "Runtime Python pronto.");
      return instance;
    })().catch((error) => {
      pyodideLoadPromise = null;
      throw error;
    });
  } else {
    postStatus(
      runId,
      "initializing",
      75,
      "Aguardando inicialização do runtime Python...",
    );
  }

  return pyodideLoadPromise;
}

async function runAssertions(pyodide, namespace, assertions) {
  if (!Array.isArray(assertions) || assertions.length === 0) {
    return [];
  }

  const results = [];
  for (const item of assertions) {
    const id = typeof item?.id === "string" ? item.id : `assert_${results.length + 1}`;
    const label =
      typeof item?.label === "string" && item.label.trim()
        ? item.label.trim()
        : id;
    const expression =
      typeof item?.expression === "string" ? item.expression.trim() : "";

    if (!expression) {
      results.push({
        id,
        label,
        passed: false,
        message: "Expressão de validação vazia.",
      });
      continue;
    }

    try {
      const value = await pyodide.runPythonAsync(
        `bool(eval(${JSON.stringify(expression)}, _codit_ns))`,
        { globals: namespace },
      );
      const passed = Boolean(value);
      results.push({
        id,
        label,
        passed,
        message: passed
          ? "Critério atendido."
          : `Critério não atendido: ${label}`,
      });
    } catch (error) {
      results.push({
        id,
        label,
        passed: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro ao avaliar critério de validação.",
      });
    }
  }

  return results;
}

self.addEventListener("message", async (event) => {
  const payload = event.data;
  if (!payload || typeof payload !== "object") {
    return;
  }

  const runId = typeof payload.runId === "string" ? payload.runId : "run-0";

  if (payload.type === "init") {
    try {
      await ensurePyodide(runId, payload.indexUrl);
      self.postMessage({
        type: "ready",
        runId,
      });
    } catch (error) {
      self.postMessage({
        type: "result",
        runId,
        ok: false,
        stdout: "",
        stderr: "",
        truncated: false,
        durationMs: 0,
        assertions: [],
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o Pyodide.",
      });
    }
    return;
  }

  if (payload.type !== "run") {
    return;
  }

  const code = typeof payload.code === "string" ? payload.code : "";
  const assertions = Array.isArray(payload.assertions) ? payload.assertions : [];
  const startedAt = Date.now();
  const stdoutBuffer = createCappedBuffer();
  const stderrBuffer = createCappedBuffer();

  try {
    const pyodide = await ensurePyodide(runId, payload.indexUrl);

    postStatus(runId, "running", 100, "Executando código Python...");

    pyodide.setStdout({
      batched: (chunk) => {
        stdoutBuffer.append(chunk);
      },
    });
    pyodide.setStderr({
      batched: (chunk) => {
        stderrBuffer.append(chunk);
      },
    });

    const executionGlobals = pyodide.globals.get("dict")();
    const userNamespace = pyodide.globals.get("dict")();
    executionGlobals.set("_codit_ns", userNamespace);

    let executionError = null;
    try {
      await pyodide.runPythonAsync(code, { globals: userNamespace });
    } catch (error) {
      executionError =
        error instanceof Error
          ? error.message
          : "Erro durante a execução do código Python.";
      stderrBuffer.append(executionError);
    }

    const assertionResults =
      executionError === null
        ? await runAssertions(pyodide, executionGlobals, assertions)
        : assertions.map((item, index) => ({
            id: typeof item?.id === "string" ? item.id : `assert_${index + 1}`,
            label:
              typeof item?.label === "string" && item.label.trim()
                ? item.label.trim()
                : `Critério ${index + 1}`,
            passed: false,
            message: "Execução interrompida por erro antes da validação.",
          }));

    if (typeof userNamespace.destroy === "function") {
      userNamespace.destroy();
    }
    if (typeof executionGlobals.destroy === "function") {
      executionGlobals.destroy();
    }

    const allAssertionsPassed = assertionResults.every((entry) => entry.passed);
    const ok = executionError === null && allAssertionsPassed;

    self.postMessage({
      type: "result",
      runId,
      ok,
      stdout: stdoutBuffer.getValue(),
      stderr: stderrBuffer.getValue(),
      truncated: stdoutBuffer.isTruncated() || stderrBuffer.isTruncated(),
      durationMs: Date.now() - startedAt,
      assertions: assertionResults,
      error: executionError,
    });
  } catch (error) {
    self.postMessage({
      type: "result",
      runId,
      ok: false,
      stdout: stdoutBuffer.getValue(),
      stderr: stderrBuffer.getValue(),
      truncated: stdoutBuffer.isTruncated() || stderrBuffer.isTruncated(),
      durationMs: Date.now() - startedAt,
      assertions: [],
      error:
        error instanceof Error
          ? error.message
          : "Falha ao inicializar o runtime Python.",
    });
  }
});
