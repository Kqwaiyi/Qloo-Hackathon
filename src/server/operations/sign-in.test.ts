import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SIGN_IN_RATE_LIMIT } from "@/config/accounts";
import { readSignedInUser } from "@/server/operations/session";
import { signIn, signOut } from "@/server/operations/sign-in";
import { signUp } from "@/server/operations/sign-up";
import { createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
  await signUp(harness.context(new TestBrowser()), {
    birthDate: { day: "9", month: "3", year: "1999" },
    username: "Noor.Ali",
    email: "noor@example.com",
    password: "a long enough password",
    stylePreference: "no_preference",
    countryCode: "AE",
    acceptedTerms: true,
  });
});

describe("sign-in", () => {
  it("signs in with the username", async () => {
    const browser = new TestBrowser();

    const result = await signIn(harness.context(browser), { identifier: "Noor.Ali", password: "a long enough password" });

    expect(result).toEqual({ ok: true });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Noor.Ali", email: "noor@example.com" });
  });

  it("signs in with the email", async () => {
    const browser = new TestBrowser();

    const result = await signIn(harness.context(browser), { identifier: "noor@example.com", password: "a long enough password" });

    expect(result).toEqual({ ok: true });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Noor.Ali" });
  });

  it("matches the username ignoring case", async () => {
    const result = await signIn(harness.context(new TestBrowser()), { identifier: "NOOR.ALI", password: "a long enough password" });

    expect(result).toEqual({ ok: true });
  });

  it("gives every failure the same refusal", async () => {
    const attempts = [
      { identifier: "Noor.Ali", password: "the wrong password" },
      { identifier: "noor@example.com", password: "the wrong password" },
      { identifier: "nobody.here", password: "a long enough password" },
      { identifier: "nobody@example.com", password: "a long enough password" },
      { identifier: "x", password: "" },
    ];

    for (const attempt of attempts) {
      const browser = new TestBrowser();
      expect(await signIn(harness.context(browser), attempt)).toEqual({ ok: false, refusal: "credentials-mismatch" });
      expect(browser.hasSessionCookie()).toBe(false);
    }
  });

  it("never locks the account after failed attempts", async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await signIn(harness.context(new TestBrowser()), { identifier: "Noor.Ali", password: "a guess" });
    }

    const result = await signIn(harness.context(new TestBrowser()), { identifier: "Noor.Ali", password: "a long enough password" });

    expect(result).toEqual({ ok: true });
  });
});

describe("the sign-in rate limit", () => {
  let limited: TestHarness;

  beforeAll(async () => {
    limited = await createTestHarness({ rateLimit: true });
    await signUp(limited.context(new TestBrowser({ ip: "192.0.2.1" })), {
      birthDate: { day: "9", month: "3", year: "1999" },
      username: "Noor.Ali",
      email: "noor@example.com",
      password: "a long enough password",
      stylePreference: "no_preference",
      countryCode: "AE",
      acceptedTerms: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Better Auth times its rate limits with the real clock, so these tests move Date itself.
  it.each([
    { by: "email", identifier: "noor@example.com", ip: "203.0.113.7" },
    { by: "username", identifier: "Noor.Ali", ip: "203.0.113.8" },
  ])(
    `lets an IP address sign in by $by ${SIGN_IN_RATE_LIMIT.max} times in ${SIGN_IN_RATE_LIMIT.window} seconds, and refuses more until they're up`,
    async ({ identifier, ip }) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const rightPassword = { identifier, password: "a long enough password" };
      for (let attempt = 0; attempt < SIGN_IN_RATE_LIMIT.max - 1; attempt++) {
        await signIn(limited.context(new TestBrowser({ ip })), { identifier, password: "a guess" });
      }
      expect(await signIn(limited.context(new TestBrowser({ ip })), rightPassword)).toEqual({ ok: true });

      const browser = new TestBrowser({ ip });
      const refused = await signIn(limited.context(browser), rightPassword);

      expect(refused).toEqual({ ok: false, refusal: "too-many-sign-ins" });
      expect(browser.hasSessionCookie()).toBe(false);
      const elsewhere = await signIn(limited.context(new TestBrowser({ ip: "198.51.100.4" })), rightPassword);
      expect(elsewhere).toEqual({ ok: true });
      vi.setSystemTime(Date.now() + SIGN_IN_RATE_LIMIT.window * 1000);
      expect(await signIn(limited.context(new TestBrowser({ ip })), rightPassword)).toEqual({ ok: true });
    },
  );
});

describe("sign-out", () => {
  it("ends the session", async () => {
    const browser = new TestBrowser();
    await signIn(harness.context(browser), { identifier: "Noor.Ali", password: "a long enough password" });
    const stolenCookies = browser.requestHeaders();

    await signOut(harness.context(browser));

    expect(await readSignedInUser(harness.context(browser))).toBeNull();
    expect(await readSignedInUser({ auth: harness.auth, requestHeaders: stolenCookies })).toBeNull();
  });
});
