import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { user } from "@/server/db/schema";
import { changeEmail, readPendingEmailChange } from "@/server/operations/email-change";
import { readEmailVerification, resendVerificationEmail } from "@/server/operations/email-verification";
import { readSignedInUser } from "@/server/operations/session";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

beforeEach(() => {
  harness.clock.set("2026-10-16T12:00:00Z");
});

afterEach(() => {
  vi.useRealTimers();
});

const HOUR_MS = 60 * 60 * 1000;

describe("signing up", () => {
  it("signs the new user in unverified and emails them a link that lasts 24 hours, and nothing else", async () => {
    const browser = new TestBrowser();

    await signUp(harness.context(browser), signUpInput({ username: "Ava.Stone", email: "ava@example.com" }));

    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "ava@example.com", emailVerified: false });
    const emails = harness.emails.to("ava@example.com");
    expect(emails).toHaveLength(1);
    expect(emails[0]!.subject).toBe("Verify your email for Outfit Recommender");
    expect(emails[0]!.text).toContain("http://localhost:3000/api/auth/verify-email?token=");
    expect(emails[0]!.text).toContain("The link works for 24 hours.");
    expect(emails[0]!.text).toContain("Unverified accounts are deleted 7 days after sign-up, so this one will be deleted on 23 October 2026");
    expect(emails[0]!.text).toContain("Didn't sign up? Ignore this email. The account is removed on 23 October 2026.");
  });

  it("stops new sign-ups, ours or direct, once 300 emails went out in 24 hours, until they're 24 hours old", async () => {
    harness.clock.set("2026-11-20T09:00:00Z");
    for (let index = 0; index < 300; index += 1) {
      await harness.emailSender.send({ kind: "password-changed", userId: null, to: `x${index}@example.com`, subject: "S", text: "T" });
    }
    harness.clock.set("2026-11-21T08:59:00Z");

    const ours = await signUp(harness.context(new TestBrowser()), signUpInput({ email: "olive@example.com" }));
    const direct = await harness.postToAuth("/sign-up/email", directSignUpBody("pia@example.com"), new TestBrowser());

    expect(ours).toEqual({ ok: false, refusal: "sign-ups-paused" });
    expect(direct.status).toBe(503);
    expect(await direct.json()).toMatchObject({ code: "SIGN_UPS_PAUSED", message: "We can't take new sign-ups right now. Please try again tomorrow." });
    expect(await harness.db.select().from(user).where(eq(user.email, "olive@example.com"))).toEqual([]);
    expect(await harness.db.select().from(user).where(eq(user.email, "pia@example.com"))).toEqual([]);
    harness.clock.set("2026-11-21T09:00:01Z");
    expect(await signUp(harness.context(new TestBrowser()), signUpInput({ email: "olive@example.com" }))).toEqual({ ok: true });
  });
});

describe("the verification link", () => {
  it("verifies the email and signs the user in on whichever device opens it, landing on the verification result", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ email: "bea@example.com" }));
    const phone = new TestBrowser();

    const response = await harness.openAuthLink(harness.linkEmailedTo("bea@example.com"), phone);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/verify-email");
    expect(await readSignedInUser(harness.context(phone))).toMatchObject({ email: "bea@example.com", emailVerified: true });
  });

  // Better Auth times its links with the real clock, so these tests move Date itself.
  it("still works just before 24 hours are up", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput({ email: "cleo@example.com" }));
    vi.setSystemTime(Date.now() + 24 * HOUR_MS - 60_000);

    const response = await harness.openAuthLink(harness.linkEmailedTo("cleo@example.com"), browser);

    expect(response.headers.get("location")).toBe("/verify-email");
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ emailVerified: true });
  });

  it("has expired after 24 hours, sending the user to the verification result with an error", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput({ email: "dev@example.com" }));
    vi.setSystemTime(Date.now() + 24 * HOUR_MS + 60_000);

    const response = await harness.openAuthLink(harness.linkEmailedTo("dev@example.com"), browser);

    expect(response.headers.get("location")).toMatch(/^\/verify-email\?error=\w+$/);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ emailVerified: false });
  });

  it("sends a broken link to the verification result with an error", async () => {
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput({ email: "eve@example.com" }));

    const response = await harness.openAuthLink(harness.linkEmailedTo("eve@example.com").replace("token=", "token=broken"), browser);

    expect(response.headers.get("location")).toMatch(/^\/verify-email\?error=\w+$/);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ emailVerified: false });
  });

  it("goes straight to the verification result when the email is already verified", async () => {
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput({ email: "fay@example.com" }));
    await harness.openAuthLink(harness.linkEmailedTo("fay@example.com"), browser);

    const again = await harness.openAuthLink(harness.linkEmailedTo("fay@example.com"), new TestBrowser());

    expect(again.headers.get("location")).toBe("/verify-email");
  });
});

describe("the verification banner", () => {
  it("tells an unverified user where the link went and when the account will be deleted, and nothing once they verify", async () => {
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput({ email: "quinn@example.com" }));

    const before = await readEmailVerification(harness.context(browser));
    await harness.openEmailedLink("quinn@example.com", browser);
    const after = await readEmailVerification(harness.context(browser));

    expect(before).toEqual({ verified: false, email: "quinn@example.com", deletionDate: new Date("2026-10-23T12:00:00Z") });
    expect(after).toEqual({ verified: true });
  });

  it("shows nothing to a signed-out visitor", async () => {
    expect(await readEmailVerification(harness.context(new TestBrowser()))).toBeNull();
  });
});

describe("resending the link", () => {
  it("sends a new link that works, up to 5 times in 24 hours on top of the one sent at sign-up", async () => {
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput({ email: "gus@example.com" }));

    for (let resend = 0; resend < 5; resend += 1) expect(await resendVerificationEmail(harness.context(browser))).toEqual({ ok: true });
    const sixth = await resendVerificationEmail(harness.context(browser));

    expect(sixth).toEqual({ ok: false, refusal: "resend-limit" });
    expect(harness.emails.to("gus@example.com")).toHaveLength(6);
    await harness.openEmailedLink("gus@example.com", browser);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ emailVerified: true });
  });

  it("sends again once 24 hours have passed since the earlier resends", async () => {
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput());
    for (let resend = 0; resend < 5; resend += 1) await resendVerificationEmail(harness.context(browser));

    harness.clock.set("2026-10-17T12:00:01Z");

    expect(await resendVerificationEmail(harness.context(browser))).toEqual({ ok: true });
  });

  it("refuses a user whose email is already verified, sending nothing", async () => {
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput({ email: "hal@example.com" }));
    await harness.openEmailedLink("hal@example.com", browser);

    const result = await resendVerificationEmail(harness.context(browser));

    expect(result).toEqual({ ok: false, refusal: "already-verified" });
    expect(harness.emails.to("hal@example.com")).toHaveLength(1);
  });

  it("refuses a signed-out visitor", async () => {
    expect(await resendVerificationEmail(harness.context(new TestBrowser()))).toEqual({ ok: false, refusal: "signed-out" });
  });
});

describe("Better Auth's server API, called directly", () => {
  it("counts its sign-up's email as a sign-up email, so the user still has all 5 resends", async () => {
    const browser = new TestBrowser();
    const { headers } = await harness.auth.api.signUpEmail({ body: directSignUpBody("rae@example.com"), returnHeaders: true });
    browser.receive(new Response(null, { headers }));

    for (let resend = 0; resend < 5; resend += 1) expect(await resendVerificationEmail(harness.context(browser))).toEqual({ ok: true });
  });

  it("counts its unverified email changes towards the cap of 3 changes", async () => {
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput({ email: "sol@example.com" }));
    for (const attempt of [1, 2, 3]) {
      await harness.auth.api.changeEmail({ body: { newEmail: `sol${attempt}@example.com` }, headers: browser.requestHeaders() });
    }

    const fourth = await changeEmail(harness.context(browser), "sol4@example.com");

    expect(fourth).toEqual({ ok: false, refusal: "change-limit" });
    expect(harness.emails.to("sol3@example.com")).toHaveLength(1);
  });
});

describe("changing an unverified user's email", () => {
  it("changes it at once and sends a new link there, keeping the deletion date from sign-up", async () => {
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput({ email: "ivy@exmaple.com" }));
    harness.clock.set("2026-10-18T09:00:00Z");

    const result = await changeEmail(harness.context(browser), "ivy@example.com");

    expect(result).toEqual({ ok: true, awaiting: "verification" });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "ivy@example.com", emailVerified: false });
    const [sent] = harness.emails.to("ivy@example.com");
    expect(sent!.text).toContain("Didn't sign up? Ignore this email. The account is removed on 23 October 2026.");
    await harness.openEmailedLink("ivy@example.com", browser);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "ivy@example.com", emailVerified: true });
  });

  it("answers an address already in use just as it answers any other, changing and sending nothing", async () => {
    await signUp(harness.context(new TestBrowser()), signUpInput({ email: "jo@example.com" }));
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput({ email: "kai@example.com" }));

    const result = await changeEmail(harness.context(browser), "jo@example.com");

    expect(result).toEqual({ ok: true, awaiting: "verification" });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "kai@example.com" });
    expect(harness.emails.to("jo@example.com")).toHaveLength(1);
  });

  it("allows 3 changes in 24 hours, refusing a fourth without changing the address", async () => {
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput({ email: "lee@example.com" }));
    for (const attempt of [1, 2, 3]) {
      expect(await changeEmail(harness.context(browser), `lee${attempt}@example.com`)).toEqual({ ok: true, awaiting: "verification" });
    }

    const fourth = await changeEmail(harness.context(browser), "lee4@example.com");

    expect(fourth).toEqual({ ok: false, refusal: "change-limit" });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "lee3@example.com" });
    expect(harness.emails.to("lee4@example.com")).toEqual([]);
  });

  it("refuses a malformed address or the address it already has", async () => {
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput({ email: "max@example.com" }));

    expect(await changeEmail(harness.context(browser), "not an address")).toEqual({ ok: false, refusal: "invalid-email" });
    expect(await changeEmail(harness.context(browser), " MAX@example.com ")).toEqual({ ok: false, refusal: "same-email" });
  });

  it("asks no approval and leaves no step pending in Settings, since the change is already made", async () => {
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInput({ email: "ned@exmaple.com" }));

    await changeEmail(harness.context(browser), "ned@example.com");

    expect(harness.emails.to("ned@exmaple.com")).toHaveLength(1);
    expect(await readPendingEmailChange(harness.context(browser))).toBeNull();
  });
});

let userCount = 0;

/** A sign-up as a script would send it to Better Auth, skipping our form. */
function directSignUpBody(email: string) {
  userCount += 1;
  const username = `direct_${userCount}`;
  return {
    name: username,
    username,
    email,
    password: "a long enough password",
    stylePreference: "menswear" as const,
    countryCode: "US",
    birthDate: "1992-02-02",
  };
}

function signUpInput(overrides: Partial<SignUpInput> = {}): SignUpInput {
  userCount += 1;
  return {
    birthDate: { day: "2", month: "2", year: "1992" },
    username: `user_${userCount}`,
    email: `user${userCount}@example.com`,
    password: "a long enough password",
    stylePreference: "menswear",
    countryCode: "US",
    acceptedTerms: true,
    ...overrides,
  };
}
