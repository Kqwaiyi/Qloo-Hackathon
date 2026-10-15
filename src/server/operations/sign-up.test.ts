import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { user } from "@/server/db/schema";
import { readSignedInUser } from "@/server/operations/session";
import { checkDateOfBirth, signUp, type SignUpInput } from "@/server/operations/sign-up";
import { createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

describe("sign-up step 1: date of birth", () => {
  it("lets an adult through", async () => {
    const browser = new TestBrowser();

    const result = await checkDateOfBirth(harness.context(browser), { day: "17", month: "5", year: "1990" });

    expect(result).toEqual({ ok: true });
  });

  it("stops someone under 18 and blocks that browser for 30 days", async () => {
    const browser = new TestBrowser();

    const result = await checkDateOfBirth(harness.context(browser), { day: "1", month: "1", year: "2010" });

    expect(result).toEqual({ ok: false, refusal: "under-18" });
    expect(browser.cookie("age_gate")).toMatchObject({ maxAge: 30 * 24 * 60 * 60, httpOnly: true, path: "/" });
  });

  it("keeps refusing that browser while the cookie lasts, even with an adult date", async () => {
    const browser = new TestBrowser();
    await checkDateOfBirth(harness.context(browser), { day: "1", month: "1", year: "2010" });

    const retry = await checkDateOfBirth(harness.context(browser), { day: "1", month: "1", year: "1990" });

    expect(retry).toEqual({ ok: false, refusal: "under-18" });
  });

  it("lets someone through on their 18th birthday", async () => {
    // 12:00 UTC is the 16th in every time zone, from UTC-12 to UTC+14.
    harness.clock.set("2026-10-16T12:00:00Z");
    const browser = new TestBrowser();

    const result = await checkDateOfBirth(harness.context(browser), { day: "16", month: "10", year: "2008" });

    expect(result).toEqual({ ok: true });
    expect(browser.cookie("age_gate")).toBeUndefined();
  });

  it("stops and blocks someone who isn't 18 anywhere in the world yet", async () => {
    // 09:00 UTC is 23:00 on the 16th in UTC+14, the first time zone to reach a new day.
    harness.clock.set("2026-10-16T09:00:00Z");
    const browser = new TestBrowser();

    const result = await checkDateOfBirth(harness.context(browser), { day: "17", month: "10", year: "2008" });

    expect(result).toEqual({ ok: false, refusal: "under-18" });
    expect(browser.cookie("age_gate")).toBeDefined();
  });

  it("stops, without blocking the browser, someone whose 18th birthday hasn't reached every time zone", async () => {
    // 10:00 UTC on the 16th is already the 17th in UTC+14, but still the 15th in UTC-12.
    harness.clock.set("2026-10-16T10:00:00Z");
    const browser = new TestBrowser();

    const result = await checkDateOfBirth(harness.context(browser), { day: "17", month: "10", year: "2008" });

    expect(result).toEqual({ ok: false, refusal: "under-18" });
    expect(browser.cookie("age_gate")).toBeUndefined();
  });

  it("refuses a date that doesn't exist without blocking the browser", async () => {
    const browser = new TestBrowser();

    const result = await checkDateOfBirth(harness.context(browser), { day: "31", month: "2", year: "1990" });

    expect(result).toEqual({ ok: false, refusal: "invalid-date" });
    expect(browser.cookie("age_gate")).toBeUndefined();
  });
});

describe("sign-up step 2: the account", () => {
  it("creates the account keeping only the birth year and month, and signs the user in", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const browser = new TestBrowser();

    const result = await signUp(
      harness.context(browser),
      signUpInput({ username: "Ava.Stone", email: "ava@example.com", birthDate: { day: "17", month: "5", year: "1990" } }),
    );

    expect(result).toEqual({ ok: true });
    const [stored] = await harness.db.select().from(user).where(eq(user.email, "ava@example.com"));
    expect(stored).toMatchObject({
      name: "Ava.Stone",
      username: "ava.stone",
      displayUsername: "Ava.Stone",
      stylePreference: "womenswear",
      countryCode: "GB",
      birthYear: 1990,
      birthMonth: 5,
    });
    expect(Object.keys(stored!).filter((column) => /birth|dob/i.test(column))).toEqual(["birthYear", "birthMonth"]);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Ava.Stone" });
  });

  it("rechecks the age, refusing an under-18 date and blocking the browser", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const browser = new TestBrowser();

    const result = await signUp(
      harness.context(browser),
      signUpInput({ email: "young@example.com", birthDate: { day: "20", month: "12", year: "2008" } }),
    );

    expect(result).toEqual({ ok: false, refusal: "under-18" });
    expect(browser.cookie("age_gate")).toMatchObject({ maxAge: 30 * 24 * 60 * 60 });
    expect(browser.hasSessionCookie()).toBe(false);
    expect(await harness.db.select().from(user).where(eq(user.email, "young@example.com"))).toEqual([]);
  });

  it("refuses a username that is taken, ignoring case", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ username: "Milo_K" }));

    const result = await signUp(harness.context(new TestBrowser()), signUpInput({ username: "milo_k" }));

    expect(result).toEqual({ ok: false, refusal: "username-taken" });
  });

  it("refuses an email that already has an account", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ email: "jo@example.com" }));

    const result = await signUp(harness.context(new TestBrowser()), signUpInput({ email: "jo@example.com" }));

    expect(result).toEqual({ ok: false, refusal: "email-taken" });
  });

  it("needs the Terms and Privacy Policy agreed to", async () => {
    const browser = new TestBrowser();

    const result = await signUp(harness.context(browser), signUpInput({ email: "terms@example.com", acceptedTerms: false }));

    expect(result).toEqual({ ok: false, refusal: "terms-not-accepted" });
    expect(await harness.db.select().from(user).where(eq(user.email, "terms@example.com"))).toEqual([]);
  });

  it("refuses a Country outside the Country list", async () => {
    const result = await signUp(harness.context(new TestBrowser()), signUpInput({ countryCode: "RU" }));

    expect(result).toEqual({ ok: false, refusal: "invalid", field: "countryCode" });
  });
});

describe("Better Auth's sign-up endpoint, called directly", () => {
  it("refuses an under-18 date of birth, stores nothing and blocks the browser", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const browser = new TestBrowser();

    const response = await harness.postToAuth(
      "/sign-up/email",
      signUpBody({ email: "teen@example.com", birthDate: "2010-01-01" }),
      browser,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "UNDER_18" });
    expect(await harness.db.select().from(user).where(eq(user.email, "teen@example.com"))).toEqual([]);
    expect(browser.cookie("age_gate")).toMatchObject({ maxAge: 30 * 24 * 60 * 60 });
  });

  it("checks the age before anything else, even a taken username", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    await harness.postToAuth("/sign-up/email", signUpBody({ username: "taken.name" }), new TestBrowser());

    const response = await harness.postToAuth(
      "/sign-up/email",
      signUpBody({ username: "taken.name", birthDate: "2010-01-01" }),
      new TestBrowser(),
    );

    expect(await response.json()).toMatchObject({ code: "UNDER_18" });
  });

  it("accepts an 18th birthday falling today", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const browser = new TestBrowser();

    const response = await harness.postToAuth(
      "/sign-up/email",
      signUpBody({ email: "birthday@example.com", birthDate: "2008-10-16" }),
      browser,
    );

    expect(response.status).toBe(200);
    const [stored] = await harness.db.select().from(user).where(eq(user.email, "birthday@example.com"));
    expect(stored).toMatchObject({ birthYear: 2008, birthMonth: 10 });
    expect(browser.cookie("age_gate")).toBeUndefined();
  });

  it("refuses a sign-up without a date of birth", async () => {
    const response = await harness.postToAuth(
      "/sign-up/email",
      signUpBody({ email: "nodob@example.com", birthDate: undefined }),
      new TestBrowser(),
    );

    expect(response.status).toBe(400);
    expect(await harness.db.select().from(user).where(eq(user.email, "nodob@example.com"))).toEqual([]);
  });

  it("refuses a browser the age gate has blocked, even with an adult date", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const browser = new TestBrowser();
    await checkDateOfBirth(harness.context(browser), { day: "1", month: "1", year: "2010" });

    const response = await harness.postToAuth(
      "/sign-up/email",
      signUpBody({ email: "retry@example.com", birthDate: "1990-01-01" }),
      browser,
    );

    expect(await response.json()).toMatchObject({ code: "UNDER_18" });
    expect(await harness.db.select().from(user).where(eq(user.email, "retry@example.com"))).toEqual([]);
    expect(response.headers.getSetCookie().filter((cookie) => cookie.startsWith("age_gate="))).toEqual([]);
  });

  it("refuses, without blocking, an 18th birthday that hasn't reached every time zone", async () => {
    harness.clock.set("2026-10-16T10:00:00Z");
    const browser = new TestBrowser();

    const response = await harness.postToAuth(
      "/sign-up/email",
      signUpBody({ email: "almost@example.com", birthDate: "2008-10-17" }),
      browser,
    );

    expect(await response.json()).toMatchObject({ code: "UNDER_18" });
    expect(await harness.db.select().from(user).where(eq(user.email, "almost@example.com"))).toEqual([]);
    expect(browser.cookie("age_gate")).toBeUndefined();
  });

  it("refuses a Country outside the Country list and an unknown Style Preference", async () => {
    const badCountry = await harness.postToAuth(
      "/sign-up/email",
      signUpBody({ email: "ru@example.com", countryCode: "RU" }),
      new TestBrowser(),
    );
    const badStyle = await harness.postToAuth(
      "/sign-up/email",
      signUpBody({ email: "style@example.com", stylePreference: "streetwear" }),
      new TestBrowser(),
    );

    expect([badCountry.status, badStyle.status]).toEqual([400, 400]);
    expect(await harness.db.select().from(user).where(eq(user.email, "ru@example.com"))).toEqual([]);
    expect(await harness.db.select().from(user).where(eq(user.email, "style@example.com"))).toEqual([]);
  });

  it("won't let birth year and month be set directly", async () => {
    const response = await harness.postToAuth(
      "/sign-up/email",
      signUpBody({ email: "direct@example.com", birthDate: "1990-05-17", birthYear: 1950, birthMonth: 1 }),
      new TestBrowser(),
    );

    expect(response.status).toBe(400);
    expect(await harness.db.select().from(user).where(eq(user.email, "direct@example.com"))).toEqual([]);
  });
});

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

function signUpInput(overrides: Partial<SignUpInput> = {}): SignUpInput {
  return {
    birthDate: { day: "3", month: "8", year: "1995" },
    username: `user${Math.floor(Math.random() * 1e9)}`,
    email: `user${Math.floor(Math.random() * 1e9)}@example.com`,
    password: "correct horse battery",
    stylePreference: "womenswear",
    countryCode: "GB",
    acceptedTerms: true,
    ...overrides,
  };
}
