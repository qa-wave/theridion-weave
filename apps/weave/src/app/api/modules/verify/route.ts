// POST /api/modules/verify — validate that a filesystem path contains the expected
// Theridion local module.  Server-only (uses fs); never reads secrets.
import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { logger } from "@/lib/logger";
import type { IntegrationKey } from "@/lib/integrations";
import { isLocalModule } from "@/lib/integrations";

export const runtime = "nodejs";

const bodySchema = z.object({
  key: z.enum(["eyes", "net", "runner"]),
  path: z.string().min(1).max(1000),
});

/** Marker files/dirs that signal a valid Theridion module installation. */
const MODULE_MARKERS: Record<"eyes" | "net" | "runner", string[]> = {
  eyes: ["CLAUDE.md", "package.json", "apps"],
  net: ["CLAUDE.md", "package.json", "apps"],
  runner: ["CLAUDE.md", "pyproject.toml", "theridion_runner"],
};

/**
 * Quick structural check: does the directory look like the expected Theridion
 * module?  We require the directory to exist AND at least one of the module-
 * specific marker files/dirs to be present.
 */
function detectModule(
  modulePath: string,
  key: "eyes" | "net" | "runner",
): { ok: boolean; detail: string } {
  try {
    const stat = fs.statSync(modulePath);
    if (!stat.isDirectory()) {
      return { ok: false, detail: "Cesta není adresář." };
    }
  } catch {
    return { ok: false, detail: "Adresář neexistuje nebo k němu nemáte přístup." };
  }

  const markers = MODULE_MARKERS[key];
  const found = markers.filter((m) => {
    try {
      fs.accessSync(path.join(modulePath, m));
      return true;
    } catch {
      return false;
    }
  });

  if (found.length === 0) {
    return {
      ok: false,
      detail: `Adresář neobsahuje žádný rozpoznatelný marker Theridion modulu (hledám: ${markers.join(", ")}).`,
    };
  }

  // If a CLAUDE.md is present, check Name field for extra confirmation (best-effort).
  const claudeMd = path.join(modulePath, "CLAUDE.md");
  try {
    const content = fs.readFileSync(claudeMd, "utf-8");
    const expectedName = `theridion-${key}`;
    if (!content.toLowerCase().includes(expectedName)) {
      return {
        ok: false,
        detail: `CLAUDE.md nenashl žádnou zmínku o "${expectedName}". Zkontrolujte, zda cesta ukazuje na správný modul.`,
      };
    }
  } catch {
    // CLAUDE.md not readable — already confirmed presence above; proceed.
  }

  return { ok: true, detail: `Modul theridion-${key} nalezen v: ${modulePath}` };
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validace selhala", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { key, path: modulePath } = parsed.data;

  // Double-check: only local modules may be verified via this endpoint.
  if (!isLocalModule(key as IntegrationKey)) {
    return NextResponse.json({ error: "Tato integrace není lokální modul." }, { status: 400 });
  }

  try {
    const result = detectModule(modulePath, key);
    if (!result.ok) {
      return NextResponse.json({ ok: false, detail: result.detail }, { status: 404 });
    }
    return NextResponse.json({ ok: true, detail: result.detail });
  } catch (err) {
    logger.error("POST /api/modules/verify failed", err);
    return NextResponse.json({ error: "Interní chyba při ověřování cesty." }, { status: 500 });
  }
}
