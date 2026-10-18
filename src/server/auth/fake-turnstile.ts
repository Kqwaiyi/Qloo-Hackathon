import type { TurnstileTransport } from "./bot-check";

/** A Bot Check request as it left for Cloudflare. */
export interface RecordedTurnstileRequest {
  /** The Turnstile secret the request carried. */
  secret: string | null;
  token: string | null;
  /** The visitor's IP address, as sent for Cloudflare to judge. */
  ip: string | null;
}

/**
 * How the fake answers: the token passes, Cloudflare rejects it with an error code (such as
 * `invalid-input-response` or `timeout-or-duplicate`), Cloudflare can't be reached, it answers
 * with a 5xx, or it never answers.
 */
export type FakeTurnstileAnswer = "pass" | { reject: string } | "unreachable" | "server-error" | "slow";

/**
 * Cloudflare Turnstile in tests: it answers as the test sets, passing every token until then, and
 * records every request, so tests can see what was sent to Cloudflare.
 */
export class FakeTurnstileTransport {
  readonly requests: RecordedTurnstileRequest[] = [];
  answer: FakeTurnstileAnswer = "pass";
  /** The hostname a token was made on, as Cloudflare reports it. */
  hostname = "localhost";

  readonly send: TurnstileTransport = async (request) => {
    const form = new URLSearchParams(await request.text());
    this.requests.push({ secret: form.get("secret"), token: form.get("response"), ip: form.get("remoteip") });
    const answer = this.answer;
    if (answer === "unreachable") throw new TypeError("fetch failed");
    if (answer === "server-error") return new Response("Internal Server Error", { status: 500 });
    if (answer === "slow") {
      // Like `fetch`, it gives up only when the request is aborted.
      return new Promise((_, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason)));
    }
    if (answer === "pass") {
      return Response.json({ success: true, "error-codes": [], challenge_ts: new Date().toISOString(), hostname: this.hostname });
    }
    return Response.json({ success: false, "error-codes": [answer.reject] });
  };
}
