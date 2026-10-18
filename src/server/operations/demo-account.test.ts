import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  changeDemoAccountBirthDate,
  changePassword,
  deleteAccount,
  signOutEverywhere,
  updateProfile,
  withdrawPhotoConsent,
} from "@/server/operations/account";
import { listConsultations, startConsultation } from "@/server/operations/consultations";
import { changeEmail, readPendingEmailChange } from "@/server/operations/email-change";
import { requestPasswordReset, resetPassword } from "@/server/operations/password-reset";
import { readSignedInUser } from "@/server/operations/session";
import { signIn } from "@/server/operations/sign-in";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { createDemoAccount, deleteAccountByEmail } from "@/server/operations/team";
import { BOTH_CONSENT_BOXES_TICKED, createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// The harness's team address is team@example.test, so the Demo Account's is its +demo plus-address.
const DEMO_EMAIL = "team+demo@example.test";
const DEMO_PASSWORD = "the judges' shared password";

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
  expect(await createDemoAccount(teamContext(harness), { password: DEMO_PASSWORD })).toEqual({ ok: true });
});

beforeEach(() => {
  harness.clock.set("2026-10-16T12:00:00Z");
});

describe("the team creating the Demo Account", () => {
  it("creates it already verified, as demo at the team's +demo address, born January 2000, signing in with the password it was given", async () => {
    const judge = new TestBrowser();
    expect(await signIn(harness.context(judge), { identifier: "demo", password: DEMO_PASSWORD })).toEqual({ ok: true });
    expect(await readSignedInUser(harness.context(judge))).toMatchObject({
      username: "demo",
      email: DEMO_EMAIL,
      emailVerified: true,
      birthYear: 2000,
      birthMonth: 1,
      isDemoAccount: true,
    });
  });

  it("says when it already exists, changing nothing", async () => {
    expect(await createDemoAccount(teamContext(harness), { password: "another shared password" })).toEqual({ ok: false, refusal: "already-exists" });

    expect(await signIn(harness.context(new TestBrowser()), { identifier: "demo", password: DEMO_PASSWORD })).toEqual({ ok: true });
  });

  it("refuses a password outside 8 to 128 characters, creating nothing", async () => {
    const fresh = await createTestHarness();

    for (const password of ["7 chars", "x".repeat(129)]) {
      expect(await createDemoAccount(teamContext(fresh), { password })).toEqual({ ok: false, refusal: "invalid-password" });
    }
    expect(await createDemoAccount(teamContext(fresh), { password: DEMO_PASSWORD })).toEqual({ ok: true });
  });

  it("says when someone else has the username demo, ignoring case, creating nothing", async () => {
    const fresh = await createTestHarness();
    expect(await signUp(fresh.context(new TestBrowser()), signUpInputFor({ username: "Demo" }))).toEqual({ ok: true });

    expect(await createDemoAccount(teamContext(fresh), { password: DEMO_PASSWORD })).toEqual({ ok: false, refusal: "username-taken" });
    expect(await signIn(fresh.context(new TestBrowser()), { identifier: DEMO_EMAIL, password: DEMO_PASSWORD })).toEqual({
      ok: false,
      refusal: "credentials-mismatch",
    });
  });

  it("is made only by the team's script: a sign-up with its address is refused as taken, even before it exists", async () => {
    const fresh = await createTestHarness();

    expect(await signUp(fresh.context(new TestBrowser()), signUpInputFor({ email: "Team+Demo@example.test" }))).toEqual({
      ok: false,
      refusal: "email-taken",
    });
    const direct = await fresh.postToAuth("/sign-up/email", { ...directSignUpBody(), email: DEMO_EMAIL }, new TestBrowser());
    expect(direct.status).toBe(422);

    expect(await createDemoAccount(teamContext(fresh), { password: DEMO_PASSWORD })).toEqual({ ok: true });
  });

  it("lets the team still delete it by email, as its scripts do", async () => {
    const fresh = await createTestHarness();
    await createDemoAccount(teamContext(fresh), { password: DEMO_PASSWORD });

    expect(await deleteAccountByEmail(teamContext(fresh), DEMO_EMAIL)).toEqual({ ok: true });
    expect(await signIn(fresh.context(new TestBrowser()), { identifier: "demo", password: DEMO_PASSWORD })).toEqual({
      ok: false,
      refusal: "credentials-mismatch",
    });
  });

  it("sends its password reset links to the team's +demo address, where only the team can open them", async () => {
    const fresh = await createTestHarness();
    await createDemoAccount(teamContext(fresh), { password: DEMO_PASSWORD });

    await requestPasswordReset(fresh.context(new TestBrowser()), DEMO_EMAIL);
    const token = new URL(fresh.linkEmailedTo(DEMO_EMAIL)).pathname.split("/").at(-1)!;
    expect(await resetPassword(fresh.context(new TestBrowser()), { token, newPassword: "the team's new password" })).toEqual({ ok: true });

    expect(await signIn(fresh.context(new TestBrowser()), { identifier: "demo", password: "the team's new password" })).toEqual({ ok: true });
  });

  it("isn't the Demo Account for anyone else", async () => {
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInputFor());

    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ isDemoAccount: false });
  });
});

describe("what the team manages on the Demo Account", () => {
  it("refuses a password change, through Settings, Better Auth's endpoint and its server API, keeping the password", async () => {
    const judge = await signedInJudge();
    const change = { currentPassword: DEMO_PASSWORD, newPassword: "a password of my own" };

    expect(await changePassword(harness.context(judge), change)).toEqual({ ok: false, refusal: "managed-by-the-team" });
    await expectManaged(harness.postToAuth("/change-password", change, judge));
    await expectManaged(harness.auth.api.changePassword({ body: change, headers: judge.requestHeaders() }));

    expect(await signIn(harness.context(new TestBrowser()), { identifier: "demo", password: DEMO_PASSWORD })).toEqual({ ok: true });
    expect(harness.emails.to(DEMO_EMAIL).filter(({ subject }) => subject.includes("password was changed"))).toEqual([]);
  });

  it("refuses an email change, through Settings, Better Auth's endpoint and its server API, keeping the email and sending nothing", async () => {
    const judge = await signedInJudge();
    const sentBefore = harness.emails.messages.length;

    expect(await changeEmail(harness.context(judge), "judge@example.com")).toEqual({ ok: false, refusal: "managed-by-the-team" });
    await expectManaged(harness.postToAuth("/change-email", { newEmail: "judge@example.com" }, judge));
    await expectManaged(harness.auth.api.changeEmail({ body: { newEmail: "judge@example.com" }, headers: judge.requestHeaders() }));

    expect(await readSignedInUser(harness.context(judge))).toMatchObject({ email: DEMO_EMAIL });
    expect(await readPendingEmailChange(harness.context(judge))).toBeNull();
    expect(harness.emails.messages.length).toBe(sentBefore);
  });

  it("refuses a username change, even of case, through Settings, Better Auth's endpoint and its server API, changing nothing", async () => {
    const judge = await signedInJudge();

    for (const username of ["judge.one", "Demo"]) {
      expect(await updateProfile(harness.context(judge), { username, stylePreference: "womenswear", countryCode: "GB" })).toEqual({
        ok: false,
        refusal: "managed-by-the-team",
      });
    }
    await expectManaged(harness.postToAuth("/update-user", { username: "judge.one", stylePreference: "womenswear" }, judge));
    await expectManaged(harness.postToAuth("/update-user", { displayUsername: "DEMO" }, judge));
    await expectManaged(harness.postToAuth("/update-user", { name: "Judge One" }, judge));
    await expectManaged(harness.auth.api.updateUser({ body: { username: "judge.one" }, headers: judge.requestHeaders() }));

    expect(await readSignedInUser(harness.context(judge))).toMatchObject({ username: "demo", stylePreference: "no_preference", countryCode: "US" });
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "demo", password: DEMO_PASSWORD })).toEqual({ ok: true });
  });

  it("refuses deleting the account, through Settings, Better Auth's endpoint and its server API, keeping it", async () => {
    const judge = await signedInJudge();

    expect(await deleteAccount(harness.context(judge), { password: DEMO_PASSWORD })).toEqual({ ok: false, refusal: "managed-by-the-team" });
    await expectManaged(harness.postToAuth("/delete-user", { password: DEMO_PASSWORD }, judge));
    await expectManaged(harness.auth.api.deleteUser({ body: { password: DEMO_PASSWORD }, headers: judge.requestHeaders() }));

    expect(await readSignedInUser(harness.context(judge))).toMatchObject({ isDemoAccount: true });
  });

  it("refuses signing out of all devices, or of other devices, through Settings, Better Auth's endpoints and its server API, keeping every judge signed in", async () => {
    const judge = await signedInJudge();
    const otherJudge = await signedInJudge();
    const [otherSession] = (await harness.auth.api.listSessions({ headers: otherJudge.requestHeaders() })).filter(
      ({ token }) => otherJudge.requestHeaders().get("cookie")!.includes(token),
    );

    expect(await signOutEverywhere(harness.context(judge))).toEqual({ ok: false, refusal: "managed-by-the-team" });
    await expectManaged(harness.postToAuth("/revoke-sessions", {}, judge));
    await expectManaged(harness.postToAuth("/revoke-other-sessions", {}, judge));
    await expectManaged(harness.postToAuth("/revoke-session", { token: otherSession!.token }, judge));
    await expectManaged(harness.auth.api.revokeSessions({ headers: judge.requestHeaders() }));

    expect(await readSignedInUser(harness.context(judge))).toMatchObject({ isDemoAccount: true });
    expect(await readSignedInUser(harness.context(otherJudge))).toMatchObject({ isDemoAccount: true });
  });

  it("refuses withdrawing photo consent, keeping every judge's Consultations", async () => {
    const judge = await signedInJudge();
    const consultationId = await startWithPlainPhoto(judge);

    expect(await withdrawPhotoConsent(harness.context(judge))).toEqual({ ok: false, refusal: "managed-by-the-team" });

    expect((await listConsultations(harness.context(await signedInJudge()))).map(({ id }) => id)).toContain(consultationId);
  });
});

describe("what judges can change on the Demo Account", () => {
  it("saves a new Style Preference and Country from Settings, keeping the username, and through Better Auth's endpoint", async () => {
    const judge = await signedInJudge();

    expect(await updateProfile(harness.context(judge), { username: "demo", stylePreference: "womenswear", countryCode: "JP" })).toEqual({ ok: true });
    expect(await readSignedInUser(harness.context(judge))).toMatchObject({ username: "demo", stylePreference: "womenswear", countryCode: "JP" });

    const direct = await harness.postToAuth("/update-user", { stylePreference: "menswear", countryCode: "GB" }, judge);
    expect(direct.status).toBe(200);
    expect(await readSignedInUser(harness.context(judge))).toMatchObject({ username: "demo", stylePreference: "menswear", countryCode: "GB" });
  });
});

describe("judges changing the Demo Account's date of birth", () => {
  it("keeps the new year and month, which Settings then shows", async () => {
    const judge = await signedInJudge();

    expect(await changeDemoAccountBirthDate(harness.context(judge), { day: "23", month: "7", year: "1985" })).toEqual({ ok: true });

    expect(await readSignedInUser(harness.context(judge))).toMatchObject({ birthYear: 1985, birthMonth: 7 });
  });

  it("keeps it 18 or over, to the day in every time zone, refusing a younger one and changing nothing", async () => {
    const judge = await signedInJudge();
    await changeDemoAccountBirthDate(harness.context(judge), { day: "1", month: "1", year: "2000" });
    // At 12:00 UTC on 16 October 2026, someone born on 17 October 2008 is already 18 east of UTC+12, but not yet everywhere.
    const younger = [
      { day: "17", month: "10", year: "2008" },
      { day: "5", month: "5", year: "2012" },
    ];

    for (const fields of younger) {
      expect(await changeDemoAccountBirthDate(harness.context(judge), fields)).toEqual({ ok: false, refusal: "under-18" });
    }
    expect(await readSignedInUser(harness.context(judge))).toMatchObject({ birthYear: 2000, birthMonth: 1 });

    expect(await changeDemoAccountBirthDate(harness.context(judge), { day: "16", month: "10", year: "2008" })).toEqual({ ok: true });
    expect(await readSignedInUser(harness.context(judge))).toMatchObject({ birthYear: 2008, birthMonth: 10 });
  });

  it("is for the Demo Account alone: anyone else's date of birth stays as they signed up with it", async () => {
    const browser = new TestBrowser();
    await signUp(harness.context(browser), signUpInputFor());

    expect(await changeDemoAccountBirthDate(harness.context(browser), { day: "23", month: "7", year: "1985" })).toEqual({
      ok: false,
      refusal: "not-demo-account",
    });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ birthYear: 1999, birthMonth: 3 });
  });

  it("refuses a date that isn't real, and a signed-out visitor, changing nothing", async () => {
    const judge = await signedInJudge();
    await changeDemoAccountBirthDate(harness.context(judge), { day: "1", month: "1", year: "2000" });

    for (const fields of [{ day: "30", month: "2", year: "1990" }, { day: "", month: "", year: "" }, { day: "1", month: "13", year: "1990" }]) {
      expect(await changeDemoAccountBirthDate(harness.context(judge), fields)).toEqual({ ok: false, refusal: "invalid-birth-date" });
    }
    expect(await changeDemoAccountBirthDate(harness.context(new TestBrowser()), { day: "23", month: "7", year: "1985" })).toEqual({
      ok: false,
      refusal: "signed-out",
    });
    expect(await readSignedInUser(harness.context(judge))).toMatchObject({ birthYear: 2000, birthMonth: 1 });
  });

  it("can't be changed through Better Auth's update-user endpoint, which would skip the 18+ rule", async () => {
    const judge = await signedInJudge();
    await changeDemoAccountBirthDate(harness.context(judge), { day: "1", month: "1", year: "2000" });

    await expectManaged(harness.postToAuth("/update-user", { birthYear: 2012, birthMonth: 5 }, judge));

    expect(await readSignedInUser(harness.context(judge))).toMatchObject({ birthYear: 2000, birthMonth: 1 });
  });
});

/** A judge's browser, signed in to the Demo Account. */
async function signedInJudge(): Promise<TestBrowser> {
  const judge = new TestBrowser();
  expect(await signIn(harness.context(judge), { identifier: "demo", password: DEMO_PASSWORD })).toEqual({ ok: true });
  return judge;
}

/** Better Auth's answer to the Demo Account asking for something the team manages: an HTTP response, or a server API call's error. */
async function expectManaged(answer: Promise<unknown>): Promise<void> {
  const settled = await answer.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  if ("error" in settled) {
    expect(settled.error).toMatchObject({ statusCode: 403, body: { code: "MANAGED_BY_THE_TEAM", message: "Managed by the team" } });
    return;
  }
  const response = settled.value as Response;
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "MANAGED_BY_THE_TEAM", message: "Managed by the team" });
}

/** Starts a Full-Body Photo Consultation with a small, plain JPEG, agreeing on the consent sheet, returning its id. */
async function startWithPlainPhoto(browser: TestBrowser): Promise<string> {
  const jpeg = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  const result = await startConsultation(harness.context(browser), {
    photo: new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }),
    photoType: "full_body",
    consent: BOTH_CONSENT_BOXES_TICKED,
  });
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
  return result.consultationId;
}

/** A team script's context, with no request and no sign-in. */
function teamContext(on: TestHarness) {
  return on.context(new TestBrowser());
}

let userCount = 0;

/** What a direct call to Better Auth's sign-up endpoint sends, skipping our form. */
function directSignUpBody() {
  userCount += 1;
  const username = `direct_${userCount}`;
  return { name: username, username, password: "a long enough password", stylePreference: "menswear", countryCode: "US", birthDate: "1992-02-02" };
}

/** Sign-up step 2 for a new user, born March 1999. */
function signUpInputFor(overrides: Partial<SignUpInput> = {}): SignUpInput {
  userCount += 1;
  return {
    birthDate: { day: "9", month: "3", year: "1999" },
    username: `user_${userCount}`,
    email: `user${userCount}@example.com`,
    password: "a long enough password",
    stylePreference: "menswear",
    countryCode: "US",
    acceptedTerms: true,
    ...overrides,
  };
}
