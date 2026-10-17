import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { qlooCache, qlooLimitState, usageRecord } from "@/server/db/schema";
import { deleteConsultation, readConsultation, startConsultation } from "@/server/operations/consultations";
import { readSignedInUser } from "@/server/operations/session";
import { readStylingStatus } from "@/server/operations/stylings";
import { readUsageSummary } from "@/server/operations/usage";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { qlooPerson, qlooResponse } from "@/server/qloo/fake";
import { recordUsage } from "@/server/usage/records";
import { BOTH_CONSENT_BOXES_TICKED, createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// Made-up people, shaped like Qloo's person entities: enough Style Icons for a Face Photo's two Outfits.
const STYLE_ICONS = [qlooPerson("p-1", "Ava Stone", 0.94), qlooPerson("p-2", "Bea Marsh", 0.91), qlooPerson("p-3", "Cleo Hart", 0.88)];

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

beforeEach(async () => {
  harness.clock.set("2026-10-16T12:00:00Z");
  harness.blob.objects.clear();
  harness.ai.scenario = "pass";
  harness.ai.styleIconScenarios = {};
  harness.ai.duringCall = undefined;
  harness.ai.photoCheckCount = 0;
  harness.stylings.pending.length = 0;
  harness.qloo.requests.length = 0;
  harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
  await harness.db.delete(qlooCache);
  // The app-wide caps count every user's Outfits, so each test starts with none made, and with no
  // report from Qloo of the calls left.
  await harness.db.delete(usageRecord);
  await harness.db.delete(qlooLimitState);
});

describe("the usage summary", () => {
  it("gives a new user 10 Outfits today, and says a Styling can start and would make 2 of them", async () => {
    const browser = await signedInUser();

    expect(await readUsageSummary(harness.context(browser))).toEqual({
      outfitsLeft: 10,
      moreOutfitsFrom: null,
      stylingStart: { ok: true, outfitsWanted: 2 },
    });
  });

  it("says a user who hasn't verified their email can't start a Styling yet", async () => {
    const browser = await signedInUser({}, { verified: false });

    expect(await readUsageSummary(harness.context(browser))).toEqual({
      outfitsLeft: 10,
      moreOutfitsFrom: null,
      stylingStart: { ok: false, refusal: "unverified" },
    });
  });

  it("is nothing for a signed-out visitor", async () => {
    expect(await readUsageSummary(harness.context(new TestBrowser()))).toBeNull();
  });
});

describe("the Outfit Allowance", () => {
  it("counts each Outfit a Styling switches in, with more 24 hours after the oldest", async () => {
    const browser = await signedInUser();
    harness.clock.set("2026-10-16T12:30:00Z");
    await start(browser);
    harness.clock.set("2026-10-16T12:31:00Z");

    await harness.stylings.runPending();

    expect(await readUsageSummary(harness.context(browser))).toEqual({
      outfitsLeft: 8,
      moreOutfitsFrom: new Date("2026-10-17T12:31:00Z"),
      stylingStart: { ok: true, outfitsWanted: 2 },
    });
  });

  it("counts 1 for a Styling that could make only 1 Outfit", async () => {
    harness.qloo.respond = () => qlooResponse([STYLE_ICONS[0]!]);
    const browser = await signedInUser();

    await styleAt(browser, "2026-10-16T12:30:00Z");

    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ outfitsLeft: 9 });
  });

  it("counts nothing for a Styling that failed, or for a Style Icon skipped after its tailoring failed", async () => {
    const browser = await signedInUser();
    harness.qloo.respond = () => qlooResponse([]);
    await styleAt(browser, "2026-10-16T12:30:00Z");
    await harness.db.delete(qlooCache);
    harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
    harness.ai.styleIconScenarios = { "Ava Stone": "tailoring-fails" };

    const consultationId = await styleAt(browser, "2026-10-16T12:40:00Z");

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toHaveLength(2);
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ outfitsLeft: 8 });
  });

  it("counts each Outfit for 24 hours, a rolling window rather than a calendar day", async () => {
    const browser = await signedInUser();
    await styleAt(browser, "2026-10-16T22:00:00Z");
    await styleAt(browser, "2026-10-17T01:00:00Z");

    harness.clock.set("2026-10-17T21:59:59Z");
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({
      outfitsLeft: 6,
      moreOutfitsFrom: new Date("2026-10-17T22:00:00Z"),
    });
    harness.clock.set("2026-10-17T22:00:00Z");
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({
      outfitsLeft: 8,
      moreOutfitsFrom: new Date("2026-10-18T01:00:00Z"),
    });
    harness.clock.set("2026-10-18T01:00:00Z");
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ outfitsLeft: 10, moreOutfitsFrom: null });
  });

  it("keeps counting the Outfits of a Consultation that was deleted", async () => {
    const browser = await signedInUser();
    const consultationId = await styleAt(browser, "2026-10-16T12:30:00Z");

    expect(await deleteConsultation(harness.context(browser), consultationId)).toEqual({ ok: true });

    expect(await readUsageSummary(harness.context(browser))).toMatchObject({
      outfitsLeft: 8,
      moreOutfitsFrom: new Date("2026-10-17T12:30:00Z"),
    });
  });

  it.each(["preview-refused", "preview-fails"] as const)("counts an Outfit shown without its Preview (%s)", async (scenario) => {
    harness.ai.scenario = scenario;
    const browser = await signedInUser();

    const consultationId = await styleAt(browser, "2026-10-16T12:30:00Z");

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.preview.state)).not.toContain("ready");
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ outfitsLeft: 8 });
  });

  it("counts the Outfits a Styling had built when its Consultation is deleted while its Previews are made", async () => {
    const browser = await signedInUser();
    harness.clock.set("2026-10-16T12:30:00Z");
    const consultationId = await start(browser);
    let deleted = false;
    harness.ai.duringCall = async (call) => {
      if (call !== "renderPreview" || deleted) return;
      deleted = true;
      expect(await deleteConsultation(harness.context(browser), consultationId)).toEqual({ ok: true });
    };

    await harness.stylings.runPending();

    expect(deleted).toBe(true);
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ outfitsLeft: 8 });
  });

  it("is each user's own", async () => {
    const browser = await signedInUser();
    await styleAt(browser, "2026-10-16T12:30:00Z");

    expect(await readUsageSummary(harness.context(await signedInUser()))).toMatchObject({ outfitsLeft: 10, moreOutfitsFrom: null });
  });
});

describe("the last Outfit left", () => {
  it("is all a first Styling makes", async () => {
    const browser = await signedInUser();
    await styleAt(browser, "2026-10-16T09:00:00Z");
    await styleAt(browser, "2026-10-16T10:00:00Z");
    await styleAt(browser, "2026-10-16T11:00:00Z");
    await harness.db.delete(qlooCache);
    harness.qloo.respond = () => qlooResponse([STYLE_ICONS[0]!]);
    await styleAt(browser, "2026-10-16T12:00:00Z");
    await harness.db.delete(qlooCache);
    harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
    await styleAt(browser, "2026-10-16T13:00:00Z");
    harness.clock.set("2026-10-16T14:00:00Z");
    expect(await readUsageSummary(harness.context(browser))).toEqual({
      outfitsLeft: 1,
      moreOutfitsFrom: new Date("2026-10-17T09:00:00Z"),
      stylingStart: { ok: true, outfitsWanted: 1 },
    });

    const consultationId = await start(browser);
    expect(await readStylingStatus(harness.context(browser), consultationId)).toMatchObject({ progress: { previews: { of: 1 } } });
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual(["Ava Stone"]);
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ outfitsLeft: 0 });
  });
});

describe("a used-up Outfit Allowance", () => {
  it("is in the usage summary, which says no Styling can start until 24 hours after the oldest Outfit", async () => {
    const browser = await useUpAllowance();

    expect(await readUsageSummary(harness.context(browser))).toEqual({
      outfitsLeft: 0,
      moreOutfitsFrom: new Date("2026-10-17T09:00:00Z"),
      stylingStart: { ok: false, refusal: "allowance-used", moreFrom: new Date("2026-10-17T09:00:00Z") },
    });
  });

  it("frees the oldest Outfits once they have counted for 24 hours", async () => {
    const browser = await useUpAllowance();

    harness.clock.set("2026-10-17T09:00:00Z");

    expect(await readUsageSummary(harness.context(browser))).toEqual({
      outfitsLeft: 2,
      moreOutfitsFrom: new Date("2026-10-17T10:00:00Z"),
      stylingStart: { ok: true, outfitsWanted: 2 },
    });
  });

  it("refuses a new Consultation before the photo is checked, with more from 24 hours after the oldest Outfit, storing nothing", async () => {
    const browser = await useUpAllowance();

    const result = await getMyOutfits(browser);

    expect(result).toEqual({ ok: false, refusal: "allowance-used", moreFrom: new Date("2026-10-17T09:00:00Z") });
    expect(harness.ai.photoCheckCount).toBe(0);
    expect(harness.blob.objects.size).toBe(0);
    expect(harness.stylings.pending).toEqual([]);
  });
});

describe("the photo-check limit", () => {
  it("counts every photo checked, accepted or rejected, and refuses a 21st in 24 hours before checking it", async () => {
    const browser = await signedInUser();
    harness.clock.set("2026-10-16T09:00:00Z");
    expect(await getMyOutfits(browser)).toMatchObject({ ok: true });
    harness.clock.set("2026-10-16T10:00:00Z");
    await rejectPhotos(browser, 19);
    harness.clock.set("2026-10-16T11:00:00Z");
    harness.ai.photoCheckCount = 0;
    harness.blob.objects.clear();

    const result = await getMyOutfits(browser);

    expect(result).toEqual({ ok: false, refusal: "photo-check-limit", moreFrom: new Date("2026-10-17T09:00:00Z") });
    expect(harness.ai.photoCheckCount).toBe(0);
    expect(harness.blob.objects.size).toBe(0);
  });

  it("checks photos again once the oldest check has counted for 24 hours", async () => {
    const browser = await signedInUser();
    harness.clock.set("2026-10-16T09:00:00Z");
    await rejectPhotos(browser, 20);

    harness.clock.set("2026-10-17T08:59:59Z");
    expect(await getMyOutfits(browser)).toMatchObject({ ok: false, refusal: "photo-check-limit" });
    harness.clock.set("2026-10-17T09:00:00Z");
    expect(await getMyOutfits(browser)).toMatchObject({ ok: true });
  });

  it("doesn't count a photo check that errors, or a file refused before the check", async () => {
    const browser = await signedInUser();
    await rejectPhotos(browser, 19);
    harness.ai.scenario = "check-errors";
    expect(await getMyOutfits(browser)).toEqual({ ok: false, refusal: "check-errored" });
    harness.ai.scenario = "pass";
    const unusable = await startConsultation(harness.context(browser), {
      photo: new Blob(["not a photo"]),
      photoType: "face",
      consent: BOTH_CONSENT_BOXES_TICKED,
    });
    expect(unusable).toEqual({ ok: false, refusal: "unusable-file" });

    expect(await getMyOutfits(browser)).toMatchObject({ ok: true });
    expect(await getMyOutfits(browser)).toMatchObject({ ok: false, refusal: "photo-check-limit" });
  });

  it("is each user's own", async () => {
    await rejectPhotos(await signedInUser(), 20);

    expect(await getMyOutfits(await signedInUser())).toMatchObject({ ok: true });
  });

  it("comes after the Outfit Allowance in the order of checks", async () => {
    const browser = await signedInUser();
    harness.clock.set("2026-10-16T08:00:00Z");
    await rejectPhotos(browser, 15);
    // 5 more photo checks.
    await useUpAllowance(browser);

    expect(await getMyOutfits(browser)).toMatchObject({ ok: false, refusal: "allowance-used" });
  });
});

describe("the app-wide 24-hour cap", () => {
  it("stops every user's Stylings once 100 Outfits have been made in 24 hours, without blaming them", async () => {
    await outfitsMadeByOthers(100, "2026-10-16T09:00:00Z");
    const browser = await signedInUser();

    expect(await readUsageSummary(harness.context(browser))).toEqual({
      outfitsLeft: 10,
      moreOutfitsFrom: null,
      stylingStart: { ok: false, refusal: "app-wide-24-hour-cap" },
    });
  });

  it("limits a Styling to the Outfits the cap leaves, then stops the next", async () => {
    await outfitsMadeByOthers(99, "2026-10-16T09:00:00Z");
    const browser = await signedInUser();
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ stylingStart: { ok: true, outfitsWanted: 1 } });

    const consultationId = await styleAt(browser, "2026-10-16T12:30:00Z");

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toHaveLength(1);
    expect(await getMyOutfits(await signedInUser())).toEqual({ ok: false, refusal: "app-wide-24-hour-cap" });
  });

  it("counts each Outfit for 24 hours, a rolling window rather than a calendar day", async () => {
    await outfitsMadeByOthers(100, "2026-10-15T13:00:00Z");
    const browser = await signedInUser();

    harness.clock.set("2026-10-16T12:59:59Z");
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ stylingStart: { ok: false, refusal: "app-wide-24-hour-cap" } });
    harness.clock.set("2026-10-16T13:00:00Z");
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ stylingStart: { ok: true, outfitsWanted: 2 } });
  });

  it("refuses a new Consultation before the photo is checked, storing nothing", async () => {
    await outfitsMadeByOthers(100, "2026-10-16T09:00:00Z");

    expect(await getMyOutfits(await signedInUser())).toEqual({ ok: false, refusal: "app-wide-24-hour-cap" });
    expect(harness.ai.photoCheckCount).toBe(0);
    expect(harness.blob.objects.size).toBe(0);
    expect(harness.stylings.pending).toEqual([]);
  });

  it.each([
    // The cap lifts at 13:30 tomorrow, after the user's own Outfits come back at 09:00.
    { othersMadeAt: "2026-10-16T13:30:00Z", refusal: { refusal: "app-wide-24-hour-cap" } },
    // The cap lifts at 15:00 today: only the user's own Outfit Allowance holds after that.
    { othersMadeAt: "2026-10-15T15:00:00Z", refusal: { refusal: "allowance-used", moreFrom: new Date("2026-10-17T09:00:00Z") } },
  ])("gives whichever lifts later when the user's own Outfit Allowance is used up too (others' made $othersMadeAt)", async ({ othersMadeAt, refusal }) => {
    await outfitsMadeByOthers(90, othersMadeAt);
    const browser = await useUpAllowance();

    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ outfitsLeft: 0, stylingStart: { ok: false, ...refusal } });
  });
});

describe("the app-wide monthly cap", () => {
  it("stops every user's Stylings once 750 Outfits have been made in the UTC calendar month, until the next month starts", async () => {
    await outfitsMadeByOthers(700, "2026-10-05T09:00:00Z");
    await outfitsMadeByOthers(50, "2026-10-16T08:00:00Z");
    const browser = await signedInUser();

    expect(await readUsageSummary(harness.context(browser))).toMatchObject({
      stylingStart: { ok: false, refusal: "app-wide-monthly-cap", backOn: new Date("2026-11-01T00:00:00Z") },
    });
    harness.clock.set("2026-10-31T23:59:59Z");
    expect(await getMyOutfits(browser)).toMatchObject({ ok: false, refusal: "app-wide-monthly-cap" });
    expect(harness.ai.photoCheckCount).toBe(0);
    harness.clock.set("2026-11-01T00:00:00Z");
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ stylingStart: { ok: true, outfitsWanted: 2 } });
  });

  it("counts only this month's Outfits, and limits a Styling to what it leaves", async () => {
    await outfitsMadeByOthers(100, "2026-09-30T23:59:59Z");
    await outfitsMadeByOthers(699, "2026-10-01T00:00:00Z");
    await outfitsMadeByOthers(50, "2026-10-16T08:00:00Z");

    expect(await readUsageSummary(harness.context(await signedInUser()))).toMatchObject({ stylingStart: { ok: true, outfitsWanted: 1 } });
  });
});

describe("the Qloo backstop", () => {
  it("stops new Stylings once Qloo reports fewer than 1,000 calls left, until Qloo's reset date", async () => {
    const browser = await styledWhileQlooReports({ callsLeft: 999, resetsInDays: 15 });

    expect(await readUsageSummary(harness.context(browser))).toEqual({
      outfitsLeft: 8,
      moreOutfitsFrom: new Date("2026-10-17T12:30:00Z"),
      stylingStart: { ok: false, refusal: "qloo-backstop", backOn: new Date("2026-10-31T12:30:00Z") },
    });
    expect(await getMyOutfits(await signedInUser())).toEqual({ ok: false, refusal: "qloo-backstop", backOn: new Date("2026-10-31T12:30:00Z") });
    expect(harness.ai.photoCheckCount).toBe(0);
    expect(harness.blob.objects.size).toBe(0);
    harness.clock.set("2026-10-31T12:30:00Z");
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ stylingStart: { ok: true, outfitsWanted: 2 } });
  });

  it("lets Stylings start while Qloo reports 1,000 calls or more left", async () => {
    const browser = await styledWhileQlooReports({ callsLeft: 1000, resetsInDays: 15 });

    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ stylingStart: { ok: true, outfitsWanted: 2 } });
  });

  it("lets Stylings start when Qloo's responses don't say how many calls are left", async () => {
    const browser = await signedInUser();

    await styleAt(browser, "2026-10-16T12:30:00Z");

    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ stylingStart: { ok: true, outfitsWanted: 2 } });
  });

  it("holds until the next UTC calendar month when Qloo doesn't say when its calls reset", async () => {
    const browser = await styledWhileQlooReports({ callsLeft: 999 });

    expect(await readUsageSummary(harness.context(browser))).toMatchObject({
      stylingStart: { ok: false, refusal: "qloo-backstop", backOn: new Date("2026-11-01T00:00:00Z") },
    });
    harness.clock.set("2026-11-01T00:00:00Z");
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ stylingStart: { ok: true } });
  });

  it.each([
    { qlooResetsInDays: 28, refusal: { refusal: "qloo-backstop", backOn: new Date("2026-11-13T12:30:00Z") } },
    { qlooResetsInDays: 4, refusal: { refusal: "app-wide-monthly-cap", backOn: new Date("2026-11-01T00:00:00Z") } },
  ])("gives the later date when the monthly cap holds too (Qloo resets in $qlooResetsInDays days)", async ({ qlooResetsInDays, refusal }) => {
    const browser = await styledWhileQlooReports({ callsLeft: 999, resetsInDays: qlooResetsInDays });
    await outfitsMadeByOthers(750, "2026-10-05T09:00:00Z");

    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ stylingStart: { ok: false, ...refusal } });
  });
});

/**
 * Has a new user's first Styling run at 12:30 while Qloo reports, on each response, `callsLeft`
 * calls left this month and, if given, how many days until they reset (Qloo sends seconds). Clears
 * the fakes' counts of photo checks and stored photos afterwards, and returns the user's browser.
 */
async function styledWhileQlooReports({ callsLeft, resetsInDays }: { callsLeft: number; resetsInDays?: number }): Promise<TestBrowser> {
  const headers: Record<string, string> = { "X-Month-RateLimit-Remaining": String(callsLeft) };
  if (resetsInDays !== undefined) headers["X-Month-RateLimit-Reset"] = String(resetsInDays * 24 * 60 * 60);
  harness.qloo.respond = () => qlooResponse(STYLE_ICONS, headers);
  const browser = await signedInUser();
  await styleAt(browser, "2026-10-16T12:30:00Z");
  harness.ai.photoCheckCount = 0;
  harness.blob.objects.clear();
  return browser;
}

/** Records `count` Outfits made at `time` by a new user, as if their Stylings had finished then. */
async function outfitsMadeByOthers(count: number, time: string): Promise<void> {
  const user = await readSignedInUser(harness.context(await signedInUser()));
  await recordUsage(harness.db, { kind: "outfit", userId: user!.id, at: new Date(time) }, count);
}

/** Sends `count` photos that the check rejects, as showing no one. */
async function rejectPhotos(browser: TestBrowser, count: number): Promise<void> {
  harness.ai.scenario = "no-person";
  for (let sent = 0; sent < count; sent += 1) {
    expect(await getMyOutfits(browser)).toMatchObject({ ok: false, refusal: "photo-rejected" });
  }
  harness.ai.scenario = "pass";
}

/** Presses "Get my Outfits" with a plain JPEG Face Photo, agreeing on the consent sheet, returning what the operation returns. */
async function getMyOutfits(browser: TestBrowser) {
  return startConsultation(harness.context(browser), { photo: await jpeg(), photoType: "face", consent: BOTH_CONSENT_BOXES_TICKED });
}

/** Starts a Face Photo Consultation, returning its id. Its Styling waits for `runPending()`. */
async function start(browser: TestBrowser): Promise<string> {
  const result = await getMyOutfits(browser);
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
  return result.consultationId;
}

/**
 * Has the user, a new one unless given, make 10 Outfits, two each hour from 09:00 to 13:00, then
 * look at 14:00, with the fakes' counts of photo checks and stored photos cleared.
 */
async function useUpAllowance(browser?: TestBrowser): Promise<TestBrowser> {
  browser ??= await signedInUser();
  for (const hour of ["09", "10", "11", "12", "13"]) await styleAt(browser, `2026-10-16T${hour}:00:00Z`);
  harness.clock.set("2026-10-16T14:00:00Z");
  harness.ai.photoCheckCount = 0;
  harness.blob.objects.clear();
  return browser;
}

/** Starts a Face Photo Consultation at `time` and runs its Styling to its finish then, returning its id. */
async function styleAt(browser: TestBrowser, time: string): Promise<string> {
  harness.clock.set(time);
  const consultationId = await start(browser);
  await harness.stylings.runPending();
  return consultationId;
}

let userCount = 0;

/** A new user, signed in, who has verified their email by its link unless told otherwise. */
async function signedInUser(overrides: Partial<SignUpInput> = {}, { verified = true } = {}): Promise<TestBrowser> {
  userCount += 1;
  const browser = new TestBrowser();
  const email = `usage.user${userCount}@example.com`;
  const result = await signUp(harness.context(browser), {
    birthDate: { day: "2", month: "2", year: "1992" },
    username: `usage_user_${userCount}`,
    email,
    password: "a long enough password",
    stylePreference: "womenswear",
    countryCode: "US",
    acceptedTerms: true,
    ...overrides,
  });
  expect(result).toEqual({ ok: true });
  if (verified) await harness.openEmailedLink(overrides.email ?? email, browser);
  return browser;
}

async function jpeg(): Promise<Blob> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}
