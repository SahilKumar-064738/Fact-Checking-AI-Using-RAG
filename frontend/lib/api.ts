/**
 * API client for the RAG Facts Check backend.
 *
 * All HTTP communication lives here — components never call fetch() directly.
 * Base URL comes from NEXT_PUBLIC_API_BASE_URL (never hardcoded in components).
 * The LLM API key stays on the backend; nothing sensitive reaches the browser.
 */

import type {
  ExtractSourceResponse,
  HalloumiRequest,
  HalloumiResponse,
  HealthResponse,
  StageEvent,
} from "./types";
import { parseHalloumiResponse, parseHealthResponse, StageEventSchema } from "./validation";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getApiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
  return url.replace(/\/+$/, "");
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/** GET /health — used for the API status indicator. */
export async function getHealth(timeoutMs = 5000): Promise<HealthResponse> {
  const res = await fetch(`${getApiBaseUrl()}/health`, {
    method: "GET",
    signal: timeoutSignal(timeoutMs),
  });
  if (!res.ok) {
    throw new ApiError(`Health check failed with status ${res.status}`, res.status);
  }
  const json = await res.json();
  return parseHealthResponse(json);
}

/**
 * POST /halloumi/generate — blocking verification (backwards-compatible path).
 */
export async function verifyAnswer(request: HalloumiRequest): Promise<HalloumiResponse> {
  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}/halloumi/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch (e) {
    throw new ApiError("RAG Facts Check couldn't reach the verification backend.");
  }

  if (!res.ok) {
    const detail = await safeDetail(res);
    throw new ApiError(humanMessage(res.status), res.status, detail);
  }

  const json = await res.json();
  try {
    return parseHalloumiResponse(json);
  } catch {
    throw new ApiError("The verification service returned an unexpected response.");
  }
}

/**
 * POST /sources/extract — extract readable text from an uploaded document.
 *
 * The backend processes the file in memory (PDF/DOCX/TXT/MD) and returns
 * normalized source text. Errors surface as ApiError with the backend's
 * user-safe detail message.
 */
export async function extractSourceDocument(file: File): Promise<ExtractSourceResponse> {
  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}/sources/extract`, {
      method: "POST",
      body: form,
    });
  } catch {
    throw new ApiError("RAG Facts Check couldn't reach the verification backend.");
  }

  if (!res.ok) {
    const detail = await safeDetail(res);
    // Prefer the backend's specific, user-safe message (e.g. "This PDF
    // does not contain extractable text…") over the generic one.
    let message: string | undefined;
    try {
      const parsed = JSON.parse(detail || "{}") as { detail?: unknown };
      if (typeof parsed.detail === "string" && parsed.detail) message = parsed.detail;
    } catch {
      // non-JSON body — fall through to the generic message
    }
    throw new ApiError(message ?? humanMessage(res.status), res.status, detail);
  }

  return (await res.json()) as ExtractSourceResponse;
}

async function safeDetail(res: Response): Promise<string | undefined> {
  try {
    const text = await res.text();
    return text.slice(0, 2000);
  } catch {
    return undefined;
  }
}

function humanMessage(status: number): string {
  switch (status) {
    case 401:
    case 403:
      return "Verification service authentication failed.";
    case 404:
      return "Verification endpoint not found.";
    case 422:
      return "The verification request was rejected by the backend.";
    case 429:
      return "The verification service is busy — too many requests.";
    case 500:
    case 502:
    case 503:
      return "Verification service error.";
    default:
      return "Verification service unavailable";
  }
}

// ---------------------------------------------------------------------------
// SSE streaming with graceful fallback
// ---------------------------------------------------------------------------

export interface StreamCallbacks {
  onStage: (stage: StageEvent) => void;
  onResult: (result: HalloumiResponse) => void;
  onError: (error: ApiError) => void;
}

/**
 * POST /halloumi/generate/stream — real progress events via SSE.
 *
 * Uses fetch() + ReadableStream (EventSource cannot POST). Falls back to the
 * blocking endpoint when streaming is unavailable, so the UI keeps working
 * against older backends.
 */
export async function verifyAnswerWithProgress(
  request: HalloumiRequest,
  callbacks: StreamCallbacks,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}/halloumi/generate/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    // Network failure — fall back to blocking call for consistent error handling
    try {
      const result = await verifyAnswer(request);
      callbacks.onResult(result);
    } catch (e) {
      callbacks.onError(e instanceof ApiError ? e : new ApiError("Request failed."));
    }
    return;
  }

  if (!res.ok) {
    // Stream endpoint missing (e.g., older backend) → fall back to blocking path
    if (res.status === 404 || res.status === 405) {
      try {
        const result = await verifyAnswer(request);
        callbacks.onResult(result);
      } catch (e) {
        callbacks.onError(e instanceof ApiError ? e : new ApiError("Request failed."));
      }
      return;
    }
    const detail = await safeDetail(res);
    callbacks.onError(new ApiError(humanMessage(res.status), res.status, detail));
    return;
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !res.body) {
    // Not an SSE stream — treat body as a single JSON result if possible
    try {
      const json = await res.json();
      callbacks.onResult(parseHalloumiResponse(json));
    } catch {
      callbacks.onError(new ApiError("Unexpected response format from the stream."));
    }
    return;
  }

  await consumeSseStream(res.body, callbacks);
}

async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  callbacks: StreamCallbacks,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let gotTerminal = false;

  const dispatch = (eventName: string, dataStr: string) => {
    let data: unknown;
    try {
      data = JSON.parse(dataStr);
    } catch {
      return; // ignore malformed payloads — never fabricate
    }

    if (eventName === "stage") {
      const parsed = StageEventSchema.safeParse(data);
      if (parsed.success) callbacks.onStage(parsed.data);
    } else if (eventName === "result") {
      try {
        callbacks.onResult(parseHalloumiResponse(data));
        gotTerminal = true;
      } catch {
        callbacks.onError(
          new ApiError("The verification service returned an unexpected response."),
        );
        gotTerminal = true;
      }
    } else if (eventName === "error") {
      const detail =
        typeof data === "object" && data !== null && "detail" in data
          ? String((data as { detail: unknown }).detail)
          : undefined;
      callbacks.onError(new ApiError("Verification service error.", 500, detail));
      gotTerminal = true;
    }
  };

  const processBuffer = () => {
    // SSE frames are separated by blank lines
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) eventName = line.slice(7).trim();
        else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
      }
      if (dataLines.length > 0) {
        dispatch(eventName, dataLines.join("\n"));
      }
    }
  };

  try {
    while (!gotTerminal) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      processBuffer();
    }
  } catch {
    if (!gotTerminal) {
      callbacks.onError(new ApiError("The connection to the verification service was interrupted."));
    }
  } finally {
    reader.releaseLock();
  }
}