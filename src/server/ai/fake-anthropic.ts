/** A request as it left for Anthropic, its JSON body parsed. */
export interface RecordedAnthropicRequest {
  url: URL;
  headers: Headers;
  body: AnthropicRequestBody;
}

/** The parts of a Messages API request the tests look at. */
export interface AnthropicRequestBody {
  model: string;
  system?: string | AnthropicContentBlock[];
  messages: { role: string; content: string | AnthropicContentBlock[] }[];
  thinking?: Record<string, unknown>;
  output_config?: Record<string, unknown>;
  temperature?: number;
  [key: string]: unknown;
}

export interface AnthropicContentBlock {
  type: string;
  text?: string;
  source?: { type: string; media_type?: string; data?: string; url?: string };
  [key: string]: unknown;
}

/**
 * Anthropic in tests: it answers every request with `respond`, and records each one. Until a test
 * sets `respond`, every request errors.
 */
export class FakeAnthropic {
  readonly requests: RecordedAnthropicRequest[] = [];
  respond: (request: RecordedAnthropicRequest) => Response = () => anthropicError(500, "api_error");

  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const body = JSON.parse(String(init?.body)) as AnthropicRequestBody;
    const recorded = { url, headers: new Headers(init?.headers), body };
    this.requests.push(recorded);
    return this.respond(recorded);
  };
}

/**
 * Claude's reply carrying `text`, as a model that finished normally sends it. Its thinking comes
 * first, with no text, as it does with thinking display omitted.
 */
export function anthropicText(text: string): Response {
  return anthropicMessage([THINKING, { type: "text", text }], "end_turn");
}

/** Claude's reply carrying `value` as JSON, as structured output sends it. */
export function anthropicJson(value: unknown): Response {
  return anthropicText(JSON.stringify(value));
}

/** One tool call Claude makes: its ID, the tool's name and its input. */
export interface AnthropicToolCall {
  id: string;
  name: string;
  input: unknown;
}

/** Claude's reply calling tools, after thinking with no text, as it does with thinking display omitted, and a note. */
export function anthropicToolUse(calls: AnthropicToolCall[], note?: string): Response {
  return anthropicMessage([THINKING, ...textAndToolUse(note, calls)], "tool_use");
}

/** Claude refusing to answer, with whatever it had written so far: text, and any tool calls it had finished. */
export function anthropicRefusal(writtenSoFar?: string, calls: AnthropicToolCall[] = []): Response {
  return anthropicMessage(textAndToolUse(writtenSoFar, calls), "refusal");
}

/** Claude's thinking with thinking display omitted: no text, only its signature. */
const THINKING = { type: "thinking", thinking: "", signature: "a-signature" };

/** Claude's text, if it wrote any, then its tool calls, as content blocks. */
function textAndToolUse(text: string | undefined, calls: AnthropicToolCall[]): unknown[] {
  return [...(text === undefined ? [] : [{ type: "text", text }]), ...calls.map(({ id, name, input }) => ({ type: "tool_use", id, name, input }))];
}

function anthropicMessage(content: unknown[], stopReason: string): Response {
  return Response.json({
    type: "message",
    id: "msg_fake",
    role: "assistant",
    model: "claude-haiku-5-5",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 100 },
  });
}

/** One of Anthropic's errors, with no wait before the AI SDK retries it. */
export function anthropicError(status: number, type: string): Response {
  return Response.json({ type: "error", error: { type, message: `Anthropic ${type} ${status}` } }, { status, headers: { "retry-after-ms": "0" } });
}

/** Every image the request carries, as Anthropic receives it. */
export function imagesOf({ body }: RecordedAnthropicRequest): AnthropicContentBlock[] {
  return body.messages.flatMap(({ content }) => (typeof content === "string" ? [] : content)).filter(({ type }) => type === "image");
}

/** All the request's text, the system prompt included. */
export function textOf({ body }: RecordedAnthropicRequest): string {
  const system = typeof body.system === "string" ? [{ type: "text", text: body.system }] : (body.system ?? []);
  const messages = body.messages.flatMap(({ content }) => (typeof content === "string" ? [{ type: "text", text: content }] : content));
  return [...system, ...messages].flatMap(({ text }) => (text === undefined ? [] : [text])).join("\n");
}
