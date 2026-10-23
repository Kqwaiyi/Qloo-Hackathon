// Gemini in tests, for the Gemini adapter's tests and the AI environment's.

/** A request as it left for Gemini. */
export interface RecordedGeminiRequest {
  url: URL;
  headers: Headers;
  body: GeminiRequestBody;
}

export interface GeminiRequestBody {
  contents: { role: string; parts: GeminiPart[] }[];
  systemInstruction?: { parts: GeminiPart[] };
  generationConfig?: Record<string, unknown>;
}

export type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string }; fileData?: unknown; thought?: boolean };

/** Gemini in tests: it answers every request with `respond`, and records each one. */
export class FakeGemini {
  readonly requests: RecordedGeminiRequest[] = [];
  respond: (request: RecordedGeminiRequest) => Response = () => geminiError(500);

  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const body = JSON.parse(String(init?.body)) as GeminiRequestBody;
    const recorded = { url, headers: new Headers(init?.headers), body };
    this.requests.push(recorded);
    return this.respond(recorded);
  };
}

/** Gemini's reply carrying `text`, as a model that finished normally sends it. */
export function geminiText(text: string): Response {
  return Response.json({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] });
}

/** Gemini's reply carrying `value` as JSON, as structured output sends it. */
export function geminiJson(value: unknown): Response {
  return geminiText(JSON.stringify(value));
}

/** One of Gemini's errors, with no wait before the AI SDK retries it. */
export function geminiError(status: number): Response {
  return Response.json({ error: { code: status, message: `Gemini error ${status}` } }, { status, headers: { "retry-after-ms": "0" } });
}
