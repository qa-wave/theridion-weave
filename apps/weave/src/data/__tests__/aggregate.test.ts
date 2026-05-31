import { describe, expect, it } from "@jest/globals";
import { aggregate, createRequirement, listRequirements, requirementCoverageMatrix } from "@/data/store";

describe("aggregate()", () => {
  it("returns coverage, bySource array with all 4 sources, and byMilestone", async () => {
    const result = await aggregate();

    expect(result.coverage).toMatchObject({
      total: expect.any(Number),
      active: expect.any(Number),
      covered: expect.any(Number),
    });

    const sources = result.bySource.map((s) => s.source).sort();
    expect(sources).toEqual(["eyes", "manual", "net", "runner"]);

    expect(Array.isArray(result.byMilestone)).toBe(true);
    expect(result.generatedAt).toMatch(/^\d{4}-/);
  });

  it("passRate in bySource is between 0 and 100", async () => {
    const { bySource } = await aggregate();
    for (const s of bySource) {
      expect(s.passRate).toBeGreaterThanOrEqual(0);
      expect(s.passRate).toBeLessThanOrEqual(100);
    }
  });

  it("byMilestone entries have valid passRate", async () => {
    const { byMilestone } = await aggregate();
    for (const m of byMilestone) {
      expect(m.passRate).toBeGreaterThanOrEqual(0);
      expect(m.passRate).toBeLessThanOrEqual(100);
    }
  });
});

describe("requirements store", () => {
  it("seeds with requirements", async () => {
    const reqs = await listRequirements();
    expect(reqs.length).toBeGreaterThan(0);
  });

  it("creates a requirement with generated id", async () => {
    const before = (await listRequirements()).length;
    const req = await createRequirement({
      title: "Test req",
      description: "desc",
      status: "open",
      priority: "medium",
      caseIds: [],
    });
    expect(req.id).toMatch(/^req-/);
    expect((await listRequirements()).length).toBe(before + 1);
  });

  it("requirementCoverageMatrix returns rows for all requirements", async () => {
    const matrix = await requirementCoverageMatrix();
    const reqs = await listRequirements();
    expect(matrix.length).toBe(reqs.length);
  });

  it("coveragePct is 0..100 for each row", async () => {
    const matrix = await requirementCoverageMatrix();
    for (const row of matrix) {
      expect(row.coveragePct).toBeGreaterThanOrEqual(0);
      expect(row.coveragePct).toBeLessThanOrEqual(100);
    }
  });
});
