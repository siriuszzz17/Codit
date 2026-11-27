import { describe, expect, it } from "vitest";
import {
  buildAssertIframeDocument,
  buildAssertWorkerScript,
  buildTimeoutSummary,
  LESSON_ASSERT_TIMEOUT_MS,
  LESSON_RUNNER_SOURCE,
  normalizeRunnerPayload,
} from "@/modules/learning/assert-runner";
import type { LessonTestCase } from "@/modules/learning/learning-schemas";

const SAMPLE_CASES: LessonTestCase[] = [
  {
    id: "c1",
    label: "Soma simples",
    expression: "soma(2, 3)",
    expected: 5,
  },
  {
    id: "c2",
    label: "Soma com negativos",
    expression: "soma(-1, 4)",
    expected: 3,
  },
];

describe("learning assert-runner", () => {
  it("builds an isolated worker script with self.postMessage and deepEqual", () => {
    const script = buildAssertWorkerScript(
      "function soma(a, b) { return a + b; }",
      SAMPLE_CASES,
      "run-1",
    );

    expect(script).toContain("self.postMessage");
    expect(script).toContain('"run-1"');
    expect(script).toContain(LESSON_RUNNER_SOURCE);
    expect(script).toContain("soma(2, 3)");
  });

  it("builds a sandboxed iframe document with CSP and escapes closing script tags", () => {
    const doc = buildAssertIframeDocument(
      "const x = '</script><img src=x>';",
      SAMPLE_CASES,
      "run-2",
    );

    expect(doc).toContain('http-equiv="Content-Security-Policy"');
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("<\\/script>");
    expect(doc).toContain("window.parent.postMessage");
  });

  it("produces a timeout summary marking all cases as failed after 4s", () => {
    const summary = buildTimeoutSummary(
      "run-timeout",
      SAMPLE_CASES,
      LESSON_ASSERT_TIMEOUT_MS,
    );

    expect(LESSON_ASSERT_TIMEOUT_MS).toBe(4000);
    expect(summary.timedOut).toBe(true);
    expect(summary.passed).toBe(false);
    expect(summary.passedCount).toBe(0);
    expect(summary.totalCount).toBe(2);
    expect(summary.runtimeError).toContain("Tempo limite excedido");
    expect(summary.results.every((r) => !r.passed && r.actualFormatted === "timeout")).toBe(true);
  });

  it("normalizes valid postMessage payloads and rejects mismatched runId or source", () => {
    expect(
      normalizeRunnerPayload(
        { source: "other", runId: "run-3", results: [] },
        "run-3",
        SAMPLE_CASES,
      ),
    ).toBeNull();

    expect(
      normalizeRunnerPayload(
        { source: LESSON_RUNNER_SOURCE, runId: "wrong", results: [] },
        "run-3",
        SAMPLE_CASES,
      ),
    ).toBeNull();

    const ok = normalizeRunnerPayload(
      {
        source: LESSON_RUNNER_SOURCE,
        runId: "run-3",
        executionMs: 12.6,
        runtimeError: null,
        consoleLines: ["debug 1"],
        results: [
          {
            id: "c1",
            label: "Soma simples",
            expression: "soma(2, 3)",
            passed: true,
            expectedFormatted: "5",
            actualFormatted: "5",
          },
          {
            id: "c2",
            label: "Soma com negativos",
            expression: "soma(-1, 4)",
            passed: true,
            expectedFormatted: "3",
            actualFormatted: "3",
          },
        ],
      },
      "run-3",
      SAMPLE_CASES,
    );

    expect(ok).not.toBeNull();
    expect(ok?.passed).toBe(true);
    expect(ok?.passedCount).toBe(2);
    expect(ok?.totalCount).toBe(2);
    expect(ok?.executionMs).toBe(13);
    expect(ok?.consoleLines).toEqual(["debug 1"]);
  });

  it("executes generated worker harness accurately via Function for green and red cases", () => {
    const messages: unknown[] = [];
    const userCode = "function soma(a, b) { console.log('run', a, b); return a + b; }";
    const harness = buildAssertWorkerScript(userCode, SAMPLE_CASES, "run-eval");

    const runner = new Function("self", harness);
    runner({ postMessage: (msg: unknown) => messages.push(msg) });

    expect(messages).toHaveLength(1);
    const normalized = normalizeRunnerPayload(messages[0], "run-eval", SAMPLE_CASES);
    expect(normalized?.passed).toBe(true);
    expect(normalized?.passedCount).toBe(2);
    expect(normalized?.consoleLines).toContain("run 2 3");

    const brokenMessages: unknown[] = [];
    const brokenHarness = buildAssertWorkerScript(
      "function soma(a, b) { return a - b; }",
      SAMPLE_CASES,
      "run-fail",
    );
    new Function("self", brokenHarness)({
      postMessage: (msg: unknown) => brokenMessages.push(msg),
    });
    const failed = normalizeRunnerPayload(
      brokenMessages[0],
      "run-fail",
      SAMPLE_CASES,
    );
    expect(failed?.passed).toBe(false);
    expect(failed?.passedCount).toBe(0);
    expect(failed?.results[0]?.actualFormatted).toBe("-1");
  });
});
