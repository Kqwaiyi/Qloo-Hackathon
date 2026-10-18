import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { user } from "@/server/db/schema";
import { updateProfile } from "@/server/operations/account";
import { listConsultations, startConsultation } from "@/server/operations/consultations";
import { changeEmail, readPendingEmailChange } from "@/server/operations/email-change";
import { requestPasswordReset } from "@/server/operations/password-reset";
import { readSignedInUser } from "@/server/operations/session";
import { signIn } from "@/server/operations/sign-in";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { qlooPerson, qlooResponse } from "@/server/qloo/fake";
import { BOTH_CONSENT_BOXES_TICKED, createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// Disposable Addresses: addresses at throwaway-inbox services, which no account may sign up with or
// change to. `mailinator.com` and `yopmail.com` are on the list the app bundles; `example.com` and
// `mymailinator.com` aren't.

// Made-up people, shaped like Qloo's person entities: enough Style Icons for a Face Photo's two Outfits.
const STYLE_ICONS = [qlooPerson("p-1", "Ava Stone", 0.94), qlooPerson("p-2", "Bea Marsh", 0.91), qlooPerson("p-3", "Cleo Hart", 0.88)];

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
  harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
});

beforeEach(() => {
  harness.clock.set("2026-10-16T12:00:00Z");
});

describe("signing up with a Disposable Address by our form", () => {
  it("is refused, creating no account and sending no email", async () => {
    const browser = new TestBrowser();

    const result = await signUp(harness.context(browser), signUpInput({ email: "bot@mailinator.com" }));

    expect(result).toEqual({ ok: false, refusal: "disposable-address" });
    expect(browser.hasSessionCookie()).toBe(false);
    expect(await harness.db.select().from(user).where(eq(user.email, "bot@mailinator.com"))).toEqual([]);
    expect(harness.emails.to("bot@mailinator.com")).toEqual([]);
  });

  it("is refused at any subdomain of a listed domain", async () => {
    const result = await signUp(harness.context(new TestBrowser()), signUpInput({ email: "bot@inbox.eu.mailinator.com" }));

    expect(result).toEqual({ ok: false, refusal: "disposable-address" });
    expect(await harness.db.select().from(user).where(eq(user.email, "bot@inbox.eu.mailinator.com"))).toEqual([]);
  });

  it("is refused whatever the case of the domain", async () => {
    const result = await signUp(harness.context(new TestBrowser()), signUpInput({ email: "Bot@Inbox.MailInator.COM" }));

    expect(result).toEqual({ ok: false, refusal: "disposable-address" });
    expect(await harness.db.select().from(user).where(eq(user.email, "bot@inbox.mailinator.com"))).toEqual([]);
  });

  it("lets an ordinary address sign up, at example.com as the e2e tests use or at a domain only ending in a listed one's name", async () => {
    expect(await signUp(harness.context(new TestBrowser()), signUpInput({ email: "ava@example.com" }))).toEqual({ ok: true });
    expect(await signUp(harness.context(new TestBrowser()), signUpInput({ email: "ben@mymailinator.com" }))).toEqual({ ok: true });
  });
});

describe("signing up with a Disposable Address at Better Auth's sign-up endpoint, called directly", () => {
  it("is refused at a listed domain and at a subdomain of one, creating no account", async () => {
    for (const email of ["script@yopmail.com", "script@Relay.YOPMAIL.com"]) {
      const response = await harness.postToAuth("/sign-up/email", signUpBody({ email }), new TestBrowser());

      expect(response.status, email).toBe(400);
      expect(await response.json()).toMatchObject({ code: "DISPOSABLE_ADDRESS" });
      expect(await harness.db.select().from(user).where(eq(user.email, email.toLowerCase()))).toEqual([]);
    }
    expect(harness.emails.to("script@yopmail.com")).toEqual([]);
  });

  it("lets an address at example.com through", async () => {
    const response = await harness.postToAuth("/sign-up/email", signUpBody({ email: "cleo@example.com" }), new TestBrowser());

    expect(response.status).toBe(200);
  });
});

describe("changing an account's email to a Disposable Address by our form", () => {
  it("is refused for a verified user, sending nothing and leaving no change waiting", async () => {
    const browser = await signedInUser({ email: "dev@example.com" });

    const result = await changeEmail(harness.context(browser), "dev@mailinator.com");

    expect(result).toEqual({ ok: false, refusal: "disposable-address" });
    expect(harness.emails.to("dev@example.com")).toHaveLength(1);
    expect(harness.emails.to("dev@mailinator.com")).toEqual([]);
    expect(await readPendingEmailChange(harness.context(browser))).toBeNull();
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "dev@example.com" });
  });

  it("is refused for an unverified user, whose change would happen at once, at a subdomain of a listed domain too", async () => {
    const browser = await signedInUser({ email: "eve@example.com", verified: false });

    const result = await changeEmail(harness.context(browser), "eve@Inbox.Mailinator.com");

    expect(result).toEqual({ ok: false, refusal: "disposable-address" });
    expect(harness.emails.to("eve@inbox.mailinator.com")).toEqual([]);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "eve@example.com" });
  });

  it("goes ahead to an ordinary address, at example.com or at a domain only ending in a listed one's name", async () => {
    const browser = await signedInUser({ email: "fay@example.com" });

    expect(await changeEmail(harness.context(browser), "fay.new@example.com")).toEqual({ ok: true, awaiting: "approval" });
    expect(await changeEmail(harness.context(browser), "fay@mymailinator.com")).toEqual({ ok: true, awaiting: "approval" });
  });
});

describe("changing an account's email to a Disposable Address at Better Auth's change-email endpoint, called directly", () => {
  it("is refused at a listed domain and at a subdomain of one, sending nothing", async () => {
    const browser = await signedInUser({ email: "gus@example.com" });

    for (const newEmail of ["gus@yopmail.com", "gus@relay.yopmail.com"]) {
      const response = await harness.postToAuth("/change-email", { newEmail }, browser);

      expect(response.status, newEmail).toBe(400);
      expect(await response.json()).toMatchObject({ code: "DISPOSABLE_ADDRESS" });
      expect(harness.emails.to(newEmail)).toEqual([]);
    }
    expect(harness.emails.to("gus@example.com")).toHaveLength(1);
    expect(await readPendingEmailChange(harness.context(browser))).toBeNull();
  });

  it("lets a change to an address at example.com through", async () => {
    const browser = await signedInUser({ email: "ivy@example.com" });

    const response = await harness.postToAuth("/change-email", { newEmail: "ivy.new@example.com" }, browser);

    expect(response.status).toBe(200);
    expect(await readPendingEmailChange(harness.context(browser))).toEqual({ newEmail: "ivy.new@example.com", step: "approval" });
  });
});

describe("an account that already has a Disposable Address", () => {
  it("keeps it, and can still sign in and get Outfits", async () => {
    await accountMadeBeforeTheRule({ madeWith: "hal@example.com", nowAt: "hal@mailinator.com" });
    const browser = new TestBrowser();

    const signedIn = await signIn(harness.context(browser), { identifier: "hal@mailinator.com", password: PASSWORD });
    const started = await startConsultation(harness.context(browser), { photo: await jpeg(), photoType: "face", consent: BOTH_CONSENT_BOXES_TICKED });

    expect(signedIn).toEqual({ ok: true });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ email: "hal@mailinator.com", emailVerified: true });
    if (!started.ok) throw new Error(`Couldn't start a Consultation: ${started.refusal}`);
    await harness.stylings.runPending();
    expect(await listConsultations(harness.context(browser))).toMatchObject([{ id: started.consultationId, outfitCount: 2 }]);
  });

  it("can still change its profile and get a password reset link", async () => {
    const browser = await accountMadeBeforeTheRule({ madeWith: "ian@example.com", nowAt: "ian@yopmail.com" });

    const profile = await updateProfile(harness.context(browser), { username: "Ian.Holt", stylePreference: "menswear", countryCode: "US" });
    const reset = await requestPasswordReset(harness.context(new TestBrowser()), { email: "ian@yopmail.com" });

    expect(profile).toEqual({ ok: true });
    expect(reset).toEqual({ ok: true });
    expect(harness.emails.to("ian@yopmail.com")).toMatchObject([{ subject: expect.stringMatching(/reset/i) }]);
  });
});

let userCount = 0;

const PASSWORD = "a long enough password";

/**
 * An account made, and verified, before Disposable Addresses were refused, whose address is now at
 * a listed domain. Only the database can make one today. Signed in on the browser returned.
 */
async function accountMadeBeforeTheRule({ madeWith, nowAt }: { madeWith: string; nowAt: string }): Promise<TestBrowser> {
  const browser = await signedInUser({ email: madeWith });
  await harness.db.update(user).set({ email: nowAt }).where(eq(user.email, madeWith));
  return browser;
}

async function jpeg(): Promise<Blob> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}

/**
 * A new user, signed up by our form with an ordinary address and signed in, who has verified it by
 * its link unless told otherwise.
 */
async function signedInUser({ email, verified = true }: { email: string; verified?: boolean }): Promise<TestBrowser> {
  const browser = new TestBrowser();
  expect(await signUp(harness.context(browser), signUpInput({ email }))).toEqual({ ok: true });
  if (verified) await harness.openEmailedLink(email, browser);
  return browser;
}

/** What a script calling Better Auth's sign-up endpoint itself would send. */
function signUpBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  userCount += 1;
  const username = `disposable_direct_${userCount}`;
  return {
    name: username,
    username,
    displayUsername: username,
    email: `${username}@example.com`,
    password: PASSWORD,
    stylePreference: "menswear",
    countryCode: "US",
    birthDate: "1990-05-17",
    ...overrides,
  };
}

function signUpInput(overrides: Partial<SignUpInput> = {}): SignUpInput {
  userCount += 1;
  return {
    birthDate: { day: "3", month: "8", year: "1995" },
    username: `disposable_user_${userCount}`,
    email: `disposable.user${userCount}@example.com`,
    password: PASSWORD,
    stylePreference: "womenswear",
    countryCode: "GB",
    acceptedTerms: true,
    ...overrides,
  };
}
