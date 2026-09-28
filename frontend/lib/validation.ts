import { z } from "zod";

/**
 * Zod schemas for runtime validation of backend responses.
 * Fields are lenient: unknown extras are allowed, missing optional
 * detail fields are tolerated (older backend versions).
 */

export const HealthResponseSchema = z.object({
  status: z.string(),
  version: z.string().optional(),
});

const SegmentSchema = z.object({
  id: z.number(),
  startOffset: z.number().int(),
  endOffset: z.number().int(),
});

const ClaimSchema = z.object({
  claimString: z.string(),
  startOffset: z.number().int(),
  endOffset: z.number().int(),
  segmentIds: z.array(z.string()),
  score: z.number(),
  rationale: z.string(),
  skipped: z.boolean(),
  verdict: z.enum(["supported", "not_enough_info", "contradicted"]).optional(),
  evidence: z.string().optional(),
  confidence: z.number().optional(),
  document_index: z.number().int().nullable().optional(),
});

export const HalloumiResponseSchema = z.object({
  answer_score: z.number(),
  claims: z.array(ClaimSchema),
  segments: z.record(z.string(), SegmentSchema),
});

/** A stage event from the SSE stream. */
export const StageEventSchema = z.object({
  event: z.enum([
    "started",
    "extracting_claims",
    "claims_extracted",
    "verifying_claims",
    "claims_verified",
    "scoring",
  ]),
  count: z.number().optional(),
  total: z.number().optional(),
  verified: z.number().optional(),
});

/**
 * Validate a halloumi response. Returns the parsed data or throws a
 * descriptive error. Never fabricates fields when validation fails.
 */
export function parseHalloumiResponse(data: unknown) {
  return HalloumiResponseSchema.parse(data);
}

/** Validate a health response. */
export function parseHealthResponse(data: unknown) {
  return HealthResponseSchema.parse(data);
}