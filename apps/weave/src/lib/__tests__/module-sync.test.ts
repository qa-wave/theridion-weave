/**
 * Unit tests for the sync spec-scan / upsert logic and connection-type routing.
 *
 * We extract the pure walkFiles helper and the upsert logic, mock the store,
 * and verify idempotency, correct file pattern matching, and per-connection-type
 * behaviour.
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";

jest.mock("node:fs");

// ─── Minimal Dirent shape used in tests ──────────────────────────────────────

interface FakeDirent {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isFIFO(): boolean;
  isSocket(): boolean;
  isSymbolicLink(): boolean;
}

function makeDirent(name: string, isDir: boolean): FakeDirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
  };
}

// Cast readdirSync to accept our FakeDirent return type without `any`.
const mockReaddirSync = fs.readdirSync as unknown as jest.MockedFunction<
  (p: string, opts: { withFileTypes: boolean }) => FakeDirent[]
>;

// ─── Extracted helpers (mirroring the route implementation) ──────────────────

/** Recursively walk a directory and collect files matching the given predicate. */
function walkFiles(root: string, match: RegExp, maxDepth = 8): string[] {
  const results: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: FakeDirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }) as unknown as FakeDirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
          walk(fullPath, depth + 1);
        }
      } else if (entry.isFile() && match.test(entry.name)) {
        results.push(path.relative(root, fullPath));
      }
    }
  }
  walk(root, 0);
  return results;
}

const SPEC_PATTERNS: Record<string, RegExp> = {
  eyes: /\.spec\.ts$/i,
  net: /\.(thr|collection\.json)$/i,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("walkFiles — eyes spec pattern", () => {
  const eyesPattern = SPEC_PATTERNS.eyes;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns empty array for an empty directory", () => {
    mockReaddirSync.mockReturnValueOnce([]);
    expect(walkFiles("/root", eyesPattern)).toEqual([]);
  });

  it("collects .spec.ts files recursively", () => {
    mockReaddirSync
      .mockReturnValueOnce([
        makeDirent("src", true),
        makeDirent("readme.md", false),
      ])
      .mockReturnValueOnce([
        makeDirent("auth.spec.ts", false),
        makeDirent("checkout.spec.ts", false),
        makeDirent("helper.ts", false),
      ]);

    const results = walkFiles("/root", eyesPattern);
    expect(results).toEqual(["src/auth.spec.ts", "src/checkout.spec.ts"]);
    expect(results).not.toContain("src/helper.ts");
    expect(results).not.toContain("readme.md");
  });

  it("skips node_modules and hidden directories", () => {
    mockReaddirSync
      .mockReturnValueOnce([
        makeDirent("node_modules", true),
        makeDirent(".git", true),
        makeDirent("tests", true),
      ])
      .mockReturnValueOnce([
        makeDirent("login.spec.ts", false),
      ]);

    // readdirSync is called for root + tests (node_modules/.git are skipped).
    const results = walkFiles("/root", eyesPattern);
    expect(results).toEqual(["tests/login.spec.ts"]);
    // Verify node_modules was never traversed: readdirSync called only twice.
    expect(mockReaddirSync).toHaveBeenCalledTimes(2);
  });

  it("ignores unreadable subdirectories gracefully", () => {
    mockReaddirSync
      .mockReturnValueOnce([makeDirent("broken", true)])
      .mockImplementationOnce(() => { throw new Error("EACCES"); });

    const results = walkFiles("/root", eyesPattern);
    expect(results).toEqual([]);
  });

  it("respects maxDepth", () => {
    // Build a chain: root → a → (would be b, but maxDepth=1 stops it).
    mockReaddirSync
      .mockReturnValueOnce([makeDirent("a", true)])       // depth 0 → enters a
      .mockReturnValueOnce([makeDirent("b", true)]);      // depth 1 → b would be depth 2, skipped

    const results = walkFiles("/root", eyesPattern, 1);
    expect(results).toEqual([]);
    expect(mockReaddirSync).toHaveBeenCalledTimes(2); // root + a
  });
});

describe("walkFiles — net spec pattern", () => {
  const netPattern = SPEC_PATTERNS.net;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("collects .thr and collection.json files", () => {
    mockReaddirSync.mockReturnValueOnce([
      makeDirent("auth-api.thr", false),
      makeDirent("smoke.collection.json", false),
      makeDirent("notes.txt", false),
    ]);
    const results = walkFiles("/collections", netPattern);
    expect(results).toContain("auth-api.thr");
    expect(results).toContain("smoke.collection.json");
    expect(results).not.toContain("notes.txt");
  });

  it("does not match .spec.ts files", () => {
    mockReaddirSync.mockReturnValueOnce([makeDirent("login.spec.ts", false)]);
    expect(walkFiles("/root", netPattern)).toEqual([]);
  });
});

// ─── Upsert idempotency logic ─────────────────────────────────────────────────

describe("sync upsert idempotency", () => {
  /**
   * Simulate the upsert logic: for each specPath, if already in bySpecPath
   * index, skip; otherwise create. Returns count of new scripts.
   */
  function simulateUpsert(
    specPaths: string[],
    existingPaths: string[],
  ): number {
    const bySpecPath = new Map(existingPaths.map((p, i) => [p, `scr-${i}`]));
    let created = 0;
    for (const sp of specPaths) {
      if (!bySpecPath.has(sp)) {
        bySpecPath.set(sp, `scr-new-${created}`);
        created++;
      }
    }
    return created;
  }

  it("creates all scripts when none exist", () => {
    expect(simulateUpsert(["a.spec.ts", "b.spec.ts"], [])).toBe(2);
  });

  it("skips existing scripts (idempotent)", () => {
    expect(simulateUpsert(["a.spec.ts", "b.spec.ts"], ["a.spec.ts"])).toBe(1);
  });

  it("creates nothing when all are already tracked", () => {
    expect(simulateUpsert(["a.spec.ts"], ["a.spec.ts"])).toBe(0);
  });

  it("handles empty specPaths", () => {
    expect(simulateUpsert([], ["a.spec.ts"])).toBe(0);
  });
});

// ─── Connection-type routing logic ────────────────────────────────────────────

describe("sync connectionType routing", () => {
  /**
   * Simulate the guard logic in the sync route: which config fields are
   * required per connection type.
   */
  type ConnCfg = {
    connectionType?: "app" | "service" | "source";
    installed?: boolean;
    installPath?: string;
    enabled?: boolean;
    baseUrl?: string;
    dataDir?: string;
  };

  function guardCheck(cfg: ConnCfg): { allowed: boolean; reason?: string } {
    const ct = cfg.connectionType;
    if (ct === "source" && (!cfg.installed || !cfg.installPath)) {
      return { allowed: false, reason: "source: installPath required" };
    }
    if (ct === "service" && (!cfg.enabled || !cfg.baseUrl)) {
      return { allowed: false, reason: "service: baseUrl required" };
    }
    if (!ct && !cfg.installed) {
      return { allowed: false, reason: "legacy: not installed" };
    }
    return { allowed: true };
  }

  it("blocks source sync when installPath is missing", () => {
    const r = guardCheck({ connectionType: "source", installed: true });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("installPath");
  });

  it("blocks source sync when not installed", () => {
    const r = guardCheck({ connectionType: "source", installed: false, installPath: "/path" });
    expect(r.allowed).toBe(false);
  });

  it("allows source sync when installed=true and installPath is set", () => {
    const r = guardCheck({ connectionType: "source", installed: true, installPath: "/path" });
    expect(r.allowed).toBe(true);
  });

  it("blocks service sync when baseUrl is missing", () => {
    const r = guardCheck({ connectionType: "service", enabled: true });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("baseUrl");
  });

  it("blocks service sync when not enabled", () => {
    const r = guardCheck({ connectionType: "service", enabled: false, baseUrl: "http://x.com" });
    expect(r.allowed).toBe(false);
  });

  it("allows service sync when enabled=true and baseUrl is set", () => {
    const r = guardCheck({ connectionType: "service", enabled: true, baseUrl: "http://svc" });
    expect(r.allowed).toBe(true);
  });

  it("allows app sync when installed=true (no installPath required)", () => {
    const r = guardCheck({ connectionType: "app", installed: true });
    expect(r.allowed).toBe(true);
  });

  it("allows app sync regardless of baseUrl (push-based)", () => {
    const r = guardCheck({ connectionType: "app", installed: true, baseUrl: undefined });
    expect(r.allowed).toBe(true);
  });

  it("blocks legacy (no connectionType) when not installed", () => {
    const r = guardCheck({ installed: false });
    expect(r.allowed).toBe(false);
  });

  it("allows legacy (no connectionType) when installed=true", () => {
    const r = guardCheck({ installed: true, installPath: "/some/path" });
    expect(r.allowed).toBe(true);
  });
});

// ─── installedModules semantics per connectionType ────────────────────────────

describe("installedModules connection-type semantics", () => {
  // Mirror the logic from integrations.ts installedModules()
  type ViewEntry = {
    installed?: boolean;
    installPath?: string;
    enabled?: boolean;
    baseUrl?: string;
    connectionType?: "app" | "service" | "source";
  };

  function isConnected(v: ViewEntry): boolean {
    const ct = v.connectionType;
    if (ct === "app") return v.installed === true;
    if (ct === "service") return v.enabled === true && !!v.baseUrl;
    if (ct === "source") return v.installed === true && !!v.installPath;
    return v.installed === true; // legacy fallback
  }

  it("app type: connected when installed=true", () => {
    expect(isConnected({ connectionType: "app", installed: true })).toBe(true);
  });

  it("app type: not connected when installed=false", () => {
    expect(isConnected({ connectionType: "app", installed: false })).toBe(false);
  });

  it("app type: does not require baseUrl to be connected", () => {
    expect(isConnected({ connectionType: "app", installed: true, baseUrl: undefined })).toBe(true);
  });

  it("service type: connected when enabled=true and baseUrl set", () => {
    expect(isConnected({ connectionType: "service", enabled: true, baseUrl: "http://x" })).toBe(true);
  });

  it("service type: not connected when enabled=false", () => {
    expect(isConnected({ connectionType: "service", enabled: false, baseUrl: "http://x" })).toBe(false);
  });

  it("service type: not connected when baseUrl is empty", () => {
    expect(isConnected({ connectionType: "service", enabled: true, baseUrl: "" })).toBe(false);
  });

  it("source type: connected when installed=true and installPath set", () => {
    expect(isConnected({ connectionType: "source", installed: true, installPath: "/path" })).toBe(true);
  });

  it("source type: not connected when installPath is missing", () => {
    expect(isConnected({ connectionType: "source", installed: true, installPath: undefined })).toBe(false);
  });

  it("source type: not connected when installed=false", () => {
    expect(isConnected({ connectionType: "source", installed: false, installPath: "/path" })).toBe(false);
  });

  it("legacy (no connectionType): connected when installed=true", () => {
    expect(isConnected({ installed: true })).toBe(true);
  });

  it("legacy (no connectionType): not connected when installed=false", () => {
    expect(isConnected({ installed: false })).toBe(false);
  });
});
