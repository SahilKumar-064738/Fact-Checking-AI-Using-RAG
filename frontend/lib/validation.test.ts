import { describe, expect, it } from "vitest";

import { HalloumiResponseSchema, StageEventSchema } from "@/lib/validation";

describe("HalloumiResponseSchema", () => {
  const valid = {
    answer_score: 10.0,
    claims: [
      {
        claimString: "Paris is the capital of France.",
        startOffset: 0,
        endOffset: 31,
        segmentIds: ["0"],
        score: 1.0,
        rationale: "Directly supported.",
        skipped: false,
        verdict: "supported",
        evidence: "Paris is the capital.",
        confidence: 0,
        document_index: 0,
      },
    ],
    segments: { "0": { id: 0, startOffset: 0, endOffset: 21 } },
  };

  it("accepts the real backend response shape", () => {
    expect(HalloumiResponseSchema.parse(valid).answer_score).toBe(10.0);
  });

  it("tolerates older backends without additive fields", () => {
    const minimal = {
      ...valid,
      claims: [
        {
          claimString: "x",
          startOffset: 0,
          endOffset: 1,
          segmentIds: [],
          score: 1.0,
          rationale: "",
          skipped: false,
        },
      ],
    };
    expect(() => HalloumiResponseSchema.parse(minimal)).not.toThrow();
  });

  it("rejects malformed responses instead of fabricating data", () => {
    expect(() => HalloumiResponseSchema.parse({ answer_score: "high" })).toThrow();
  });
});

describe("StageEventSchema", () => {
  it("accepts real pipeline stages", () => {
    expect(
      StageEventSchema.parse({ event: "claims_extracted", count: 3 }).count,
    ).toBe(3);
  });

  it("rejects unknown stage names (no fabricated progress)", () => {
    expect(() => StageEventSchema.parse({ event: "reading_answer" })).toThrow();
  });
});