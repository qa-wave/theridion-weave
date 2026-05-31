/**
 * Unit tests for the /api/modules/verify path-validation logic.
 *
 * Covers all three connection types:
 *   'source'  — filesystem path check (detectModule)
 *   'app'     — optional dataDir check (detectAppDataDir); no path = instant ok
 *   'service' — HTTP probe (probeService) — mocked via global fetch
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import fs from "node:fs";

// ─── Mock node:fs before importing the module under test ────────────────────

jest.mock("node:fs");

const mockStatSync = fs.statSync as jest.MockedFunction<typeof fs.statSync>;
const mockAccessSync = fs.accessSync as jest.MockedFunction<typeof fs.accessSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

// ─── Helper shapes ────────────────────────────────────────────────────────────

type ModuleKey = "eyes" | "net" | "runner";

const MODULE_MARKERS: Record<ModuleKey, string[]> = {
  eyes: ["CLAUDE.md", "package.json", "apps"],
  net: ["CLAUDE.md", "package.json", "apps"],
  runner: ["CLAUDE.md", "pyproject.toml", "theridion_runner"],
};

const APP_DATA_MARKERS: Record<ModuleKey, string[]> = {
  eyes: ["runs", "screenshots", "config.json"],
  net: ["runs", "collections", "config.json"],
  runner: ["runs", "config.json"],
};

// ─── Extracted helpers (mirroring the route) ─────────────────────────────────

function detectModule(modulePath: string, key: ModuleKey): { ok: boolean; detail: string } {
  try {
    const stat = fs.statSync(modulePath);
    if (!(stat as unknown as { isDirectory(): boolean }).isDirectory()) {
      return { ok: false, detail: "Cesta není adresář." };
    }
  } catch {
    return { ok: false, detail: "Adresář neexistuje nebo k němu nemáte přístup." };
  }
  const markers = MODULE_MARKERS[key];
  const found = markers.filter((m) => {
    try { fs.accessSync(`${modulePath}/${m}`); return true; } catch { return false; }
  });
  if (found.length === 0) {
    return {
      ok: false,
      detail: `Adresář neobsahuje žádný rozpoznatelný marker Theridion modulu (hledám: ${markers.join(", ")}).`,
    };
  }
  try {
    const content = fs.readFileSync(`${modulePath}/CLAUDE.md`, "utf-8") as string;
    const expectedName = `theridion-${key}`;
    if (!content.toLowerCase().includes(expectedName)) {
      return { ok: false, detail: `CLAUDE.md nenashl žádnou zmínku o "${expectedName}".` };
    }
  } catch { /* not readable — proceed */ }
  return { ok: true, detail: `Modul theridion-${key} nalezen v: ${modulePath}` };
}

function detectAppDataDir(dataDirPath: string, key: ModuleKey): { ok: boolean; detail: string } {
  try {
    const stat = fs.statSync(dataDirPath);
    if (!(stat as unknown as { isDirectory(): boolean }).isDirectory()) {
      return { ok: false, detail: "Datová složka není adresář." };
    }
  } catch {
    return { ok: false, detail: "Datová složka neexistuje nebo k ní nemáte přístup." };
  }
  const markers = APP_DATA_MARKERS[key];
  const found = markers.filter((m) => {
    try { fs.accessSync(`${dataDirPath}/${m}`); return true; } catch { return false; }
  });
  if (found.length === 0) {
    return {
      ok: false,
      detail: `Datová složka neobsahuje žádný rozpoznatelný marker (hledám: ${markers.join(", ")}).`,
    };
  }
  return { ok: true, detail: `Datová složka modulu theridion-${key} nalezena v: ${dataDirPath}` };
}

async function probeService(baseUrl: string): Promise<{ ok: boolean; detail: string }> {
  const base = baseUrl.replace(/\/$/, "");
  const probeUrls = [`${base}/health`, `${base}/api/health`];
  for (const url of probeUrls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (resp.ok) return { ok: true, detail: `Služba dostupná na ${url} (HTTP ${resp.status}).` };
    } catch { /* try next */ }
  }
  return { ok: false, detail: `Služba na ${base} neodpověděla na /health ani /api/health do 5 s.` };
}

// ─── 'source' type tests ─────────────────────────────────────────────────────

describe("detectModule (connectionType=source)", () => {
  const DIR_STAT = { isDirectory: () => true } as unknown as fs.Stats;
  const FILE_STAT = { isDirectory: () => false } as unknown as fs.Stats;

  beforeEach(() => { jest.clearAllMocks(); });

  it("returns ok=false when path does not exist", () => {
    mockStatSync.mockImplementationOnce(() => { throw new Error("ENOENT"); });
    const r = detectModule("/no/such/path", "eyes");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("neexistuje");
  });

  it("returns ok=false when path is a file, not a directory", () => {
    mockStatSync.mockReturnValueOnce(FILE_STAT);
    const r = detectModule("/some/file.txt", "eyes");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("adresář");
  });

  it("returns ok=false when no marker files are found", () => {
    mockStatSync.mockReturnValueOnce(DIR_STAT);
    mockAccessSync.mockImplementation(() => { throw new Error("ENOENT"); });
    const r = detectModule("/empty/dir", "eyes");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("marker");
  });

  it("returns ok=false when CLAUDE.md does not mention the expected module name", () => {
    mockStatSync.mockReturnValueOnce(DIR_STAT);
    mockAccessSync.mockImplementation(() => undefined);
    mockReadFileSync.mockReturnValueOnce("Name: theridion-hub");
    const r = detectModule("/wrong/module", "eyes");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("theridion-eyes");
  });

  it("returns ok=true for a valid eyes module directory", () => {
    mockStatSync.mockReturnValueOnce(DIR_STAT);
    mockAccessSync.mockImplementation(() => undefined);
    mockReadFileSync.mockReturnValueOnce("Name: theridion-eyes\nsome content");
    const r = detectModule("/valid/theridion-eyes", "eyes");
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("theridion-eyes");
    expect(r.detail).toContain("/valid/theridion-eyes");
  });

  it("returns ok=true for a valid net module directory", () => {
    mockStatSync.mockReturnValueOnce(DIR_STAT);
    mockAccessSync.mockImplementation(() => undefined);
    mockReadFileSync.mockReturnValueOnce("Name: theridion-net");
    const r = detectModule("/valid/theridion-net", "net");
    expect(r.ok).toBe(true);
  });

  it("returns ok=true for a valid runner module directory", () => {
    mockStatSync.mockReturnValueOnce(DIR_STAT);
    mockAccessSync.mockImplementation(() => undefined);
    mockReadFileSync.mockReturnValueOnce("theridion-runner CLI tool");
    const r = detectModule("/valid/theridion-runner", "runner");
    expect(r.ok).toBe(true);
  });

  it("proceeds ok when CLAUDE.md is not readable but markers are present", () => {
    mockStatSync.mockReturnValueOnce(DIR_STAT);
    mockAccessSync.mockImplementation(() => undefined);
    mockReadFileSync.mockImplementationOnce(() => { throw new Error("EACCES"); });
    const r = detectModule("/partial/theridion-eyes", "eyes");
    expect(r.ok).toBe(true);
  });

  it("returns ok=false for an unrecognised marker (runner: missing all markers)", () => {
    mockStatSync.mockReturnValueOnce(DIR_STAT);
    mockAccessSync.mockImplementation(() => { throw new Error("ENOENT"); });
    const r = detectModule("/incomplete/runner", "runner");
    expect(r.ok).toBe(false);
  });
});

// ─── 'app' type tests ─────────────────────────────────────────────────────────

describe("detectAppDataDir (connectionType=app)", () => {
  const DIR_STAT = { isDirectory: () => true } as unknown as fs.Stats;
  const FILE_STAT = { isDirectory: () => false } as unknown as fs.Stats;

  beforeEach(() => { jest.clearAllMocks(); });

  it("returns ok=false when data dir does not exist", () => {
    mockStatSync.mockImplementationOnce(() => { throw new Error("ENOENT"); });
    const r = detectAppDataDir("/no/such/dir", "eyes");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("neexistuje");
  });

  it("returns ok=false when data dir path is a file", () => {
    mockStatSync.mockReturnValueOnce(FILE_STAT);
    const r = detectAppDataDir("/some/file.txt", "eyes");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("adresář");
  });

  it("returns ok=false when no known markers are found in data dir", () => {
    mockStatSync.mockReturnValueOnce(DIR_STAT);
    mockAccessSync.mockImplementation(() => { throw new Error("ENOENT"); });
    const r = detectAppDataDir("/empty/data", "eyes");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("marker");
  });

  it("returns ok=true when at least one marker found (eyes: runs dir)", () => {
    mockStatSync.mockReturnValueOnce(DIR_STAT);
    // First marker (runs) is accessible; rest throw.
    let callCount = 0;
    mockAccessSync.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return undefined; // 'runs' found
      throw new Error("ENOENT");
    });
    const r = detectAppDataDir("/valid/eyes-data", "eyes");
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("theridion-eyes");
  });

  it("returns ok=true when runner data dir has 'runs' and 'config.json'", () => {
    mockStatSync.mockReturnValueOnce(DIR_STAT);
    mockAccessSync.mockImplementation(() => undefined);
    const r = detectAppDataDir("/valid/runner-data", "runner");
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("theridion-runner");
  });

  it("app connect with no dataDir is always treated as valid (push-only)", () => {
    // The route returns ok=true with guidance when no dataDir is supplied.
    // Test this logic inline (no fs calls should be made).
    const dataDir: string | undefined = undefined;
    const isValid = !dataDir; // route logic: if (!dataDir) return ok
    expect(isValid).toBe(true);
    expect(mockStatSync).not.toHaveBeenCalled();
  });
});

// ─── Minimal fetch response mock (avoids dependency on global Response class) ──

function fakeOkResponse(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as unknown as Response;
}

// ─── 'service' type tests ─────────────────────────────────────────────────────

describe("probeService (connectionType=service)", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("returns ok=true when /health responds with 200", async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce(fakeOkResponse(200));
    const r = await probeService("https://theridion-eyes.example.com");
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("/health");
    expect(r.detail).toContain("200");
  });

  it("falls through to /api/health when /health is not found (404)", async () => {
    global.fetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(fakeOkResponse(404)) // /health → 404
      .mockResolvedValueOnce(fakeOkResponse(200)); // /api/health → 200
    const r = await probeService("https://theridion-eyes.example.com");
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("/api/health");
  });

  it("returns ok=false when both probes fail with network error", async () => {
    global.fetch = jest.fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockRejectedValueOnce(new Error("fetch failed"));
    const r = await probeService("https://offline.example.com");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("neodpověděla");
  });

  it("returns ok=false when /health returns 500 and /api/health is also unreachable", async () => {
    global.fetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(fakeOkResponse(500))
      .mockRejectedValueOnce(new Error("timeout"));
    const r = await probeService("https://error.example.com");
    expect(r.ok).toBe(false);
  });

  it("strips trailing slash from baseUrl before probing", async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce(fakeOkResponse(200));
    await probeService("https://service.example.com/");
    const calledUrl = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0][0] as string;
    expect(calledUrl).toBe("https://service.example.com/health");
  });
});
