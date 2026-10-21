import type { ExchangeRateTransport } from "./rates";

/** A request as it left for a rate source. */
export interface RecordedExchangeRateRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: string;
}

/**
 * The exchange-rate sources in tests: every request is answered by `respond`, which has Frankfurter
 * give a few currencies' rates until a test says otherwise, and recorded, so tests can see what the
 * sources were sent.
 */
export class FakeExchangeRateTransport {
  readonly requests: RecordedExchangeRateRequest[] = [];
  respond: (url: URL) => Response | Promise<Response> = () => frankfurterRates({ EUR: 0.89166, GBP: 0.74925, IDR: 17986 });

  readonly send: ExchangeRateTransport = async (request) => {
    const url = new URL(request.url);
    this.requests.push({ method: request.method, url, headers: new Headers(request.headers), body: await request.text() });
    return this.respond(url);
  };
}

/** Frankfurter's answer for these rates to the US dollar, as it sends them. */
export function frankfurterRates(rates: Record<string, number>, date = "2026-10-21"): Response {
  return Response.json(Object.entries(rates).map(([quote, rate]) => ({ date, base: "USD", quote, rate })));
}

/** fawazahmed0's currency API's answer for these rates to the US dollar, by their lower-case codes, as it sends them. */
export function fawazahmed0Rates(rates: Record<string, number>, date = "2026-10-21"): Response {
  return Response.json({ date, usd: rates });
}
