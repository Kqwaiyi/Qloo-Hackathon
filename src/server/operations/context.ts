import type { Auth } from "@/server/auth/create-auth";
import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/database";
import type { ResponseCookies } from "@/server/http/cookies";

/**
 * Everything a server operation may touch. The edges (the clock, and later the AI provider, the
 * Qloo transport, the email transport and Blob storage) are injected so tests can replace them.
 */
export interface OperationContext {
  db: Database;
  auth: Auth;
  clock: Clock;
  /** The incoming request's headers, cookies included. */
  requestHeaders: Headers;
  /** Cookies to send back with the response. */
  responseCookies: ResponseCookies;
}

export type Refusal<R> = { ok: false } & R;
export type Result<T, R> = ({ ok: true } & T) | Refusal<R>;
