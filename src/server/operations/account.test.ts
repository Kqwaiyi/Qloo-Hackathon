import { inArray } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ProfileField, ProfileInput } from "@/server/accounts/profile";
import { consultation } from "@/server/db/schema";
import { changePassword, signOutEverywhere, updateProfile } from "@/server/operations/account";
import { startConsultation } from "@/server/operations/consultations";
import { requestPasswordReset, resetPassword } from "@/server/operations/password-reset";
import { readSignedInUser } from "@/server/operations/session";
import { signIn } from "@/server/operations/sign-in";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { BOTH_CONSENT_BOXES_TICKED, createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

beforeEach(() => {
  harness.clock.set("2026-10-16T12:00:00Z");
});

describe("updating the profile", () => {
  it("saves a new username, Style Preference and Country", async () => {
    const browser = await signedInUser({ username: "Ava.Stone", stylePreference: "menswear", countryCode: "US" });

    const result = await updateProfile(harness.context(browser), { username: "Ava.Marsh", stylePreference: "womenswear", countryCode: "GB" });

    expect(result).toEqual({ ok: true });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({
      username: "Ava.Marsh",
      stylePreference: "womenswear",
      countryCode: "GB",
    });
  });

  it("frees the old username at once: the user signs in with the new one, and anyone may take the old", async () => {
    const browser = await signedInUser({ username: "Ben.Old", email: "ben@example.com" });

    await updateProfile(harness.context(browser), profileOf({ username: "Ben.New" }));

    expect(await signIn(harness.context(new TestBrowser()), { identifier: "Ben.New", password: "the current password" })).toEqual({ ok: true });
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "Ben.Old", password: "the current password" })).toEqual({
      ok: false,
      refusal: "credentials-mismatch",
    });
    const other = await signedInUser();
    expect(await updateProfile(harness.context(other), profileOf({ username: "ben.old" }))).toEqual({ ok: true });
  });

  it("refuses a username someone else has, ignoring case, and changes nothing", async () => {
    await signedInUser({ username: "Cleo.Hart" });
    const browser = await signedInUser({ username: "Cleo.Ray", stylePreference: "menswear" });

    const result = await updateProfile(harness.context(browser), profileOf({ username: "CLEO.HART", stylePreference: "womenswear" }));

    expect(result).toEqual({ ok: false, refusal: "username-taken" });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Cleo.Ray", stylePreference: "menswear" });
  });

  it("lets the user change only the case of their own username, shown as typed", async () => {
    const browser = await signedInUser({ username: "dev.shah" });

    expect(await updateProfile(harness.context(browser), profileOf({ username: "Dev.Shah" }))).toEqual({ ok: true });

    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Dev.Shah" });
  });

  it("refuses a username outside Better Auth's rules, a Style Preference or Country not on the lists, and changes nothing", async () => {
    const browser = await signedInUser({ username: "Eve.Lin" });
    const attempts: [ProfileInput, ProfileField][] = [
      [{ username: "ev", stylePreference: "womenswear", countryCode: "GB" }, "username"],
      [{ username: "e".repeat(31), stylePreference: "womenswear", countryCode: "GB" }, "username"],
      [{ username: "eve lin", stylePreference: "womenswear", countryCode: "GB" }, "username"],
      [{ username: "Eve.Ng", stylePreference: "unisex", countryCode: "GB" }, "stylePreference"],
      [{ username: "Eve.Ng", stylePreference: "womenswear", countryCode: "XX" }, "countryCode"],
    ];

    for (const [profile, field] of attempts) {
      expect(await updateProfile(harness.context(browser), profile)).toEqual({ ok: false, refusal: "invalid", field });
    }
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Eve.Lin", stylePreference: "menswear", countryCode: "US" });
  });

  it("changes only new Consultations: each one keeps the Style Preference and Country it started with", async () => {
    const browser = await signedInUser({ email: "gus@example.com", stylePreference: "menswear", countryCode: "US" });
    await harness.openEmailedLink("gus@example.com", browser);
    const before = await startWithPlainPhoto(browser);

    await updateProfile(harness.context(browser), { username: "Gus.Wu", stylePreference: "no_preference", countryCode: "JP" });
    const after = await startWithPlainPhoto(browser);

    const stored = await harness.db
      .select({ id: consultation.id, stylePreference: consultation.stylePreference, countryCode: consultation.countryCode })
      .from(consultation)
      .where(inArray(consultation.id, [before, after]));
    expect(stored).toEqual(
      expect.arrayContaining([
        { id: before, stylePreference: "menswear", countryCode: "US" },
        { id: after, stylePreference: "no_preference", countryCode: "JP" },
      ]),
    );
  });

  it("refuses a signed-out visitor", async () => {
    expect(await updateProfile(harness.context(new TestBrowser()), profileOf({ username: "Fay.Moss" }))).toEqual({ ok: false, refusal: "signed-out" });
  });
});

describe("changing the password", () => {
  it("sets the new password when given the current one, so the user signs in with it and no longer with the old", async () => {
    const browser = await signedInUser({ username: "Ivy.Cole" });

    const result = await changePassword(harness.context(browser), { currentPassword: "the current password", newPassword: "the new password" });

    expect(result).toEqual({ ok: true });
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "Ivy.Cole", password: "the new password" })).toEqual({ ok: true });
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "Ivy.Cole", password: "the current password" })).toEqual({
      ok: false,
      refusal: "credentials-mismatch",
    });
  });

  it("refuses a wrong current password, keeping the old password", async () => {
    const browser = await signedInUser({ username: "Jo.Park" });

    const wrong = await changePassword(harness.context(browser), { currentPassword: "not the password", newPassword: "the new password" });
    const tooLong = await changePassword(harness.context(browser), { currentPassword: "x".repeat(129), newPassword: "the new password" });

    expect(wrong).toEqual({ ok: false, refusal: "wrong-password" });
    expect(tooLong).toEqual({ ok: false, refusal: "wrong-password" });
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "Jo.Park", password: "the current password" })).toEqual({ ok: true });
  });

  it("takes a new password of 8 to 128 characters", async () => {
    const browser = await signedInUser({ username: "Kai.Lund" });

    const tooShort = await changePassword(harness.context(browser), { currentPassword: "the current password", newPassword: "7 chars" });
    const tooLong = await changePassword(harness.context(browser), { currentPassword: "the current password", newPassword: "x".repeat(129) });
    const longest = await changePassword(harness.context(browser), { currentPassword: "the current password", newPassword: "x".repeat(128) });

    expect(tooShort).toEqual({ ok: false, refusal: "invalid-password" });
    expect(tooLong).toEqual({ ok: false, refusal: "invalid-password" });
    expect(longest).toEqual({ ok: true });
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "Kai.Lund", password: "x".repeat(128) })).toEqual({ ok: true });
  });

  it("signs the user out on their other devices, keeping this one signed in", async () => {
    const laptop = await signedInUser({ username: "Lee.Ray" });
    const phone = new TestBrowser();
    await signIn(harness.context(phone), { identifier: "Lee.Ray", password: "the current password" });

    await changePassword(harness.context(laptop), { currentPassword: "the current password", newPassword: "the new password" });

    expect(await readSignedInUser(harness.context(phone))).toBeNull();
    expect(await readSignedInUser(harness.context(laptop))).toMatchObject({ username: "Lee.Ray" });
  });

  it("emails the user a notice saying to reset the password and contact the team if it wasn't them", async () => {
    const browser = await signedInUser({ username: "Max.Ford", email: "max@example.com" });

    await changePassword(harness.context(browser), { currentPassword: "the current password", newPassword: "the new password" });

    const notices = passwordChangedEmailsTo("max@example.com");
    expect(notices).toHaveLength(1);
    expect(notices[0]!.text).toContain("If you didn't change it, reset your password now:\n\nhttp://localhost:3000/forgot-password");
    expect(notices[0]!.text).toContain("Then email us at team@example.test so we can help secure your account.");
  });

  it("sends no notice when the password isn't changed", async () => {
    const browser = await signedInUser({ username: "Ned.Cho", email: "ned@example.com" });

    await changePassword(harness.context(browser), { currentPassword: "not the password", newPassword: "the new password" });
    await changePassword(harness.context(browser), { currentPassword: "the current password", newPassword: "short" });

    expect(passwordChangedEmailsTo("ned@example.com")).toEqual([]);
  });

  it("sends no notice for a password reset, which isn't a change made in Settings", async () => {
    await signedInUser({ username: "Pia.Holt", email: "pia@example.com" });
    await requestPasswordReset(harness.context(new TestBrowser()), "pia@example.com");
    const token = new URL(harness.linkEmailedTo("pia@example.com")).pathname.split("/").at(-1)!;

    expect(await resetPassword(harness.context(new TestBrowser()), { token, newPassword: "the new password" })).toEqual({ ok: true });

    expect(passwordChangedEmailsTo("pia@example.com")).toEqual([]);
  });

  it("still changes the password when the notice can't go out", async () => {
    const browser = await signedInUser({ username: "Quinn.Bay", email: "quinn@example.com" });
    harness.emails.failWith = new Error("SMTP refused");

    try {
      const result = await changePassword(harness.context(browser), { currentPassword: "the current password", newPassword: "the new password" });
      expect(result).toEqual({ ok: true });
    } finally {
      harness.emails.failWith = undefined;
    }
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "Quinn.Bay", password: "the new password" })).toEqual({ ok: true });
  });

  it("refuses a signed-out visitor", async () => {
    const result = await changePassword(harness.context(new TestBrowser()), { currentPassword: "the current password", newPassword: "the new password" });

    expect(result).toEqual({ ok: false, refusal: "signed-out" });
  });

  it("asks a browser trying too many current passwords to wait", async () => {
    const limited = await createTestHarness({ rateLimit: true });
    const browser = new TestBrowser({ ip: "203.0.113.7" });
    await signUp(limited.context(browser), signUpInputFor("Oli.Grey"));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await changePassword(limited.context(browser), { currentPassword: `guess ${attempt}`, newPassword: "the new password" })).toEqual({
        ok: false,
        refusal: "wrong-password",
      });
    }

    const fourth = await changePassword(limited.context(browser), { currentPassword: "the current password", newPassword: "the new password" });

    expect(fourth).toEqual({ ok: false, refusal: "rate-limited" });
  });
});

describe("Better Auth's change-password endpoint, called directly", () => {
  it("signs out the other devices and sends the notice too, even when asked to keep the other devices", async () => {
    const laptop = await signedInUser({ username: "Ray.Dunn", email: "ray@example.com" });
    const phone = new TestBrowser();
    await signIn(harness.context(phone), { identifier: "Ray.Dunn", password: "the current password" });

    const direct = await harness.postToAuth(
      "/change-password",
      { currentPassword: "the current password", newPassword: "the new password", revokeOtherSessions: false },
      laptop,
    );

    expect(direct.status).toBe(200);
    expect(await readSignedInUser(harness.context(phone))).toBeNull();
    expect(await readSignedInUser(harness.context(laptop))).toMatchObject({ username: "Ray.Dunn" });
    expect(passwordChangedEmailsTo("ray@example.com")).toHaveLength(1);
  });

  it("sends the notice for a server API call too", async () => {
    const browser = await signedInUser({ username: "Sol.Vega", email: "sol@example.com" });

    await harness.auth.api.changePassword({
      body: { currentPassword: "the current password", newPassword: "the new password" },
      headers: browser.requestHeaders(),
    });

    expect(passwordChangedEmailsTo("sol@example.com")).toHaveLength(1);
  });
});

describe("signing out of all devices", () => {
  it("ends every sign-in, this one included", async () => {
    const laptop = await signedInUser({ username: "Tess.Roy" });
    const phone = new TestBrowser();
    await signIn(harness.context(phone), { identifier: "Tess.Roy", password: "the current password" });

    const result = await signOutEverywhere(harness.context(laptop));

    expect(result).toEqual({ ok: true });
    expect(laptop.hasSessionCookie()).toBe(false);
    expect(await readSignedInUser(harness.context(laptop))).toBeNull();
    expect(await readSignedInUser(harness.context(phone))).toBeNull();
  });

  it("leaves other users signed in", async () => {
    const uma = await signedInUser({ username: "Uma.Bell" });
    const someoneElse = await signedInUser({ username: "Vic.Hale" });

    await signOutEverywhere(harness.context(uma));

    expect(await readSignedInUser(harness.context(someoneElse))).toMatchObject({ username: "Vic.Hale" });
  });

  it("refuses a signed-out visitor", async () => {
    expect(await signOutEverywhere(harness.context(new TestBrowser()))).toEqual({ ok: false, refusal: "signed-out" });
  });
});

describe("the date of birth", () => {
  it("can't be changed through Better Auth's update-user endpoint, alone or with other fields", async () => {
    const browser = await signedInUser({ username: "Hal.Kim", birthDate: { day: "9", month: "3", year: "1999" } });
    const attempts = [{ birthYear: 2012 }, { birthMonth: 11 }, { birthYear: 1980, birthMonth: 1, countryCode: "GB" }];

    for (const body of attempts) {
      const response = await harness.postToAuth("/update-user", body, browser);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "FIELD_NOT_ALLOWED" });
    }
    await expect(
      harness.auth.api.updateUser({ body: { birthYear: 2012 } as never, headers: browser.requestHeaders() }),
    ).rejects.toMatchObject({ body: { code: "FIELD_NOT_ALLOWED" } });
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ birthYear: 1999, birthMonth: 3, countryCode: "US" });
  });
});

/** The Profile section as sent: this username, with Menswear and the US unless told otherwise. */
function profileOf(overrides: Partial<ProfileInput> & Pick<ProfileInput, "username">): ProfileInput {
  return { stylePreference: "menswear", countryCode: "US", ...overrides };
}

/** The password-changed notices sent to this address, oldest first. */
function passwordChangedEmailsTo(address: string) {
  return harness.emails.to(address).filter((email) => email.subject === "Your Outfit Recommender password was changed");
}

/** Starts a Full-Body Photo Consultation with a small, plain JPEG, returning its id. */
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

let userCount = 0;

/** A new user, signed in on a browser of their own. */
async function signedInUser(overrides: Partial<SignUpInput> = {}): Promise<TestBrowser> {
  const browser = new TestBrowser();
  expect(await signUp(harness.context(browser), { ...signUpInputFor(overrides.username), ...overrides })).toEqual({ ok: true });
  return browser;
}

/** Sign-up step 2 for a new user, born March 1999, with "the current password". */
function signUpInputFor(username?: string): SignUpInput {
  userCount += 1;
  return {
    birthDate: { day: "9", month: "3", year: "1999" },
    username: username ?? `user_${userCount}`,
    email: `user${userCount}@example.com`,
    password: "the current password",
    stylePreference: "menswear",
    countryCode: "US",
    acceptedTerms: true,
  };
}
