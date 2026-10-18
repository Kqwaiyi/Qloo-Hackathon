import { APIError, getIP } from "better-auth/api";

import { BOT_CHECK_ENDPOINTS, BOT_CHECK_TIMEOUT_MS } from "@/config/accounts";
import { COPY } from "@/config/copy";

import type { HookContext } from "./create-auth";

// The Bot Check: Cloudflare Turnstile, checked in our own `hooks.before` so that it fails open when
// Cloudflare can't be reached (ADR-0006). A missing or rejected token is always refused.

/** Better Auth's error code when the Bot Check refuses a request. */
export const BOT_CHECK_FAILED = "BOT_CHECK_FAILED";

/** The request header that carries the Turnstile widget's token, as Better Auth's own captcha plugin names it. */
export const BOT_CHECK_TOKEN_HEADER = "x-captcha-response";

/** Cloudflare's endpoint that judges a token. */
export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The one way the Bot Check talks to Cloudflare: `fetch` in the app, a fake in tests. */
export type TurnstileTransport = (request: Request) => Promise<Response>;

export interface BotCheckOptions {
  /** The Turnstile secret, which never leaves the server. */
  secret: string;
  transport: TurnstileTransport;
  /** The hostnames a token must have been made on, on Production. Unset, any hostname will do. */
  allowedHostnames?: readonly string[];
}

/** The Bot Check as the environment sets it up, and the site key the forms' widget needs. */
export interface BotCheckSetup {
  options: BotCheckOptions;
  siteKey: string;
}

/**
 * TURNSTILE_SECRET_KEY and TURNSTILE_SITE_KEY. With no secret the Bot Check is off, the local
 * development default, except on Production, where that's an error rather than an unprotected app.
 * On Production a token must also have been made on one of `productionHostnames`.
 */
export function botCheckFromEnvironment(productionHostnames: readonly string[]): BotCheckSetup | null {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const siteKey = process.env.TURNSTILE_SITE_KEY;
  const production = process.env.VERCEL_ENV === "production";
  if (!secret) {
    if (production) throw new Error("TURNSTILE_SECRET_KEY is not set.");
    return null;
  }
  if (!siteKey) throw new Error("TURNSTILE_SITE_KEY must be set with TURNSTILE_SECRET_KEY.");
  return {
    options: { secret, transport: (request) => fetch(request), allowedHostnames: production ? productionHostnames : undefined },
    siteKey,
  };
}

type Verdict = { verdict: "pass" } | { verdict: "rejected" } | { verdict: "unreachable"; reason: string };

/**
 * For the `hooks.before` on every endpoint: on the Bot Check's endpoints, refuses a request whose
 * token is missing or that Cloudflare rejects. When Cloudflare can't be reached the request goes
 * on, and the runtime log says so. Without options the Bot Check is off.
 */
export function botCheckGuard(options: BotCheckOptions | undefined) {
  return async function botCheck(ctx: HookContext): Promise<void> {
    if (!options || !BOT_CHECK_ENDPOINTS.includes(ctx.path)) return;
    // A server call without a request's headers, such as a team script's, comes from no browser.
    if (!ctx.headers) return;
    const token = ctx.headers.get(BOT_CHECK_TOKEN_HEADER)?.trim();
    if (!token) throw botCheckFailed();
    const outcome = await verify(options, token, getIP(ctx.headers, ctx.context.options));
    if (outcome.verdict === "rejected") throw botCheckFailed();
    if (outcome.verdict === "unreachable") console.warn(`The Bot Check let a request to ${ctx.path} through: ${outcome.reason}.`);
  };
}

/** Asks Cloudflare about the token, waiting at most BOT_CHECK_TIMEOUT_MS. */
async function verify(options: BotCheckOptions, token: string, remoteIp: string | null): Promise<Verdict> {
  const body = new URLSearchParams({ secret: options.secret, response: token });
  // The visitor's own address, so Cloudflare judges them rather than our server.
  if (remoteIp) body.set("remoteip", remoteIp);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<Verdict>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ verdict: "unreachable", reason: `no answer within ${BOT_CHECK_TIMEOUT_MS / 1000} seconds` });
    }, BOT_CHECK_TIMEOUT_MS);
  });
  try {
    const request = new Request(TURNSTILE_VERIFY_URL, { method: "POST", body, signal: controller.signal });
    return await Promise.race([ask(options, request), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

async function ask(options: BotCheckOptions, request: Request): Promise<Verdict> {
  let response: Response;
  try {
    response = await options.transport(request);
  } catch (error) {
    return { verdict: "unreachable", reason: `network error (${error instanceof Error ? error.message : "unknown error"})` };
  }
  if (response.status >= 500) return { verdict: "unreachable", reason: `Cloudflare answered ${response.status}` };
  // Anything else Cloudflare says counts against the token: a bot can't make that look like an outage.
  const answer: unknown = await response.json().catch(() => undefined);
  const { success, hostname } = (answer ?? {}) as { success?: unknown; hostname?: unknown };
  if (!response.ok || success !== true) return { verdict: "rejected" };
  if (options.allowedHostnames && !options.allowedHostnames.includes(String(hostname))) return { verdict: "rejected" };
  return { verdict: "pass" };
}

function botCheckFailed(): APIError {
  return new APIError("FORBIDDEN", { code: BOT_CHECK_FAILED, message: COPY.botCheckFailed });
}
