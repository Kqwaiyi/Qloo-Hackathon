import { createAuth } from "@/server/auth/create-auth";
import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/database";
import { openPgliteDatabase } from "@/server/db/pglite";
import { type CookieToSet, forwardSetCookies, type ResponseCookies } from "@/server/http/cookies";
import type { OperationContext } from "@/server/operations/context";

const BASE_URL = "http://localhost:3000";

/** A clock the test moves by hand. */
export class TestClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(time: Date | string): void {
    this.current = new Date(time);
  }
}

/**
 * One visitor's browser: the cookies it holds and sends with each request. Like a real browser, it
 * drops a cookie once its Max-Age or Expires passes (by `Date.now()`, which tests may fake).
 */
export class TestBrowser {
  private readonly jar = new Map<string, { cookie: CookieToSet; expiresAt: number }>();

  readonly responseCookies: ResponseCookies = {
    set: (cookie) => {
      const expiresAt =
        cookie.maxAge !== undefined ? Date.now() + cookie.maxAge * 1000 : (cookie.expires?.getTime() ?? Number.POSITIVE_INFINITY);
      if (expiresAt <= Date.now()) this.jar.delete(cookie.name);
      else this.jar.set(cookie.name, { cookie, expiresAt });
    },
  };

  /** The cookie as it was last set, or undefined if the browser doesn't hold it (any more). */
  cookie(name: string): CookieToSet | undefined {
    return this.liveCookies().find((cookie) => cookie.name === name);
  }

  /** True when the browser holds a Better Auth session cookie. */
  hasSessionCookie(): boolean {
    return this.liveCookies().some((cookie) => cookie.name.endsWith("session_token"));
  }

  requestHeaders(): Headers {
    const headers = new Headers({ origin: BASE_URL, "user-agent": "vitest" });
    const cookieHeader = this.liveCookies()
      .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
      .join("; ");
    if (cookieHeader) headers.set("cookie", cookieHeader);
    return headers;
  }

  private liveCookies(): CookieToSet[] {
    return [...this.jar.values()].filter(({ expiresAt }) => expiresAt > Date.now()).map(({ cookie }) => cookie);
  }

  /** Keeps the cookies an HTTP response sets. */
  receive(response: Response): void {
    forwardSetCookies(response.headers, this.responseCookies);
  }
}

export interface TestHarness {
  db: Database;
  auth: ReturnType<typeof createAuth>;
  clock: TestClock;
  /** A server operation's context for a request coming from this browser. */
  context(browser: TestBrowser): OperationContext;
  /** Sends a request straight to Better Auth's HTTP handler, as a script skipping our forms could. */
  postToAuth(path: string, body: unknown, browser: TestBrowser): Promise<Response>;
}

/**
 * A fresh database with the real migrations, Better Auth running for real against it, and a clock
 * the test controls (starting at 2026-10-16 12:00 UTC). Create one per test file.
 */
export async function createTestHarness(): Promise<TestHarness> {
  const db = await openPgliteDatabase();
  const clock = new TestClock(new Date("2026-10-16T12:00:00Z"));
  const auth = createAuth({ db, clock, baseURL: BASE_URL, secret: "test-secret-that-is-at-least-32-characters-long" });

  return {
    db,
    auth,
    clock,
    context: (browser) => ({
      db,
      auth,
      clock,
      requestHeaders: browser.requestHeaders(),
      responseCookies: browser.responseCookies,
    }),
    async postToAuth(path, body, browser) {
      const headers = browser.requestHeaders();
      headers.set("content-type", "application/json");
      const response = await auth.handler(
        new Request(`${BASE_URL}/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) }),
      );
      browser.receive(response);
      return response;
    },
  };
}
