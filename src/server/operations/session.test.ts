import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
});
