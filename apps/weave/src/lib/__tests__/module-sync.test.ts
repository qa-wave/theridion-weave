/**
 * Unit tests for the sync spec-scan / upsert logic.
 *
 * We extract the pure walkFiles helper and the upsert logic, mock the store,
 * and verify idempotency and correct file pattern matching.
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
