export interface ProblemFieldError {
  field: string;
  message: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  traceId: string;
  errors?: ReadonlyArray<ProblemFieldError>;
}

export interface CreateProblemDetailsInput {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  traceId?: string;
  errors?: ReadonlyArray<ProblemFieldError>;
}

function generateTraceId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `req_${globalThis.crypto.randomUUID()}`;
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export type ProblemDetailsObserver = (problem: ProblemDetails) => void;

let problemDetailsObserver: ProblemDetailsObserver | null = null;

export function setProblemDetailsObserver(
  observer: ProblemDetailsObserver | null,
): void {
  problemDetailsObserver = observer;
}

export function createProblemDetails(
  input: CreateProblemDetailsInput,
): ProblemDetails {
  const traceId = input.traceId ?? generateTraceId();

  const problem: ProblemDetails = {
    type: input.type,
    title: input.title,
    status: input.status,
    detail: input.detail,
    ...(input.instance !== undefined ? { instance: input.instance } : {}),
    traceId,
    ...(input.errors !== undefined ? { errors: input.errors } : {}),
  };

  if (
    problemDetailsObserver &&
    (problem.status >= 500 || problem.status === 0)
  ) {
    try {
      problemDetailsObserver(problem);
    } catch {
      // Observabilidade nunca deve interromper o fluxo principal de erro.
    }
  }

  return problem;
}

export function isProblemDetails(value: unknown): value is ProblemDetails {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.type === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.status === "number" &&
    typeof candidate.detail === "string" &&
    typeof candidate.traceId === "string"
  );
}
