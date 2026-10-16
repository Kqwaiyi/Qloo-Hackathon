import type { AiProvider } from "@/server/ai/provider";
import type { Auth } from "@/server/auth/create-auth";
import type { BlobStore } from "@/server/blob/store";
import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/database";
import type { ResponseCookies } from "@/server/http/cookies";

/**
 * Everything a server operation may touch. The edges (the clock, the AI provider, Blob storage,
 * and later the Qloo transport and the email transport) are injected so tests can replace them.
 */
export interface OperationContext {
  db: Database;
  auth: Auth;
  clock: Clock;
  ai: AiProvider;
  blob: BlobStore;
  /** The incoming request's headers, cookies included. */
  requestHeaders: Headers;
  /** Cookies to send back with the response. */
  responseCookies: ResponseCookies;
}

export type Refusal<R> = { ok: false } & R;
export type Result<T, R> = ({ ok: true } & T) | Refusal<R>;
