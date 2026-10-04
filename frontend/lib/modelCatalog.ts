/**
 * Frontend types for the backend model catalog (GET /models).
 *
 * The backend (rag_facts_check/model_registry.py) is the single source of
 * truth — this file only mirrors the public shape. The backend validates
 * every requested model id against its server-side allowlist; the UI never
 * sends arbitrary ids to the LLM provider.
 */

export type ModelCapability =
  | "text"
  | "vision"
  | "audio"
  | "video"
  | "reasoning"
  | "coding"
  | "translation"
  | "image-generation";

export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  description: string;
  context: string;
  free: boolean;
  capabilities: ModelCapability[];
  recommended?: boolean;
  experimental?: boolean;
  default?: boolean;
  supported_for_fact_checking?: boolean;
  specialization?: string | null;
}

/** Used when nothing is stored locally yet. Must match the backend default. */
export const DEFAULT_MODEL_ID = "qwen/qwen3.8-omni-flash:free";

/** Human label + compact glyph for capability badges. */
export const CAPABILITY_META: Record<
  ModelCapability,
  { label: string; icon: string }
> = {
  text: { label: "Text", icon: "📄" },
  vision: { label: "Vision", icon: "👁" },
  audio: { label: "Audio", icon: "🎧" },
  video: { label: "Video", icon: "🎬" },
  reasoning: { label: "Reasoning", icon: "🧠" },
  coding: { label: "Coding", icon: "⌨" },
  translation: { label: "Translation", icon: "🌐" },
  "image-generation": { label: "Image Generation", icon: "🎨" },
};

/** Parse a context label like "1M", "256K" or "—" into a token count. */
export function contextTokens(context: string): number | null {
  const m = /^([\d.]+)\s*(K|M)?$/i.exec(context.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || "").toUpperCase();
  if (unit === "M") return Math.round(n * 1_000_000);
  if (unit === "K") return Math.round(n * 1_000);
  return Math.round(n);
}

/** "Long context" threshold for the model-browser filter. */
export const LONG_CONTEXT_TOKENS = 256_000;

export function isLongContext(model: ModelInfo): boolean {
  const t = contextTokens(model.context);
  return t !== null && t >= LONG_CONTEXT_TOKENS;
}

/** Models excluded from the normal browsing/selection experience. */
export function isSupportedForFactChecking(model: ModelInfo): boolean {
  return model.supported_for_fact_checking !== false;
}