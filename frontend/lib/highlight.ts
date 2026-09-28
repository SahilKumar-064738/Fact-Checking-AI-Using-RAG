/**
 * Offset-safe highlighting utilities.
 *
 * Claim offsets refer to the ANSWER string. Segment offsets refer to the
 * JOINED SOURCES string (sources concatenated without separators, matching
 * the backend's _to_halloumi_format). These helpers never render a span
 * that falls outside the text, and they never fabricate positions.
 */

import type { HalloumiClaim, HalloumiResponse, SourceDoc } from "./types";

export interface TextRange {
  start: number;
  end: number;
}

/** One renderable piece of the answer: plain text or a highlighted claim. */
export type AnswerPiece =
  | { kind: "text"; text: string }
  | { kind: "claim"; text: string; claim: HalloumiClaim };

/**
 * Split the answer text into pieces for rendering, using claim spans.
 * Overlapping or invalid spans are discarded rather than rendered wrong.
 */
export function buildAnswerPieces(
  answer: string,
  claims: HalloumiClaim[],
): AnswerPiece[] {
  // Only inline-renderable claims (with a real span in the answer)
  const inline = claims
    .filter(
      (c) =>
        !c.skipped &&
        Number.isFinite(c.startOffset) &&
        Number.isFinite(c.endOffset) &&
        c.startOffset >= 0 &&
        c.endOffset > c.startOffset &&
        c.endOffset <= answer.length,
    )
    .sort((a, b) => a.startOffset - b.startOffset);

  // Discard overlaps; keep the first claim for any given region
  const kept: HalloumiClaim[] = [];
  let lastEnd = 0;
  for (const claim of inline) {
    if (claim.startOffset >= lastEnd) {
      kept.push(claim);
      lastEnd = claim.endOffset;
    }
  }

  const pieces: AnswerPiece[] = [];
  let cursor = 0;
  for (const claim of kept) {
    if (claim.startOffset > cursor) {
      pieces.push({ kind: "text", text: answer.slice(cursor, claim.startOffset) });
    }
    pieces.push({
      kind: "claim",
      text: answer.slice(claim.startOffset, claim.endOffset),
      claim,
    });
    cursor = claim.endOffset;
  }
  if (cursor < answer.length) {
    pieces.push({ kind: "text", text: answer.slice(cursor) });
  }
  return pieces;
}

/**
 * Map a segment (offsets in the joined sources string) back to a single
 * source document and a local offset range within it.
 * The backend joins sources with no separator, so lengths add directly.
 */
export function locateSegmentInSources(
  sources: SourceDoc[],
  range: TextRange,
): { sourceIndex: number; start: number; end: number } | null {
  let offset = 0;
  for (let i = 0; i < sources.length; i++) {
    const len = sources[i].text.length;
    const segStart = range.start;
    const segEnd = range.end;
    // Segment lies (at least partially) inside this source
    if (segStart < offset + len && segEnd > offset) {
      const localStart = Math.max(0, segStart - offset);
      const localEnd = Math.min(len, segEnd - offset);
      if (localEnd > localStart) {
        return { sourceIndex: i, start: localStart, end: localEnd };
      }
    }
    offset += len;
  }
  return null;
}

/** All segments for a claim, validated against the response. */
export function claimSegments(claim: HalloumiClaim, response: HalloumiResponse): TextRange[] {
  const ranges: TextRange[] = [];
  for (const id of claim.segmentIds) {
    const seg = response.segments[id];
    if (
      seg &&
      Number.isFinite(seg.startOffset) &&
      Number.isFinite(seg.endOffset) &&
      seg.endOffset > seg.startOffset
    ) {
      ranges.push({ start: seg.startOffset, end: seg.endOffset });
    }
  }
  return ranges;
}

/** Which source documents a claim references (by joined-offset mapping). */
export function claimSourceIndices(
  claim: HalloumiClaim,
  response: HalloumiResponse,
  sources: SourceDoc[],
): number[] {
  const indices = new Set<number>();
  for (const range of claimSegments(claim, response)) {
    const loc = locateSegmentInSources(sources, range);
    if (loc) indices.add(loc.sourceIndex);
  }
  return Array.from(indices).sort((a, b) => a - b);
}