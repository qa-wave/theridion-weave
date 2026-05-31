import { NextResponse } from "next/server";
import { isDurable } from "@/data/store";

export const dynamic = "force-dynamic";

// Liveness/observability probe. Never throws — used by post-deploy smoke tests.
export async function GET() {
  return NextResponse.json({
    status: "ok",
    storage: isDurable() ? "durable" : "demo",
    time: new Date().toISOString(),
  });
}
