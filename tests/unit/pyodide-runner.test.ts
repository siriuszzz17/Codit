import { afterEach, describe, expect, it, vi } from "vitest";
import { LESSON_RUNNER_SOURCE } from "@/modules/learning/assert-runner";
import {
  PYODIDE_EXECUTION_TIMEOUT_MS,
  PYODIDE_MAX_OUTPUT_BYTES,
  PYODIDE_SANDBOX_SOURCE,
  runPythonCode,
  runPythonLessonAssertions,
  truncateOutputToByteLimit,
  type PyodideLoadProgress,
  type PyodideWorkerLike,
} from "@/modules/sandbox/pyodide-runner";

class FakeWorker implements PyodideWorkerLike {
  terminated = false;
  postedMessages: unknown[] = [];
  private listeners: Record<
    "message" | "error",
    Set<(event: MessageEvent | ErrorEvent) => void>
  > = {
    message: new Set(),
    error: new Set(),
  };

  constructor(
    private readonly onPost?: (msg: Record<string, unknown>, worker: FakeWorker) => void,
  ) {}

  postMessage(message: unknown): void {
    this.postedMessages.push(message);
    if (this.onPost && message && typeof message === "object") {
      this.onPost(message as Record<string, unknown>, this);
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  addEventListener(
    type: "message" | "error",
    listener: (event: MessageEvent | ErrorEvent) => void,
  ): void {
    this.listeners[type].add(listener);
  }

  removeEventListener(
    type: "message" | "error",
    listener: (event: MessageEvent | ErrorEvent) => void,
  ): void {
    this.listeners[type].delete(listener);
  }

  emitMessage(data: unknown): void {
    const event = { data } as MessageEvent;
    for (const listener of this.listeners.message) {
      listener(event);
    }
  }
}

describe("pyodide-runner (Web Worker + watchdog 5s RN-202)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("terminates worker in 5s when Python code enters an infinite loop (RN-202)", async () => {
    vi.useFakeTimers();
    let createdWorker: FakeWorker | null = null;
    const stages: PyodideLoadProgress[] = [];

    const promise = runPythonCode("while True:\n    pass", {
      onProgress: (p) => stages.push(p),
      workerFactory: () => {
        createdWorker = new FakeWorker((msg, worker) => {
          worker.emitMessage({
            type: "progress",
            runId: msg.runId,
            stage: "running",
            percent: 100,
            label: "Executando código Python...",
          });
          // Simula loop infinito: nunca envia resposta final.
        });
        return createdWorker;
      },
    });

    expect(PYODIDE_EXECUTION_TIMEOUT_MS).toBe(5000);
    expect(createdWorker).not.toBeNull();
    expect(createdWorker!.terminated).toBe(false);

    await vi.advanceTimersByTimeAsync(4999);
    expect(createdWorker!.terminated).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;

    expect(createdWorker!.terminated).toBe(true);
    expect(result.timedOut).toBe(true);
    expect(result.executionMs).toBe(5000);
    expect(result.runtimeError).toContain("5s");
    expect(stages.some((s) => s.stage === "error")).toBe(true);
  });

  it("truncates stdout/stderr strictly at 16 KB max", async () => {
    const hugeStdout = "A".repeat(PYODIDE_MAX_OUTPUT_BYTES + 2048);

    const result = await runPythonCode('print("A" * 20000)', {
      workerFactory: () =>
        new FakeWorker((msg, worker) => {
          worker.emitMessage({
            source: PYODIDE_SANDBOX_SOURCE,
            runId: msg.runId,
            stdout: hugeStdout,
            stderr: "",
            truncated: false,
            executionMs: 12,
            runtimeError: null,
          });
        }),
    });

    expect(result.timedOut).toBe(false);
    expect(result.truncated).toBe(true);
    expect(new TextEncoder().encode(result.stdout).byteLength).toBeLessThanOrEqual(
      PYODIDE_MAX_OUTPUT_BYTES,
    );
  });

  it("reuses AssertRunSummary contract and emits progress stages for Python lessons", async () => {
    const progressEvents: PyodideLoadProgress[] = [];

    const summary = await runPythonLessonAssertions(
      "def dobro(n):\n    return n * 2",
      [
        {
          id: "c1",
          label: "dobro(4) == 8",
          expression: "dobro(4)",
          expected: 8,
        },
      ],
      {
        onProgress: (p) => progressEvents.push(p),
        workerFactory: () =>
          new FakeWorker((msg, worker) => {
            worker.emitMessage({
              type: "progress",
              runId: msg.runId,
              stage: "downloading",
              percent: 25,
              label: "Baixando runtime Python (Pyodide)...",
            });
            worker.emitMessage({
              type: "progress",
              runId: msg.runId,
              stage: "running",
              percent: 100,
              label: "Executando testes em Python...",
            });
            worker.emitMessage({
              source: LESSON_RUNNER_SOURCE,
              runId: msg.runId,
              executionMs: 18,
              runtimeError: null,
              consoleLines: ["ok"],
              results: [
                {
                  id: "c1",
                  label: "dobro(4) == 8",
                  expression: "dobro(4)",
                  passed: true,
                  expectedFormatted: "8",
                  actualFormatted: "8",
                },
              ],
            });
          }),
      },
    );

    expect(summary.passed).toBe(true);
    expect(summary.passedCount).toBe(1);
    expect(summary.totalCount).toBe(1);
    expect(progressEvents.map((e) => e.stage)).toEqual([
      "downloading",
      "running",
    ]);
  });

  it("truncateOutputToByteLimit respects UTF-8 byte length", () => {
    const sample = "é".repeat(10_000); // 20_000 bytes em UTF-8
    const out = truncateOutputToByteLimit(sample, 16 * 1024);
    expect(out.truncated).toBe(true);
    expect(new TextEncoder().encode(out.text).byteLength).toBeLessThanOrEqual(
      16 * 1024,
    );
  });
});
