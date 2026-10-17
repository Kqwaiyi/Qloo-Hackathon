import { FakeAiProvider } from "@/server/ai/fake";
import { createAuth } from "@/server/auth/create-auth";
import { MemoryBlobStore } from "@/server/blob/memory";
import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/database";
import { openPgliteDatabase } from "@/server/db/pglite";
import { CapturingEmailTransport } from "@/server/email/capturing";
import { createEmailSender, type EmailSender } from "@/server/email/send-email";
import { type CookieToSet, forwardSetCookies, type ResponseCookies } from "@/server/http/cookies";
import type { PhotoConsentTicks } from "@/server/operations/consultations";
import type { OperationContext } from "@/server/operations/context";
import { QlooClient } from "@/server/qloo/client";
import { FakeQlooTransport } from "@/server/qloo/fake";
import { InlineStylingRunner } from "@/server/stylings/inline-runner";

const BASE_URL = "http://localhost:3000";

/**
 * The consent sheet with both boxes ticked, as "Get my Outfits" sends it. Starting a Consultation
 * with it records the user's agreement to the photo notice first.
 */
export const BOTH_CONSENT_BOXES_TICKED: PhotoConsentTicks = { storeAndProcess: true, sendToGemini: true };

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
  private readonly ip?: string;
  /**
   * The country of the browser's IP address, as Vercel's `x-vercel-ip-country` header gives it, or
   * undefined for no header, as in local development. A test may move the browser.
   */
  ipCountry?: string;

  /** `ip` is the browser's address, which its requests carry as Vercel sets it, and `ipCountry` its country. */
  constructor({ ip, ipCountry }: { ip?: string; ipCountry?: string } = {}) {
    this.ip = ip;
    this.ipCountry = ipCountry;
  }

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
    if (this.ip) headers.set("x-forwarded-for", this.ip);
    if (this.ipCountry !== undefined) headers.set("x-vercel-ip-country", this.ipCountry);
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
  /** The fake AI adapter, with no delay. Tests set its scenario. */
  ai: FakeAiProvider;
  blob: MemoryBlobStore;
  /** Qloo: it answers with no one until a test sets `respond`, and records every request. */
  qloo: FakeQlooTransport;
  /** Runs started Stylings when the test calls `runPending()`, through the real Qloo client and cache. */
  stylings: InlineStylingRunner;
  /** The send-email function every email goes through, Better Auth's included. */
  emailSender: EmailSender;
  /** Where the email goes instead of Gmail: every message sent, kept for the test to read. */
  emails: CapturingEmailTransport;
  /** A server operation's context for a request coming from this browser. */
  context(browser: TestBrowser): OperationContext;
  /** Sends a request straight to Better Auth's HTTP handler, as a script skipping our forms could. */
  postToAuth(path: string, body: unknown, browser: TestBrowser): Promise<Response>;
  /** Opens a link to Better Auth, such as one from an email, in this browser. Redirects aren't followed. */
  openAuthLink(url: string, browser: TestBrowser): Promise<Response>;
  /** The link in the newest email sent to this address. */
  linkEmailedTo(address: string): string;
  /** Opens the link in the newest email sent to this address, in this browser. */
  openEmailedLink(address: string, browser: TestBrowser): Promise<Response>;
}

/**
 * A fresh database with the real migrations, Better Auth running for real against it, a clock the
 * test controls (starting at 2026-10-16 12:00 UTC), the fake AI adapter, an in-memory Blob store,
 * a fake Qloo, Stylings run inline and email captured. Create one per test file. Better Auth's rate
 * limits are off, as in local development, unless `rateLimit` turns them on.
 */
export async function createTestHarness({ rateLimit = false }: { rateLimit?: boolean } = {}): Promise<TestHarness> {
  const db = await openPgliteDatabase();
  const clock = new TestClock(new Date("2026-10-16T12:00:00Z"));
  const ai = new FakeAiProvider({ delayMs: 0 });
  const blob = new MemoryBlobStore();
  const qloo = new FakeQlooTransport();
  const qlooClient = new QlooClient({ db, clock, transport: qloo.send, apiUrl: "https://qloo.test", apiKey: "test-qloo-key" });
  const stylings = new InlineStylingRunner({ db, clock, qloo: qlooClient, ai, blob });
  const emails = new CapturingEmailTransport();
  const emailSender = createEmailSender({ db, clock, transport: emails });
  const auth = createAuth({
    db,
    clock,
    baseURL: BASE_URL,
    secret: "test-secret-that-is-at-least-32-characters-long",
    emailSender,
    teamEmail: "team@example.test",
    rateLimit,
  });

  return {
    db,
    auth,
    clock,
    ai,
    blob,
    qloo,
    stylings,
    emailSender,
    emails,
    context: (browser) => ({
      db,
      auth,
      clock,
      ai,
      blob,
      stylings,
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
    openAuthLink,
    linkEmailedTo,
    openEmailedLink: (address, browser) => openAuthLink(linkEmailedTo(address), browser),
  };

  async function openAuthLink(url: string, browser: TestBrowser): Promise<Response> {
    const response = await auth.handler(new Request(url, { headers: browser.requestHeaders() }));
    browser.receive(response);
    return response;
  }

  function linkEmailedTo(address: string): string {
    const text = emails.to(address).at(-1)?.text ?? "";
    const link = /https?:\/\/\S+/.exec(text)?.[0];
    if (!link) throw new Error(`No link was emailed to ${address}.`);
    return link;
  }
}
