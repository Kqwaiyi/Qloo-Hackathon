import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { consultation, emailLog, styling, usageRecord } from "@/server/db/schema";
import { deleteAccount } from "@/server/operations/account";
import { listConsultations, type PhotoConsentTicks, startConsultation } from "@/server/operations/consultations";
import { requestPasswordReset, resetPassword } from "@/server/operations/password-reset";
import { readSignedInUser } from "@/server/operations/session";
import { signIn } from "@/server/operations/sign-in";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { qlooPerson, qlooResponse } from "@/server/qloo/fake";
import { BOTH_CONSENT_BOXES_TICKED, createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// Made-up people, shaped like Qloo's person entities: enough Style Icons for a Face Photo's two Outfits.
const STYLE_ICONS = [qlooPerson("p-1", "Ava Stone", 0.94), qlooPerson("p-2", "Bea Marsh", 0.91), qlooPerson("p-3", "Cleo Hart", 0.88)];

const PASSWORD = "a long enough password";

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

beforeEach(() => {
  harness.clock.set("2026-10-16T12:00:00Z");
  harness.blob.objects.clear();
  harness.blob.deleteFolderFails = false;
  harness.ai.scenario = "pass";
  harness.ai.duringCall = undefined;
  harness.stylings.pending.length = 0;
  harness.stylings.cancelled.length = 0;
  harness.qloo.requests.length = 0;
  harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
});

describe("deleting the account in Settings", () => {
  it("deletes the account, confirmed with the password, signing the user out, so the account can't sign in again", async () => {
    const browser = await signedInUser({ username: "Ada.Moss", email: "ada@example.com" });

    const result = await deleteAccount(harness.context(browser), { password: PASSWORD });

    expect(result).toEqual({ ok: true });
    expect(browser.hasSessionCookie()).toBe(false);
    expect(await readSignedInUser(harness.context(browser))).toBeNull();
    for (const identifier of ["Ada.Moss", "ada@example.com"]) {
      expect(await signIn(harness.context(new TestBrowser()), { identifier, password: PASSWORD })).toEqual({
        ok: false,
        refusal: "credentials-mismatch",
      });
    }
  });

  it("deletes every Consultation at once, with its photo and Previews", async () => {
    const browser = await signedInUser();
    const first = await start(browser);
    await harness.stylings.runPending();
    const second = await start(browser);
    await harness.stylings.runPending();
    expect(harness.blob.objects.size).toBe(6);

    await deleteAccount(harness.context(browser), { password: PASSWORD });

    const left = await harness.db.select({ id: consultation.id }).from(consultation).where(inArray(consultation.id, [first, second]));
    expect(left).toEqual([]);
    expect(harness.blob.objects.size).toBe(0);
  });

  it("cancels a running Styling's Workflow run first, so it never builds anything", async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser);
    const [running] = await harness.db.select().from(styling).where(eq(styling.consultationId, consultationId));

    await deleteAccount(harness.context(browser), { password: PASSWORD });
    await harness.stylings.runPending();

    expect(harness.stylings.cancelled).toEqual([running!.workflowRunId]);
    expect(harness.qloo.requests).toEqual([]);
    expect(harness.blob.objects.size).toBe(0);
  });

  it("strips the user from their usage records and email log, which stay, so the app-wide caps still count them", async () => {
    const browser = await signedInUser();
    const { id } = (await readSignedInUser(harness.context(browser)))!;
    await start(browser);
    await harness.stylings.runPending();
    const usage = await harness.db.select({ id: usageRecord.id }).from(usageRecord).where(eq(usageRecord.userId, id));
    const emails = await harness.db.select({ id: emailLog.id }).from(emailLog).where(eq(emailLog.userId, id));
    // The photo check and both Outfits; the verification email.
    expect(usage).toHaveLength(3);
    expect(emails).toHaveLength(1);

    await deleteAccount(harness.context(browser), { password: PASSWORD });

    const keptUsage = await harness.db.select().from(usageRecord).where(inArray(usageRecord.id, usage.map((row) => row.id)));
    const keptEmails = await harness.db.select().from(emailLog).where(inArray(emailLog.id, emails.map((row) => row.id)));
    expect(keptUsage.map((row) => row.userId)).toEqual([null, null, null]);
    expect(keptEmails.map((row) => row.userId)).toEqual([null]);
  });

  it("deletes the password reset links still waiting, so one sent before can't be used", async () => {
    const browser = await signedInUser({ email: "bo@example.com" });
    await requestPasswordReset(harness.context(new TestBrowser()), "bo@example.com");
    const token = new URL(harness.linkEmailedTo("bo@example.com")).pathname.split("/").at(-1)!;

    await deleteAccount(harness.context(browser), { password: PASSWORD });

    expect(await resetPassword(harness.context(new TestBrowser()), { token, newPassword: "a new password" })).toEqual({
      ok: false,
      refusal: "invalid-link",
    });
  });

  it("signs the user out on every other device too", async () => {
    const laptop = await signedInUser({ username: "Cy.Lowe" });
    const phone = new TestBrowser();
    await signIn(harness.context(phone), { identifier: "Cy.Lowe", password: PASSWORD });

    await deleteAccount(harness.context(laptop), { password: PASSWORD });

    expect(await readSignedInUser(harness.context(phone))).toBeNull();
  });

  it("frees the username and email for a new account", async () => {
    const browser = await signedInUser({ username: "Di.Kerr", email: "di@example.com" });

    await deleteAccount(harness.context(browser), { password: PASSWORD });

    await signedInUser({ username: "Di.Kerr", email: "di@example.com" });
  });

  it("refuses a wrong password, deleting nothing and keeping the user signed in", async () => {
    const browser = await signedInUser({ username: "Ed.Finch" });
    const consultationId = await start(browser);
    await harness.stylings.runPending();

    const wrong = await deleteAccount(harness.context(browser), { password: "not the password" });
    const tooLong = await deleteAccount(harness.context(browser), { password: "x".repeat(129) });

    expect(wrong).toEqual({ ok: false, refusal: "wrong-password" });
    expect(tooLong).toEqual({ ok: false, refusal: "wrong-password" });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Ed.Finch" });
    expect((await listConsultations(harness.context(browser))).map(({ id }) => id)).toEqual([consultationId]);
    expect(harness.blob.objects.size).toBe(3);
  });

  it("leaves other users' accounts and Consultations alone", async () => {
    const deleting = await signedInUser();
    await start(deleting);
    await harness.stylings.runPending();
    const someoneElse = await signedInUser({ username: "Fen.Ash" });
    const theirs = await start(someoneElse);
    await harness.stylings.runPending();

    await deleteAccount(harness.context(deleting), { password: PASSWORD });

    expect(await readSignedInUser(harness.context(someoneElse))).toMatchObject({ username: "Fen.Ash" });
    expect((await listConsultations(harness.context(someoneElse))).map(({ id }) => id)).toEqual([theirs]);
    expect(harness.blob.objects.size).toBe(3);
  });

  it("refuses a signed-out visitor", async () => {
    expect(await deleteAccount(harness.context(new TestBrowser()), { password: PASSWORD })).toEqual({ ok: false, refusal: "signed-out" });
  });

  it("keeps the account when the Blob objects can't be deleted, and deleting again finishes the job", async () => {
    const browser = await signedInUser({ username: "Gil.Rowe" });
    await start(browser);
    await harness.stylings.runPending();
    harness.blob.deleteFolderFails = true;

    try {
      await expect(deleteAccount(harness.context(browser), { password: PASSWORD })).rejects.toThrow();
    } finally {
      harness.blob.deleteFolderFails = false;
    }
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Gil.Rowe" });

    expect(await deleteAccount(harness.context(browser), { password: PASSWORD })).toEqual({ ok: true });
    expect(harness.blob.objects.size).toBe(0);
  });

  it("leaves nothing behind from a \"Get my Outfits\" still checking its photo in another tab", async () => {
    const browser = await signedInUser();
    const { id } = (await readSignedInUser(harness.context(browser)))!;
    harness.ai.duringCall = async (call) => {
      if (call === "checkPhoto") expect(await deleteAccount(harness.context(browser), { password: PASSWORD })).toEqual({ ok: true });
    };

    try {
      // Whatever it answers, the account is gone.
      await getMyOutfits(browser, BOTH_CONSENT_BOXES_TICKED).catch(() => undefined);
    } finally {
      harness.ai.duringCall = undefined;
    }

    expect(await harness.db.select().from(consultation).where(eq(consultation.userId, id))).toEqual([]);
    expect(harness.blob.objects.size).toBe(0);
    expect(harness.stylings.pending).toEqual([]);
  });

  it("asks a browser trying too many passwords to wait", async () => {
    const limited = await createTestHarness({ rateLimit: true });
    const browser = new TestBrowser({ ip: "203.0.113.9" });
    expect(await signUp(limited.context(browser), signUpInputFor())).toEqual({ ok: true });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await deleteAccount(limited.context(browser), { password: `guess ${attempt}` })).toEqual({ ok: false, refusal: "wrong-password" });
    }

    expect(await deleteAccount(limited.context(browser), { password: PASSWORD })).toEqual({ ok: false, refusal: "rate-limited" });
    expect(await readSignedInUser(limited.context(browser))).not.toBeNull();
  });
});

describe("Better Auth's delete-user endpoint, called directly", () => {
  it("needs the password, even just after signing in", async () => {
    const browser = await signedInUser({ username: "Hope.Dale" });

    const response = await harness.postToAuth("/delete-user", {}, browser);
    await expect(harness.auth.api.deleteUser({ body: {}, headers: browser.requestHeaders() })).rejects.toMatchObject({
      body: { code: "PASSWORD_REQUIRED" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PASSWORD_REQUIRED" });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Hope.Dale" });
  });

  it("deletes everything with the password, as Settings does", async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser);
    await harness.stylings.runPending();

    const response = await harness.postToAuth("/delete-user", { password: PASSWORD }, browser);

    expect(response.status).toBe(200);
    expect(await harness.db.select().from(consultation).where(eq(consultation.id, consultationId))).toEqual([]);
    expect(harness.blob.objects.size).toBe(0);
  });
});

let userCount = 0;

/** A new user, signed in, who has verified their email by its link. */
async function signedInUser(overrides: Partial<SignUpInput> = {}): Promise<TestBrowser> {
  const browser = new TestBrowser();
  const input = { ...signUpInputFor(), ...overrides };
  expect(await signUp(harness.context(browser), input)).toEqual({ ok: true });
  await harness.openEmailedLink(input.email, browser);
  return browser;
}

/** Sign-up step 2 for a new user, born June 1994. */
function signUpInputFor(): SignUpInput {
  userCount += 1;
  return {
    birthDate: { day: "14", month: "6", year: "1994" },
    username: `deleting_user_${userCount}`,
    email: `deleting.user${userCount}@example.com`,
    password: PASSWORD,
    stylePreference: "womenswear",
    countryCode: "GB",
    acceptedTerms: true,
  };
}

/** Starts a Face Photo Consultation, agreeing on the consent sheet, returning its id. Its Styling waits for `runPending()`. */
async function start(browser: TestBrowser): Promise<string> {
  const result = await getMyOutfits(browser, BOTH_CONSENT_BOXES_TICKED);
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
  return result.consultationId;
}

/** Presses "Get my Outfits" with a plain JPEG Face Photo, with the consent sheet's ticks if given. */
async function getMyOutfits(browser: TestBrowser, consent?: PhotoConsentTicks) {
  return startConsultation(harness.context(browser), { photo: await jpeg(), photoType: "face", consent });
}

async function jpeg(): Promise<Blob> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}
