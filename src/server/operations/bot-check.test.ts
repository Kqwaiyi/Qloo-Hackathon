import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BOT_CHECK_TIMEOUT_MS } from "@/config/accounts";
import { user } from "@/server/db/schema";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { createDemoAccount } from "@/server/operations/team";
import { createTestHarness, TEST_BOT_CHECK_SECRET, TestBrowser, type TestHarness } from "@/test/harness";

// The Bot Check (ADR-0006): Cloudflare Turnstile, through the harness's fake. It guards sign-up by
// our form and by a direct post, and fails open only when Cloudflare can't be reached.

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

beforeEach(() => {
  harness.clock.set("2026-10-16T12:00:00Z");
  harness.turnstile.requests.length = 0;
  harness.turnstile.answer = "pass";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the Bot Check on sign-up by our form", () => {
  it("lets a visitor with a good token sign up, sending Cloudflare the secret, the form's token and the visitor's IP address", async () => {
    const browser = new TestBrowser({ ip: "203.0.113.9" });

    const result = await signUp(harness.context(browser), signUpInput({ email: "pass@example.com", botCheckToken: "form-token" }));

    expect(result).toEqual({ ok: true });
    expect(await accountExists("pass@example.com")).toBe(true);
    expect(harness.turnstile.requests).toEqual([{ secret: TEST_BOT_CHECK_SECRET, token: "form-token", ip: "203.0.113.9" }]);
  });

  it("refuses a token Cloudflare rejects, creating no account and sending no email", async () => {
    harness.turnstile.answer = { reject: "timeout-or-duplicate" };

    const result = await signUp(harness.context(new TestBrowser()), signUpInput({ email: "used@example.com" }));

    expect(result).toEqual({ ok: false, refusal: "bot-check-failed" });
    expect(await accountExists("used@example.com")).toBe(false);
    expect(harness.emails.to("used@example.com")).toEqual([]);
  });

  it("refuses a form sent without a token, without asking Cloudflare", async () => {
    const browser = new TestBrowser();
    browser.botCheckToken = undefined;

    const none = await signUp(harness.context(browser), signUpInput({ email: "none@example.com" }));
    const empty = await signUp(harness.context(browser), signUpInput({ email: "empty@example.com", botCheckToken: "" }));

    expect([none, empty]).toEqual([
      { ok: false, refusal: "bot-check-failed" },
      { ok: false, refusal: "bot-check-failed" },
    ]);
    expect(await accountExists("none@example.com")).toBe(false);
    expect(await accountExists("empty@example.com")).toBe(false);
    expect(harness.turnstile.requests).toEqual([]);
  });

  it("checks the form's token, not one the browser sent itself", async () => {
    const browser = new TestBrowser();
    browser.botCheckToken = "browser-token";

    await signUp(harness.context(browser), signUpInput({ botCheckToken: "form-token" }));

    expect(harness.turnstile.requests.map((request) => request.token)).toEqual(["form-token"]);
  });

  it("lets the sign-up go ahead when Cloudflare can't be reached, and logs it", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.turnstile.answer = "unreachable";

    const result = await signUp(harness.context(new TestBrowser()), signUpInput({ email: "offline@example.com" }));

    expect(result).toEqual({ ok: true });
    expect(await accountExists("offline@example.com")).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]!.join(" ")).toMatch(/Bot Check let a request to \/sign-up\/email through: network error/);
  });

  it("lets the sign-up go ahead when Cloudflare answers with a server error, and logs it", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.turnstile.answer = "server-error";

    const result = await signUp(harness.context(new TestBrowser()), signUpInput({ email: "5xx@example.com" }));

    expect(result).toEqual({ ok: true });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]!.join(" ")).toMatch(/Bot Check let a request to \/sign-up\/email through: Cloudflare answered 500/);
  });

  it("waits up to 5 seconds for Cloudflare, then lets the sign-up go ahead and logs it", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.turnstile.answer = "slow";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let settled = false;

    const pending = signUp(harness.context(new TestBrowser()), signUpInput({ email: "slow@example.com" })).finally(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(harness.turnstile.requests).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(BOT_CHECK_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual({ ok: true });
    expect(await accountExists("slow@example.com")).toBe(true);
    expect(log.mock.calls[0]!.join(" ")).toMatch(/Bot Check let a request to \/sign-up\/email through: no answer within 5 seconds/);
  });
});

describe("the Bot Check on Better Auth's sign-up endpoint, called directly", () => {
  it("lets a script with a good token through, sending Cloudflare its token and IP address", async () => {
    const browser = new TestBrowser({ ip: "198.51.100.23" });
    browser.botCheckToken = "direct-token";

    const response = await harness.postToAuth("/sign-up/email", signUpBody({ email: "direct@example.com" }), browser);

    expect(response.status).toBe(200);
    expect(harness.turnstile.requests).toEqual([{ secret: TEST_BOT_CHECK_SECRET, token: "direct-token", ip: "198.51.100.23" }]);
  });

  it("refuses a post without a token, without asking Cloudflare", async () => {
    const browser = new TestBrowser();
    browser.botCheckToken = undefined;

    const response = await harness.postToAuth("/sign-up/email", signUpBody({ email: "bot@example.com" }), browser);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "BOT_CHECK_FAILED" });
    expect(await accountExists("bot@example.com")).toBe(false);
    expect(harness.turnstile.requests).toEqual([]);
  });

  it("refuses a token Cloudflare rejects", async () => {
    harness.turnstile.answer = { reject: "invalid-input-response" };

    const response = await harness.postToAuth("/sign-up/email", signUpBody({ email: "junk@example.com" }), new TestBrowser());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "BOT_CHECK_FAILED" });
    expect(await accountExists("junk@example.com")).toBe(false);
  });

  it("lets the post through when Cloudflare can't be reached, and logs it", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.turnstile.answer = "unreachable";

    const response = await harness.postToAuth("/sign-up/email", signUpBody({ email: "down@example.com" }), new TestBrowser());

    expect(response.status).toBe(200);
    expect(log.mock.calls[0]!.join(" ")).toMatch(/Bot Check let a request to \/sign-up\/email through: network error/);
  });

  it("lets the post through when Cloudflare hasn't answered within 5 seconds, and logs it", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.turnstile.answer = "slow";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const pending = harness.postToAuth("/sign-up/email", signUpBody({ email: "timeout@example.com" }), new TestBrowser());
    await vi.waitFor(() => expect(harness.turnstile.requests).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(BOT_CHECK_TIMEOUT_MS);

    expect((await pending).status).toBe(200);
    expect(await accountExists("timeout@example.com")).toBe(true);
    expect(log.mock.calls[0]!.join(" ")).toMatch(/Bot Check let a request to \/sign-up\/email through: no answer within 5 seconds/);
  });
});

describe("the Bot Check's other rules", () => {
  it("skips a team script's call, which has no request headers", async () => {
    const fresh = await createTestHarness();
    fresh.turnstile.answer = { reject: "invalid-input-response" };

    const result = await createDemoAccount(fresh, { password: "the team's demo password" });

    expect(result).toEqual({ ok: true });
    expect(fresh.turnstile.requests).toEqual([]);
  });

  it("refuses a token made on another site where the app checks hostnames, as on Production", async () => {
    const production = await createTestHarness({ botCheck: { allowedHostnames: ["outfits.example"] } });
    production.turnstile.hostname = "elsewhere.example";

    const elsewhere = await signUp(production.context(new TestBrowser()), signUpInput({ email: "elsewhere@example.com" }));
    production.turnstile.hostname = "outfits.example";
    const ours = await signUp(production.context(new TestBrowser()), signUpInput({ email: "ours@example.com" }));

    expect(elsewhere).toEqual({ ok: false, refusal: "bot-check-failed" });
    expect(ours).toEqual({ ok: true });
  });

  it("is off with no secret configured: no token is needed and Cloudflare is never asked", async () => {
    const unconfigured = await createTestHarness({ botCheck: false });
    const browser = new TestBrowser();
    browser.botCheckToken = undefined;

    const ours = await signUp(unconfigured.context(browser), signUpInput({ email: "off@example.com" }));
    const direct = await unconfigured.postToAuth("/sign-up/email", signUpBody({ email: "off.direct@example.com" }), browser);

    expect(ours).toEqual({ ok: true });
    expect(direct.status).toBe(200);
    expect(unconfigured.turnstile.requests).toEqual([]);
  });
});

async function accountExists(email: string): Promise<boolean> {
  return (await harness.db.select({ id: user.id }).from(user).where(eq(user.email, email))).length > 0;
}

function signUpInput(overrides: Partial<SignUpInput> = {}): SignUpInput {
  const id = Math.floor(Math.random() * 1e9);
  return {
    birthDate: { day: "3", month: "8", year: "1995" },
    username: `user${id}`,
    email: `user${id}@example.com`,
    password: "correct horse battery",
    stylePreference: "womenswear",
    countryCode: "GB",
    acceptedTerms: true,
    ...overrides,
  };
}

function signUpBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const username = `user${Math.floor(Math.random() * 1e9)}`;
  return {
    name: username,
    username,
    displayUsername: username,
    email: `${username}@example.com`,
    password: "correct horse battery",
    stylePreference: "menswear",
    countryCode: "US",
    birthDate: "1990-05-17",
    ...overrides,
  };
}
