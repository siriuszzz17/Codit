import { describe, expect, it } from "vitest";
import { sanitizeContext } from "@/lib/logger";

describe("sanitizeContext", () => {
  it("redacts sensitive keys including nested objects", () => {
    const sanitized = sanitizeContext({
      password: "my-secret-password",
      sessionId: "sess_abc123",
      email: "student@example.com",
      database_url: "postgresql://codit:pass@localhost:5432/codit",
      headers: {
        "x-api-key": "ai-secret-key",
        jwt: "header.payload.signature",
        safeHeader: "application/json",
      },
    });

    expect(sanitized).toEqual({
      password: "[REDACTED]",
      sessionId: "[REDACTED]",
      email: "[REDACTED]",
      database_url: "[REDACTED]",
      headers: {
        "x-api-key": "[REDACTED]",
        jwt: "[REDACTED]",
        safeHeader: "application/json",
      },
    });
  });

  it("redacts credentials embedded in URLs inside Error messages", () => {
    const error = new Error(
      "Connection failed for postgresql://user:supersecret@db.internal:5432/codit",
    );

    const sanitized = sanitizeContext({ error });

    expect(sanitized).toEqual({
      error: {
        name: "Error",
        message:
          "Connection failed for postgresql://[REDACTED]:[REDACTED]@db.internal:5432/codit",
      },
    });
  });

  it("redacts Bearer tokens inside string values", () => {
    const sanitized = sanitizeContext({
      detail: "Upstream rejected Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
    });

    expect(sanitized).toEqual({
      detail: "Upstream rejected Bearer [REDACTED]",
    });
  });
});
