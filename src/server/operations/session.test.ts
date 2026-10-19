import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { CookieToSet } from "@/server/http/cookies";
import { signOutEverywhere } from "@/server/operations/account";
import { readSignedInUser, refreshSession } from "@/server/operations/session";
import { signIn } from "@/server/operations/sign-in";
import { signUp } from "@/server/operations/sign-up";
import { createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

const DAY_MS = 24 * 60 * 60 * 1000;
const START = new Date("2026-10-16T12:00:00Z");

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
  await signUp(harness.context(new TestBrowser()), {
    birthDate: { day: "2", month: "2", year: "1992" },
    username: "sam",
    email: "sam@example.com",
    password: "a long enough password",
    stylePreference: "menswear",
    countryCode: "US",
    acceptedTerms: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// Better Auth keeps session time with the real clock, so these tests move Date itself.
async function signInAt(time: Date): Promise<TestBrowser> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(time);
  const browser = new TestBrowser();
  await signIn(harness.context(browser), { identifier: "sam", password: "a long enough password" });
  return browser;
}

describe("sessions", () => {
  it("keep the session cookie for 30 days", async () => {
    const browser = await signInAt(START);

    expect(browser.cookie("better-auth.session_token")).toMatchObject({ maxAge: 30 * 24 * 60 * 60 });
  });

  it("end after 30 days without use", async () => {
    const browser = await signInAt(START);

    vi.setSystemTime(START.getTime() + 31 * DAY_MS);

    expect(await readSignedInUser(harness.context(browser))).toBeNull();
  });

  it("roll forward 30 days from when they were last used", async () => {
    const browser = await signInAt(START);

    vi.setSystemTime(START.getTime() + 2 * DAY_MS);
    await refreshSession(harness.context(browser));
    vi.setSystemTime(START.getTime() + 31 * DAY_MS);

    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "sam" });
  });

  it("aren't rolled forward by reading the signed-in user, so a refresh later that day still renews the cookie", async () => {
    const browser = await signInAt(START);

    vi.setSystemTime(START.getTime() + 2 * DAY_MS);
    await readSignedInUser(harness.context(browser));
    await refreshSession(harness.context(browser));
    vi.setSystemTime(START.getTime() + 31 * DAY_MS);

    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "sam" });
  });

  it("end 30 days after sign-in when the signed-in user was only read since", async () => {
    const browser = await signInAt(START);

    vi.setSystemTime(START.getTime() + 2 * DAY_MS);
    await readSignedInUser(harness.context(browser));
    vi.setSystemTime(START.getTime() + 31 * DAY_MS);

    expect(await readSignedInUser(harness.context(browser))).toBeNull();
  });

  it("aren't renewed while less than a day old: the refresh sends no cookie", async () => {
    const browser = await signInAt(START);

    vi.setSystemTime(START.getTime() + DAY_MS / 2);

    expect(await cookiesSentByRefresh(browser)).toEqual([]);
  });

  it("aren't started by a refresh from a browser that isn't signed in: it sends no cookie", async () => {
    expect(await cookiesSentByRefresh(new TestBrowser())).toEqual([]);
  });

  it("stay ended after signing out of all devices: a refresh from another browser clears its cookie", async () => {
    const laptop = await signInAt(START);
    const phone = await signInAt(START);

    vi.setSystemTime(START.getTime() + 2 * DAY_MS);
    await signOutEverywhere(harness.context(laptop));
    await refreshSession(harness.context(phone));

    expect(phone.hasSessionCookie()).toBe(false);
    expect(await readSignedInUser(harness.context(phone))).toBeNull();
  });
});

/** Refreshes the browser's session, and gives back every cookie the response sent it. */
async function cookiesSentByRefresh(browser: TestBrowser): Promise<CookieToSet[]> {
  const sent: CookieToSet[] = [];
  await refreshSession({
    ...harness.context(browser),
    responseCookies: {
      set: (cookie) => {
        sent.push(cookie);
        browser.responseCookies.set(cookie);
      },
    },
  });
  return sent;
}
