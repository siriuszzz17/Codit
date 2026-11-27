import { describe, expect, it } from "vitest";
import { createProblemDetails, isProblemDetails } from "@/lib/problem-details";
import { buildPyodideWorkerScript } from "@/modules/learning/pyodide-runner";

describe("Phase 4 — Pyodide Worker & Observability", () => {
  it("builds Pyodide worker script with CDN importScripts and progress stages", () => {
    const script = buildPyodideWorkerScript("https://cdn.example.com/pyodide/");
    expect(script).toContain("importScripts");
    expect(script).toContain("https://cdn.example.com/pyodide/");
    expect(script).toContain("loadPyodide");
    expect(script).toContain("downloading");
    expect(script).toContain("initializing");
  });

  it("creates valid RFC 9457 ProblemDetails with traceId", () => {
    const problem = createProblemDetails({
      type: "https://codit.dev/problems/internal",
      title: "Erro interno",
      status: 500,
      detail: "Falha ao processar requisição.",
    });
    expect(isProblemDetails(problem)).toBe(true);
    expect(problem.traceId).toMatch(/^req_/);
  });
});
