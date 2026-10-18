import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, onTestFinished } from "vitest";

import type { PhotoType } from "@/config/consultations";
import { LocalBlobStore } from "@/server/blob/local";
import { qlooCache, usageRecord } from "@/server/db/schema";
import { type ConsultationView, deleteConsultation, readConsultation, startConsultation } from "@/server/operations/consultations";
import { type LandingSample, type LandingSamples, readLandingPage } from "@/server/operations/landing";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { exportLandingSample } from "@/server/operations/team";
import { qlooBrand, qlooPerson, qlooResponse } from "@/server/qloo/fake";
import { BOTH_CONSENT_BOXES_TICKED, createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

beforeEach(() => {
  harness.clock.set("2026-10-16T12:00:00Z");
  harness.blob.objects.clear();
  harness.qloo.requests.length = 0;
});

// Frozen sample Consultations as the landing page ships them, made up for these tests.
const FULL_BODY: LandingSample = {
  photoType: "full_body",
  stylePreference: "menswear",
  ageGroup: "25_29",
  countryCode: "GB",
  budgetTier: "medium",
  photoStyle: ["streetwear", "casual"],
  styleIcons: ["Dev Rowe", "Eli Frost", "Finn Ash"],
  outfit: {
    styleIconName: "Dev Rowe",
    pieces: [
      { category: "hairstyle", item: "Textured crop with a low fade", why: "Dev Rowe's crop, kept easy.", brand: null },
      {
        category: "top",
        item: "Boxy heavyweight tee in sage",
        why: "A boxy tee for a relaxed look.",
        brand: { name: "Bolt", priceRange: { min: 20, max: 120 }, visitUrl: "https://bolt.example/" },
      },
      {
        category: "bottom",
        item: "Straight-leg jeans, mid wash",
        why: "Mid-wash denim grounds the tee.",
        brand: { name: "Jeanery", priceRange: { min: 50, max: 110 }, visitUrl: null },
      },
      {
        category: "shoes",
        item: "Retro runners in grey suede",
        why: "Grey suede finishes it quietly.",
        brand: { name: "Stride", priceRange: { min: 60, max: 180 }, visitUrl: "https://stride.example/" },
      },
    ],
  },
  images: { photoPathname: "landing/c-full/photo.jpg", previewPathname: "landing/c-full/preview.webp" },
};

const FACE: LandingSample = {
  photoType: "face",
  stylePreference: "womenswear",
  ageGroup: "30_34",
  countryCode: "AU",
  budgetTier: null,
  photoStyle: ["edgy"],
  styleIcons: ["Ava Stone", "Bea Marsh"],
  outfit: {
    styleIconName: "Ava Stone",
    pieces: [{ category: "hairstyle", item: "Chin-length blunt bob", why: "A blunt line for an edgy look.", brand: null }],
  },
  images: { photoPathname: "landing/c-face/photo.jpg", previewPathname: "landing/c-face/preview.webp" },
};

const BODY_ONLY: LandingSample = {
  photoType: "body_only",
  stylePreference: "womenswear",
  ageGroup: "35_44",
  countryCode: "DE",
  budgetTier: "low",
  photoStyle: ["preppy"],
  styleIcons: ["Cleo Hart"],
  outfit: {
    styleIconName: "Cleo Hart",
    pieces: [
      {
        category: "one_piece",
        item: "Navy belted shirt dress",
        why: "One easy piece.",
        brand: { name: "Ember", priceRange: { min: 15, max: 60 }, visitUrl: "https://ember.example/" },
      },
      { category: "shoes", item: "Canvas sneakers", why: "Clean canvas keeps it light.", brand: { name: "Pace", priceRange: null, visitUrl: null } },
    ],
  },
  images: { photoPathname: "landing/c-body/photo.jpg", previewPathname: "landing/c-body/preview.webp" },
};

const SAMPLES: LandingSamples = { full_body: FULL_BODY, face: FACE, body_only: BODY_ONLY };

describe("the landing page", () => {
  it("shows each frozen Consultation's text, with its photo and Preview through signed links valid for 1 hour", async () => {
    const page = await readLandingPage(harness.context(new TestBrowser()), SAMPLES);

    expect(page.samples.full_body).toEqual({
      photoType: "full_body",
      stylePreference: "menswear",
      ageGroup: "25_29",
      countryName: "United Kingdom",
      budgetTier: "medium",
      photoStyle: ["streetwear", "casual"],
      styleIcons: ["Dev Rowe", "Eli Frost", "Finn Ash"],
      outfit: {
        position: 1,
        styleIconName: "Dev Rowe",
        priceRange: { min: 130, max: 410 },
        pieces: FULL_BODY.outfit.pieces,
      },
      photoUrl: "https://blob.test/landing/c-full/photo.jpg?validUntil=2026-10-16T13:00:00.000Z",
      previewUrl: "https://blob.test/landing/c-full/preview.webp?validUntil=2026-10-16T13:00:00.000Z",
    });
    expect(page.samples.face).toMatchObject({
      countryName: "Australia",
      outfit: { position: 1, styleIconName: "Ava Stone", priceRange: null },
      photoUrl: "https://blob.test/landing/c-face/photo.jpg?validUntil=2026-10-16T13:00:00.000Z",
      previewUrl: "https://blob.test/landing/c-face/preview.webp?validUntil=2026-10-16T13:00:00.000Z",
    });
    expect(page.samples.body_only).toMatchObject({
      countryName: "Germany",
      outfit: { styleIconName: "Cleo Hart", priceRange: { min: 15, max: 60 } },
      photoUrl: "https://blob.test/landing/c-body/photo.jpg?validUntil=2026-10-16T13:00:00.000Z",
    });
  });

  it("shows a placeholder sample, whose images haven't been captured yet, with no image links", async () => {
    const page = await readLandingPage(harness.context(new TestBrowser()), { ...SAMPLES, face: { ...FACE, images: null } });

    expect(page.samples.face).toMatchObject({ outfit: { styleIconName: "Ava Stone" }, photoUrl: null, previewUrl: null });
    expect(page.samples.full_body.photoUrl).toBe("https://blob.test/landing/c-full/photo.jpg?validUntil=2026-10-16T13:00:00.000Z");
  });

  it("shows an image the Blob store can't link with no link, rather than failing the page", async () => {
    // Local development's store links only the files it holds, and a fresh checkout holds none of
    // the samples' images.
    const folder = await mkdtemp(path.join(tmpdir(), "landing-blob-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    const blob = new LocalBlobStore(folder);
    await blob.put(FACE.images!.photoPathname, new Uint8Array([1, 2, 3]), "image/jpeg");

    const page = await readLandingPage({ ...harness.context(new TestBrowser()), blob }, SAMPLES);

    expect(page.samples.full_body).toMatchObject({ photoUrl: null, previewUrl: null });
    expect(page.samples.face).toMatchObject({ photoUrl: expect.any(String), previewUrl: null });
  });

  it("tells the header whether the visitor is signed in, so it offers to open the app instead of signing in", async () => {
    const signedIn = await signedInUser();

    expect(await readLandingPage(harness.context(signedIn), SAMPLES)).toMatchObject({ signedIn: true });
    expect(await readLandingPage(harness.context(new TestBrowser()), SAMPLES)).toMatchObject({ signedIn: false });
  });

  it("makes no Qloo or AI call, so a visit costs nothing", async () => {
    await readLandingPage(harness.context(new TestBrowser()), SAMPLES);
    await readLandingPage(harness.context(await signedInUser()), SAMPLES);

    expect(harness.qloo.requests).toEqual([]);
    expect(harness.ai).toMatchObject({ photoCheckCount: 0, tailoringRequests: [], previewRequests: [] });
  });
});

describe("the team exporting a Demo Account Consultation as a landing page sample", () => {
  beforeEach(async () => {
    // Each test answers Qloo its own way, and the app-wide caps count every user's Outfits.
    await harness.db.delete(qlooCache);
    await harness.db.delete(usageRecord);
    harness.ai.scenario = "pass";
    harness.qloo.respond = (request) =>
      qlooResponse(request.url.searchParams.get("filter.type") === "urn:entity:brand" ? BRANDS : STYLE_ICONS);
  });

  it("exports its Photo Style, its first ranked Style Icons, and its first Outfit's Brands and Pieces", async () => {
    const demo = await signedInUser({ email: "demo@example.com", stylePreference: "womenswear", countryCode: "GB" });
    const consultationId = await start(demo, "full_body");
    await harness.stylings.runPending();

    const result = await exportLandingSample(teamContext(), { email: "demo@example.com", consultationId });

    expect(result).toEqual({
      ok: true,
      sample: {
        photoType: "full_body",
        stylePreference: "womenswear",
        ageGroup: "30_34",
        countryCode: "GB",
        budgetTier: "no_budget",
        photoStyle: ["casual"],
        styleIcons: ["Ava Stone", "Bea Marsh", "Cleo Hart", "Dana Reed", "Esme Vale"],
        outfit: {
          styleIconName: "Ava Stone",
          pieces: [
            {
              category: "hairstyle",
              item: "Casual textured cut with soft layers",
              why: "Ava Stone's signature cut, reworked so your current hair carries it with your casual Photo Style.",
              brand: null,
            },
            {
              category: "top",
              item: "Navy relaxed cotton overshirt",
              why: "An easy layer in the spirit of Ava Stone, at home with your casual Photo Style.",
              brand: { name: "Bolt", priceRange: { min: 20, max: 120 }, visitUrl: "https://bolt.example/" },
            },
            {
              category: "bottom",
              item: "Charcoal straight-leg cotton chinos",
              why: "Straight-leg chinos Ava Stone would reach for, keeping your casual Outfit grounded.",
              brand: { name: "Jeanery", priceRange: { min: 50, max: 110 }, visitUrl: null },
            },
            {
              category: "shoes",
              item: "White low-top leather trainers",
              why: "Clean trainers that finish the Outfit the way Ava Stone does, and suit your casual style.",
              brand: { name: "Stride", priceRange: { min: 60, max: 180 }, visitUrl: "https://stride.example/" },
            },
          ],
        },
        images: { photoPathname: `landing/${consultationId}/photo.jpg`, previewPathname: `landing/${consultationId}/preview.webp` },
      },
    });
  });

  it("keeps the first Outfit's Style Icon in the ranked list, even when it ranks below the first few", async () => {
    // Only the sixth Style Icon's fans favour Brands that make a whole Outfit.
    harness.qloo.respond = (request) => {
      const params = request.url.searchParams;
      if (params.get("filter.type") !== "urn:entity:brand") return qlooResponse(STYLE_ICONS);
      return qlooResponse(params.get("signal.interests.entities") === "w-6" ? BRANDS : []);
    };
    const demo = await signedInUser({ email: "demo.low.rank@example.com" });
    const consultationId = await start(demo, "full_body");
    await harness.stylings.runPending();

    const result = await exportLandingSample(teamContext(), { email: "demo.low.rank@example.com", consultationId });

    expect(result).toMatchObject({
      ok: true,
      sample: {
        styleIcons: ["Ava Stone", "Bea Marsh", "Cleo Hart", "Dana Reed", "Esme Vale", "Fay Lowe"],
        outfit: { styleIconName: "Fay Lowe" },
      },
    });
  });

  it("copies its photo and first Preview into the landing page's own Blob folder, so the sample outlives the Consultation", async () => {
    const demo = await signedInUser({ email: "demo.copies@example.com" });
    const consultationId = await start(demo, "full_body");
    await harness.stylings.runPending();
    const shown = (await readConsultation(harness.context(demo), consultationId))!;
    const photo = harness.blob.objects.get(blobPathnameOf(shown.photoUrl));
    const preview = harness.blob.objects.get(blobPathnameOf(firstPreviewUrl(shown)));

    const result = await exportLandingSample(teamContext(), { email: "demo.copies@example.com", consultationId });
    await deleteConsultation(harness.context(demo), consultationId);

    if (!result.ok) throw new Error(`Couldn't export the sample: ${result.refusal}`);
    const page = await readLandingPage(harness.context(new TestBrowser()), { ...SAMPLES, full_body: result.sample });
    expect(page.samples.full_body).toMatchObject({
      photoUrl: `https://blob.test/landing/${consultationId}/photo.jpg?validUntil=2026-10-16T13:00:00.000Z`,
      previewUrl: `https://blob.test/landing/${consultationId}/preview.webp?validUntil=2026-10-16T13:00:00.000Z`,
    });
    expect(harness.blob.objects.get(`landing/${consultationId}/photo.jpg`)).toEqual(photo);
    expect(harness.blob.objects.get(`landing/${consultationId}/preview.webp`)).toEqual(preview);
    expect(photo).toBeDefined();
    expect(preview).toBeDefined();
  });

  it("exports the same Consultation again, replacing its copies", async () => {
    const demo = await signedInUser({ email: "demo.again@example.com" });
    const consultationId = await start(demo, "full_body");
    await harness.stylings.runPending();
    const first = await exportLandingSample(teamContext(), { email: "demo.again@example.com", consultationId });

    const again = await exportLandingSample(teamContext(), { email: "demo.again@example.com", consultationId });

    expect(again).toEqual(first);
    expect(landingBlobs()).toEqual([
      `landing/${consultationId}/photo.jpg`,
      `landing/${consultationId}/preview.webp`,
    ]);
  });

  it("refuses another account's Consultation, so no other user's photo can reach the public page", async () => {
    await signedInUser({ email: "demo.only@example.com" });
    const someoneElse = await signedInUser({ email: "someone.else@example.com" });
    const consultationId = await start(someoneElse, "full_body");
    await harness.stylings.runPending();

    expect(await exportLandingSample(teamContext(), { email: "demo.only@example.com", consultationId })).toEqual({
      ok: false,
      refusal: "no-such-consultation",
    });
    expect(await exportLandingSample(teamContext(), { email: "nobody@example.com", consultationId })).toEqual({
      ok: false,
      refusal: "no-such-account",
    });
    expect(landingBlobs()).toEqual([]);
  });

  it("refuses a Consultation with no Outfit yet, or whose first Outfit has no Preview", async () => {
    const demo = await signedInUser({ email: "demo.unfinished@example.com" });
    const unfinished = await start(demo, "full_body");
    expect(await exportLandingSample(teamContext(), { email: "demo.unfinished@example.com", consultationId: unfinished })).toEqual({
      ok: false,
      refusal: "no-outfit",
    });
    await harness.stylings.runPending();

    harness.ai.scenario = "preview-refused";
    const refused = await start(demo, "full_body");
    await harness.stylings.runPending();

    expect(await exportLandingSample(teamContext(), { email: "demo.unfinished@example.com", consultationId: refused })).toEqual({
      ok: false,
      refusal: "no-preview",
    });
    expect(landingBlobs()).toEqual([]);
  });
});

/** Everything in the landing page's own Blob folders. */
function landingBlobs(): string[] {
  return [...harness.blob.objects.keys()].filter((pathname) => pathname.startsWith("landing/"));
}

/** The Blob pathname a test store's signed link points at. */
function blobPathnameOf(signedUrl: string): string {
  return new URL(signedUrl).pathname.slice(1);
}

function firstPreviewUrl(shown: ConsultationView): string {
  const preview = shown.outfits[0]?.preview;
  if (preview?.state !== "ready") throw new Error("The first Outfit has no Preview.");
  return preview.url;
}

// Made-up people and Brands, shaped like Qloo's entities. The first Outfit is Stride, Bolt and
// Jeanery (denim, so the Bottom).
const STYLE_ICONS = [
  qlooPerson("w-1", "Ava Stone", 0.94),
  qlooPerson("w-2", "Bea Marsh", 0.91),
  qlooPerson("w-3", "Cleo Hart", 0.88),
  qlooPerson("w-4", "Dana Reed", 0.86),
  qlooPerson("w-5", "Esme Vale", 0.84),
  qlooPerson("w-6", "Fay Lowe", 0.8),
];
const BRANDS = [
  qlooBrand("b-stride", "Stride", { categories: ["footwear"], affinity: 0.97, price: [60, 180], officialSite: "https://stride.example/" }),
  qlooBrand("b-bolt", "Bolt", { categories: ["apparel"], affinity: 0.95, price: [20, 120], officialSite: "https://bolt.example/" }),
  qlooBrand("b-sole", "Sole", { categories: ["footwear"], affinity: 0.93, price: [40, 90] }),
  qlooBrand("b-dune", "Dune", { categories: ["apparel"], affinity: 0.9, officialSite: "https://dune.example/" }),
  qlooBrand("b-jeanery", "Jeanery", { categories: ["apparel", "denim"], affinity: 0.88, price: [50, 110] }),
  qlooBrand("b-ember", "Ember", { categories: ["apparel"], affinity: 0.85, price: [15, 60] }),
];

/** What a team script's operations get: no browser's request. */
function teamContext() {
  return harness.context(new TestBrowser());
}

/** Presses "Get my Outfits" with a plain JPEG, agreeing on the consent sheet, returning the new Consultation's id. */
async function start(browser: TestBrowser, photoType: PhotoType): Promise<string> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  const result = await startConsultation(harness.context(browser), {
    photo: new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
    photoType,
    consent: BOTH_CONSENT_BOXES_TICKED,
  });
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
  return result.consultationId;
}

let userCount = 0;

/** A new user, signed in. */
async function signedInUser(overrides: Partial<SignUpInput> = {}): Promise<TestBrowser> {
  userCount += 1;
  const browser = new TestBrowser();
  const input: SignUpInput = {
    birthDate: { day: "14", month: "6", year: "1994" },
    username: `landing_user_${userCount}`,
    email: `landing.user${userCount}@example.com`,
    password: "a long enough password",
    stylePreference: "womenswear",
    countryCode: "GB",
    acceptedTerms: true,
    ...overrides,
  };
  expect(await signUp(harness.context(browser), input)).toEqual({ ok: true });
  // Verified, so it can start Consultations.
  await harness.openEmailedLink(input.email, browser);
  return browser;
}
