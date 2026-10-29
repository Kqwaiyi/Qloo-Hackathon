import { eq, inArray } from "drizzle-orm";
import sharp, { type Sharp } from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { BudgetTier, PhotoType } from "@/config/consultations";
import type { FakeAiScenario } from "@/server/ai/fake";
import type { PhotoRejection } from "@/server/consultations/photo-check";
import { consultation, outfit, piece, qlooCache, styleIcon, styling } from "@/server/db/schema";
import { deleteConsultation, listConsultations, readConsultation, startConsultation } from "@/server/operations/consultations";
import { readSignedInUser } from "@/server/operations/session";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { qlooPerson, qlooResponse } from "@/server/qloo/fake";
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
  harness.stylings.pending.length = 0;
  harness.stylings.cancelled.length = 0;
  harness.stylings.cancelFails = false;
  harness.blob.stored.length = 0;
  harness.blob.deleteFolderFails = false;
  harness.qloo.requests.length = 0;
  harness.qloo.respond = () => qlooResponse([]);
  harness.qloo.duringRequest = undefined;
  harness.ai.duringCall = undefined;
  await harness.db.delete(qlooCache);
});

describe("starting a Consultation", () => {
  it("stores an accepted photo exactly as it was sent and creates one Consultation from it", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "GB", birthDate: { day: "9", month: "3", year: "1990" } });
    const bytes = await photoBytes("jpeg");
    harness.clock.set("2026-10-16T12:30:00Z");

    const result = await startConsultation(harness.context(browser), {
      photo: new Blob([bytes], { type: "image/jpeg" }),
      photoType: "full_body",
      consent: BOTH_CONSENT_BOXES_TICKED,
    });

    expect(result).toEqual({ ok: true, consultationId: expect.any(String) });
    const stored = await consultationsOf(browser);
    expect(stored).toEqual([
      {
        id: result.ok && result.consultationId,
        userId: (await readSignedInUser(harness.context(browser)))!.id,
        createdAt: new Date("2026-10-16T12:30:00Z"),
        photoType: "full_body",
        photoPathname: expect.any(String),
        faceVisible: true,
        hairVisible: true,
        upperBodyVisible: true,
        legsVisible: true,
        feetVisible: true,
        hairCovered: false,
        photoStyle: ["casual"],
        budgetTier: "no_budget",
        stylePreference: "womenswear",
        countryCode: "GB",
        ageGroup: "35_44",
        state: "styling",
        // Only the Demo Account's Consultations keep the photo notice agreed to: this user's is theirs.
        acceptedPhotoNoticeVersion: null,
        photoNoticeAcceptedAt: null,
      },
    ]);
    expect([...harness.blob.objects.keys()]).toEqual([stored[0]!.photoPathname]);
    expect(harness.blob.objects.get(stored[0]!.photoPathname)).toEqual({ bytes, contentType: "image/jpeg" });
  });

  it("gives a body photo the default Budget Tier, No Budget, and a Face Photo none", async () => {
    const browser = await signedInUser();

    await start(browser, "body_only");
    // One Styling at a time: the user waits for the first.
    await harness.stylings.runPending();
    await start(browser, "face");

    const stored = await consultationsOf(browser);
    expect(stored.map(({ photoType, budgetTier }) => ({ photoType, budgetTier }))).toEqual([
      { photoType: "body_only", budgetTier: "no_budget" },
      { photoType: "face", budgetTier: null },
    ]);
  });

  it.each(["low", "medium", "expensive", "no_budget"] as const)(
    "keeps the %s Budget Tier chosen for a body photo as the Consultation's current one",
    async (budgetTier) => {
      const browser = await signedInUser();

      await start(browser, "full_body", budgetTier);

      expect((await consultationsOf(browser)).map((row) => row.budgetTier)).toEqual([budgetTier]);
    },
  );

  it("gives a Face Photo no Budget Tier, even when one is sent", async () => {
    const browser = await signedInUser();

    await start(browser, "face", "expensive");

    expect((await consultationsOf(browser)).map((row) => row.budgetTier)).toEqual([null]);
  });

  it("keeps the age group the user is in when the Consultation starts", async () => {
    const browser = await signedInUser({ birthDate: { day: "20", month: "11", year: "2001" } });

    harness.clock.set("2026-10-31T23:00:00Z");
    await start(browser, "full_body");
    await harness.stylings.runPending();
    harness.clock.set("2026-11-01T01:00:00Z");
    await start(browser, "full_body");

    expect((await consultationsOf(browser)).map((row) => row.ageGroup)).toEqual(["18_24", "25_29"]);
  });

  it("takes a PNG or WebP photo too, keeping its own format", async () => {
    const browser = await signedInUser();
    const png = await photoBytes("png");
    const webp = await photoBytes("webp");

    const consent = BOTH_CONSENT_BOXES_TICKED;
    await startConsultation(harness.context(browser), { photo: new Blob([png]), photoType: "full_body", consent });
    await harness.stylings.runPending();
    await startConsultation(harness.context(browser), { photo: new Blob([webp]), photoType: "full_body", consent });

    expect([...harness.blob.objects.values()]).toEqual([
      { bytes: png, contentType: "image/png" },
      { bytes: webp, contentType: "image/webp" },
    ]);
  });

  it("refuses a signed-out visitor", async () => {
    const result = await startConsultation(harness.context(new TestBrowser()), {
      photo: new Blob([await photoBytes("jpeg")]),
      photoType: "full_body",
    });

    expect(result).toEqual({ ok: false, refusal: "signed-out" });
    expect(harness.blob.objects.size).toBe(0);
  });

  it("refuses a user who hasn't verified their email before checking anything else, storing nothing", async () => {
    const browser = await signedInUser({}, { verified: false });

    const result = await startConsultation(harness.context(browser), {
      photo: new Blob(["not even a photo"], { type: "image/jpeg" }),
      photoType: "full_body",
    });

    expect(result).toEqual({ ok: false, refusal: "unverified" });
    expect(harness.ai.photoCheckCount).toBe(0);
    expect(harness.blob.objects.size).toBe(0);
    expect(await consultationsOf(browser)).toEqual([]);
  });

  it.each([
    ["a photo over 2 MB", async () => new Blob([await noisyPngOver2Mb()], { type: "image/png" })],
    ["a file that isn't an image", async () => new Blob(["just some text"], { type: "image/jpeg" })],
    ["a GIF", async () => new Blob([await photoBytes("gif")], { type: "image/gif" })],
    ["a JPEG cut off part-way", async () => new Blob([await jpegCutInHalf()], { type: "image/jpeg" })],
  ])("refuses %s before the photo check, storing nothing", async (_name, makePhoto) => {
    const browser = await signedInUser();

    const result = await startConsultation(harness.context(browser), {
      photo: await makePhoto(),
      photoType: "full_body",
      consent: BOTH_CONSENT_BOXES_TICKED,
    });

    expect(result).toEqual({ ok: false, refusal: "unusable-file" });
    expect(harness.ai.photoCheckCount).toBe(0);
    expect(harness.blob.objects.size).toBe(0);
    expect(await consultationsOf(browser)).toEqual([]);
  });
});

describe("the photo check", () => {
  const rejections: [string, FakeAiScenario, PhotoType, PhotoRejection][] = [
    ["an explicit photo as not appropriate", "not-appropriate", "full_body", { reason: "not-appropriate" }],
    ["a photo Google blocked as not appropriate", "blocked", "full_body", { reason: "not-appropriate" }],
    ["a photo with nobody in it", "no-person", "full_body", { reason: "no-person" }],
    ["a photo of two people with no clear Main Person", "unclear-main-person", "full_body", { reason: "unclear-main-person" }],
    ["a photo that isn't clear enough", "too-unclear", "full_body", { reason: "too-unclear" }],
    [
      "a face-and-hair photo sent as a Full-Body Photo, naming the Face Photo it looks like",
      "wrong-photo-type",
      "full_body",
      { reason: "wrong-photo-type", looksLike: "face" },
    ],
    [
      "a face-and-hair photo sent as a Body-Only Photo, naming the Face Photo it looks like",
      "wrong-photo-type",
      "body_only",
      { reason: "wrong-photo-type", looksLike: "face" },
    ],
    [
      "a head-to-feet photo with covered hair sent as a Face Photo, naming Full-Body Photo before the hair",
      "hair-covered",
      "face",
      { reason: "wrong-photo-type", looksLike: "full_body" },
    ],
    ["a Face Photo with the hair out of frame, since a Hairstyle needs the hair", "hair-not-visible", "face", { reason: "hair-not-visible" }],
    [
      "a body photo cropped to just a face, which fits no Photo Type, as too unclear",
      "hair-not-visible",
      "full_body",
      { reason: "too-unclear" },
    ],
  ];

  it.each(rejections)("refuses %s, storing nothing", async (_name, scenario, photoType, rejection) => {
    const browser = await signedInUser();
    harness.ai.scenario = scenario;

    const result = await getMyOutfits(browser, photoType);

    expect(result).toEqual({ ok: false, refusal: "photo-rejected", rejection });
    expect(harness.blob.objects.size).toBe(0);
    expect(await consultationsOf(browser)).toEqual([]);
  });

  it("reports a photo check that errors as its own outcome, storing nothing", async () => {
    const browser = await signedInUser();
    harness.ai.scenario = "check-errors";

    const result = await getMyOutfits(browser, "full_body");

    expect(result).toEqual({ ok: false, refusal: "check-errored" });
    expect(harness.blob.objects.size).toBe(0);
    expect(await consultationsOf(browser)).toEqual([]);
  });

  it("accepts a photo of two people with a clear Main Person as a one-person photo, queueing its Styling", async () => {
    const browser = await signedInUser();
    harness.ai.scenario = "clear-main-person";

    const result = await getMyOutfits(browser, "full_body");

    expect(result).toEqual({ ok: true, consultationId: expect.any(String) });
    const [stored] = await consultationsOf(browser);
    expect(stored).toMatchObject({ id: result.ok && result.consultationId, photoType: "full_body", state: "styling" });
    expect([...harness.blob.objects.keys()]).toEqual([stored!.photoPathname]);
    expect(harness.stylings.pending).toHaveLength(1);
  });

  it("accepts a Full-Body Photo with covered hair, storing the hair as covered", async () => {
    const browser = await signedInUser();
    harness.ai.scenario = "hair-covered";

    const result = await getMyOutfits(browser, "full_body");

    expect(result).toEqual({ ok: true, consultationId: expect.any(String) });
    const [stored] = await consultationsOf(browser);
    expect(stored).toMatchObject({
      photoType: "full_body",
      faceVisible: true,
      hairVisible: false,
      upperBodyVisible: true,
      legsVisible: true,
      feetVisible: true,
      hairCovered: true,
    });
  });

  it("accepts a Body-Only Photo that shows a face, recording the face as visible", async () => {
    const browser = await signedInUser();
    harness.ai.scenario = "hair-covered";

    const result = await getMyOutfits(browser, "body_only");

    expect(result).toEqual({ ok: true, consultationId: expect.any(String) });
    const [stored] = await consultationsOf(browser);
    expect(stored).toMatchObject({ photoType: "body_only", faceVisible: true });
  });

  it("accepts the same photo sent again as the Photo Type it looked like, as a fresh check", async () => {
    const browser = await signedInUser();
    harness.ai.scenario = "wrong-photo-type";
    const bytes = await photoBytes("jpeg");
    const sendSamePhotoAs = (photoType: PhotoType) =>
      startConsultation(harness.context(browser), {
        photo: new Blob([bytes], { type: "image/jpeg" }),
        photoType,
        consent: BOTH_CONSENT_BOXES_TICKED,
      });

    const rejected = await sendSamePhotoAs("full_body");
    if (rejected.ok || rejected.refusal !== "photo-rejected" || rejected.rejection.reason !== "wrong-photo-type") {
      throw new Error("Expected a wrong Photo Type");
    }
    const switched = await sendSamePhotoAs(rejected.rejection.looksLike);

    expect(switched).toEqual({ ok: true, consultationId: expect.any(String) });
    expect(harness.ai.photoCheckCount).toBe(2);
    const stored = await consultationsOf(browser);
    expect(stored.map(({ photoType, budgetTier }) => ({ photoType, budgetTier }))).toEqual([
      { photoType: "face", budgetTier: null },
    ]);
    expect([...harness.blob.objects.values()]).toEqual([{ bytes, contentType: "image/jpeg" }]);
  });
});

describe("opening a Consultation", () => {
  it("shows its owner the header: the photo through a link valid for 1 hour, Photo Type, date, Budget Tier and Photo Style", async () => {
    const browser = await signedInUser();
    harness.clock.set("2026-10-16T09:15:00Z");
    const consultationId = await start(browser, "body_only", "medium");
    const [stored] = await consultationsOf(browser);
    harness.clock.set("2026-10-17T08:00:00Z");

    const opened = await readConsultation(harness.context(browser), consultationId);

    expect(opened).toEqual({
      id: consultationId,
      photoUrl: await harness.blob.signedUrl(stored!.photoPathname, new Date("2026-10-17T09:00:00Z")),
      photoType: "body_only",
      createdAt: new Date("2026-10-16T09:15:00Z"),
      budgetTier: "medium",
      photoStyle: ["casual"],
      state: "styling",
      outfits: [],
      everyPreviewRefused: false,
      // No Outfits yet for "Show 2 more Outfits" to add to.
      everyOutfitBuilt: true,
      failedStyling: null,
      stylistNotes: [],
      productsToCheck: false,
      // A signed-in owner's: re-stylings are theirs to have.
      isGuestConsultation: false,
    });
  });

  it("shows a Face Photo's header with no Budget Tier", async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser, "face");

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ photoType: "face", budgetTier: null });
  });

  it("won't open another user's Consultation", async () => {
    const owner = await signedInUser();
    const consultationId = await start(owner, "full_body");

    expect(await readConsultation(harness.context(await signedInUser()), consultationId)).toBeNull();
    expect(await readConsultation(harness.context(new TestBrowser()), consultationId)).toBeNull();
  });

  it("finds nothing for an id that doesn't exist", async () => {
    const browser = await signedInUser();

    expect(await readConsultation(harness.context(browser), "no-such-consultation")).toBeNull();
  });
});

describe("My Consultations", () => {
  it("lists the user's Consultations, newest first, each with its photo through a link valid for 1 hour, Photo Type, date and Budget Tier", async () => {
    const browser = await signedInUser();
    harness.clock.set("2026-10-15T09:00:00Z");
    const older = await start(browser, "face");
    await harness.stylings.runPending();
    // Listed within 10 minutes, so its Styling isn't stuck yet.
    harness.clock.set("2026-10-17T07:55:00Z");
    const newer = await start(browser, "body_only", "low");
    const [olderPhoto, newerPhoto] = (await consultationsOf(browser)).map((row) => row.photoPathname);
    harness.clock.set("2026-10-17T08:00:00Z");

    const listed = await listConsultations(harness.context(browser));

    expect(listed).toEqual([
      {
        id: newer,
        photoUrl: await harness.blob.signedUrl(newerPhoto!, new Date("2026-10-17T09:00:00Z")),
        photoType: "body_only",
        createdAt: new Date("2026-10-17T07:55:00Z"),
        budgetTier: "low",
        state: "styling",
        outfitCount: 0,
      },
      {
        id: older,
        photoUrl: await harness.blob.signedUrl(olderPhoto!, new Date("2026-10-17T09:00:00Z")),
        photoType: "face",
        createdAt: new Date("2026-10-15T09:00:00Z"),
        budgetTier: null,
        state: "no_outfits",
        outfitCount: 0,
      },
    ]);
  });

  it("counts the Outfits each one shows once its Styling finishes, and shows No Outfits when none could be built", async () => {
    const browser = await signedInUser();
    harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
    harness.clock.set("2026-10-16T12:10:00Z");
    const styled = await start(browser, "face");
    await harness.stylings.runPending();
    await harness.db.delete(qlooCache);
    harness.qloo.respond = () => qlooResponse([]);
    harness.clock.set("2026-10-16T12:20:00Z");
    const unbuilt = await start(browser, "face");
    await harness.stylings.runPending();

    const listed = await listConsultations(harness.context(browser));

    expect(listed.map(({ id, state, outfitCount }) => ({ id, state, outfitCount }))).toEqual([
      { id: unbuilt, state: "no_outfits", outfitCount: 0 },
      { id: styled, state: "ready", outfitCount: 2 },
    ]);
  });

  it("never lists another user's Consultations, and lists nothing for a signed-out visitor", async () => {
    const owner = await signedInUser();
    await start(owner, "full_body");
    const someoneElse = await signedInUser();

    expect(await listConsultations(harness.context(someoneElse))).toEqual([]);
    expect(await listConsultations(harness.context(new TestBrowser()))).toEqual([]);
  });
});

describe("deleting a Consultation", () => {
  it("deletes it for good: its Stylings, Style Icons, Outfits and Pieces, its photo and its Previews", async () => {
    const browser = await signedInUser();
    harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();
    const outfitIds = (await harness.db.select({ id: outfit.id }).from(outfit).where(eq(outfit.consultationId, consultationId))).map(
      ({ id }) => id,
    );
    expect(outfitIds).toHaveLength(2);
    expect(harness.blob.objects.size).toBe(3);

    const result = await deleteConsultation(harness.context(browser), consultationId);

    expect(result).toEqual({ ok: true });
    expect(await readConsultation(harness.context(browser), consultationId)).toBeNull();
    expect(await listConsultations(harness.context(browser))).toEqual([]);
    expect(await rowsStoredFor(consultationId, outfitIds)).toEqual({ stylings: [], styleIcons: [], outfits: [], pieces: [] });
    expect(harness.blob.objects.size).toBe(0);
  });

  it("keeps the user's other Consultations and their photos", async () => {
    const browser = await signedInUser();
    const kept = await start(browser, "full_body");
    await harness.stylings.runPending();
    const deleted = await start(browser, "face");

    await deleteConsultation(harness.context(browser), deleted);

    expect((await listConsultations(harness.context(browser))).map(({ id }) => id)).toEqual([kept]);
    expect([...harness.blob.objects.keys()]).toEqual([(await consultationsOf(browser))[0]!.photoPathname]);
  });

  it("leaves another user's Consultation alone, as if it didn't exist", async () => {
    const owner = await signedInUser();
    const consultationId = await start(owner, "full_body");

    const result = await deleteConsultation(harness.context(await signedInUser()), consultationId);

    expect(result).toEqual({ ok: false, refusal: "not-found" });
    expect((await listConsultations(harness.context(owner))).map(({ id }) => id)).toEqual([consultationId]);
    expect(harness.blob.objects.size).toBe(1);
  });

  it("refuses a signed-out visitor, deleting nothing", async () => {
    const owner = await signedInUser();
    const consultationId = await start(owner, "full_body");

    const result = await deleteConsultation(harness.context(new TestBrowser()), consultationId);

    expect(result).toEqual({ ok: false, refusal: "signed-out" });
    expect((await listConsultations(harness.context(owner))).map(({ id }) => id)).toEqual([consultationId]);
    expect(harness.blob.objects.size).toBe(1);
  });

  it("cancels a running Styling's Workflow run, so it never builds anything", async () => {
    const browser = await signedInUser();
    harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
    const consultationId = await start(browser, "face");
    const [running] = await harness.db.select().from(styling).where(eq(styling.consultationId, consultationId));

    await deleteConsultation(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    expect(harness.stylings.cancelled).toEqual([running!.workflowRunId]);
    expect(harness.qloo.requests).toEqual([]);
    expect(await rowsStoredFor(consultationId, [])).toEqual({ stylings: [], styleIcons: [], outfits: [], pieces: [] });
    expect(harness.blob.objects.size).toBe(0);
  });

  it.each([
    ["Finding Style Icons, as Qloo answers", "style-icons"],
    ["Building Outfits, as the Stylist works on them", "building-outfits"],
    ["Generating Previews", "previews"],
  ] as const)("mid-Styling, while %s, leaves the step nothing to save into, and nothing more is stored", async (_name, moment) => {
    const browser = await signedInUser();
    harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
    const consultationId = await start(browser, "face");
    let deleted = false;
    let storedBeforeDeleting = 0;
    const deleteOnce = async () => {
      if (deleted) return;
      deleted = true;
      expect(await deleteConsultation(harness.context(browser), consultationId)).toEqual({ ok: true });
      storedBeforeDeleting = harness.blob.stored.length;
    };
    if (moment === "style-icons") harness.qloo.duringRequest = deleteOnce;
    else harness.ai.duringCall = async (call) => {
      // The Stylist's second turn is its first at Building Outfits, once it has found the Style Icons.
      if (moment === "building-outfits" ? call === "stylistModel" && harness.ai.stylistRequests.at(-1)?.turn === 2 : call === "renderPreview") {
        await deleteOnce();
      }
    };

    await harness.stylings.runPending();

    expect(deleted).toBe(true);
    expect(await rowsStoredFor(consultationId, [])).toEqual({ stylings: [], styleIcons: [], outfits: [], pieces: [] });
    expect(harness.blob.objects.size).toBe(0);
    expect(harness.blob.stored.slice(storedBeforeDeleting)).toEqual([]);
  });

  it("still deletes everything when the run can't be cancelled, and the run then saves nothing", async () => {
    const browser = await signedInUser();
    harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
    const consultationId = await start(browser, "face");
    harness.stylings.cancelFails = true;

    const result = await deleteConsultation(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    expect(result).toEqual({ ok: true });
    expect(await rowsStoredFor(consultationId, [])).toEqual({ stylings: [], styleIcons: [], outfits: [], pieces: [] });
    expect(harness.blob.objects.size).toBe(0);
    expect(harness.qloo.requests).toEqual([]);
  });

  it("keeps a Consultation whose Blob objects couldn't be deleted, its Styling stopped, to delete again", async () => {
    const browser = await signedInUser();
    harness.qloo.respond = () => qlooResponse(STYLE_ICONS);
    const consultationId = await start(browser, "face");
    harness.blob.deleteFolderFails = true;

    await expect(deleteConsultation(harness.context(browser), consultationId)).rejects.toThrow("Blob storage is down.");
    harness.blob.deleteFolderFails = false;

    expect(await listConsultations(harness.context(browser))).toEqual([
      expect.objectContaining({ id: consultationId, state: "no_outfits" }),
    ]);
    expect(await deleteConsultation(harness.context(browser), consultationId)).toEqual({ ok: true });
    expect(harness.blob.objects.size).toBe(0);
  });

  it("finds nothing to delete for an id that doesn't exist", async () => {
    const browser = await signedInUser();

    expect(await deleteConsultation(harness.context(browser), "no-such-consultation")).toEqual({ ok: false, refusal: "not-found" });
  });
});

/** Starts a Consultation with a plain JPEG, returning its id. */
async function start(browser: TestBrowser, photoType: PhotoType, budgetTier?: BudgetTier): Promise<string> {
  const result = await getMyOutfits(browser, photoType, budgetTier);
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
  return result.consultationId;
}

/** Presses "Get my Outfits" with a plain JPEG, agreeing on the consent sheet, returning what the operation returns. */
async function getMyOutfits(browser: TestBrowser, photoType: PhotoType, budgetTier?: BudgetTier) {
  return startConsultation(harness.context(browser), {
    photo: new Blob([await photoBytes("jpeg")], { type: "image/jpeg" }),
    photoType,
    budgetTier,
    consent: BOTH_CONSENT_BOXES_TICKED,
  });
}

let userCount = 0;

/** A new user, signed in, who has verified their email by its link unless told otherwise. */
async function signedInUser(overrides: Partial<SignUpInput> = {}, { verified = true } = {}): Promise<TestBrowser> {
  userCount += 1;
  const browser = new TestBrowser();
  const email = `user${userCount}@example.com`;
  const result = await signUp(harness.context(browser), {
    birthDate: { day: "2", month: "2", year: "1992" },
    username: `user_${userCount}`,
    email,
    password: "a long enough password",
    stylePreference: "menswear",
    countryCode: "US",
    acceptedTerms: true,
    ...overrides,
  });
  expect(result).toEqual({ ok: true });
  if (verified) await harness.openEmailedLink(overrides.email ?? email, browser);
  return browser;
}

/** The user's stored Consultations, oldest first. */
async function consultationsOf(browser: TestBrowser) {
  const user = await readSignedInUser(harness.context(browser));
  return harness.db.select().from(consultation).where(eq(consultation.userId, user!.id)).orderBy(consultation.createdAt);
}

/** Every row still stored for the Consultation: its Stylings, Style Icons and Outfits, and the Pieces of the Outfits given. */
async function rowsStoredFor(consultationId: string, outfitIds: string[]) {
  return {
    stylings: await harness.db.select().from(styling).where(eq(styling.consultationId, consultationId)),
    styleIcons: await harness.db.select().from(styleIcon).where(eq(styleIcon.consultationId, consultationId)),
    outfits: await harness.db.select().from(outfit).where(eq(outfit.consultationId, consultationId)),
    pieces: outfitIds.length === 0 ? [] : await harness.db.select().from(piece).where(inArray(piece.outfitId, outfitIds)),
  };
}

/** A small, plain image in the given format. */
async function photoBytes(format: "jpeg" | "png" | "webp" | "gif"): Promise<Uint8Array<ArrayBuffer>> {
  const image = sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } });
  return new Uint8Array(await image.toFormat(format).toBuffer());
}

/** A PNG that decodes fine but is just over 2 MB: random pixels, uncompressed. */
async function noisyPngOver2Mb(): Promise<Uint8Array<ArrayBuffer>> {
  const png = await noise(1000, 720).png({ compressionLevel: 0 }).toBuffer();
  expect(png.byteLength).toBeGreaterThan(2 * 1024 * 1024);
  return new Uint8Array(png);
}

/** The first half of a JPEG: its header reads fine, but the image stops part-way. */
async function jpegCutInHalf(): Promise<Uint8Array<ArrayBuffer>> {
  const jpeg = await noise(300, 200).jpeg().toBuffer();
  return new Uint8Array(jpeg.subarray(0, jpeg.byteLength / 2));
}

function noise(width: number, height: number): Sharp {
  const pixels = new Uint8Array(width * height * 3).map(() => Math.floor(Math.random() * 256));
  return sharp(pixels, { raw: { width, height, channels: 3 } });
}
