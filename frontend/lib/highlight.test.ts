import { describe, expect, it } from "vitest";

import { buildAnswerPieces, claimSegments, locateSegmentInSources } from "@/lib/highlight";
import type { HalloumiClaim, HalloumiResponse, SourceDoc } from "@/lib/types";

function claim(overrides: Partial<HalloumiClaim> = {}): HalloumiClaim {
  return {
    claimString: "Paris is the capital of France.",
    startOffset: 0,
    endOffset: 31,
    segmentIds: [],
    score: 1.0,
    rationale: "",
    skipped: false,
    ...overrides,
  };
}

function source(text: string, id = "s1"): SourceDoc {
  return { id, title: "Doc", text, sourceType: "text", url: "" };
}

describe("buildAnswerPieces", () => {
  const answer = "Paris is the capital of France. The sky is blue.";

  it("splits text around a valid claim span", () => {
    const pieces = buildAnswerPieces(answer, [claim()]);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toEqual({
      kind: "claim",
      text: "Paris is the capital of France.",
      claim: expect.anything(),
    });
    expect(pieces[1].text).toBe(" The sky is blue.");
  });

  it("returns the whole answer as text when there are no claims", () => {
    const pieces = buildAnswerPieces(answer, []);
    expect(pieces).toEqual([{ kind: "text", text: answer }]);
  });

  it("discards skipped claims (no exact span in the answer)", () => {
    const pieces = buildAnswerPieces(answer, [claim({ skipped: true })]);
    expect(pieces).toEqual([{ kind: "text", text: answer }]);
  });

  it("discards out-of-bounds spans instead of rendering them wrong", () => {
    const pieces = buildAnswerPieces(answer, [
      claim({ startOffset: 0, endOffset: answer.length + 100 }),
    ]);
    expect(pieces).toEqual([{ kind: "text", text: answer }]);
  });

  it("discards overlapping spans, keeping the first", () => {
    const pieces = buildAnswerPieces(answer, [
      claim({ startOffset: 0, endOffset: 20 }),
      claim({ startOffset: 10, endOffset: 31, claimString: "overlap" }),
    ]);
    const kinds = pieces.map((p) => p.kind);
    expect(kinds.filter((k) => k === "claim")).toHaveLength(1);
  });
});

describe("locateSegmentInSources", () => {
  it("maps joined offsets back to the correct source", () => {
    const sources = [source("AAAA"), source("BBBBBB")];
    // Segment inside source 2: joined offsets 4..8 -> local 0..4
    const loc = locateSegmentInSources(sources, { start: 4, end: 8 });
    expect(loc).toEqual({ sourceIndex: 1, start: 0, end: 4 });
  });

  it("clamps segments that cross source boundaries", () => {
    const sources = [source("AAAA"), source("BBBBBB")];
    const loc = locateSegmentInSources(sources, { start: 2, end: 6 });
    expect(loc).toEqual({ sourceIndex: 0, start: 2, end: 4 });
  });

  it("returns null for empty sources", () => {
    expect(locateSegmentInSources([], { start: 0, end: 5 })).toBeNull();
  });
});

describe("claimSegments", () => {
  const response: HalloumiResponse = {
    answer_score: 10,
    claims: [],
    segments: {
      "0": { id: 0, startOffset: 0, endOffset: 10 },
      "1": { id: 1, startOffset: 20, endOffset: 20 }, // zero-length, invalid
    },
  };

  it("returns only valid, referenced segments", () => {
    const ranges = claimSegments(claim({ segmentIds: ["0", "1", "missing"] }), response);
    expect(ranges).toEqual([{ start: 0, end: 10 }]);
  });
});