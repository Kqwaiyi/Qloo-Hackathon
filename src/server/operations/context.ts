import type { AiProvider } from "@/server/ai/provider";
import type { Auth } from "@/server/auth/create-auth";
import type { BlobStore } from "@/server/blob/store";
import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/database";
import type { ResponseCookies } from "@/server/http/cookies";
import type { ProductSearch } from "@/server/product-search/provider";
import type { StylingRunner } from "@/server/stylings/runner";

/**
 * Everything a server operation may touch. The edges (the clock, the AI provider, Blob storage,
 * what runs Stylings, the product search, and later the email transport) are injected so tests can
 * replace them.
 */
export interface OperationContext {
  db: Database;
  auth: Auth;
  clock: Clock;
  ai: AiProvider;
  blob: BlobStore;
  /** Runs Stylings, whose steps call Qloo and the product search. */
  stylings: StylingRunner;
  /** The product search, whose free Product check the price refresh calls. */
  productSearch: ProductSearch;
  /**
   * The secret salt the Guest Page's daily limit hashes internet addresses under
   * (`guestIpSaltFromEnvironment`), or null on a deployment without one, which keeps the Guest Page closed.
   */
  guestIpSalt: string | null;
  /** The incoming request's headers, cookies included. */
  requestHeaders: Headers;
  /** Cookies to send back with the response. */
  responseCookies: ResponseCookies;
}

/** What an operation calling Better Auth for the browser's request needs: its headers in, its cookies out. */
export type AuthRequestContext = Pick<OperationContext, "auth" | "requestHeaders" | "responseCookies">;

export type Refusal<R> = { ok: false } & R;
export type Result<T, R> = ({ ok: true } & T) | Refusal<R>;
