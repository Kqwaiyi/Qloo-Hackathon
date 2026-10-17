import type { QlooTransport } from "./client";

/** A request as it left for Qloo. */
export interface RecordedQlooRequest {
  method: string;
  url: URL;
  headers: Headers;
}

/**
 * Qloo in tests: it answers with small hand-written responses and records every request, so tests
 * can see which requests went out and what they carried. It answers with no entities until a test
 * sets `respond`.
 */
export class FakeQlooTransport {
  readonly requests: RecordedQlooRequest[] = [];
  respond: (request: RecordedQlooRequest) => Response = () => qlooResponse([]);
  /** Runs while each request waits for its answer, so a test can see which requests are in flight together. */
  duringRequest?: (request: RecordedQlooRequest) => Promise<void>;

  readonly send: QlooTransport = async (request) => {
    const recorded = { method: request.method, url: new URL(request.url), headers: new Headers(request.headers) };
    this.requests.push(recorded);
    await this.duringRequest?.(recorded);
    return this.respond(recorded);
  };
}

/** A Qloo person entity, as Qloo sends it. */
export function qlooPerson(entityId: string, name: string, affinity: number) {
  return { entity_id: entityId, name, type: "urn:entity", subtype: "urn:entity:person", properties: {}, query: { affinity } };
}

/** A successful Insights response holding `entities`, as Qloo sends it, with any `headers`. */
export function qlooResponse(entities: readonly object[], headers?: HeadersInit): Response {
  return Response.json({ success: true, results: { entities } }, { headers });
}

/** Qloo's "too many requests". */
export function qlooTooManyRequests(headers?: HeadersInit): Response {
  return Response.json({ error: "Too many requests" }, { status: 429, headers });
}
