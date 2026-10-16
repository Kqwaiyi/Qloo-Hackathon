import { eq } from "drizzle-orm";
import sharp, { type Sharp } from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { BudgetTier, PhotoType } from "@/config/consultations";
import type { FakeAiScenario } from "@/server/ai/fake";
import type { PhotoRejection } from "@/server/consultations/photo-check";
import { consultation } from "@/server/db/schema";
import { readConsultation, startConsultation } from "@/server/operations/consultations";
import { readSignedInUser } from "@/server/operations/session";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

beforeEach(() => {
  harness.clock.set("2026-10-16T12:00:00Z");
  harness.blob.objects.clear();
  harness.ai.scenario = "pass";
  harness.ai.photoCheckCount = 0;
});

describe("starting a Consultation", () => {
  it("stores an accepted photo exactly as it was sent and creates one Consultation from it", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "GB", birthDate: { day: "9", month: "3", year: "1990" } });
    const bytes = await photoBytes("jpeg");
    harness.clock.set("2026-10-16T12:30:00Z");

    const result = await startConsultation(harness.context(browser), {
      photo: new Blob([bytes], { type: "image/jpeg" }),
      photoType: "full_body",
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
      },
    ]);
    expect([...harness.blob.objects.keys()]).toEqual([stored[0]!.photoPathname]);
    expect(harness.blob.objects.get(stored[0]!.photoPathname)).toEqual({ bytes, contentType: "image/jpeg" });
  });

  it("gives a body photo the default Budget Tier, No Budget, and a Face Photo none", async () => {
    const browser = await signedInUser();

    await start(browser, "body_only");
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
    harness.clock.set("2026-11-01T01:00:00Z");
    await start(browser, "full_body");

    expect((await consultationsOf(browser)).map((row) => row.ageGroup)).toEqual(["18_24", "25_29"]);
  });

  it("takes a PNG or WebP photo too, keeping its own format", async () => {
    const browser = await signedInUser();
    const png = await photoBytes("png");
    const webp = await photoBytes("webp");

    await startConsultation(harness.context(browser), { photo: new Blob([png]), photoType: "full_body" });
    await startConsultation(harness.context(browser), { photo: new Blob([webp]), photoType: "full_body" });

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

  it.each([
    ["a photo over 2 MB", async () => new Blob([await noisyPngOver2Mb()], { type: "image/png" })],
    ["a file that isn't an image", async () => new Blob(["just some text"], { type: "image/jpeg" })],
    ["a GIF", async () => new Blob([await photoBytes("gif")], { type: "image/gif" })],
    ["a JPEG cut off part-way", async () => new Blob([await jpegCutInHalf()], { type: "image/jpeg" })],
  ])("refuses %s before the photo check, storing nothing", async (_name, makePhoto) => {
    const browser = await signedInUser();

    const result = await startConsultation(harness.context(browser), { photo: await makePhoto(), photoType: "full_body" });

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
    ["a photo of two people", "more-than-one-person", "full_body", { reason: "more-than-one-person" }],
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
      startConsultation(harness.context(browser), { photo: new Blob([bytes], { type: "image/jpeg" }), photoType });

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

/** Starts a Consultation with a plain JPEG, returning its id. */
async function start(browser: TestBrowser, photoType: PhotoType, budgetTier?: BudgetTier): Promise<string> {
  const result = await getMyOutfits(browser, photoType, budgetTier);
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
  return result.consultationId;
}

/** Presses "Get my Outfits" with a plain JPEG, returning what the operation returns. */
async function getMyOutfits(browser: TestBrowser, photoType: PhotoType, budgetTier?: BudgetTier) {
  return startConsultation(harness.context(browser), {
    photo: new Blob([await photoBytes("jpeg")], { type: "image/jpeg" }),
    photoType,
    budgetTier,
  });
}

let userCount = 0;

/** Signs up a new adult user and returns their signed-in browser. */
async function signedInUser(overrides: Partial<SignUpInput> = {}): Promise<TestBrowser> {
  userCount += 1;
  const browser = new TestBrowser();
  const result = await signUp(harness.context(browser), {
    birthDate: { day: "2", month: "2", year: "1992" },
    username: `user_${userCount}`,
    email: `user${userCount}@example.com`,
    password: "a long enough password",
    stylePreference: "menswear",
    countryCode: "US",
    acceptedTerms: true,
    ...overrides,
  });
  expect(result).toEqual({ ok: true });
  return browser;
}

/** The user's stored Consultations, oldest first. */
async function consultationsOf(browser: TestBrowser) {
  const user = await readSignedInUser(harness.context(browser));
  return harness.db.select().from(consultation).where(eq(consultation.userId, user!.id)).orderBy(consultation.createdAt);
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
