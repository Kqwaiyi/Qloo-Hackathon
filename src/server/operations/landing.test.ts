import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PhotoType } from "@/config/consultations";
import { qlooCache, usageRecord } from "@/server/db/schema";
import { refreshExchangeRates } from "@/server/exchange-rates/rates";
import { type ConsultationView, deleteConsultation, readConsultation, startConsultation } from "@/server/operations/consultations";
import { type LandingSample, type LandingSamples, readLandingPage } from "@/server/operations/landing";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { exportLandingSample, makeLandingSample } from "@/server/operations/team";
import { channel3Search } from "@/server/product-search/fake-channel3";
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
  harness.channel3.requests.length = 0;
  harness.productPhotos.requests.length = 0;
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
      { category: "hairstyle", item: "Textured crop with a low fade", why: "Dev Rowe's crop, kept easy.", brand: null, product: null },
      {
        category: "top",
        item: "Boxy heavyweight tee in sage",
        why: "A boxy tee for a relaxed look.",
        brand: { name: "Bolt", priceRange: { min: 20, max: 120 }, visitUrl: "https://bolt.example/" },
        product: null,
      },
      {
        category: "bottom",
        item: "Straight-leg jeans, mid wash",
        why: "Mid-wash denim grounds the tee.",
        brand: { name: "Jeanery", priceRange: { min: 50, max: 110 }, visitUrl: null },
        product: null,
      },
      {
        category: "shoes",
        item: "Retro runners in grey suede",
        why: "Grey suede finishes it quietly.",
        brand: { name: "Stride", priceRange: { min: 60, max: 180 }, visitUrl: "https://stride.example/" },
        product: null,
      },
    ],
  },
  images: { photoPath: "/landing/samples/full_body/photo.jpg", previewPath: "/landing/samples/full_body/preview.webp" },
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
    pieces: [{ category: "hairstyle", item: "Chin-length blunt bob", why: "A blunt line for an edgy look.", brand: null, product: null }],
  },
  images: { photoPath: "/landing/samples/face/photo.jpg", previewPath: "/landing/samples/face/preview.webp" },
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
        product: null,
      },
      { category: "shoes", item: "Canvas sneakers", why: "Clean canvas keeps it light.", brand: { name: "Pace", priceRange: null, visitUrl: null }, product: null },
    ],
  },
  images: { photoPath: "/landing/samples/body_only/photo.png", previewPath: "/landing/samples/body_only/preview.webp" },
};

const SAMPLES: LandingSamples = { full_body: FULL_BODY, face: FACE, body_only: BODY_ONLY };

// The walkthrough's sample as the team's script freezes it now: made in the United States, each
// Top, Bottom and Shoes a real Product, priced as its seller listed it on the day it was found.
const FULL_BODY_WITH_PRODUCTS: LandingSample = {
  ...FULL_BODY,
  stylePreference: "no_preference",
  countryCode: "US",
  budgetTier: "no_budget",
  outfit: {
    styleIconName: "Dev Rowe",
    pieces: [
      FULL_BODY.outfit.pieces[0]!,
      {
        category: "top",
        item: "Heavyweight Pocket Tee - Sage",
        why: "A boxy pocket tee keeps Dev Rowe's look relaxed.",
        brand: { name: "Bolt", priceRange: null, visitUrl: null },
        product: {
          available: true,
          price: { amount: 38, currency: "USD" },
          pricedOn: "2026-10-02",
          url: "https://bolt.example/products/pocket-tee",
          shopDomain: "bolt.example",
        },
      },
      {
        category: "bottom",
        item: "90s Straight Jean in Mid Wash",
        why: "Mid-wash denim grounds the tee.",
        brand: { name: "Jeanery", priceRange: null, visitUrl: null },
        product: {
          available: true,
          price: { amount: 89.5, currency: "USD" },
          pricedOn: "2026-10-02",
          url: "https://shop.example/jeanery-90s-straight",
          shopDomain: "shop.example",
        },
      },
      {
        category: "shoes",
        item: "Retro Runner Suede - Grey",
        why: "Grey suede finishes it quietly.",
        brand: { name: "Stride", priceRange: null, visitUrl: null },
        product: {
          available: true,
          price: { amount: 120, currency: "USD" },
          pricedOn: "2026-10-02",
          url: "https://stride.example/retro-runner",
          shopDomain: "stride.example",
        },
      },
    ],
  },
};

describe("the landing page", () => {
  it("shows each frozen Consultation's text, with its photo and Preview as they ship with the page", async () => {
    const page = await readLandingPage(harness.context(new TestBrowser()), SAMPLES);

    expect(page.samples.full_body).toEqual({
      photoType: "full_body",
      stylePreference: "menswear",
      ageGroup: "25_29",
      countryName: "United Kingdom",
      budgetTier: "medium",
      photoStyle: ["streetwear", "casual"],
      styleIcons: ["Dev Rowe", "Eli Frost", "Finn Ash"],
      // Its Brands' price ranges as Qloo gave them, in US dollars, written as the United Kingdom writes them.
      outfit: {
        position: 1,
        styleIconName: "Dev Rowe",
        total: "US$130–US$410",
        leftOutOfTotal: 0,
        pieces: [
          FULL_BODY.outfit.pieces[0],
          { ...FULL_BODY.outfit.pieces[1], brand: { name: "Bolt", priceRange: "US$20–US$120", visitUrl: "https://bolt.example/" } },
          { ...FULL_BODY.outfit.pieces[2], brand: { name: "Jeanery", priceRange: "US$50–US$110", visitUrl: null } },
          { ...FULL_BODY.outfit.pieces[3], brand: { name: "Stride", priceRange: "US$60–US$180", visitUrl: "https://stride.example/" } },
        ],
      },
      photoUrl: "/landing/samples/full_body/photo.jpg",
      previewUrl: "/landing/samples/full_body/preview.webp",
    });
    expect(page.samples.face).toMatchObject({
      countryName: "Australia",
      outfit: { position: 1, styleIconName: "Ava Stone", total: null },
      photoUrl: "/landing/samples/face/photo.jpg",
      previewUrl: "/landing/samples/face/preview.webp",
    });
    expect(page.samples.body_only).toMatchObject({
      countryName: "Germany",
      outfit: { styleIconName: "Cleo Hart", total: "US$15–US$60" },
      photoUrl: "/landing/samples/body_only/photo.png",
    });
  });

  it("shows a frozen sample's Products as the app's card does: each by its seller's name, with its Brand, its shop and its dated price", async () => {
    const page = await readLandingPage(harness.context(new TestBrowser()), { ...SAMPLES, full_body: FULL_BODY_WITH_PRODUCTS });

    expect(page.samples.full_body).toMatchObject({ countryName: "United States", stylePreference: "no_preference", budgetTier: "no_budget" });
    // Each price in whole US dollars, as its seller listed it, on the day it was found; the total adds them up.
    expect(page.samples.full_body.outfit).toEqual({
      position: 1,
      styleIconName: "Dev Rowe",
      total: "$248",
      leftOutOfTotal: 0,
      pieces: [
        FULL_BODY.outfit.pieces[0],
        {
          category: "top",
          item: "Heavyweight Pocket Tee - Sage",
          why: "A boxy pocket tee keeps Dev Rowe's look relaxed.",
          brand: { name: "Bolt", priceRange: null, visitUrl: null },
          product: { available: true, price: "$38", pricedOn: "2026-10-02", url: "https://bolt.example/products/pocket-tee", shopDomain: "bolt.example" },
        },
        {
          category: "bottom",
          item: "90s Straight Jean in Mid Wash",
          why: "Mid-wash denim grounds the tee.",
          brand: { name: "Jeanery", priceRange: null, visitUrl: null },
          product: { available: true, price: "$90", pricedOn: "2026-10-02", url: "https://shop.example/jeanery-90s-straight", shopDomain: "shop.example" },
        },
        {
          category: "shoes",
          item: "Retro Runner Suede - Grey",
          why: "Grey suede finishes it quietly.",
          brand: { name: "Stride", priceRange: null, visitUrl: null },
          product: { available: true, price: "$120", pricedOn: "2026-10-02", url: "https://stride.example/retro-runner", shopDomain: "stride.example" },
        },
      ],
    });
  });

  it("shows a placeholder sample, whose images haven't been captured yet, with no images", async () => {
    const page = await readLandingPage(harness.context(new TestBrowser()), { ...SAMPLES, face: { ...FACE, images: null } });

    expect(page.samples.face).toMatchObject({ outfit: { styleIconName: "Ava Stone" }, photoUrl: null, previewUrl: null });
    expect(page.samples.full_body.photoUrl).toBe("/landing/samples/full_body/photo.jpg");
  });

  it("tells the header whether the visitor is signed in, so it offers to open the app instead of signing in", async () => {
    const signedIn = await signedInUser();

    expect(await readLandingPage(harness.context(signedIn), SAMPLES)).toMatchObject({ signedIn: true });
    expect(await readLandingPage(harness.context(new TestBrowser()), SAMPLES)).toMatchObject({ signedIn: false });
  });

  it("makes no Qloo, AI or product-search call, so a visit costs nothing", async () => {
    const samples = { ...SAMPLES, full_body: FULL_BODY_WITH_PRODUCTS };

    await readLandingPage(harness.context(new TestBrowser()), samples);
    await readLandingPage(harness.context(await signedInUser()), samples);

    expect(harness.qloo.requests).toEqual([]);
    expect(harness.ai).toMatchObject({ photoCheckCount: 0, tailoringRequests: [], previewRequests: [] });
    expect(harness.channel3.requests).toEqual([]);
  });

  it("never refreshes a frozen sample's Products: they keep the prices and dates they were found with, however old", async () => {
    // It's 16 October, two weeks after they were found: an Outfit of the app's own would be checked again by now.
    const page = await readLandingPage(harness.context(await signedInUser()), { ...SAMPLES, full_body: FULL_BODY_WITH_PRODUCTS });

    expect(page.samples.full_body.outfit.pieces.map(({ product }) => product)).toEqual([
      null,
      expect.objectContaining({ available: true, price: "$38", pricedOn: "2026-10-02" }),
      expect.objectContaining({ available: true, price: "$90", pricedOn: "2026-10-02" }),
      expect.objectContaining({ available: true, price: "$120", pricedOn: "2026-10-02" }),
    ]);
    // Nothing asks the product search about them, nor fetches their photos.
    expect(harness.channel3.requests).toEqual([]);
    expect(harness.productPhotos.requests).toEqual([]);
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
    // The British market's searches hold its Brands' price ranges in pounds, at the stored rates.
    await refreshExchangeRates(harness);
  });

  it("exports its Photo Style, its first ranked Style Icons, and, unless told otherwise, its first Outfit's Brands and Pieces", async () => {
    const demo = await signedInUser({ email: "demo@example.com", stylePreference: "womenswear", countryCode: "GB" });
    const consultationId = await start(demo, "full_body");
    await harness.stylings.runPending();
    // Each Product as the fake Channel3 sells it in the United Kingdom.
    const product = (id: string) => ({
      available: true,
      price: { amount: 45, currency: "GBP" },
      pricedOn: "2026-10-16",
      url: `https://shop.example/products/${id}`,
      shopDomain: "shop.example",
    });

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
              product: null,
            },
            {
              category: "top",
              item: "Product c3-bolt-top-1",
              why: "An easy top layer in the spirit of Ava Stone, at home with your casual Photo Style.",
              brand: { name: "Bolt", priceRange: null, visitUrl: null },
              product: product("c3-bolt-top-1"),
            },
            {
              category: "bottom",
              item: "Product c3-jeanery-bottom-1",
              why: "A grounding Bottom in the spirit of Ava Stone, at home with your casual Photo Style.",
              brand: { name: "Jeanery", priceRange: null, visitUrl: null },
              product: product("c3-jeanery-bottom-1"),
            },
            {
              category: "shoes",
              item: "Product c3-stride-shoes-1",
              why: "Shoes that finish the Outfit in the spirit of Ava Stone, at home with your casual Photo Style.",
              brand: { name: "Stride", priceRange: null, visitUrl: null },
              product: product("c3-stride-shoes-1"),
            },
          ],
        },
        images: { photoPath: "/landing/samples/full_body/photo.jpg", previewPath: "/landing/samples/full_body/preview.webp" },
      },
      images: expect.any(Array),
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

  it("hands back its photo and first Preview to ship with the page, writing nothing, so the sample outlives the Consultation", async () => {
    const demo = await signedInUser({ email: "demo.copies@example.com" });
    const consultationId = await start(demo, "full_body");
    await harness.stylings.runPending();
    const shown = (await readConsultation(harness.context(demo), consultationId))!;
    const photo = harness.blob.objects.get(blobPathnameOf(shown.photoUrl));
    const preview = harness.blob.objects.get(blobPathnameOf(firstPreviewUrl(shown)));
    const stored = [...harness.blob.objects.keys()];

    const result = await exportLandingSample(teamContext(), { email: "demo.copies@example.com", consultationId });

    expect([...harness.blob.objects.keys()]).toEqual(stored);
    await deleteConsultation(harness.context(demo), consultationId);
    if (!result.ok) throw new Error(`Couldn't export the sample: ${result.refusal}`);
    expect(result.images).toEqual([
      { path: "/landing/samples/full_body/photo.jpg", bytes: photo?.bytes },
      { path: "/landing/samples/full_body/preview.webp", bytes: preview?.bytes },
    ]);
    expect(photo).toBeDefined();
    expect(preview).toBeDefined();
    const page = await readLandingPage(harness.context(new TestBrowser()), { ...SAMPLES, full_body: result.sample });
    expect(page.samples.full_body).toMatchObject({
      photoUrl: "/landing/samples/full_body/photo.jpg",
      previewUrl: "/landing/samples/full_body/preview.webp",
    });
  });

  it("exports another of its Outfits when the team picks one, with that Outfit's Preview", async () => {
    const demo = await signedInUser({ email: "demo.picked@example.com" });
    const consultationId = await start(demo, "full_body");
    await harness.stylings.runPending();
    const second = (await readConsultation(harness.context(demo), consultationId))!.outfits[1];
    if (second?.preview.state !== "ready") throw new Error("The second Outfit has no Preview.");
    const preview = harness.blob.objects.get(blobPathnameOf(second.preview.url));

    const result = await exportLandingSample(teamContext(), { email: "demo.picked@example.com", consultationId, outfitPosition: 2 });

    expect(result).toMatchObject({
      ok: true,
      sample: {
        styleIcons: ["Ava Stone", "Bea Marsh", "Cleo Hart", "Dana Reed", "Esme Vale"],
        // Its Pieces as stored, which the page shows as the card does.
        outfit: { styleIconName: second.styleIconName, pieces: second.pieces.map(({ category, item, why }) => expect.objectContaining({ category, item, why })) },
      },
    });
    expect(second.styleIconName).not.toBe("Ava Stone");
    expect(result.ok && result.images[1]).toEqual({ path: "/landing/samples/full_body/preview.webp", bytes: preview?.bytes });
    expect(preview).toBeDefined();
  });

  it("refuses an Outfit number the Consultation doesn't have", async () => {
    const demo = await signedInUser({ email: "demo.no.such.outfit@example.com" });
    const consultationId = await start(demo, "full_body");
    await harness.stylings.runPending();

    expect(
      await exportLandingSample(teamContext(), { email: "demo.no.such.outfit@example.com", consultationId, outfitPosition: 9 }),
    ).toEqual({ ok: false, refusal: "no-outfit" });
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
  });
});

describe("the team making a landing page sample by running the pipeline once on its photo", () => {
  // Each makes it on a fresh app of its own, as the script does, with Qloo, Channel3 and the AI faked.
  let fresh: TestHarness;

  beforeEach(async () => {
    fresh = await createTestHarness();
    fresh.qloo.respond = (request) =>
      qlooResponse(request.url.searchParams.get("filter.type") === "urn:entity:brand" ? BRANDS : STYLE_ICONS);
  });

  it("styles the photo as the Demo Account in the United States, in the sample's line, and freezes its first Outfit's Products and Preview", async () => {
    const photo = await jpegPhoto();

    const result = await makeLandingSample(freshApp(), { photoType: "full_body", photo, stylePreference: "menswear", budgetTier: "no_budget" });

    // Each Product as the fake Channel3 sells it in the United States, on the day the pipeline ran:
    // at 45 US dollars, or the nearest price within its Brand's own range.
    const product = (id: string, amount: number) => ({
      available: true,
      price: { amount, currency: "USD" },
      pricedOn: "2026-10-16",
      url: `https://shop.example/products/${id}`,
      shopDomain: "shop.example",
    });
    expect(result).toEqual({
      ok: true,
      sample: {
        photoType: "full_body",
        stylePreference: "menswear",
        // The Demo Account's, born January 2000.
        ageGroup: "25_29",
        countryCode: "US",
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
              product: null,
            },
            {
              category: "top",
              item: "Product c3-bolt-top-1",
              why: "An easy top layer in the spirit of Ava Stone, at home with your casual Photo Style.",
              brand: { name: "Bolt", priceRange: null, visitUrl: null },
              product: product("c3-bolt-top-1", 45),
            },
            {
              category: "bottom",
              item: "Product c3-jeanery-bottom-1",
              why: "A grounding Bottom in the spirit of Ava Stone, at home with your casual Photo Style.",
              brand: { name: "Jeanery", priceRange: null, visitUrl: null },
              product: product("c3-jeanery-bottom-1", 50),
            },
            {
              category: "shoes",
              item: "Product c3-stride-shoes-1",
              why: "Shoes that finish the Outfit in the spirit of Ava Stone, at home with your casual Photo Style.",
              brand: { name: "Stride", priceRange: null, visitUrl: null },
              product: product("c3-stride-shoes-1", 60),
            },
          ],
        },
        images: { photoPath: "/landing/samples/full_body/photo.jpg", previewPath: "/landing/samples/full_body/preview.webp" },
      },
      // The photo exactly as it was given, and the Preview drawn from it.
      images: [
        { path: "/landing/samples/full_body/photo.jpg", bytes: new Uint8Array(await photo.arrayBuffer()) },
        { path: "/landing/samples/full_body/preview.webp", bytes: expect.any(Uint8Array) },
      ],
    });
    // Every search was in the menswear line, in the United States.
    const searches = fresh.channel3.requests.filter(({ url }) => url.pathname === "/v1/browse").map(channel3Search);
    expect(searches).not.toEqual([]);
    expect(new Set(searches.map(({ gender, market }) => `${gender} in ${market}`))).toEqual(new Set(["male in US"]));
  });

  it("freezes another of its Outfits when the team picks one", async () => {
    const result = await makeLandingSample(freshApp(), {
      photoType: "full_body",
      photo: await jpegPhoto(),
      stylePreference: "menswear",
      budgetTier: "no_budget",
      outfitPosition: 2,
    });

    expect(result).toMatchObject({ ok: true, sample: { outfit: { styleIconName: "Bea Marsh" } } });
  });

  it("says why when the photo check rejects the photo, styling nothing", async () => {
    fresh.ai.scenario = "more-than-one-person";

    const result = await makeLandingSample(freshApp(), { photoType: "full_body", photo: await jpegPhoto(), stylePreference: "menswear" });

    expect(result).toEqual({ ok: false, refusal: "photo-rejected", rejection: { reason: "more-than-one-person" } });
    expect(fresh.qloo.requests).toEqual([]);
    expect(fresh.channel3.requests).toEqual([]);
  });

  it("says so when its Styling makes no Outfit to freeze", async () => {
    // Qloo knows no Style Icon for the sample.
    fresh.qloo.respond = () => qlooResponse([]);

    const result = await makeLandingSample(freshApp(), { photoType: "full_body", photo: await jpegPhoto(), stylePreference: "menswear" });

    expect(result).toEqual({ ok: false, refusal: "no-outfit" });
  });

  /** The fresh app, as the script hands it over: its services, with Stylings run in this process. */
  function freshApp() {
    return { ...fresh.context(new TestBrowser()), stylings: fresh.stylings };
  }
});

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
  const result = await startConsultation(harness.context(browser), { photo: await jpegPhoto(), photoType, consent: BOTH_CONSENT_BOXES_TICKED });
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
  return result.consultationId;
}

/** A plain JPEG, as a photo file. */
async function jpegPhoto(): Promise<Blob> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
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
