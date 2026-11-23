import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/health/route";

describe("GET /api/v1/health", () => {
  it("returns 200 ok with no-store cache control and valid ISO timestamp", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = (await response.json()) as {
      status: string;
      service: string;
      version: string;
      timestamp: string;
    };

    expect(body.status).toBe("ok");
    expect(body.service).toBe("codit");
    expect(body.version).toBe("0.1.4");
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
