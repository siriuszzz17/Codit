import type { ProblemDetails } from "@/lib/problem-details";

export type AppToastTone = "error" | "warning" | "info" | "success";

export interface AppToastItem {
  id: string;
  tone: AppToastTone;
  title: string;
  detail: string;
  traceId?: string;
  createdAt: number;
  durationMs: number;
}

export interface EmitAppToastInput {
  tone?: AppToastTone;
  title: string;
  detail: string;
  traceId?: string;
  durationMs?: number;
}

type AppToastListener = () => void;

const MAX_VISIBLE_APP_TOASTS = 4;
const DEDUPE_WINDOW_MS = 3500;
const DEFAULT_ERROR_DURATION_MS = 6500;
const DEFAULT_INFO_DURATION_MS = 4500;

let toastsSnapshot: readonly AppToastItem[] = [];
const listeners = new Set<AppToastListener>();
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();
const recentFingerprints = new Map<string, number>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function createToastId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `toast_${globalThis.crypto.randomUUID()}`;
  }
  return `toast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getAppToastsSnapshot(): readonly AppToastItem[] {
  return toastsSnapshot;
}

export function subscribeAppToasts(listener: AppToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissAppToast(id: string): void {
  const timer = dismissTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    dismissTimers.delete(id);
  }

  const next = toastsSnapshot.filter((toast) => toast.id !== id);
  if (next.length !== toastsSnapshot.length) {
    toastsSnapshot = next;
    notifyListeners();
  }
}

export function clearAppToasts(): void {
  for (const timer of dismissTimers.values()) {
    clearTimeout(timer);
  }
  dismissTimers.clear();
  recentFingerprints.clear();
  if (toastsSnapshot.length > 0) {
    toastsSnapshot = [];
    notifyListeners();
  }
}

export function emitAppToast(input: EmitAppToastInput): AppToastItem | null {
  if (typeof window === "undefined") {
    return null;
  }

  const tone: AppToastTone = input.tone ?? "info";
  const title = input.title.trim();
  const detail = input.detail.trim();
  if (!title && !detail) {
    return null;
  }

  const now = Date.now();
  const fingerprint = `${tone}::${title}::${detail}`;
  const lastSeen = recentFingerprints.get(fingerprint);
  if (lastSeen !== undefined && now - lastSeen < DEDUPE_WINDOW_MS) {
    return null;
  }
  recentFingerprints.set(fingerprint, now);

  const durationMs =
    input.durationMs ??
    (tone === "error" || tone === "warning"
      ? DEFAULT_ERROR_DURATION_MS
      : DEFAULT_INFO_DURATION_MS);

  const item: AppToastItem = {
    id: createToastId(),
    tone,
    title: title || "Aviso",
    detail,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    createdAt: now,
    durationMs,
  };

  const next = [item, ...toastsSnapshot];
  if (next.length > MAX_VISIBLE_APP_TOASTS) {
    const removed = next.splice(MAX_VISIBLE_APP_TOASTS);
    for (const stale of removed) {
      const staleTimer = dismissTimers.get(stale.id);
      if (staleTimer !== undefined) {
        clearTimeout(staleTimer);
        dismissTimers.delete(stale.id);
      }
    }
  }

  toastsSnapshot = next;
  notifyListeners();

  if (durationMs > 0) {
    const timer = setTimeout(() => {
      dismissAppToast(item.id);
    }, durationMs);
    dismissTimers.set(item.id, timer);
  }

  return item;
}

export function emitProblemToast(
  problem: ProblemDetails,
  options?: { durationMs?: number },
): AppToastItem | null {
  return emitAppToast({
    tone: problem.status >= 500 || problem.status === 0 ? "error" : "warning",
    title: problem.title,
    detail: problem.detail,
    traceId: problem.traceId,
    durationMs: options?.durationMs,
  });
}
