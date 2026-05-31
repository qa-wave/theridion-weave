import { NextResponse } from "next/server";
import { z } from "zod";
import { maskSettings } from "@/lib/integrations";
import { loadSettings, saveSettings } from "@/lib/integrations.server";
import { logger } from "@/lib/logger";

const configSchema = z.object({
  enabled: z.boolean().optional(),
  baseUrl: z.string().max(300).optional(),
  token: z.string().max(500).optional(),
  email: z.string().max(300).optional(),
  projectKey: z.string().max(50).optional(),
  spaceKey: z.string().max(50).optional(),
  statusTransitionMap: z.string().max(2000).optional(),
});

const patchSchema = z.object({
  eyes: configSchema.optional(),
  net: configSchema.optional(),
  runner: configSchema.optional(),
  hub: configSchema.optional(),
  jira: configSchema.optional(),
  confluence: configSchema.optional(),
});

const unavailable = () =>
  NextResponse.json({ error: "Úložiště nedostupné", code: "store_unavailable" }, {
    status: 503,
    headers: { "Retry-After": "5" },
  });

export async function GET() {
  try {
    return NextResponse.json(maskSettings(await loadSettings()));
  } catch (e) {
    logger.error("GET /api/settings failed", e);
    return unavailable();
  }
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validace selhala", issues: parsed.error.flatten() }, { status: 422 });
  }
  try {
    const saved = await saveSettings(parsed.data);
    return NextResponse.json(maskSettings(saved));
  } catch (e) {
    logger.error("PUT /api/settings failed", e);
    return unavailable();
  }
}
