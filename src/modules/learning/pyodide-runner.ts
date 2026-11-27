import {
  PYODIDE_CDN_BASE,
  PYODIDE_EXECUTION_TIMEOUT_MS,
  runPythonLessonAssertions,
  resetPyodideWorker,
  type PyodideLoadProgress,
  type PyodideLoadStage,
  type RunPythonOptions,
} from "@/modules/sandbox/pyodide-runner";

export {
  PYODIDE_CDN_BASE,
  PYODIDE_EXECUTION_TIMEOUT_MS,
  runPythonLessonAssertions,
  resetPyodideWorker,
};
export type { PyodideLoadProgress, PyodideLoadStage };
export type RunPythonAssertionsOptions = RunPythonOptions;

/**
 * Mantido para compatibilidade com testes de contrato do worker script.
 * Em runtime, o carregamento usa o worker dedicado em /workers/pyodide-runner.worker.js.
 */
export function buildPyodideWorkerScript(
  cdnBase: string = PYODIDE_CDN_BASE,
): string {
  const safeBase = JSON.stringify(cdnBase);
  return `
var PYODIDE_CDN_BASE = ${safeBase};
async function ensurePyodide() {
  self.postMessage({ type: "progress", stage: "downloading", percent: 25, label: "Baixando runtime Python (Pyodide)..." });
  importScripts(PYODIDE_CDN_BASE + "pyodide.js");
  self.postMessage({ type: "progress", stage: "initializing", percent: 65, label: "Inicializando interpretador Python..." });
  return await loadPyodide({ indexURL: PYODIDE_CDN_BASE });
}
`.trim();
}
