import { NextResponse } from "next/server";
import {
  createProblemDetails,
  type CreateProblemDetailsInput,
  type ProblemDetails,
} from "@/lib/problem-details";

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
