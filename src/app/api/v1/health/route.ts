import { NextResponse } from "next/server";

export const dynamic = "force-static";

export interface HealthCheckPayload {
  status: "ok";
  service: "codit";
  version: string;
  timestamp: string;
}

export async function GET(): Promise<NextResponse<HealthCheckPayload>> {
  return NextResponse.json(
    {
      status: "ok",
      service: "codit",
      version: "0.1.3",
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
