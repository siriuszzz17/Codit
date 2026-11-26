import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAppToasts,
  dismissAppToast,
  emitAppToast,
  emitProblemToast,
  getAppToastsSnapshot,
  subscribeAppToasts,
} from "@/lib/app-toast";
import { createProblemDetails } from "@/lib/problem-details";

describe("app-toast ephemeral store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as unknown as { window?: object }).window = {};
    clearAppToasts();
  });

  afterEach(() => {
    clearAppToasts();
    delete (globalThis as unknown as { window?: object }).window;
    vi.useRealTimers();
  });

  it("emits, notifies subscribers, deduplicates rapid duplicates, and auto-dismisses", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppToasts(listener);

    const problem = createProblemDetails({
      type: "https://codit.app/errors/supabase-database",
      title: "Falha ao salvar",
      status: 500,
      detail: "Sem comunicação com o banco.",
    });

    const first = emitProblemToast(problem, { durationMs: 3000 });
    expect(first).not.toBeNull();
    expect(first?.tone).toBe("error");
    expect(first?.traceId).toBe(problem.traceId);
    expect(getAppToastsSnapshot()).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);

    const duplicate = emitProblemToast(problem, { durationMs: 3000 });
    expect(duplicate).toBeNull();
    expect(getAppToastsSnapshot()).toHaveLength(1);

    vi.advanceTimersByTime(3000);
    expect(getAppToastsSnapshot()).toHaveLength(0);

    unsubscribe();
  });

  it("allows manual dismissal", () => {
    const item = emitAppToast({
      tone: "info",
      title: "Sincronizado",
      detail: "Alterações salvas.",
      durationMs: 5000,
    });
    expect(item).not.toBeNull();
    expect(getAppToastsSnapshot()).toHaveLength(1);

    dismissAppToast(item!.id);
    expect(getAppToastsSnapshot()).toHaveLength(0);
  });
});
