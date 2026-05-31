import { describe, expect, it } from "@jest/globals";
import {
  canTransitionTest,
  canTransitionScript,
  canTransitionRun,
  nextTestStates,
  nextScriptStates,
  nextRunStates,
  appendHistory,
  type RunStatus,
} from "@/lib/workflow";

// ─── TestCase workflow ─────────────────────────────────────────────────────────

describe("TestCase workflow", () => {
  it("allows draft → in_review", () => {
    expect(canTransitionTest("draft", "in_review")).toBe(true);
  });

  it("allows in_review → active", () => {
    expect(canTransitionTest("in_review", "active")).toBe(true);
  });

  it("allows active → in_review (reopen)", () => {
    expect(canTransitionTest("active", "in_review")).toBe(true);
  });

  it("allows active → deprecated", () => {
    expect(canTransitionTest("active", "deprecated")).toBe(true);
  });

  it("rejects draft → active (must go through in_review)", () => {
    expect(canTransitionTest("draft", "active")).toBe(false);
  });

  it("rejects deprecated → active", () => {
    expect(canTransitionTest("deprecated", "active")).toBe(false);
  });

  it("rejects deprecated → in_review", () => {
    expect(canTransitionTest("deprecated", "in_review")).toBe(false);
  });

  it("rejects same-state transition", () => {
    expect(canTransitionTest("active", "active")).toBe(false);
    expect(canTransitionTest("draft", "draft")).toBe(false);
  });

  it("nextTestStates from draft returns [in_review]", () => {
    expect(nextTestStates("draft")).toEqual(["in_review"]);
  });

  it("nextTestStates from deprecated returns []", () => {
    expect(nextTestStates("deprecated")).toEqual([]);
  });

  it("nextTestStates from active includes in_review and deprecated", () => {
    const states = nextTestStates("active");
    expect(states).toContain("in_review");
    expect(states).toContain("deprecated");
  });
});

// ─── Script workflow ───────────────────────────────────────────────────────────

describe("Script workflow", () => {
  it("allows draft → active", () => {
    expect(canTransitionScript("draft", "active")).toBe(true);
  });

  it("allows active → flaky", () => {
    expect(canTransitionScript("active", "flaky")).toBe(true);
  });

  it("allows flaky → active (recover)", () => {
    expect(canTransitionScript("flaky", "active")).toBe(true);
  });

  it("allows active → deprecated", () => {
    expect(canTransitionScript("active", "deprecated")).toBe(true);
  });

  it("rejects draft → flaky", () => {
    expect(canTransitionScript("draft", "flaky")).toBe(false);
  });

  it("rejects deprecated → active", () => {
    expect(canTransitionScript("deprecated", "active")).toBe(false);
  });

  it("nextScriptStates from deprecated returns []", () => {
    expect(nextScriptStates("deprecated")).toEqual([]);
  });

  it("nextScriptStates from flaky includes active and deprecated", () => {
    const states = nextScriptStates("flaky");
    expect(states).toContain("active");
    expect(states).toContain("deprecated");
  });
});

// ─── Run workflow ─────────────────────────────────────────────────────────────

describe("Run workflow", () => {
  it("allows created → in_progress", () => {
    expect(canTransitionRun("created", "in_progress")).toBe(true);
  });

  it("allows in_progress → completed", () => {
    expect(canTransitionRun("in_progress", "completed")).toBe(true);
  });

  it("allows completed → signed_off", () => {
    expect(canTransitionRun("completed", "signed_off")).toBe(true);
  });

  it("allows any → blocked", () => {
    const states: RunStatus[] = ["created", "in_progress", "completed"];
    for (const s of states) {
      expect(canTransitionRun(s, "blocked")).toBe(true);
    }
  });

  it("allows blocked → in_progress (unblock)", () => {
    expect(canTransitionRun("blocked", "in_progress")).toBe(true);
  });

  it("rejects created → completed (skip step)", () => {
    expect(canTransitionRun("created", "completed")).toBe(false);
  });

  it("rejects signed_off → any (terminal state)", () => {
    const targets: RunStatus[] = ["created", "in_progress", "completed", "blocked"];
    for (const t of targets) {
      expect(canTransitionRun("signed_off", t)).toBe(false);
    }
  });

  it("nextRunStates from signed_off returns []", () => {
    expect(nextRunStates("signed_off")).toEqual([]);
  });

  it("nextRunStates from created includes in_progress and blocked", () => {
    const states = nextRunStates("created");
    expect(states).toContain("in_progress");
    expect(states).toContain("blocked");
  });
});

// ─── appendHistory ─────────────────────────────────────────────────────────────

describe("appendHistory", () => {
  it("appends an entry immutably", () => {
    const orig = [{ from: "draft", to: "active", by: "x", at: "2026-01-01T00:00:00Z" }];
    const next = appendHistory(orig, "active", "deprecated", "y");
    expect(next).toHaveLength(2);
    expect(orig).toHaveLength(1); // original unchanged
    expect(next[1].from).toBe("active");
    expect(next[1].to).toBe("deprecated");
    expect(next[1].by).toBe("y");
  });

  it("sets a valid ISO at timestamp", () => {
    const entry = appendHistory([], "draft", "active", "qa")[0];
    expect(() => new Date(entry.at).toISOString()).not.toThrow();
  });
});
