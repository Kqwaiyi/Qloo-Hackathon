import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PHOTO_NOTICE_VERSION } from "@/config/accounts";
import { OUTFIT_ALLOWANCE } from "@/config/limits";
import { needsPhotoConsent } from "@/server/accounts/photo-consent";
import { consultation, qlooCache, styling, usageRecord, user } from "@/server/db/schema";
import { withdrawPhotoConsent } from "@/server/operations/account";
import { listConsultations, type PhotoConsentTicks, readConsultation, startConsultation } from "@/server/operations/consultations";
import { readSignedInUser } from "@/server/operations/session";
import { signIn } from "@/server/operations/sign-in";
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
  harness.ai.photoCheckCount = 0;
  harness.ai.duringCall = undefined;
  harness.stylings.pending.length = 0;
  harness.stylings.cancelled.length = 0;
  harness.qloo.requests.length = 0;
  harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
  await harness.db.delete(qlooCache);
  await harness.db.delete(usageRecord);
});

describe("photo consent on \"Get my Outfits\"", () => {
  it("refuses a user who has never agreed to the photo notice, before the photo is checked, storing nothing", async () => {
    const browser = await signedInUser();

    const result = await getMyOutfits(browser);

    expect(result).toEqual({ ok: false, refusal: "photo-consent-needed" });
    expect(harness.ai.photoCheckCount).toBe(0);
    expect(harness.blob.objects.size).toBe(0);
    expect(harness.stylings.pending).toEqual([]);
  });

  it("records the user's agreement to the current photo notice, and when, once both boxes are ticked, and goes ahead", async () => {
    const browser = await signedInUser();
    harness.clock.set("2026-10-16T12:34:56Z");

    const result = await getMyOutfits(browser, BOTH_CONSENT_BOXES_TICKED);

    expect(result).toEqual({ ok: true, consultationId: expect.any(String) });
    expect((await readSignedInUser(harness.context(browser)))!.photoConsent).toEqual({
      noticeVersion: PHOTO_NOTICE_VERSION,
      acceptedAt: new Date("2026-10-16T12:34:56Z"),
    });
  });

  it("shows a new user the consent sheet, and not once they've agreed: later Consultations go ahead without the ticks", async () => {
    const browser = await signedInUser();
    expect(needsPhotoConsent((await readSignedInUser(harness.context(browser)))!)).toBe(true);

    await getMyOutfits(browser, BOTH_CONSENT_BOXES_TICKED);
    await harness.stylings.runPending();

    expect(needsPhotoConsent((await readSignedInUser(harness.context(browser)))!)).toBe(false);
    expect(await getMyOutfits(browser)).toEqual({ ok: true, consultationId: expect.any(String) });
  });

  it.each([
    ["only the box for storing photos and having AI process them", { storeAndProcess: true, sendToGemini: false }],
    ["only the box for sending them to Google's Gemini", { storeAndProcess: false, sendToGemini: true }],
    ["neither box", { storeAndProcess: false, sendToGemini: false }],
  ])("refuses %s ticked, recording nothing and storing nothing", async (_name, consent) => {
    const browser = await signedInUser();

    const result = await getMyOutfits(browser, consent);

    expect(result).toEqual({ ok: false, refusal: "photo-consent-needed" });
    expect((await readSignedInUser(harness.context(browser)))!.photoConsent).toBeNull();
    expect(harness.ai.photoCheckCount).toBe(0);
    expect(harness.blob.objects.size).toBe(0);
  });

  it("shows the consent sheet again once the photo notice changes, and records the new one when both boxes are ticked", async () => {
    const browser = await signedInUser();
    await agreedToAnOlderPhotoNotice(browser);

    expect(needsPhotoConsent((await readSignedInUser(harness.context(browser)))!)).toBe(true);
    expect(await getMyOutfits(browser)).toEqual({ ok: false, refusal: "photo-consent-needed" });
    harness.clock.set("2026-10-16T13:00:00Z");
    expect(await getMyOutfits(browser, BOTH_CONSENT_BOXES_TICKED)).toMatchObject({ ok: true });
    expect((await readSignedInUser(harness.context(browser)))!.photoConsent).toEqual({
      noticeVersion: PHOTO_NOTICE_VERSION,
      acceptedAt: new Date("2026-10-16T13:00:00Z"),
    });
  });

  it("keeps the agreement when the photo is then rejected, so sending it again, or switching its Photo Type, needs no ticks", async () => {
    const browser = await signedInUser();
    harness.ai.scenario = "no-person";
    expect(await getMyOutfits(browser, BOTH_CONSENT_BOXES_TICKED)).toMatchObject({ ok: false, refusal: "photo-rejected" });

    harness.ai.scenario = "pass";
    expect(await getMyOutfits(browser)).toMatchObject({ ok: true });
  });
});

describe("where photo consent comes in the order of checks", () => {
  it("comes after the region gate, so nothing is recorded from a country Gemini doesn't serve", async () => {
    const browser = await signedInUser();
    browser.ipCountry = "RU";

    expect(await getMyOutfits(browser)).toEqual({ ok: false, refusal: "unsupported-region" });
    expect(await getMyOutfits(browser, BOTH_CONSENT_BOXES_TICKED)).toEqual({ ok: false, refusal: "unsupported-region" });
    expect((await readSignedInUser(harness.context(browser)))!.photoConsent).toBeNull();
  });

  it("comes before the limits, and the ticks are recorded even when a limit then stops the Consultation", async () => {
    const browser = await signedInUser();
    const signedIn = await readSignedInUser(harness.context(browser));
    await recordUsage(harness.db, { kind: "outfit", userId: signedIn!.id, at: harness.clock.now() }, OUTFIT_ALLOWANCE);

    expect(await getMyOutfits(browser)).toEqual({ ok: false, refusal: "photo-consent-needed" });
    expect(await getMyOutfits(browser, BOTH_CONSENT_BOXES_TICKED)).toMatchObject({ ok: false, refusal: "allowance-used" });
    expect(needsPhotoConsent((await readSignedInUser(harness.context(browser)))!)).toBe(false);
  });
});

describe("withdrawing photo consent", () => {
  it("deletes every Consultation for good, with its photo and Previews, and keeps the account", async () => {
    const browser = await signedInUser({ username: "Wren.Hale", password: "a long enough password" });
    const first = await start(browser);
    await harness.stylings.runPending();
    const second = await start(browser);
    await harness.stylings.runPending();
    expect(harness.blob.objects.size).toBe(6);

    const result = await withdrawPhotoConsent(harness.context(browser));

    expect(result).toEqual({ ok: true });
    expect(await listConsultations(harness.context(browser))).toEqual([]);
    expect(await readConsultation(harness.context(browser), first)).toBeNull();
    expect(await readConsultation(harness.context(browser), second)).toBeNull();
    expect(await harness.db.select().from(consultation)).not.toContainEqual(expect.objectContaining({ id: first }));
    expect(harness.blob.objects.size).toBe(0);
    expect(await readSignedInUser(harness.context(browser))).toMatchObject({ username: "Wren.Hale" });
    expect(await signIn(harness.context(new TestBrowser()), { identifier: "Wren.Hale", password: "a long enough password" })).toEqual({
      ok: true,
    });
  });

  it("forgets the agreement, so the consent sheet comes back before the next Consultation", async () => {
    const browser = await signedInUser();
    await start(browser);

    await withdrawPhotoConsent(harness.context(browser));

    const signedIn = await readSignedInUser(harness.context(browser));
    expect(signedIn!.photoConsent).toBeNull();
    expect(needsPhotoConsent(signedIn!)).toBe(true);
    expect(await getMyOutfits(browser)).toEqual({ ok: false, refusal: "photo-consent-needed" });
    expect(await getMyOutfits(browser, BOTH_CONSENT_BOXES_TICKED)).toMatchObject({ ok: true });
  });

  it("cancels a running Styling's Workflow run first, so it never builds anything", async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser);
    const [running] = await harness.db.select().from(styling).where(eq(styling.consultationId, consultationId));

    await withdrawPhotoConsent(harness.context(browser));
    await harness.stylings.runPending();

    expect(harness.stylings.cancelled).toEqual([running!.workflowRunId]);
    expect(harness.qloo.requests).toEqual([]);
    expect(await harness.db.select().from(styling).where(eq(styling.consultationId, consultationId))).toEqual([]);
    expect(harness.blob.objects.size).toBe(0);
  });

  it("leaves other users' Consultations and agreements alone", async () => {
    const withdrawing = await signedInUser();
    await start(withdrawing);
    const someoneElse = await signedInUser();
    const theirs = await start(someoneElse);

    await withdrawPhotoConsent(harness.context(withdrawing));

    expect((await listConsultations(harness.context(someoneElse))).map(({ id }) => id)).toEqual([theirs]);
    expect(harness.blob.objects.size).toBe(1);
    expect(needsPhotoConsent((await readSignedInUser(harness.context(someoneElse)))!)).toBe(false);
  });

  it("leaves no Consultation behind from a \"Get my Outfits\" still checking its photo in another tab", async () => {
    const browser = await signedInUser();
    harness.ai.duringCall = async (call) => {
      if (call === "checkPhoto") expect(await withdrawPhotoConsent(harness.context(browser))).toEqual({ ok: true });
    };

    const result = await getMyOutfits(browser, BOTH_CONSENT_BOXES_TICKED);

    expect(result).toEqual({ ok: false, refusal: "photo-consent-needed" });
    expect(await listConsultations(harness.context(browser))).toEqual([]);
    expect(harness.blob.objects.size).toBe(0);
    expect(harness.stylings.pending).toEqual([]);
  });

  it("refuses a signed-out visitor, deleting nothing", async () => {
    const owner = await signedInUser();
    const consultationId = await start(owner);

    expect(await withdrawPhotoConsent(harness.context(new TestBrowser()))).toEqual({ ok: false, refusal: "signed-out" });
    expect((await listConsultations(harness.context(owner))).map(({ id }) => id)).toEqual([consultationId]);
  });
});

let userCount = 0;

/** A new user, signed in, who has verified their email by its link. */
async function signedInUser(overrides: Partial<SignUpInput> = {}): Promise<TestBrowser> {
  userCount += 1;
  const browser = new TestBrowser();
  const email = `consent.user${userCount}@example.com`;
  expect(
    await signUp(harness.context(browser), {
      birthDate: { day: "14", month: "6", year: "1994" },
      username: `consent_user_${userCount}`,
      email,
      password: "a long enough password",
      stylePreference: "womenswear",
      countryCode: "GB",
      acceptedTerms: true,
      ...overrides,
    }),
  ).toEqual({ ok: true });
  await harness.openEmailedLink(email, browser);
  return browser;
}

/** As if the user agreed to the photo notice before its wording last changed. */
async function agreedToAnOlderPhotoNotice(browser: TestBrowser): Promise<void> {
  const signedIn = await readSignedInUser(harness.context(browser));
  await harness.db
    .update(user)
    .set({ acceptedPhotoNoticeVersion: PHOTO_NOTICE_VERSION - 1, photoNoticeAcceptedAt: new Date("2026-09-01T10:00:00Z") })
    .where(eq(user.id, signedIn!.id));
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
