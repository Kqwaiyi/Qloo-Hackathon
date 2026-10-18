import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { consultation } from "@/server/db/schema";
import { startConsultation } from "@/server/operations/consultations";
import { requestPasswordReset, resetPassword } from "@/server/operations/password-reset";
import { readSignedInUser } from "@/server/operations/session";
import { signIn } from "@/server/operations/sign-in";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { correctBirthDate, deleteAccountByEmail } from "@/server/operations/team";
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
  harness.stylings.pending.length = 0;
  harness.stylings.cancelled.length = 0;
  harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
});

describe("the team deleting an account by email", () => {
  it("deletes the account using that email, ignoring case, with every Consultation, photo and Preview, as the user's own deletion does", async () => {
    const browser = await signedInUser({ username: "Ida.Penn", email: "ida.penn@example.com" });
    const { id } = (await readSignedInUser(harness.context(browser)))!;
    await start(browser);
    await harness.stylings.runPending();
    const running = await start(browser);

    const result = await deleteAccountByEmail(teamContext(), " Ida.Penn@Example.com ");

    expect(result).toEqual({ ok: true });
    expect(harness.stylings.cancelled).toHaveLength(1);
    expect(await harness.db.select().from(consultation).where(eq(consultation.userId, id))).toEqual([]);
    expect(await harness.db.select().from(consultation).where(eq(consultation.id, running))).toEqual([]);
    expect(harness.blob.objects.size).toBe(0);
    expect(await readSignedInUser(harness.context(browser))).toBeNull();
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "Ida.Penn", password: PASSWORD })).toEqual({
      ok: false,
      refusal: "credentials-mismatch",
    });
  });

  it("deletes the password reset links still waiting, as the user's own deletion does", async () => {
    await signedInUser({ email: "jem@example.com" });
    await requestPasswordReset(harness.context(new TestBrowser()), { email: "jem@example.com" });
    const token = new URL(harness.linkEmailedTo("jem@example.com")).pathname.split("/").at(-1)!;

    await deleteAccountByEmail(teamContext(), "jem@example.com");

    expect(await resetPassword(harness.context(new TestBrowser()), { token, newPassword: "a new password" })).toEqual({
      ok: false,
      refusal: "invalid-link",
    });
  });

  it("says when no account uses the email, deleting nothing", async () => {
    const browser = await signedInUser({ username: "Kit.Vale", email: "kit@example.com" });

    expect(await deleteAccountByEmail(teamContext(), "kit@example.org")).toEqual({ ok: false, refusal: "no-such-account" });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Kit.Vale" });
  });
});

describe("the team correcting a date of birth", () => {
  it("keeps only the corrected birth year and month, which Settings then shows, keeping the account", async () => {
    const browser = await signedInUser({ email: "lou@example.com", birthDate: { day: "14", month: "6", year: "1994" } });

    const result = await correctBirthDate(teamContext(), { email: "LOU@example.com", birthDate: "1990-02-11" });

    expect(result).toEqual({ ok: true, accountDeleted: false });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ birthYear: 1990, birthMonth: 2 });
  });

  it("deletes the account, with every Consultation, photo and Preview, when the correction shows the user is under 18", async () => {
    const browser = await signedInUser({ username: "Mo.Reid", email: "mo@example.com" });
    const { id } = (await readSignedInUser(harness.context(browser)))!;
    await start(browser);
    await harness.stylings.runPending();

    const result = await correctBirthDate(teamContext(), { email: "mo@example.com", birthDate: "2010-01-05" });

    expect(result).toEqual({ ok: true, accountDeleted: true });
    expect(await harness.db.select().from(consultation).where(eq(consultation.userId, id))).toEqual([]);
    expect(harness.blob.objects.size).toBe(0);
    expect(await readSignedInUser(harness.context(browser))).toBeNull();
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "Mo.Reid", password: PASSWORD })).toEqual({
      ok: false,
      refusal: "credentials-mismatch",
    });
  });

  it("judges 18 to the day and in every time zone, as sign-up does", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const eighteenEverywhere = await signedInUser({ email: "nia@example.com" });
    const eighteenOnlyInSomeTimeZones = await signedInUser({ email: "oz@example.com" });

    const kept = await correctBirthDate(teamContext(), { email: "nia@example.com", birthDate: "2008-10-16" });
    const deleted = await correctBirthDate(teamContext(), { email: "oz@example.com", birthDate: "2008-10-17" });

    expect(kept).toEqual({ ok: true, accountDeleted: false });
    expect(await readSignedInUser(harness.context(eighteenEverywhere))).toMatchObject({ birthYear: 2008, birthMonth: 10 });
    expect(deleted).toEqual({ ok: true, accountDeleted: true });
    expect(await readSignedInUser(harness.context(eighteenOnlyInSomeTimeZones))).toBeNull();
  });

  it("refuses a date that isn't real or hasn't come yet, changing nothing", async () => {
    harness.clock.set("2026-10-16T12:00:00Z");
    const browser = await signedInUser({ email: "pam@example.com", birthDate: { day: "14", month: "6", year: "1994" } });

    for (const birthDate of ["1990-02-30", "1990-13-01", "1899-12-31", "11/02/1990", "2026-10-17"]) {
      expect(await correctBirthDate(teamContext(), { email: "pam@example.com", birthDate })).toEqual({
        ok: false,
        refusal: "invalid-birth-date",
      });
    }
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ birthYear: 1994, birthMonth: 6 });
  });

  it("says when no account uses the email", async () => {
    expect(await correctBirthDate(teamContext(), { email: "nobody@example.com", birthDate: "1990-02-11" })).toEqual({
      ok: false,
      refusal: "no-such-account",
    });
  });
});

/** What a team script's operations get: no browser's request. */
function teamContext() {
  return harness.context(new TestBrowser());
}

let userCount = 0;

/** A new user, signed in, who has verified their email by its link. */
async function signedInUser(overrides: Partial<SignUpInput> = {}): Promise<TestBrowser> {
  userCount += 1;
  const browser = new TestBrowser();
  const input: SignUpInput = {
    birthDate: { day: "14", month: "6", year: "1994" },
    username: `team_user_${userCount}`,
    email: `team.user${userCount}@example.com`,
    password: PASSWORD,
    stylePreference: "womenswear",
    countryCode: "GB",
    acceptedTerms: true,
    ...overrides,
  };
  expect(await signUp(harness.context(browser), input)).toEqual({ ok: true });
  await harness.openEmailedLink(input.email, browser);
  return browser;
}

/** Starts a Face Photo Consultation, agreeing on the consent sheet, returning its id. Its Styling waits for `runPending()`. */
async function start(browser: TestBrowser): Promise<string> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  const result = await startConsultation(harness.context(browser), {
    photo: new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
    photoType: "face",
    consent: BOTH_CONSENT_BOXES_TICKED,
  });
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
  return result.consultationId;
}
