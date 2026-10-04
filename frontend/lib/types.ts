/**
 * TypeScript types matching the ACTUAL backend schema.
 *
 * Backend endpoints (FastAPI, rag_facts_check/server.py):
 * - GET  /health                 -> { status, version }
 * - POST /halloumi/generate      -> HalloumiResponse (blocking)
 * - POST /halloumi/generate/stream -> SSE: stage events + final result
 *
 * Verdict values produced by the backend:
 *   "supported" | "not_enough_info" | "contradicted"
 * Per-claim scores are verdict-based: supported=1.0, nei=0.4, contradicted=0.0
 */

export type Verdict = "supported" | "not_enough_info" | "contradicted";

/** A segment is an evidence span within the JOINED sources string. */
export interface HalloumiSegment {
  id: number;
  startOffset: number;
  endOffset: number;
}

/** A claim as returned by /halloumi/generate. */
export interface HalloumiClaim {
  /** The claim text (excerpt from the answer, or rephrased). */
  claimString: string;
  /** Start offset of the claim in the answer. */
  startOffset: number;
  /** End offset of the claim in the answer (exclusive). */
  endOffset: number;
  /** Segment ids referencing evidence spans in the joined sources. */
  segmentIds: string[];
  /** Verdict-based score: 1.0 supported, 0.4 not_enough_info, 0.0 contradicted. */
  score: number;
  /** Explanation of the verdict from the LLM. */
  rationale: string;
  /** True when the LLM paraphrased and no exact span was found in the answer. */
  skipped: boolean;
  // --- Additive detail fields (may be absent on older backends) ---
  verdict?: Verdict;
  evidence?: string;
  confidence?: number;
  document_index?: number | null;
}

/** Full response of POST /halloumi/generate. */
export interface HalloumiResponse {
  /** Overall answer quality score, 0-10. */
  answer_score: number;
  claims: HalloumiClaim[];
  /** Map of segment id -> evidence span in the joined sources string. */
  segments: Record<string, HalloumiSegment>;
  /** Which model produced this result (additive; older backends omit it). */
  model?: string;
}

/** GET /health response. */
export interface HealthResponse {
  status: string;
  version?: string;
  /** Model configured on the backend (never includes secrets). */
  model?: string;
}

/** Response of POST /sources/extract. */
export interface ExtractSourceResponse {
  filename: string;
  text: string;
  chars: number;
}

/** A source document entered by the user (frontend state only). */
export interface SourceDoc {
  /** Stable client-side id for React keys. */
  id: string;
  title: string;
  text: string;
  sourceType: SourceType;
  url: string;
  /** Original file name for uploaded documents. */
  fileName?: string;
  /** File kind label (PDF/DOCX/TXT/MD) for uploaded documents. */
  fileKind?: string;
}

export type SourceType = "text" | "web" | "file" | "other";

/** Structured source as accepted by the backend HalloumiSource model. */
export interface HalloumiSourceInput {
  text: string;
  title?: string | null;
  source_type?: string | null;
  link?: string | null;
}

/** Request body for /halloumi/generate. */
export interface HalloumiRequest {
  answer: string;
  sources: (string | HalloumiSourceInput)[];
  max_context_segments?: number;
  batch_size?: number | null;
  /**
   * Requested LLM model id. The backend validates this against a
   * server-side allowlist; arbitrary ids are rejected with 422.
   */
  model?: string | null;
}

/**
 * Real pipeline stages emitted by the backend SSE stream
 * (rag_facts_check/server.py -> /halloumi/generate/stream).
 */
export type BackendStage =
  | "started"
  | "extracting_claims"
  | "claims_extracted"
  | "verifying_claims"
  | "claims_verified"
  | "scoring";

/** A progress event from the backend, validated on arrival. */
export interface StageEvent {
  event: BackendStage;
  count?: number;
  total?: number;
  verified?: number;
}

/** Verification phase for the UI state machine. */
export type VerificationPhase =
  | "idle"
  | "connecting"
  | "running"
  | "complete"
  | "error";

/** Derived per-verdict counts for the analytics summary. */
export interface VerdictCounts {
  supported: number;
  notEnoughInfo: number;
  contradicted: number;
  skipped: number;
}