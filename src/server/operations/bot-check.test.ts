import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BOT_CHECK_TIMEOUT_MS, SIGN_IN_RATE_LIMIT } from "@/config/accounts";
import { user } from "@/server/db/schema";
import { requestPasswordReset } from "@/server/operations/password-reset";
import { readSignedInUser } from "@/server/operations/session";
import { signIn } from "@/server/operations/sign-in";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { createDemoAccount } from "@/server/operations/team";
import { createTestHarness, TEST_BOT_CHECK_SECRET, TestBrowser, type TestHarness } from "@/test/harness";

// The Bot Check (ADR-0006): Cloudflare Turnstile, through the harness's fake. It guards sign-up and
// sign-in by our forms and by a direct post, and fails open only when Cloudflare can't be reached.

// Mina has an account, and signs in by her email or by her username, each its own Better Auth endpoint.
const MINA = { email: "mina@example.com", username: "Mina.Park", password: "correct horse battery" };

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
  expect(await signUp(harness.context(new TestBrowser()), signUpInput({ email: MINA.email, username: MINA.username }))).toEqual({ ok: true });
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
    await untilCloudflareIsAsked();
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
    await untilCloudflareIsAsked();
    await vi.advanceTimersByTimeAsync(BOT_CHECK_TIMEOUT_MS);

    expect((await pending).status).toBe(200);
    expect(await accountExists("timeout@example.com")).toBe(true);
    expect(log.mock.calls[0]!.join(" ")).toMatch(/Bot Check let a request to \/sign-up\/email through: no answer within 5 seconds/);
  });
});

const SIGN_IN_BY = [
  { by: "email", identifier: MINA.email, path: "/sign-in/email" },
  { by: "username", identifier: MINA.username, path: "/sign-in/username" },
];

describe("the Bot Check on sign-in by our form", () => {
  it.each(SIGN_IN_BY)(
    "signs in by $by with the form's good token, sending Cloudflare that token and the visitor's IP address",
    async ({ identifier }) => {
      const browser = new TestBrowser({ ip: "203.0.113.41" });
      browser.botCheckToken = undefined;

      const result = await signIn(harness.context(browser), { identifier, password: MINA.password, botCheckToken: "form-token" });

      expect(result).toEqual({ ok: true });
      expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: MINA.email });
      expect(harness.turnstile.requests).toEqual([{ secret: TEST_BOT_CHECK_SECRET, token: "form-token", ip: "203.0.113.41" }]);
    },
  );

  it.each(SIGN_IN_BY)("checks the form's token at sign-in by $by, not one the browser sent itself", async ({ identifier }) => {
    const browser = new TestBrowser();
    browser.botCheckToken = "browser-token";

    await signIn(harness.context(browser), { identifier, password: MINA.password, botCheckToken: "form-token" });

    expect(harness.turnstile.requests.map((request) => request.token)).toEqual(["form-token"]);
  });

  it.each(SIGN_IN_BY)("refuses a token Cloudflare rejects at sign-in by $by, signing nobody in", async ({ identifier }) => {
    harness.turnstile.answer = { reject: "timeout-or-duplicate" };
    const browser = new TestBrowser();

    const result = await signIn(harness.context(browser), { identifier, password: MINA.password });

    expect(result).toEqual({ ok: false, refusal: "bot-check-failed" });
    expect(browser.hasSessionCookie()).toBe(false);
  });

  it.each(SIGN_IN_BY)("refuses a form sent without a token at sign-in by $by, without asking Cloudflare", async ({ identifier }) => {
    const browser = new TestBrowser();
    browser.botCheckToken = undefined;

    const none = await signIn(harness.context(browser), { identifier, password: MINA.password });
    const empty = await signIn(harness.context(browser), { identifier, password: MINA.password, botCheckToken: "" });

    expect([none, empty]).toEqual([
      { ok: false, refusal: "bot-check-failed" },
      { ok: false, refusal: "bot-check-failed" },
    ]);
    expect(browser.hasSessionCookie()).toBe(false);
    expect(harness.turnstile.requests).toEqual([]);
  });

  it.each(SIGN_IN_BY)("keeps a refused Bot Check apart from wrong credentials at sign-in by $by", async ({ identifier }) => {
    const wrongPassword = await signIn(harness.context(new TestBrowser()), { identifier, password: "a guess" });
    harness.turnstile.answer = { reject: "invalid-input-response" };
    const bot = await signIn(harness.context(new TestBrowser()), { identifier, password: "a guess" });

    expect(wrongPassword).toEqual({ ok: false, refusal: "credentials-mismatch" });
    expect(bot).toEqual({ ok: false, refusal: "bot-check-failed" });
  });

  it.each(SIGN_IN_BY)("lets the sign-in by $by go ahead when Cloudflare can't be reached, and logs it", async ({ identifier, path }) => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.turnstile.answer = "unreachable";
    const browser = new TestBrowser();

    const result = await signIn(harness.context(browser), { identifier, password: MINA.password });

    expect(result).toEqual({ ok: true });
    expect(browser.hasSessionCookie()).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]!.join(" ")).toContain(`Bot Check let a request to ${path} through: network error`);
  });

  it.each(SIGN_IN_BY)("lets the sign-in by $by go ahead when Cloudflare answers with a server error, and logs it", async ({ identifier, path }) => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.turnstile.answer = "server-error";

    const result = await signIn(harness.context(new TestBrowser()), { identifier, password: MINA.password });

    expect(result).toEqual({ ok: true });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]!.join(" ")).toContain(`Bot Check let a request to ${path} through: Cloudflare answered 500`);
  });

  it.each(SIGN_IN_BY)("waits up to 5 seconds for Cloudflare at sign-in by $by, then lets it go ahead and logs it", async ({ identifier, path }) => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.turnstile.answer = "slow";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let settled = false;
    const browser = new TestBrowser();

    const pending = signIn(harness.context(browser), { identifier, password: MINA.password }).finally(() => {
      settled = true;
    });
    await untilCloudflareIsAsked();
    await vi.advanceTimersByTimeAsync(BOT_CHECK_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual({ ok: true });
    expect(browser.hasSessionCookie()).toBe(true);
    expect(log.mock.calls[0]!.join(" ")).toContain(`Bot Check let a request to ${path} through: no answer within 5 seconds`);
  });
});

describe("the Bot Check on Better Auth's sign-in endpoints, called directly", () => {
  const DIRECT_SIGN_IN_BY = [
    { by: "email", path: "/sign-in/email", body: { email: MINA.email, password: MINA.password } },
    { by: "username", path: "/sign-in/username", body: { username: MINA.username, password: MINA.password } },
  ];

  it.each(DIRECT_SIGN_IN_BY)("lets a script with a good token sign in by $by, sending Cloudflare its token and IP address", async ({ path, body }) => {
    const browser = new TestBrowser({ ip: "198.51.100.61" });
    browser.botCheckToken = "direct-token";

    const response = await harness.postToAuth(path, body, browser);

    expect(response.status).toBe(200);
    expect(browser.hasSessionCookie()).toBe(true);
    expect(harness.turnstile.requests).toEqual([{ secret: TEST_BOT_CHECK_SECRET, token: "direct-token", ip: "198.51.100.61" }]);
  });

  it.each(DIRECT_SIGN_IN_BY)("refuses a post by $by without a token, without asking Cloudflare", async ({ path, body }) => {
    const browser = new TestBrowser();
    browser.botCheckToken = undefined;

    const response = await harness.postToAuth(path, body, browser);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "BOT_CHECK_FAILED" });
    expect(browser.hasSessionCookie()).toBe(false);
    expect(harness.turnstile.requests).toEqual([]);
  });

  it.each(DIRECT_SIGN_IN_BY)("refuses a post by $by with a token Cloudflare rejects", async ({ path, body }) => {
    harness.turnstile.answer = { reject: "invalid-input-response" };
    const browser = new TestBrowser();

    const response = await harness.postToAuth(path, body, browser);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "BOT_CHECK_FAILED" });
    expect(browser.hasSessionCookie()).toBe(false);
  });

  it.each(DIRECT_SIGN_IN_BY)("lets the post by $by through when Cloudflare can't be reached, and logs it", async ({ path, body }) => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.turnstile.answer = "unreachable";

    const response = await harness.postToAuth(path, body, new TestBrowser());

    expect(response.status).toBe(200);
    expect(log.mock.calls[0]!.join(" ")).toContain(`Bot Check let a request to ${path} through: network error`);
  });

  it.each(DIRECT_SIGN_IN_BY)("lets the post by $by through when Cloudflare hasn't answered within 5 seconds, and logs it", async ({ path, body }) => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    harness.turnstile.answer = "slow";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const pending = harness.postToAuth(path, body, new TestBrowser());
    await untilCloudflareIsAsked();
    await vi.advanceTimersByTimeAsync(BOT_CHECK_TIMEOUT_MS);

    expect((await pending).status).toBe(200);
    expect(log.mock.calls[0]!.join(" ")).toContain(`Bot Check let a request to ${path} through: no answer within 5 seconds`);
  });
});

// The harness's team address is team@example.test, so the Demo Account's is its +demo plus-address.
const DEMO_ACCOUNT = { email: "team+demo@example.test", username: "demo", password: "the judges' shared password" };

describe("the Demo Account at sign-in", () => {
  let demo: TestHarness;

  beforeAll(async () => {
    demo = await createTestHarness();
    expect(await createDemoAccount(demo, { password: DEMO_ACCOUNT.password })).toEqual({ ok: true });
  });

  beforeEach(() => {
    demo.turnstile.requests.length = 0;
    demo.turnstile.answer = { reject: "invalid-input-response" };
  });

  // Better Auth compares both ignoring case.
  it.each([
    { by: "email", identifier: DEMO_ACCOUNT.email },
    { by: "email, in another case", identifier: "Team+Demo@Example.TEST" },
    { by: "username", identifier: DEMO_ACCOUNT.username },
    { by: "username, in another case", identifier: "DEMO" },
  ])("skips the Bot Check by our form, by $by: no token is needed and Cloudflare is never asked", async ({ identifier }) => {
    const judge = new TestBrowser();
    judge.botCheckToken = undefined;

    const result = await signIn(demo.context(judge), { identifier, password: DEMO_ACCOUNT.password });

    expect(result).toEqual({ ok: true });
    expect(await readSignedInUser(demo.context(judge))).toMatchObject({ isDemoAccount: true });
    expect(demo.turnstile.requests).toEqual([]);
  });

  it.each([
    { by: "email", path: "/sign-in/email", body: { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password } },
    { by: "username", path: "/sign-in/username", body: { username: DEMO_ACCOUNT.username, password: DEMO_ACCOUNT.password } },
  ])("skips the Bot Check on a direct post by $by", async ({ path, body }) => {
    const judge = new TestBrowser();
    judge.botCheckToken = undefined;

    const response = await demo.postToAuth(path, body, judge);

    expect(response.status).toBe(200);
    expect(judge.hasSessionCookie()).toBe(true);
    expect(demo.turnstile.requests).toEqual([]);
  });

  it("skips it at sign-in only: signing up as demo, at its address or another, still needs a token", async () => {
    const browser = new TestBrowser();
    browser.botCheckToken = undefined;

    const atItsAddress = await signUp(demo.context(browser), signUpInput({ email: DEMO_ACCOUNT.email, username: DEMO_ACCOUNT.username }));
    const elsewhere = await signUp(demo.context(browser), signUpInput({ username: DEMO_ACCOUNT.username }));

    expect([atItsAddress, elsewhere]).toEqual([
      { ok: false, refusal: "bot-check-failed" },
      { ok: false, refusal: "bot-check-failed" },
    ]);
  });

  it("skips it at sign-in only: asking for a reset link to its address still needs a token", async () => {
    const browser = new TestBrowser();
    browser.botCheckToken = undefined;

    const result = await requestPasswordReset(demo.context(browser), { email: DEMO_ACCOUNT.email });

    expect(result).toEqual({ ok: false, refusal: "bot-check-failed" });
    expect(resetEmailsTo(DEMO_ACCOUNT.email, demo)).toEqual([]);
  });

  describe("with Better Auth's rate limits on", () => {
    let limited: TestHarness;

    beforeAll(async () => {
      limited = await createTestHarness({ rateLimit: true });
      expect(await createDemoAccount(limited, { password: DEMO_ACCOUNT.password })).toEqual({ ok: true });
    });

    // Better Auth times its rate limits with the real clock, so this holds Date still.
    it.each([
      { by: "email", identifier: DEMO_ACCOUNT.email, ip: "203.0.113.70" },
      { by: "username", identifier: DEMO_ACCOUNT.username, ip: "203.0.113.71" },
    ])(
      `still refuses a judge signing in by $by more than ${SIGN_IN_RATE_LIMIT.max} times in ${SIGN_IN_RATE_LIMIT.window} seconds from one IP address`,
      async ({ identifier, ip }) => {
        vi.useFakeTimers({ toFake: ["Date"] });
        const signInAsJudge = (browser: TestBrowser) => {
          browser.botCheckToken = undefined;
          return signIn(limited.context(browser), { identifier, password: DEMO_ACCOUNT.password });
        };
        for (let attempt = 0; attempt < SIGN_IN_RATE_LIMIT.max; attempt++) {
          expect(await signInAsJudge(new TestBrowser({ ip }))).toEqual({ ok: true });
        }

        const judge = new TestBrowser({ ip });
        const refused = await signInAsJudge(judge);

        expect(refused).toEqual({ ok: false, refusal: "too-many-sign-ins" });
        expect(judge.hasSessionCookie()).toBe(false);
        expect(limited.turnstile.requests).toEqual([]);
      },
    );
  });
});

describe("the Bot Check on asking for a password reset by our form", () => {
  it("emails the reset link with the form's good token, sending Cloudflare that token and the visitor's IP address", async () => {
    const email = await newAccount();
    const browser = new TestBrowser({ ip: "203.0.113.52" });
    browser.botCheckToken = undefined;

    const result = await requestPasswordReset(harness.context(browser), { email, botCheckToken: "form-token" });

    expect(result).toEqual({ ok: true });
    expect(resetEmailsTo(email)).toHaveLength(1);
    expect(harness.turnstile.requests).toEqual([{ secret: TEST_BOT_CHECK_SECRET, token: "form-token", ip: "203.0.113.52" }]);
  });

  it("refuses a token Cloudflare rejects, sending no email", async () => {
    const email = await newAccount();
    harness.turnstile.answer = { reject: "timeout-or-duplicate" };

    const result = await requestPasswordReset(harness.context(new TestBrowser()), { email });

    expect(result).toEqual({ ok: false, refusal: "bot-check-failed" });
    expect(resetEmailsTo(email)).toEqual([]);
  });

  it("refuses a form sent without a token, without asking Cloudflare or sending an email", async () => {
    const email = await newAccount();
    const browser = new TestBrowser();
    browser.botCheckToken = undefined;

    const none = await requestPasswordReset(harness.context(browser), { email });
    const empty = await requestPasswordReset(harness.context(browser), { email, botCheckToken: "" });

    expect([none, empty]).toEqual([
      { ok: false, refusal: "bot-check-failed" },
      { ok: false, refusal: "bot-check-failed" },
    ]);
    expect(resetEmailsTo(email)).toEqual([]);
    expect(harness.turnstile.requests).toEqual([]);
  });

  it("gives an address with an account and one without the same answer, with a good token", async () => {
    const email = await newAccount();

    const known = await requestPasswordReset(harness.context(new TestBrowser()), { email });
    const unknown = await requestPasswordReset(harness.context(new TestBrowser()), { email: "no.account@example.com" });

    expect(known).toEqual({ ok: true });
    expect(unknown).toEqual(known);
    expect(resetEmailsTo(email)).toHaveLength(1);
    expect(harness.emails.to("no.account@example.com")).toEqual([]);
  });

  it.each([
    { token: "rejected", botCheckToken: "junk" },
    { token: "missing", botCheckToken: "" },
  ])("gives an address with an account and one without the same refusal, with a $token token", async ({ botCheckToken }) => {
    const email = await newAccount();
    harness.turnstile.answer = { reject: "invalid-input-response" };

    const known = await requestPasswordReset(harness.context(new TestBrowser()), { email, botCheckToken });
    const unknown = await requestPasswordReset(harness.context(new TestBrowser()), { email: "no.account@example.com", botCheckToken });

    expect(known).toEqual({ ok: false, refusal: "bot-check-failed" });
    expect(unknown).toEqual(known);
  });

  it("emails the link when Cloudflare can't be reached, and logs it", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const email = await newAccount();
    harness.turnstile.answer = "unreachable";

    const result = await requestPasswordReset(harness.context(new TestBrowser()), { email });

    expect(result).toEqual({ ok: true });
    expect(resetEmailsTo(email)).toHaveLength(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]!.join(" ")).toContain("Bot Check let a request to /request-password-reset through: network error");
  });

  it("emails the link when Cloudflare answers with a server error, and logs it", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const email = await newAccount();
    harness.turnstile.answer = "server-error";

    const result = await requestPasswordReset(harness.context(new TestBrowser()), { email });

    expect(result).toEqual({ ok: true });
    expect(resetEmailsTo(email)).toHaveLength(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]!.join(" ")).toContain("Bot Check let a request to /request-password-reset through: Cloudflare answered 500");
  });

  it("waits up to 5 seconds for Cloudflare, then emails the link and logs it", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const email = await newAccount();
    harness.turnstile.answer = "slow";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let settled = false;

    const pending = requestPasswordReset(harness.context(new TestBrowser()), { email }).finally(() => {
      settled = true;
    });
    await untilCloudflareIsAsked();
    await vi.advanceTimersByTimeAsync(BOT_CHECK_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual({ ok: true });
    expect(resetEmailsTo(email)).toHaveLength(1);
    expect(log.mock.calls[0]!.join(" ")).toContain("Bot Check let a request to /request-password-reset through: no answer within 5 seconds");
  });
});

describe("the Bot Check on Better Auth's request-password-reset endpoint, called directly", () => {
  it("emails the link to a script with a good token, sending Cloudflare its token and IP address", async () => {
    const email = await newAccount();
    const browser = new TestBrowser({ ip: "198.51.100.72" });
    browser.botCheckToken = "direct-token";

    const response = await harness.postToAuth("/request-password-reset", { email }, browser);

    expect(response.status).toBe(200);
    expect(resetEmailsTo(email)).toHaveLength(1);
    expect(harness.turnstile.requests).toEqual([{ secret: TEST_BOT_CHECK_SECRET, token: "direct-token", ip: "198.51.100.72" }]);
  });

  it("refuses a post without a token, without asking Cloudflare or sending an email", async () => {
    const email = await newAccount();
    const browser = new TestBrowser();
    browser.botCheckToken = undefined;

    const response = await harness.postToAuth("/request-password-reset", { email }, browser);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "BOT_CHECK_FAILED" });
    expect(resetEmailsTo(email)).toEqual([]);
    expect(harness.turnstile.requests).toEqual([]);
  });

  it("refuses a post with a token Cloudflare rejects, sending no email", async () => {
    const email = await newAccount();
    harness.turnstile.answer = { reject: "invalid-input-response" };

    const response = await harness.postToAuth("/request-password-reset", { email }, new TestBrowser());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "BOT_CHECK_FAILED" });
    expect(resetEmailsTo(email)).toEqual([]);
  });

  it.each([
    { token: "good", answer: "pass" as const },
    { token: "rejected", answer: { reject: "invalid-input-response" } as const },
  ])("answers an address with an account and one without the same, with a $token token", async ({ answer }) => {
    const email = await newAccount();
    harness.turnstile.answer = answer;

    const known = await harness.postToAuth("/request-password-reset", { email }, new TestBrowser());
    const unknown = await harness.postToAuth("/request-password-reset", { email: "no.account@example.com" }, new TestBrowser());

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
  });

  it("lets the post through when Cloudflare can't be reached, and logs it", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const email = await newAccount();
    harness.turnstile.answer = "unreachable";

    const response = await harness.postToAuth("/request-password-reset", { email }, new TestBrowser());

    expect(response.status).toBe(200);
    expect(resetEmailsTo(email)).toHaveLength(1);
    expect(log.mock.calls[0]!.join(" ")).toContain("Bot Check let a request to /request-password-reset through: network error");
  });

  it("lets the post through when Cloudflare hasn't answered within 5 seconds, and logs it", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const email = await newAccount();
    harness.turnstile.answer = "slow";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const pending = harness.postToAuth("/request-password-reset", { email }, new TestBrowser());
    await untilCloudflareIsAsked();
    await vi.advanceTimersByTimeAsync(BOT_CHECK_TIMEOUT_MS);

    expect((await pending).status).toBe(200);
    expect(resetEmailsTo(email)).toHaveLength(1);
    expect(log.mock.calls[0]!.join(" ")).toContain("Bot Check let a request to /request-password-reset through: no answer within 5 seconds");
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

  it("sends Cloudflare an IPv6 visitor's whole address, not the /64 network Better Auth rate-limits by", async () => {
    const browser = new TestBrowser({ ip: "2001:db8::1:2:3:4" });

    await signUp(harness.context(browser), signUpInput());

    expect(harness.turnstile.requests.map((request) => request.ip)).toEqual(["2001:0db8:0000:0000:0001:0002:0003:0004"]);
  });

  it("refuses a token longer than Cloudflare ever makes, without asking Cloudflare, so it can't stand in for an outage", async () => {
    harness.turnstile.answer = "unreachable";

    const result = await signUp(harness.context(new TestBrowser()), signUpInput({ email: "long@example.com", botCheckToken: "x".repeat(2049) }));

    expect(result).toEqual({ ok: false, refusal: "bot-check-failed" });
    expect(await accountExists("long@example.com")).toBe(false);
    expect(harness.turnstile.requests).toEqual([]);
  });

  it("logs it when Cloudflare refuses the secret, which refuses every visitor until the team fixes it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    harness.turnstile.answer = { reject: "invalid-input-secret" };

    const result = await signUp(harness.context(new TestBrowser()), signUpInput());

    expect(result).toEqual({ ok: false, refusal: "bot-check-failed" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]!.join(" ")).toMatch(/Cloudflare refused the Bot Check's secret \(invalid-input-secret\)/);
  });

  it("is off with no secret configured: no token is needed and Cloudflare is never asked", async () => {
    const unconfigured = await createTestHarness({ botCheck: false });
    const browser = new TestBrowser();
    browser.botCheckToken = undefined;

    const ours = await signUp(unconfigured.context(browser), signUpInput({ email: "off@example.com" }));
    const direct = await unconfigured.postToAuth("/sign-up/email", signUpBody({ email: "off.direct@example.com" }), browser);
    const reset = await requestPasswordReset(unconfigured.context(browser), { email: "off@example.com" });
    const directReset = await unconfigured.postToAuth("/request-password-reset", { email: "off.direct@example.com" }, browser);

    expect(ours).toEqual({ ok: true });
    expect(direct.status).toBe(200);
    expect(reset).toEqual({ ok: true });
    expect(directReset.status).toBe(200);
    expect(resetEmailsTo("off@example.com", unconfigured)).toHaveLength(1);
    expect(resetEmailsTo("off.direct@example.com", unconfigured)).toHaveLength(1);
    expect(unconfigured.turnstile.requests).toEqual([]);
  });
});

/**
 * Waits until the Bot Check has asked Cloudflare. Under fake timers, `vi.waitFor` moves time on by its
 * interval at every check, which would count towards the Bot Check's 5 seconds, so this one doesn't.
 */
async function untilCloudflareIsAsked(): Promise<void> {
  await vi.waitFor(() => expect(harness.turnstile.requests).toHaveLength(1), { interval: 0 });
}

/**
 * Signs someone up through our form, as a visitor would, and gives their address. The sign-up's own
 * Bot Check is forgotten, so a test sees only what it asks Cloudflare.
 */
async function newAccount(): Promise<string> {
  const input = signUpInput();
  expect(await signUp(harness.context(new TestBrowser()), input)).toEqual({ ok: true });
  harness.turnstile.requests.length = 0;
  return input.email;
}

/** The reset emails sent to this address, oldest first. */
function resetEmailsTo(address: string, sentBy: TestHarness = harness) {
  return sentBy.emails.to(address).filter((email) => email.subject === "Reset your Outfit Recommender password");
}

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
