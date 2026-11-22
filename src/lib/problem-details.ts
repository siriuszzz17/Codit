import { NextResponse } from "next/server";

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

export function createProblemDetails(
  input: CreateProblemDetailsInput,
): ProblemDetails {
  const traceId = input.traceId ?? `req_${crypto.randomUUID()}`;

  return {
    type: input.type,
    title: input.title,
    status: input.status,
    detail: input.detail,
    ...(input.instance !== undefined ? { instance: input.instance } : {}),
    traceId,
    ...(input.errors !== undefined ? { errors: input.errors } : {}),
  };
}

export function problemResponse(
  input: CreateProblemDetailsInput,
): NextResponse<ProblemDetails> {
  const body = createProblemDetails(input);

  return NextResponse.json(body, {
    status: body.status,
    headers: {
      "Content-Type": "application/problem+json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
