import { describe, expect, it } from "vitest";
import { createProblemDetails, isProblemDetails } from "@/lib/problem-details";
import { problemResponse } from "@/lib/problem-response";

describe("problemResponse (RFC 9457)", () => {
  it("builds client-safe ProblemDetails payloads via createProblemDetails", () => {
    const problem = createProblemDetails({
      type: "https://codit.app/errors/supabase-database",
      title: "Falha ao salvar dados",
      status: 400,
      detail: "Não foi possível salvar os dados no momento.",
    });

    expect(isProblemDetails(problem)).toBe(true);
    expect(problem.traceId).toMatch(/^req_/);
  });

  it("returns application/problem+json with no-store cache and req_ traceId", async () => {
    const response = problemResponse({
      type: "https://codit.app/errors/forbidden-resource",
      title: "Acesso negado ao recurso",
      status: 403,
      detail: "Você não possui permissão para acessar este mini-projeto.",
      instance: "/api/v1/projects/0193",
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("Content-Type")).toBe(
      "application/problem+json; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.type).toBe("https://codit.app/errors/forbidden-resource");
    expect(payload.title).toBe("Acesso negado ao recurso");
    expect(payload.status).toBe(403);
    expect(payload.detail).toBe(
      "Você não possui permissão para acessar este mini-projeto.",
    );
    expect(payload.instance).toBe("/api/v1/projects/0193");
    expect(typeof payload.traceId).toBe("string");
    expect(String(payload.traceId)).toMatch(/^req_/);
  });
});
