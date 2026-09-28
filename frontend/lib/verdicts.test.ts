import { describe, expect, it } from "vitest";

import type { HalloumiClaim } from "@/lib/types";
import { claimVerdict, countVerdicts, groundingSummary, scoreLabel } from "@/lib/verdicts";

function claim(overrides: Partial<HalloumiClaim> = {}): HalloumiClaim {
  return {
    claimString: "x",
    startOffset: 0,
    endOffset: 1,
    segmentIds: [],
    score: 1.0,
    rationale: "",
    skipped: false,
    ...overrides,
  };
}

describe("claimVerdict", () => {
  it("prefers the explicit verdict field", () => {
    expect(claimVerdict(claim({ verdict: "contradicted", score: 1.0 }))).toBe("contradicted");
  });

  it("falls back to the verdict-based score mapping", () => {
    expect(claimVerdict(claim({ score: 1.0 }))).toBe("supported");
    expect(claimVerdict(claim({ score: 0.4 }))).toBe("not_enough_info");
    expect(claimVerdict(claim({ score: 0.0 }))).toBe("contradicted");
  });
});

describe("countVerdicts", () => {
  it("counts claims per verdict and skipped separately", () => {
    const counts = countVerdicts([
      claim({ verdict: "supported" }),
      claim({ verdict: "not_enough_info", skipped: true }),
      claim({ verdict: "contradicted" }),
    ]);
    expect(counts).toEqual({
      supported: 1,
      notEnoughInfo: 1,
      contradicted: 1,
      skipped: 1,
    });
  });
});

describe("scoreLabel", () => {
  it("matches the backend score_label thresholds", () => {
    expect(scoreLabel(9.5)).toBe("Excellent");
    expect(scoreLabel(7)).toBe("Good");
    expect(scoreLabel(5)).toBe("Acceptable");
    expect(scoreLabel(3)).toBe("Poor");
    expect(scoreLabel(1)).toBe("Failing");
    expect(scoreLabel(0)).toBe("No claims");
  });
});

describe("groundingSummary", () => {
  const base = { notEnoughInfo: 0, contradicted: 0, skipped: 0 };

  it("never invents claims for empty results", () => {
    expect(groundingSummary(0, { ...base, supported: 0 }, 0)).toContain("No factual claims");
  });

  it("reports contradictions truthfully", () => {
    const text = groundingSummary(4, { ...base, supported: 1, contradicted: 1 }, 2);
    expect(text).toContain("contradicted");
  });

  it("reports full support when every claim is supported", () => {
    const text = groundingSummary(10, { ...base, supported: 3 }, 3);
    expect(text).toContain("Every claim");
  });
});