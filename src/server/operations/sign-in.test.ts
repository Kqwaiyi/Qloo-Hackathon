import { beforeAll, describe, expect, it } from "vitest";

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
