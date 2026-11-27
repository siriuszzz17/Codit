import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProblemDetails,
  setProblemDetailsObserver,
} from "@/lib/problem-details";
import {
  getSessionTelemetryCount,
  MAX_TELEMETRY_REPORTS_PER_SESSION,
  reportClientError,
  reportProblemDetails,
  resetErrorReporterStateForTests,
  sanitizeTelemetryRoute,
  sanitizeTelemetryText,
  setErrorReporterTransportForTests,
  type SanitizedErrorPayload,
} from "@/lib/telemetry/error-reporter";

afterEach(() => {
  setProblemDetailsObserver(null);
  resetErrorReporterStateForTests();
});

describe("error-reporter (sanitized telemetry + throttle 5/session)", () => {
  it("strips emails, JWTs, bearer tokens, query secrets and local user paths (zero PII)", () => {
    const raw =
      "Falha para aluno@exemplo.com com Bearer secret_tok_123 e eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc123 em C:\\Users\\gusta\\proj?token=xyz999";
    const sanitized = sanitizeTelemetryText(raw);

    expect(sanitized).not.toContain("aluno@exemplo.com");
    expect(sanitized).not.toContain("secret_tok_123");
    expect(sanitized).not.toContain("eyJhbGci");
    expect(sanitized).not.toContain("xyz999");
    expect(sanitized).not.toContain("gusta");
    expect(sanitized).toContain("[redacted-email]");
    expect(sanitized).toContain("Bearer [redacted]");
    expect(sanitized).toContain("[redacted-jwt]");
    expect(sanitized).toContain("[redacted-path]");
  });

  it("strips query strings and hashes from routes", () => {
    expect(
      sanitizeTelemetryRoute("/projetos?token=abc&email=a@b.com#debug"),
    ).toBe("/projetos");
  });

  it("enforces strict session throttle of 5 reports and deduplicates repeats", async () => {
    const sent: SanitizedErrorPayload[] = [];
    setErrorReporterTransportForTests((payload) => {
      sent.push(payload);
    });

    // Duplicate message should only count once
    expect(
      await reportClientError(new Error("Erro repetido"), { route: "/projetos" }),
    ).toBe(true);
    expect(
      await reportClientError(new Error("Erro repetido"), { route: "/projetos" }),
    ).toBe(false);
    expect(getSessionTelemetryCount()).toBe(1);

    // Fill up to session limit (5 total)
    for (let i = 2; i <= MAX_TELEMETRY_REPORTS_PER_SESSION; i += 1) {
      expect(
        await reportClientError(new Error(`Falha distinta #${i}`), {
          route: "/projetos",
        }),
      ).toBe(true);
    }

    // 6th distinct report must be dropped
    expect(
      await reportClientError(new Error("Falha excedente #6"), {
        route: "/projetos",
      }),
    ).toBe(false);
    expect(sent).toHaveLength(MAX_TELEMETRY_REPORTS_PER_SESSION);
  });

  it("integrates with createProblemDetails for 5xx/0 errors only", async () => {
    const sent: SanitizedErrorPayload[] = [];
    setErrorReporterTransportForTests((payload) => {
      sent.push(payload);
    });

    const spy = vi.fn((problem) => {
      void reportProblemDetails(problem);
    });
    setProblemDetailsObserver(spy);

    createProblemDetails({
      type: "https://codit.app/errors/validation",
      title: "Entrada inválida",
      status: 400,
      detail: "Campo obrigatório.",
    });
    expect(spy).not.toHaveBeenCalled();

    createProblemDetails({
      type: "https://codit.app/errors/supabase-database",
      title: "Falha interna",
      status: 500,
      detail: "Erro ao consultar aluno@dominio.com",
      instance: "/projetos?token=123",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.status_code).toBe(500);
    expect(sent[0]?.route).toBe("/projetos");
    expect(sent[0]?.message).not.toContain("aluno@dominio.com");
  });
});
