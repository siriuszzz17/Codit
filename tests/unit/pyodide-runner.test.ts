import { describe, expect, it, vi } from "vitest";
import {
  createPyodideRunner,
  PYODIDE_MAX_OUTPUT_BYTES,
  PYODIDE_TIMEOUT_MS,
  truncateUtf8Output,
  type PyodideProgressEvent,
  type WorkerLike,
} from "@/modules/sandbox/pyodide-runner";

class FakeWorker implements WorkerLike {
  public terminated = false;
  public postedMessages: unknown[] = [];
  private messageListeners = new Set<(event: MessageEvent | ErrorEvent) => void>();
  private errorListeners = new Set<(event: MessageEvent | ErrorEvent) => void>();
  private readonly onPost?: (msg: unknown, worker: FakeWorker) => void;

  constructor(onPost?: (msg: unknown, worker: FakeWorker) => void) {
    this.onPost = onPost;
  }

  postMessage(message: unknown): void {
    this.postedMessages.push(message);
    this.onPost?.(message, this);
  }

  terminate(): void {
    this.terminated = true;
  }

  addEventListener(
    type: "message" | "error",
    listener: (event: MessageEvent | ErrorEvent) => void,
  ): void {
    if (type === "message") {
      this.messageListeners.add(listener);
    } else {
      this.errorListeners.add(listener);
    }
  }

  removeEventListener(
    type: "message" | "error",
    listener: (event: MessageEvent | ErrorEvent) => void,
  ): void {
    if (type === "message") {
      this.messageListeners.delete(listener);
    } else {
      this.errorListeners.delete(listener);
    }
  }

  emitMessage(data: unknown): void {
    const event = { data } as MessageEvent;
    for (const listener of this.messageListeners) {
      listener(event);
    }
  }

  emitError(message: string): void {
    const event = { message } as ErrorEvent;
    for (const listener of this.errorListeners) {
      listener(event);
    }
  }
}

describe("pyodide-runner (Web Worker + Watchdog RN-202)", () => {
  it("reports download/init progress and returns stdout + assertion results", async () => {
    const progressEvents: PyodideProgressEvent[] = [];

    const runner = createPyodideRunner({
      workerFactory: () =>
        new FakeWorker((msg, worker) => {
          const payload = msg as { runId: string; type: string };
          if (payload.type !== "run") return;

          worker.emitMessage({
            type: "status",
            runId: payload.runId,
            stage: "downloading",
            progress: 20,
            message: "Baixando runtime Python...",
          });
          worker.emitMessage({
            type: "status",
            runId: payload.runId,
            stage: "initializing",
            progress: 65,
            message: "Inicializando Pyodide...",
          });
          worker.emitMessage({
            type: "result",
            runId: payload.runId,
            ok: true,
            stdout: "Média: 9.0\n",
            stderr: "",
            truncated: false,
            durationMs: 42,
            assertions: [
              {
                id: "assert-media",
                label: "media == 9.0",
                passed: true,
                message: "Critério atendido.",
              },
            ],
            error: null,
          });
        }),
    });

    const result = await runner.run("media = 9.0\nprint(f'Média: {media}')", {
      assertions: [
        { id: "assert-media", label: "media == 9.0", expression: "media == 9.0" },
      ],
      onProgress: (ev) => progressEvents.push(ev),
    });

    expect(result.ok).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toContain("Média: 9.0");
    expect(result.assertions).toHaveLength(1);
    expect(result.assertions[0]?.passed).toBe(true);
    expect(progressEvents.map((e) => e.stage)).toEqual([
      "downloading",
      "initializing",
    ]);
  });

  it("terminates worker after 5s watchdog on infinite loop (RN-202) and respawns cleanly", async () => {
    vi.useFakeTimers();
    try {
      const workers: FakeWorker[] = [];
      const runner = createPyodideRunner({
        workerFactory: () => {
          const index = workers.length;
          const worker = new FakeWorker((msg, w) => {
            const payload = msg as { runId: string; code: string };
            if (index === 0) {
              // Simula loop infinito (while True: pass) sem resposta
              return;
            }
            w.emitMessage({
              type: "result",
              runId: payload.runId,
              ok: true,
              stdout: "ok após reinício\n",
              stderr: "",
              truncated: false,
              durationMs: 12,
              assertions: [],
              error: null,
            });
          });
          workers.push(worker);
          return worker;
        },
      });

      const hungRun = runner.run("while True:\n    pass");
      await vi.advanceTimersByTimeAsync(PYODIDE_TIMEOUT_MS);
      const hungResult = await hungRun;

      expect(hungResult.ok).toBe(false);
      expect(hungResult.timedOut).toBe(true);
      expect(hungResult.error).toContain("5s");
      expect(workers[0]?.terminated).toBe(true);

      const recoveryResult = await runner.run("print('ok após reinício')");
      expect(workers).toHaveLength(2);
      expect(recoveryResult.ok).toBe(true);
      expect(recoveryResult.stdout).toContain("ok após reinício");
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces 16 KB stdout/stderr truncation cap (RN-202)", () => {
    const oversized = "A".repeat(PYODIDE_MAX_OUTPUT_BYTES + 2048);
    const result = truncateUtf8Output(oversized);

    expect(result.truncated).toBe(true);
    expect(result.text).toContain("truncada em 16 KB");
    expect(result.text.length).toBeLessThan(oversized.length);
  });

  it("terminates and recovers when worker emits fatal error", async () => {
    const created: FakeWorker[] = [];
    const runner = createPyodideRunner({
      workerFactory: () => {
        const worker = new FakeWorker((_msg, w) => {
          w.emitError("WASM out of memory");
        });
        created.push(worker);
        return worker;
      },
    });

    const result = await runner.run("x = [0] * (10**9)");
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.error).toContain("WASM out of memory");
    expect(created[0]?.terminated).toBe(true);
  });
});
