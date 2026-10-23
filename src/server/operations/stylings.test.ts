import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { inspect, isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type BudgetTier, byCategoryOrder, type PhotoType } from "@/config/consultations";
import { PRODUCT_PHOTO_MAX_BYTES } from "@/config/product-search";
import type { StylingKind } from "@/config/stylings";
import type { AiProvider } from "@/server/ai/provider";
import { brandMatch, consultation, exchangeRate, outfit, piece, pieceCandidates, qlooCache, styleIcon, styling, usageRecord, user } from "@/server/db/schema";
import { frankfurterRates } from "@/server/exchange-rates/fake";
import { refreshExchangeRates } from "@/server/exchange-rates/rates";
import { updateProfile } from "@/server/operations/account";
import { listConsultations, readConsultation, startConsultation } from "@/server/operations/consultations";
import { readSignedInUser } from "@/server/operations/session";
import {
  changeBudgetTier,
  changePhotoStyle,
  photoStyleWordsSchema,
  readStylingStatus,
  showMoreOutfits,
  type StylingProgressView,
  type StylingStatusView,
  tryAgain,
} from "@/server/operations/stylings";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { readUsageSummary } from "@/server/operations/usage";
import { neverAnswering, type ProductPhotoFormat, productPhoto, productPhotoBytes } from "@/server/product-photos/fake";
import {
  channel3Forbidden,
  channel3Offer,
  channel3Product,
  type Channel3Search,
  channel3Search,
  channel3SellingEveryBrand,
  channel3SmallCatalogue,
} from "@/server/product-search/fake-channel3";
import { qlooBrand, qlooPerson, qlooResponse, type RecordedQlooRequest } from "@/server/qloo/fake";
import { recordUsage } from "@/server/usage/records";
import { BOTH_CONSENT_BOXES_TICKED, createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// Made-up people, shaped like Qloo's person entities.
const WOMEN = [qlooPerson("w-1", "Ava Stone", 0.94), qlooPerson("w-2", "Bea Marsh", 0.91), qlooPerson("w-3", "Cleo Hart", 0.88)];
const MEN = [qlooPerson("m-1", "Dev Rowe", 0.93), qlooPerson("m-2", "Eli Frost", 0.9), qlooPerson("m-3", "Finn Ash", 0.85)];
const SIX_WOMEN = [
  ...WOMEN,
  qlooPerson("w-4", "Dana Reed", 0.86),
  qlooPerson("w-5", "Esme Vale", 0.84),
  qlooPerson("w-6", "Fay Lowe", 0.8),
];
// Who Qloo finds for an edgier Photo Style.
const EDGY_WOMEN = [qlooPerson("w-e1", "Gwen Black", 0.95), qlooPerson("w-e2", "Hope Lark", 0.92), qlooPerson("w-e3", "Iris Moon", 0.87)];

// Made-up Brands, shaped like Qloo's Brand entities, that every Style Icon's fans favour unless a
// test says otherwise. The first Outfit is Stride, Bolt and Jeanery (denim, in the top 10, so the
// Bottom), the second Sole, Dune and Bolt. There are 10, so the pool isn't thin.
const BRANDS = [
  qlooBrand("b-stride", "Stride", { categories: ["footwear"], affinity: 0.97, price: [60, 180], officialSite: "https://stride.example/" }),
  qlooBrand("b-bolt", "Bolt", { categories: ["apparel"], affinity: 0.95, price: [20, 120], officialSite: "https://bolt.example/" }),
  qlooBrand("b-sole", "Sole", { categories: ["footwear", "sneakers"], affinity: 0.93, price: [40, 90], officialSite: "http://sole.example/" }),
  qlooBrand("b-dune", "Dune", { categories: ["apparel", "outerwear"], affinity: 0.9, officialSite: "https://dune.example/" }),
  qlooBrand("b-jeanery", "Jeanery", { categories: ["apparel", "denim"], affinity: 0.88, price: [50, 110] }),
  qlooBrand("b-ember", "Ember", { categories: ["apparel"], affinity: 0.85, price: [15, 60], officialSite: "https://ember.example/" }),
  qlooBrand("b-pace", "Pace", { categories: ["footwear"], affinity: 0.8, price: [30, 70], officialSite: "https://pace.example/" }),
  qlooBrand("b-hem", "Hem", { categories: ["apparel"], affinity: 0.7, price: [25, 80] }),
  qlooBrand("b-loom", "Loom", { categories: ["apparel"], affinity: 0.65, price: [30, 90] }),
  qlooBrand("b-weft", "Weft", { categories: ["apparel"], affinity: 0.6, price: [20, 70] }),
];

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

beforeEach(async () => {
  harness.clock.set("2026-10-16T12:00:00Z");
  harness.blob.objects.clear();
  harness.ai.scenario = "pass";
  harness.ai.styleIconScenarios = {};
  harness.ai.tailoringRequests.length = 0;
  harness.ai.previewRequests.length = 0;
  harness.ai.previewScenarios = [];
  harness.ai.stylistRequests.length = 0;
  harness.ai.stylistTurn = undefined;
  harness.ai.duringCall = undefined;
  harness.stylings.pending.length = 0;
  harness.stylings.cancelled.length = 0;
  harness.stylings.cancelFails = false;
  harness.qloo.requests.length = 0;
  harness.qloo.respond = qlooAnswering({ female: WOMEN, male: MEN });
  harness.qloo.duringRequest = undefined;
  harness.channel3.requests.length = 0;
  harness.channel3.respond = channel3SellingEveryBrand();
  harness.channel3.duringRequest = undefined;
  harness.productPhotos.requests.length = 0;
  harness.productPhotos.respond = (url) => productPhoto(url);
  harness.stylings.previewRetries = 0;
  harness.stylings.searchRetries = 0;
  await harness.db.delete(qlooCache);
  await harness.db.delete(brandMatch);
  // No exchange rate is stored until a test stores some.
  await harness.db.delete(exchangeRate);
  // The app-wide caps count every user's Outfits, so each test starts with none made.
  await harness.db.delete(usageRecord);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a new Consultation's first Styling", () => {
  it("starts with the Consultation, which shows Styling… until it finishes", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    harness.clock.set("2026-10-16T12:30:00Z");

    const consultationId = await start(browser, "full_body");

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ state: "styling", outfits: [] });
    expect(await readStylingStatus(harness.context(browser), consultationId)).toEqual({
      state: "styling",
      progress: { kind: "first", stage: "style_icons", previews: { done: 0, of: 2 }, slow: false },
    });
    expect(await stylingsOf(consultationId)).toEqual([
      {
        id: harness.stylings.pending[0],
        consultationId,
        userId: (await readSignedInUser(harness.context(browser)))!.id,
        onDemoAccount: false,
        kind: "first",
        budgetTier: "no_budget",
        photoStyle: ["casual"],
        status: "running",
        stage: "style_icons",
        stageMovedAt: new Date("2026-10-16T12:30:00Z"),
        outfitsWanted: 2,
        outfitsMade: 0,
        tailoringFailures: 0,
        productSearches: 0,
        failureReason: null,
        workflowRunId: expect.any(String),
        market: "US",
        startedAt: new Date("2026-10-16T12:30:00Z"),
        finishedAt: null,
      },
    ]);
    expect(harness.qloo.requests).toEqual([]);
  });

  it("builds two Outfits from the top two Style Icons, switching them in together when it finishes", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    harness.clock.set("2026-10-16T12:30:00Z");
    const consultationId = await start(browser, "full_body");
    harness.clock.set("2026-10-16T12:30:20Z");

    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      outfits: [
        { id: expect.any(String), position: 1, styleIconName: "Ava Stone" },
        { id: expect.any(String), position: 2, styleIconName: "Bea Marsh" },
      ],
    });
    expect(await readStylingStatus(harness.context(browser), consultationId)).toEqual({ state: "ready", progress: null });
    expect(await stylingsOf(consultationId)).toEqual([
      expect.objectContaining({
        status: "succeeded",
        stage: "previews",
        stageMovedAt: new Date("2026-10-16T12:30:20Z"),
        outfitsWanted: 2,
        outfitsMade: 2,
        failureReason: null,
        finishedAt: new Date("2026-10-16T12:30:20Z"),
      }),
    ]);
  });

  it("asks Qloo once for Style Icons: well-known people in the user's line, age group and Country, in tune with the Photo Style", async () => {
    const browser = await signedInUser({ stylePreference: "menswear", countryCode: "US", birthDate: { day: "2", month: "2", year: "1992" } });

    await start(browser, "face");
    await harness.stylings.runPending();

    expect(harness.qloo.requests).toHaveLength(1);
    const [request] = harness.qloo.requests;
    expect(request!.method).toBe("GET");
    expect(request!.url.pathname).toBe("/v2/insights");
    expect(Object.fromEntries(request!.url.searchParams)).toMatchObject({
      "filter.type": "urn:entity:person",
      "filter.gender": "male",
      "signal.demographics.gender": "male",
      "signal.demographics.age": "30_to_34",
      "signal.location.query": "United States",
      "signal.interests.tags": "urn:tag:personal_style:qloo:casual",
      "filter.popularity.min": "0.995",
      take: "50",
    });
  });

  it("searches with the Style Preference, Country and age group stored on the Consultation, not the profile since", async () => {
    const browser = await signedInUser({ stylePreference: "menswear", countryCode: "US", birthDate: { day: "20", month: "11", year: "1991" } });
    const userId = (await readSignedInUser(harness.context(browser)))!.id;
    harness.clock.set("2026-10-31T23:00:00Z");
    await start(browser, "full_body");

    // The user changes their profile, and turns 35, before the Styling's steps run.
    await harness.db.update(user).set({ stylePreference: "womenswear", countryCode: "GB" }).where(eq(user.id, userId));
    harness.clock.set("2026-11-01T01:00:00Z");
    await harness.stylings.runPending();

    expect(personCalls().map((params) => Object.fromEntries(params))).toEqual([
      expect.objectContaining({
        "filter.gender": "male",
        "signal.location.query": "United States",
        "signal.demographics.age": "30_to_34",
      }),
    ]);
    expect(brandCalls()).not.toHaveLength(0);
    for (const params of brandCalls()) {
      expect(Object.fromEntries(params)).toMatchObject({
        "signal.demographics.gender": "male",
        "signal.location.query": "United States",
        "signal.demographics.age": "30_to_34",
      });
      expect(params.get("filter.tags")).toContain("urn:tag:target_age_group:qloo:adults");
      expect(params.get("filter.tags")).toContain("urn:tag:key_market:qloo:united_states");
    }
  });

  it("gives a no-preference user a womenswear and a menswear call, and Outfits from each line in turn", async () => {
    const browser = await signedInUser({ stylePreference: "no_preference" });

    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();

    expect(personCalls().map((params) => params.get("filter.gender")).toSorted()).toEqual(["female", "male"]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual([
      "Ava Stone",
      "Dev Rowe",
    ]);
  });

  it("keeps each ranked Style Icon with the Styling that picked it, its position, line and whether it was used", async () => {
    const browser = await signedInUser({ stylePreference: "no_preference" });
    const consultationId = await start(browser, "full_body");
    const [stylingId] = harness.stylings.pending;

    await harness.stylings.runPending();

    const icons = await harness.db
      .select()
      .from(styleIcon)
      .where(eq(styleIcon.consultationId, consultationId))
      .orderBy(asc(styleIcon.position));
    expect(icons.map(({ stylingId, position, qlooEntityId, name, line, status }) => ({ stylingId, position, qlooEntityId, name, line, status }))).toEqual([
      { stylingId, position: 1, qlooEntityId: "w-1", name: "Ava Stone", line: "womenswear", status: "used" },
      { stylingId, position: 2, qlooEntityId: "m-1", name: "Dev Rowe", line: "menswear", status: "used" },
      { stylingId, position: 3, qlooEntityId: "w-2", name: "Bea Marsh", line: "womenswear", status: "unused" },
      { stylingId, position: 4, qlooEntityId: "m-2", name: "Eli Frost", line: "menswear", status: "unused" },
      { stylingId, position: 5, qlooEntityId: "w-3", name: "Cleo Hart", line: "womenswear", status: "unused" },
      { stylingId, position: 6, qlooEntityId: "m-3", name: "Finn Ash", line: "menswear", status: "unused" },
    ]);
  });

  it("never picks a Style Icon on the denylist", async () => {
    harness.qloo.respond = qlooAnswering({ male: [qlooPerson("CB6258A6-C9B8-45C8-81CD-45D6077DD981", "Conor McGregor", 0.99), ...MEN] });
    const browser = await signedInUser({ stylePreference: "menswear" });

    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual([
      "Dev Rowe",
      "Eli Frost",
    ]);
  });
});

describe("each Outfit's Pieces", () => {
  it("are a Face Photo's Hairstyle only, each Outfit the next Style Icon's, tailored to the photo", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear", birthDate: { day: "2", month: "2", year: "1992" } });

    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toEqual([
      {
        id: expect.any(String),
        position: 1,
        styleIconName: "Ava Stone",
        preview: { state: "ready", url: expect.any(String) },
        total: null,
        leftOutOfTotal: 0,
        pieces: [{ category: "hairstyle", item: expect.any(String), why: expect.stringContaining("Ava Stone"), brand: null, product: null }],
      },
      {
        id: expect.any(String),
        position: 2,
        styleIconName: "Bea Marsh",
        preview: { state: "ready", url: expect.any(String) },
        total: null,
        leftOutOfTotal: 0,
        pieces: [{ category: "hairstyle", item: expect.any(String), why: expect.stringContaining("Bea Marsh"), brand: null, product: null }],
      },
    ]);
    expect(brandCalls()).toEqual([]);
    expect(await piecesOf(consultationId)).toEqual([
      { category: "hairstyle", item: expect.any(String), details: expect.any(String), why: expect.stringContaining("Ava Stone"), unknownCut: false },
      { category: "hairstyle", item: expect.any(String), details: expect.any(String), why: expect.stringContaining("Bea Marsh"), unknownCut: false },
    ]);
  });

  it("keep the Style Icon when the AI doesn't know their signature cut, marking the Hairstyle's cut unknown", async () => {
    harness.ai.scenario = "unknown-cut";
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();

    const { outfits } = (await readConsultation(harness.context(browser), consultationId))!;
    expect(outfits.map((o) => o.styleIconName)).toEqual(["Ava Stone", "Bea Marsh"]);
    expect(await piecesOf(consultationId)).toEqual([
      expect.objectContaining({ category: "hairstyle", unknownCut: true, why: expect.not.stringContaining("Ava Stone") }),
      expect.objectContaining({ category: "hairstyle", unknownCut: true, why: expect.not.stringContaining("Bea Marsh") }),
    ]);
  });

  it("fail the Styling as nothing could be built when every Outfit the Stylist saves breaks a rule, once its 30 turns are used up", async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    harness.ai.scenario = "tailoring-fails";
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ state: "no_outfits", outfits: [] });
    expect(await stylingsOf(consultationId)).toEqual([
      expect.objectContaining({ status: "failed", failureReason: "nothing_built", outfitsMade: 0, tailoringFailures: 0 }),
    ]);
    expect((await styleIconStatuses(consultationId)).map(([, status]) => status)).toEqual(["unused", "unused", "unused", "unused", "unused", "unused"]);
    expect(harness.ai.stylistRequests).toHaveLength(30);
    expect(harness.ai.previewRequests).toEqual([]);
  });

  it("are tailored from the photo itself and the Outfit, with each Brand Piece's Brand and candidate Products by their words alone, the Top Brand's One-Pieces beside the Top's, never the Country or the Budget Tier", async () => {
    harness.qloo.respond = qlooAnswering({ male: [MEN[0]!] });
    await storeExchangeRates({ EUR: 0.89166 });
    const browser = await signedInUser({ stylePreference: "menswear", countryCode: "FR", birthDate: { day: "2", month: "2", year: "1992" } });

    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();

    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    // Each candidate's ID, title, description and colours: never its photos, offers or prices.
    const candidates = (brandId: string, category: string) =>
      [1, 2].map((n) => ({ id: `${brandId}-${category}-${n}`, title: `Product ${brandId}-${category}-${n}`, description: `About product ${brandId}-${category}-${n}.`, colours: ["#1f2a44"] }));
    expect(harness.ai.tailoringRequests).toEqual([
      {
        photo: { mediaType: "image/jpeg", sha256: sha256(harness.blob.objects.get(stored!.photoPathname)!.bytes) },
        photoType: "full_body",
        ageGroup: "30_34",
        photoStyle: ["casual"],
        line: "menswear",
        styleIconName: "Dev Rowe",
        pieces: [
          { category: "hairstyle" },
          {
            category: "top",
            brand: { name: "Bolt", categoryTags: ["apparel"] },
            candidates: candidates("c3-bolt", "top"),
            onePieceCandidates: candidates("c3-bolt", "one_piece"),
          },
          { category: "bottom", brand: { name: "Jeanery", categoryTags: ["apparel", "denim"] }, candidates: candidates("c3-jeanery", "bottom") },
          { category: "shoes", brand: { name: "Stride", categoryTags: ["footwear"] }, candidates: candidates("c3-stride", "shoes") },
        ],
      },
    ]);
  });
});

describe("a body photo's Outfits", () => {
  it("are built on Brands: a Full-Body Photo's have a Hairstyle, and a Top, Bottom and Shoes that are Products of their Brands", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();

    const { outfits } = (await readConsultation(harness.context(browser), consultationId))!;
    expect(outfits.map((o) => [o.styleIconName, o.pieces.map((p) => [p.category, p.brand?.name ?? null, p.product?.available ? p.product.url : null])])).toEqual([
      [
        "Ava Stone",
        [
          ["hairstyle", null, null],
          ["top", "Bolt", "https://shop.example/products/c3-bolt-top-1"],
          ["bottom", "Jeanery", "https://shop.example/products/c3-jeanery-bottom-1"],
          ["shoes", "Stride", "https://shop.example/products/c3-stride-shoes-1"],
        ],
      ],
      [
        "Bea Marsh",
        [
          ["hairstyle", null, null],
          ["top", "Dune", "https://shop.example/products/c3-dune-top-1"],
          ["bottom", "Bolt", "https://shop.example/products/c3-bolt-bottom-1"],
          ["shoes", "Sole", "https://shop.example/products/c3-sole-shoes-1"],
        ],
      ],
    ]);
  });

  it("leave out the Hairstyle when the hair is covered", async () => {
    harness.ai.scenario = "hair-covered";
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();

    const { outfits } = (await readConsultation(harness.context(browser), consultationId))!;
    expect(outfits.map((o) => o.pieces.map((p) => p.category))).toEqual([
      ["top", "bottom", "shoes"],
      ["top", "bottom", "shoes"],
    ]);
    expect(harness.ai.tailoringRequests.map((request) => request.pieces.map((p) => p.category))).toEqual([
      ["top", "bottom", "shoes"],
      ["top", "bottom", "shoes"],
    ]);
    expect(harness.ai.previewRequests.map((request) => request.pieces.map((p) => p.category))).toEqual([
      ["top", "bottom", "shoes"],
      ["top", "bottom", "shoes"],
    ]);
  });

  it("are a Body-Only Photo's Top, Bottom and Shoes", async () => {
    const browser = await signedInUser({ stylePreference: "menswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    const { outfits } = (await readConsultation(harness.context(browser), consultationId))!;
    expect(outfits.map((o) => [o.styleIconName, o.pieces.map((p) => [p.category, p.brand?.name])])).toEqual([
      ["Dev Rowe", [["top", "Bolt"], ["bottom", "Jeanery"], ["shoes", "Stride"]]],
      ["Eli Frost", [["top", "Dune"], ["bottom", "Bolt"], ["shoes", "Sole"]]],
    ]);
  });

  it("keep each Outfit's Brand picks apart from its Pieces, and each Brand Piece's Brand", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    const stored = await harness.db
      .select({ top: outfit.topBrandEntityId, bottom: outfit.bottomBrandEntityId, shoes: outfit.shoesBrandEntityId })
      .from(outfit)
      .where(eq(outfit.consultationId, consultationId))
      .orderBy(asc(outfit.position));
    // No Brand repeats within a Category across the Styling's Outfits.
    expect(stored).toEqual([
      { top: "b-bolt", bottom: "b-jeanery", shoes: "b-stride" },
      { top: "b-dune", bottom: "b-bolt", shoes: "b-sole" },
    ]);
    const [first] = await brandPiecesOf(consultationId);
    expect(first).toEqual([
      { category: "top", brandEntityId: "b-bolt", brandName: "Bolt", brandOfficialSite: "https://bolt.example/", brandPriceUsdMin: 20, brandPriceUsdMax: 120 },
      { category: "bottom", brandEntityId: "b-jeanery", brandName: "Jeanery", brandOfficialSite: null, brandPriceUsdMin: 50, brandPriceUsdMax: 110 },
      { category: "shoes", brandEntityId: "b-stride", brandName: "Stride", brandOfficialSite: "https://stride.example/", brandPriceUsdMin: 60, brandPriceUsdMax: 180 },
    ]);
  });

  it("skip a Style Icon whose fans' Brands can't complete an Outfit, without counting it as a tailoring failure", async () => {
    harness.qloo.respond = qlooAnswering({ female: WOMEN }, (styleIconId) => (styleIconId === "w-1" ? BRANDS.filter((b) => b.name !== "Stride" && b.name !== "Sole" && b.name !== "Pace") : BRANDS));
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual([
      "Bea Marsh",
      "Cleo Hart",
    ]);
    expect(await styleIconStatuses(consultationId)).toEqual([
      ["Ava Stone", "skipped"],
      ["Bea Marsh", "used"],
      ["Cleo Hart", "used"],
    ]);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 2, tailoringFailures: 0 })]);
    expect(harness.ai.tailoringRequests.map((request) => request.styleIconName)).not.toContain("Ava Stone");
  });

  it("give a Style Icon held back by a planned Outfit's Brands its turn once that Outfit's tailoring fails", async () => {
    // Bea Marsh's fans favour only the Brands Ava Stone's Outfit is planned with.
    const avasBrands = BRANDS.filter((b) => ["Stride", "Bolt", "Jeanery"].includes(b.name));
    harness.qloo.respond = qlooAnswering({ female: WOMEN }, (styleIconId) => (styleIconId === "w-2" ? avasBrands : BRANDS));
    harness.ai.styleIconScenarios = { "Ava Stone": "tailoring-fails" };
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)])).toEqual([
      ["Bea Marsh", ["Bolt", "Jeanery", "Stride"]],
      ["Cleo Hart", ["Dune", "Bolt", "Sole"]],
    ]);
    expect(await styleIconStatuses(consultationId)).toEqual([
      ["Ava Stone", "skipped"],
      ["Bea Marsh", "used"],
      ["Cleo Hart", "used"],
    ]);
  });

  it("fail the Styling as nothing could be built when no Style Icon's fans' Brands complete an Outfit", async () => {
    harness.qloo.respond = qlooAnswering({ female: WOMEN }, () => []);
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ state: "no_outfits", outfits: [] });
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "failed", failureReason: "nothing_built" })]);
    expect(harness.ai.tailoringRequests).toEqual([]);
  });
});

describe("the Brand calls", () => {
  it("ask for each Style Icon's fans' Brands, popular with the Consultation's age group and Country, never the Photo Style", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "GB", birthDate: { day: "2", month: "2", year: "2004" } });

    await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(brandCalls().map((params) => Object.fromEntries(params))).toEqual([
      {
        "filter.type": "urn:entity:brand",
        "signal.interests.entities": "w-1",
        "signal.demographics.age": "24_and_younger",
        "signal.demographics.gender": "female",
        "signal.location.query": "United Kingdom",
        "operator.filter.tags": "intersection",
        "filter.tags": "urn:tag:genre:brand:fashion,urn:tag:key_market:qloo:united_kingdom,urn:tag:target_age_group:qloo:young_adults",
        "filter.popularity.min": "0.98",
        take: "50",
      },
    ]);
  });

  it("ask at the Consultation's Budget Tier, and its Outfits are built only on Brands within the tier's price guard", async () => {
    // Gild is tagged for the tier, but its prices aren't Low, and Dune has none. Tuck keeps the pool at 10.
    const gild = qlooBrand("b-gild", "Gild", { categories: ["footwear"], affinity: 0.99, price: [250, 900] });
    const tuck = qlooBrand("b-tuck", "Tuck", { categories: ["apparel"], affinity: 0.55, price: [20, 60] });
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] }, () => [gild, ...BRANDS, tuck]);
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only", "low");
    await harness.stylings.runPending();

    expect(brandCalls().map((params) => [params.get("filter.tags"), params.get("filter.exclude.tags")])).toEqual([
      [
        "urn:tag:genre:brand:fashion,urn:tag:key_market:qloo:united_states,urn:tag:target_age_group:qloo:adults,urn:tag:target_income_level:qloo:low_to_medium",
        "urn:tag:target_income_level:qloo:high,urn:tag:target_income_level:qloo:medium_to_high",
      ],
    ]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.pieces.map((p) => p.brand?.name))).toEqual([
      ["Bolt", "Jeanery", "Stride"],
    ]);
  });

  it("widen a thin pool quietly within one fetch, one step at a time, until a query gives at least 10 usable Brands", async () => {
    // Only Stride and Bolt carry the United Kingdom's key_market tag.
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] }, (_, query) =>
      query.get("filter.tags")!.includes("key_market") ? BRANDS.filter((b) => ["Stride", "Bolt"].includes(b.name)) : BRANDS,
    );
    await storeExchangeRates({ GBP: 0.74925 });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "GB", birthDate: { day: "2", month: "2", year: "2004" } });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(brandCalls().map((params) => [params.get("filter.tags"), params.get("filter.popularity.min"), params.get("signal.location.query")])).toEqual([
      ["urn:tag:genre:brand:fashion,urn:tag:key_market:qloo:united_kingdom,urn:tag:target_age_group:qloo:young_adults", "0.98", "United Kingdom"],
      ["urn:tag:genre:brand:fashion,urn:tag:key_market:qloo:united_kingdom,urn:tag:target_age_group:qloo:adults", "0.98", "United Kingdom"],
      ["urn:tag:genre:brand:fashion,urn:tag:target_age_group:qloo:adults", "0.98", "United Kingdom"],
    ]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)])).toEqual([
      ["Ava Stone", ["Bolt", "Jeanery", "Stride"]],
    ]);
  });

  it("build on the query's with the most usable Brands when every query leaves a thin pool", async () => {
    // Each query finds a few Brands; the one without the market tag finds the most.
    const found = (query: URLSearchParams) => {
      const tags = query.get("filter.tags")!;
      if (tags.includes("key_market")) return ["Stride", "Bolt"];
      if (!tags.includes("target_age_group")) return ["Pace", "Ember"];
      return query.get("filter.popularity.min") === "0.98" ? ["Stride", "Bolt", "Sole", "Dune", "Jeanery"] : ["Sole", "Dune"];
    };
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] }, (_, query) => BRANDS.filter((b) => found(query).includes(b.name)));
    await storeExchangeRates({ GBP: 0.74925 });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "GB", birthDate: { day: "2", month: "2", year: "1992" } });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(brandCalls().map((params) => [params.get("filter.tags"), params.get("filter.popularity.min")])).toEqual([
      ["urn:tag:genre:brand:fashion,urn:tag:key_market:qloo:united_kingdom,urn:tag:target_age_group:qloo:adults", "0.98"],
      ["urn:tag:genre:brand:fashion,urn:tag:target_age_group:qloo:adults", "0.98"],
      ["urn:tag:genre:brand:fashion,urn:tag:target_age_group:qloo:adults", "0.95"],
      ["urn:tag:genre:brand:fashion", "0.95"],
    ]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)])).toEqual([
      ["Ava Stone", ["Bolt", "Jeanery", "Stride"]],
    ]);
  });

  it("are made for the first 3 Style Icons at once, and no more while 2 of them complete Outfits", async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    let inFlight = 0;
    let mostInFlight = 0;
    harness.qloo.duringRequest = async () => {
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    };
    const browser = await signedInUser({ stylePreference: "womenswear" });

    await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(brandCalls().map((params) => params.get("signal.interests.entities")).toSorted()).toEqual(["w-1", "w-2", "w-3"]);
    expect(mostInFlight).toBe(3);
  });

  it("use each Style Icon's own line for a no-preference user", async () => {
    const browser = await signedInUser({ stylePreference: "no_preference" });

    await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(
      Object.fromEntries(brandCalls().map((params) => [params.get("signal.interests.entities"), params.get("signal.demographics.gender")])),
    ).toEqual({ "w-1": "female", "m-1": "male", "w-2": "female" });
  });

  it("are made for later Style Icons as needed, one at a time, and for at most 6 Style Icons in a Styling", async () => {
    const eightWomen = [...SIX_WOMEN, qlooPerson("w-7", "Gia Penn", 0.78), qlooPerson("w-8", "Hana Moor", 0.76)];
    // Only Ava Stone's and Gia Penn's fans favour Brands that make a whole Outfit.
    harness.qloo.respond = qlooAnswering({ female: eightWomen }, (styleIconId) => (styleIconId === "w-1" || styleIconId === "w-7" ? BRANDS : []));
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    // Each fetch with no Brands widens to its last query before the next fetch starts.
    const fetched = [...new Set(brandCalls().map((params) => params.get("signal.interests.entities")))];
    expect(fetched.slice(0, 3).toSorted()).toEqual(["w-1", "w-2", "w-3"]);
    expect(fetched.slice(3)).toEqual(["w-4", "w-5", "w-6"]);
    expect(await styleIconStatuses(consultationId)).toEqual([
      ["Ava Stone", "used"],
      ["Bea Marsh", "skipped"],
      ["Cleo Hart", "skipped"],
      ["Dana Reed", "skipped"],
      ["Esme Vale", "skipped"],
      ["Fay Lowe", "skipped"],
      ["Gia Penn", "unused"],
      ["Hana Moor", "unused"],
    ]);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 1, tailoringFailures: 0 })]);
  });

  it("are made for the next Style Icon when a substitute for failed tailoring needs one, with the failed Outfit's Brands free again", async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    harness.ai.styleIconScenarios = { "Ava Stone": "tailoring-fails", "Bea Marsh": "tailoring-fails" };
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(brandCalls().map((params) => params.get("signal.interests.entities")).toSorted()).toEqual(["w-1", "w-2", "w-3", "w-4"]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)])).toEqual([
      ["Cleo Hart", ["Bolt", "Jeanery", "Stride"]],
      ["Dana Reed", ["Dune", "Bolt", "Sole"]],
    ]);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 2, tailoringFailures: 2 })]);
  });
});

describe("the Brands the product search knows", () => {
  it("are the only ones an Outfit is built on: one it doesn't know is passed over for the next in Qloo's order", async () => {
    harness.channel3.respond = channel3SellingEveryBrand({ except: ["Bolt"] });
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    // Bolt, the highest-affinity apparel Brand, would otherwise be the first Outfit's Top and the second's Bottom.
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)])).toEqual([
      ["Ava Stone", ["Dune", "Jeanery", "Stride"]],
      ["Bea Marsh", ["Jeanery", "Dune", "Sole"]],
    ]);
  });

  it("are looked up only as a pick is about to use them: the next in Qloo's order only once one before it isn't known", async () => {
    harness.channel3.respond = channel3SellingEveryBrand({ except: ["Bolt"] });
    const browser = await signedInUser({ stylePreference: "womenswear" });

    await start(browser, "body_only");
    await harness.stylings.runPending();

    // Dune was looked up for the first Outfit's Top once Bolt wasn't known. Ember, Pace, Hem, Loom
    // and Weft were never about to be used, nor were the Brands of Cleo Hart, whose fans' Brands were
    // fetched as a spare.
    expect(brandLookups().toSorted()).toEqual(["Bolt", "Dune", "Jeanery", "Sole", "Stride"]);
  });

  it("are looked up at most 3 at once", async () => {
    let inFlight = 0;
    let mostInFlight = 0;
    harness.channel3.duringRequest = async () => {
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    };
    const browser = await signedInUser({ stylePreference: "womenswear" });

    await start(browser, "body_only");
    await harness.stylings.runPending();

    // The two Outfits' picks use 5 Brands: Stride, Bolt and Jeanery, then Sole, Dune and Bolt.
    expect(brandLookups()).toHaveLength(5);
    expect(mostInFlight).toBe(3);
  });

  it("are looked up once in 30 days, whether the product search knew them or not", async () => {
    harness.channel3.respond = channel3SellingEveryBrand({ except: ["Bolt"] });
    await start(await signedInUser({ stylePreference: "womenswear" }), "body_only");
    await harness.stylings.runPending();
    // Channel3 knows Bolt from now on.
    harness.channel3.respond = channel3SellingEveryBrand();
    harness.channel3.requests.length = 0;

    harness.clock.set("2026-11-15T11:59:59Z");
    const later = await signedInUser({ stylePreference: "womenswear" });
    const laterConsultationId = await start(later, "body_only");
    await harness.stylings.runPending();

    expect(brandLookups()).toEqual([]);
    expect((await readConsultation(harness.context(later), laterConsultationId))!.outfits.map((o) => o.pieces.map((p) => p.brand?.name))).toEqual([
      ["Dune", "Jeanery", "Stride"],
      ["Jeanery", "Dune", "Sole"],
    ]);

    harness.clock.set("2026-11-15T12:00:00Z");
    const latest = await signedInUser({ stylePreference: "womenswear" });
    const latestConsultationId = await start(latest, "body_only");
    await harness.stylings.runPending();

    expect(brandLookups().toSorted()).toEqual(["Bolt", "Dune", "Jeanery", "Sole", "Stride"]);
    expect((await readConsultation(harness.context(latest), latestConsultationId))!.outfits.map((o) => o.pieces.map((p) => p.brand?.name))).toEqual([
      ["Bolt", "Jeanery", "Stride"],
      ["Dune", "Bolt", "Sole"],
    ]);
  });

  it("must complete an Outfit, or its Style Icon is skipped for the next, without counting as a tailoring failure", async () => {
    // Stride is the only footwear Brand Ava Stone's fans favour, and the product search doesn't know it.
    harness.qloo.respond = qlooAnswering({ female: WOMEN }, (styleIconId) => (styleIconId === "w-1" ? BRANDS.filter((b) => b.name !== "Sole" && b.name !== "Pace") : BRANDS));
    harness.channel3.respond = channel3SellingEveryBrand({ except: ["Stride"] });
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)])).toEqual([
      ["Bea Marsh", ["Bolt", "Jeanery", "Sole"]],
      ["Cleo Hart", ["Dune", "Bolt", "Pace"]],
    ]);
    expect(await styleIconStatuses(consultationId)).toEqual([
      ["Ava Stone", "skipped"],
      ["Bea Marsh", "used"],
      ["Cleo Hart", "used"],
    ]);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 2, tailoringFailures: 0 })]);
    expect(harness.ai.tailoringRequests.map((request) => request.styleIconName)).not.toContain("Ava Stone");
  });

  it("are never looked up for a Face Photo, whose Outfits have no Brands", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toHaveLength(2);
    expect(harness.channel3.requests).toEqual([]);
  });
});

describe("a body photo's Products", () => {
  it("are what its Top, Bottom and Shoes are: each a Product of its Brand, saved with its title, photo, offer, price, currency, market and date", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "US" });
    const consultationId = await start(browser, "body_only");
    harness.clock.set("2026-10-21T09:30:00Z");

    await harness.stylings.runPending();

    // The fake AI picks each Category's first candidate: Bolt's, Jeanery's and Stride's first Products.
    expect(await productPiecesOf(consultationId)).toEqual([
      {
        category: "top",
        item: "Product c3-bolt-top-1",
        details: null,
        brandName: "Bolt",
        productId: "c3-bolt-top-1",
        productPhotoUrl: "https://cdn.channel3.test/c3-bolt-top-1-cleaned.png",
        offerUrl: "https://shop.example/products/c3-bolt-top-1",
        offerShopDomain: "shop.example",
        price: 45,
        currency: "USD",
        market: "US",
        pricedAt: new Date("2026-10-21T09:30:00Z"),
        available: true,
      },
      expect.objectContaining({ category: "bottom", item: "Product c3-jeanery-bottom-1", brandName: "Jeanery", price: 50, currency: "USD", market: "US" }),
      expect.objectContaining({ category: "shoes", item: "Product c3-stride-shoes-1", brandName: "Stride", price: 60, currency: "USD", market: "US" }),
    ]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toEqual([
      {
        id: expect.any(String),
        position: 1,
        styleIconName: "Ava Stone",
        preview: { state: "ready", url: expect.any(String) },
        // 45, 50 and 60 dollars.
        total: "$155",
        leftOutOfTotal: 0,
        pieces: [
          {
            category: "top",
            item: "Product c3-bolt-top-1",
            why: expect.stringContaining("Ava Stone"),
            brand: { name: "Bolt", priceRange: null, visitUrl: null },
            product: { available: true, price: "$45", pricedOn: "2026-10-21", url: "https://shop.example/products/c3-bolt-top-1", shopDomain: "shop.example" },
          },
          {
            category: "bottom",
            item: "Product c3-jeanery-bottom-1",
            why: expect.stringContaining("Ava Stone"),
            brand: { name: "Jeanery", priceRange: null, visitUrl: null },
            product: { available: true, price: "$50", pricedOn: "2026-10-21", url: "https://shop.example/products/c3-jeanery-bottom-1", shopDomain: "shop.example" },
          },
          {
            category: "shoes",
            item: "Product c3-stride-shoes-1",
            why: expect.stringContaining("Ava Stone"),
            brand: { name: "Stride", priceRange: null, visitUrl: null },
            product: { available: true, price: "$60", pricedOn: "2026-10-21", url: "https://shop.example/products/c3-stride-shoes-1", shopDomain: "shop.example" },
          },
        ],
      },
    ]);
  });

  it("keep all of their Product's fields and no hidden Preview description, which the database holds them to", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    const consultationId = await start(await signedInUser({ stylePreference: "womenswear" }), "body_only");
    await harness.stylings.runPending();
    const [productPiece] = await harness.db
      .select({ id: piece.id })
      .from(piece)
      .innerJoin(outfit, eq(outfit.id, piece.outfitId))
      .where(and(eq(outfit.consultationId, consultationId), isNotNull(piece.productId)))
      .limit(1);
    const thatPiece = eq(piece.id, productPiece!.id);

    await expect(harness.db.update(piece).set({ price: null }).where(thatPiece)).rejects.toThrow();
    await expect(harness.db.update(piece).set({ details: "A navy overshirt with two chest pockets." }).where(thatPiece)).rejects.toThrow();
    await expect(harness.db.update(piece).set({ brandEntityId: null, brandName: null }).where(thatPiece)).rejects.toThrow();
  });

  it("are searched for once per Piece, for its Brand alone, in the Outfit's line and the market, new and in stock, within the Brand's price range in a US-dollar market", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "US" });

    await start(browser, "body_only");
    await harness.stylings.runPending();

    // Each Outfit's One-Piece too, on its Top Brand: Bolt's and Dune's.
    expect(productSearchesSent().map(({ brandId, category, gender, market, priceRange }) => [brandId, category, gender, market, priceRange])).toEqual([
      ["c3-bolt", "bottom", "female", "US", { min: 20, max: 120 }],
      ["c3-bolt", "one_piece", "female", "US", { min: 20, max: 120 }],
      ["c3-bolt", "top", "female", "US", { min: 20, max: 120 }],
      // Dune has no price range, so its searches have no price filter.
      ["c3-dune", "one_piece", "female", "US", null],
      ["c3-dune", "top", "female", "US", null],
      ["c3-jeanery", "bottom", "female", "US", { min: 50, max: 110 }],
      ["c3-sole", "shoes", "female", "US", { min: 40, max: 90 }],
      ["c3-stride", "shoes", "female", "US", { min: 60, max: 180 }],
    ]);
    for (const { body } of browseRequests()) {
      expect(body).toMatchObject({ filters: { brand_ids: [expect.any(String)], conditions: ["new"], availability: ["InStock"] }, config: { country: "US" } });
    }
  });

  it("are searched for in a market priced in another currency within the Brand's price range converted into it with the day's rates, in whole units around it, keeping that market and their offers' currency", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    await storeExchangeRates({ GBP: 0.74925, EUR: 0.89166 });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "GB" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    // Bolt's 20–120 dollars are 14.99–89.91 pounds, Jeanery's 50–110 are 37.46–82.42, and Stride's 60–180 are 44.96–134.87.
    expect(productSearchesSent().map(({ brandId, category, market, priceRange }) => [brandId, category, market, priceRange])).toEqual([
      ["c3-bolt", "one_piece", "GB", { min: 14, max: 90 }],
      ["c3-bolt", "top", "GB", { min: 14, max: 90 }],
      ["c3-jeanery", "bottom", "GB", { min: 37, max: 83 }],
      ["c3-stride", "shoes", "GB", { min: 44, max: 135 }],
    ]);
    // The fake Channel3 prices each Product at 45 within the filter.
    expect((await productPiecesOf(consultationId)).map(({ market, price, currency }) => [market, price, currency])).toEqual([
      ["GB", 45, "GBP"],
      ["GB", 45, "GBP"],
      ["GB", 45, "GBP"],
    ]);
  });

  it("are searched for in the euro-wide market within the Brand's price range in euros", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    await storeExchangeRates({ EUR: 0.89166 });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "LU" });

    await start(browser, "body_only");
    await harness.stylings.runPending();

    // Bolt's 20–120 dollars are 17.83–106.9992 euros.
    expect(productSearchesSent().find(({ brandId, category }) => brandId === "c3-bolt" && category === "top")).toMatchObject({
      market: "EU",
      priceRange: { min: 17, max: 107 },
    });
  });

  it("break the Styling, sending no search, when no rate is stored for the market's currency, rather than search beyond the Brand's price range", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    await storeExchangeRates({ EUR: 0.89166 });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "GB" });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "no_outfits",
      failedStyling: { kind: "first", reason: "something_broke" },
    });
    expect(productSearchesSent()).toEqual([]);
    expect(JSON.stringify(errors.mock.calls)).toContain("GBP");
  });

  it("link to the Brand's own store when it sells them, by Qloo's official site, and otherwise to their first new, in-stock offer", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    harness.channel3.respond = channel3SellingEveryBrand({
      products: ({ brandId, category, gender }) => [
        channel3Product(`${brandId}-${category}`, {
          brandIds: [brandId],
          gender,
          offers: [
            channel3Offer({ url: "https://resale.example/p", domain: "resale.example", price: 20, condition: "used" }),
            channel3Offer({ url: "https://store.example/p", domain: "store.example", price: 70 }),
            channel3Offer({ url: `https://www.bolt.example/p/${category}`, domain: "www.bolt.example", price: 80 }),
          ],
        }),
      ],
    });
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    // Bolt's official site is https://bolt.example/. Jeanery has none, and Stride's store doesn't sell it.
    expect((await productPiecesOf(consultationId)).map(({ category, offerUrl, offerShopDomain, price }) => [category, offerUrl, offerShopDomain, price])).toEqual([
      ["top", "https://www.bolt.example/p/top", "www.bolt.example", 80],
      ["bottom", "https://store.example/p", "store.example", 70],
      ["shoes", "https://store.example/p", "store.example", 70],
    ]);
  });

  it("come from the Style Icon's next Brand for a Piece whose search finds none that qualify, which stays out of that Category for the rest of the Styling", async () => {
    // Bolt's tops are all shown on a model.
    harness.channel3.respond = channel3SellingEveryBrand({
      products: (search) =>
        search.brandId === "c3-bolt" && search.category === "top"
          ? [channel3Product("bolt-on-model", { brandIds: ["c3-bolt"], images: [{ url: "https://images.example/bolt.jpg", cleaned_url: null, shot_type: "on_model" }] })]
          : channel3SmallCatalogue(search),
    });
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    // Bolt would otherwise be Ava Stone's Top, and Dune Bea Marsh's. Bolt can still be a Bottom.
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)])).toEqual([
      ["Ava Stone", ["Dune", "Jeanery", "Stride"]],
      ["Bea Marsh", ["Jeanery", "Bolt", "Sole"]],
    ]);
    expect(await styleIconStatuses(consultationId)).toEqual([
      ["Ava Stone", "used"],
      ["Bea Marsh", "used"],
      ["Cleo Hart", "unused"],
    ]);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 2, tailoringFailures: 0 })]);
    expect(productSearchesSent().filter(({ brandId, category }) => brandId === "c3-bolt" && category === "top")).toHaveLength(1);
    // The Brands are fixed before tailoring, which is never offered a Brand whose search found nothing.
    expect(harness.ai.tailoringRequests.flatMap((request) => request.pieces.flatMap((p) => (p.category === "top" ? [p.brand.name] : [])))).toEqual(["Dune", "Jeanery"]);
    expect(
      await harness.db
        .select({ top: outfit.topBrandEntityId, bottom: outfit.bottomBrandEntityId, shoes: outfit.shoesBrandEntityId })
        .from(outfit)
        .where(eq(outfit.consultationId, consultationId))
        .orderBy(asc(outfit.position)),
    ).toEqual([
      { top: "b-dune", bottom: "b-jeanery", shoes: "b-stride" },
      { top: "b-jeanery", bottom: "b-bolt", shoes: "b-sole" },
    ]);
  });

  it("come from the Style Icon's next Brand for a Piece whose search still errors after its retries, as when it finds none", async () => {
    const selling = channel3SellingEveryBrand();
    harness.channel3.respond = (request) =>
      request.url.pathname === "/v1/browse" && channel3Search(request).brandId === "c3-bolt" && channel3Search(request).category === "top"
        ? Response.json({ detail: "Internal error" }, { status: 500 })
        : selling(request);
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)])).toEqual([
      ["Ava Stone", ["Dune", "Jeanery", "Stride"]],
      ["Bea Marsh", ["Jeanery", "Bolt", "Sole"]],
    ]);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 2, tailoringFailures: 0 })]);
    expect(productSearchesSent().filter(({ brandId, category }) => brandId === "c3-bolt" && category === "top")).toHaveLength(1);
  });

  it("must each be found for an Outfit: a Style Icon left with no Brand for a Piece is skipped for the next, without counting as a tailoring failure", async () => {
    // Stride is the only footwear Brand Ava Stone's fans favour, and it sells no women's shoes.
    harness.qloo.respond = qlooAnswering({ female: WOMEN }, (styleIconId) => (styleIconId === "w-1" ? BRANDS.filter((b) => b.name !== "Sole" && b.name !== "Pace") : BRANDS));
    harness.channel3.respond = channel3SellingEveryBrand({
      products: (search) => (search.brandId === "c3-stride" && search.category === "shoes" ? [] : channel3SmallCatalogue(search)),
    });
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)])).toEqual([
      ["Bea Marsh", ["Bolt", "Jeanery", "Sole"]],
      ["Cleo Hart", ["Dune", "Bolt", "Pace"]],
    ]);
    expect(await styleIconStatuses(consultationId)).toEqual([
      ["Ava Stone", "skipped"],
      ["Bea Marsh", "used"],
      ["Cleo Hart", "used"],
    ]);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 2, tailoringFailures: 0 })]);
    expect(harness.ai.tailoringRequests.map((request) => request.styleIconName)).not.toContain("Ava Stone");
    expect(productSearchesSent().filter(({ brandId, category }) => brandId === "c3-stride" && category === "shoes")).toHaveLength(1);
  });

  it("are never searched for more loosely to fill a gap: each next Brand's search keeps the market, its own price range, new and in stock, and none is searched again", async () => {
    // Bolt's tops are all shown on a model, and Stride's shoes search keeps failing.
    harness.channel3.respond = channel3SellingEveryBrand({
      products: (search) => {
        if (search.brandId === "c3-stride" && search.category === "shoes") throw new Error("Channel3 is failing.");
        return search.brandId === "c3-bolt" && search.category === "top"
          ? [channel3Product("bolt-on-model", { brandIds: ["c3-bolt"], images: [{ url: "https://images.example/bolt.jpg", cleaned_url: null, shot_type: "on_model" }] })]
          : channel3SmallCatalogue(search);
      },
    });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "US" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.pieces.map((p) => p.brand?.name))).toEqual([
      ["Dune", "Jeanery", "Sole"],
      ["Jeanery", "Bolt", "Pace"],
    ]);
    expect(productSearchesSent().map(({ brandId, category, gender, market, priceRange }) => [brandId, category, gender, market, priceRange])).toEqual([
      ["c3-bolt", "bottom", "female", "US", { min: 20, max: 120 }],
      ["c3-bolt", "top", "female", "US", { min: 20, max: 120 }],
      // Each Outfit's One-Piece, on the Top Brand it ends up with.
      ["c3-dune", "one_piece", "female", "US", null],
      ["c3-dune", "top", "female", "US", null],
      ["c3-jeanery", "bottom", "female", "US", { min: 50, max: 110 }],
      ["c3-jeanery", "one_piece", "female", "US", { min: 50, max: 110 }],
      ["c3-jeanery", "top", "female", "US", { min: 50, max: 110 }],
      ["c3-pace", "shoes", "female", "US", { min: 30, max: 70 }],
      ["c3-sole", "shoes", "female", "US", { min: 40, max: 90 }],
      ["c3-stride", "shoes", "female", "US", { min: 60, max: 180 }],
    ]);
    for (const { body } of browseRequests()) {
      expect(body).toMatchObject({ filters: { conditions: ["new"], availability: ["InStock"] }, config: { country: "US" } });
    }
  });

  it("keep a Piece's Brand whose search errors on a try the step will retry and then answers", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    harness.stylings.searchRetries = 2;
    const selling = channel3SellingEveryBrand();
    let boltTopTries = 0;
    harness.channel3.respond = (request) => {
      if (request.url.pathname === "/v1/browse" && channel3Search(request).brandId === "c3-bolt" && channel3Search(request).category === "top") {
        boltTopTries += 1;
        if (boltTopTries <= 2) return Response.json({ detail: "Internal error" }, { status: 500 });
      }
      return selling(request);
    };
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(boltTopTries).toBe(3);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.pieces.map((p) => p.brand?.name))).toEqual([
      ["Bolt", "Jeanery", "Stride"],
    ]);
  });

  it("pass a Piece's Brand over only once its search still errors on the step's last try, each try asking for exactly the same", async () => {
    harness.stylings.searchRetries = 2;
    const selling = channel3SellingEveryBrand();
    harness.channel3.respond = (request) =>
      request.url.pathname === "/v1/browse" && channel3Search(request).brandId === "c3-bolt" && channel3Search(request).category === "top"
        ? Response.json({ detail: "Internal error" }, { status: 500 })
        : selling(request);
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "US" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    const boltTopTries = browseRequests().filter((request) => channel3Search(request).brandId === "c3-bolt" && channel3Search(request).category === "top");
    expect(boltTopTries.map(({ body }) => body)).toEqual(Array(3).fill(boltTopTries[0]!.body));
    expect(boltTopTries[0]!.body).toMatchObject({
      filters: { brand_ids: ["c3-bolt"], gender: "female", conditions: ["new"], availability: ["InStock"], price: { min_price: 20, max_price: 120 } },
      config: { country: "US" },
    });
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.pieces.map((p) => p.brand?.name))).toEqual([
      ["Dune", "Jeanery", "Stride"],
      ["Jeanery", "Bolt", "Sole"],
    ]);
  });

  it("break the Styling once every search it sent still errors after its retries, none answering, so the user can Try again rather than get other Brands", async () => {
    const selling = channel3SellingEveryBrand();
    harness.channel3.respond = (request) => (request.url.pathname === "/v1/browse" ? Response.json({ detail: "Internal error" }, { status: 500 }) : selling(request));
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "failed", failureReason: "something_broke", outfitsMade: 0 })]);
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "no_outfits",
      failedStyling: { kind: "first", reason: "something_broke" },
    });
    // Ava Stone's Top, Bottom and Shoes, 3 at once, and no next Brand's.
    expect(productSearchesSent().map(({ brandId, category }) => [brandId, category])).toEqual([
      ["c3-bolt", "top"],
      ["c3-jeanery", "bottom"],
      ["c3-stride", "shoes"],
    ]);
    expect(harness.ai.tailoringRequests).toEqual([]);
  });

  it.each([
    ["on a try the step would retry", 2],
    ["on the step's last try", 0],
  ])("break the Styling at once when the product search refuses the key %s, retrying no search and passing no Brand over", async (_, retries) => {
    harness.stylings.searchRetries = retries;
    const selling = channel3SellingEveryBrand();
    harness.channel3.respond = (request) =>
      request.url.pathname === "/v1/browse" && channel3Search(request).category === "top" ? channel3Forbidden() : selling(request);
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "failed", failureReason: "something_broke", outfitsMade: 0 })]);
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ failedStyling: { kind: "first", reason: "something_broke" } });
    // Ava Stone's Top, Bottom and Shoes, 3 at once: the Top's tried once, and no next Brand's.
    expect(productSearchesSent().map(({ brandId, category }) => [brandId, category])).toEqual([
      ["c3-bolt", "top"],
      ["c3-jeanery", "bottom"],
      ["c3-stride", "shoes"],
    ]);
    expect(harness.ai.tailoringRequests).toEqual([]);
  });

  it("are each Piece's search's candidates, kept only while the Styling runs, so a later Styling searches afresh", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "US" });
    const consultationId = await start(browser, "body_only");
    const keptWhileTailoring: number[] = [];
    harness.ai.duringCall = async (call) => {
      if (call === "tailorPieces") keptWhileTailoring.push((await candidatesOf(consultationId)).length);
    };

    await harness.stylings.runPending();

    // A search for each of the two Outfits' Top, Bottom, Shoes and One-Piece.
    expect(keptWhileTailoring).toEqual([8, 8]);
    expect(await candidatesOf(consultationId)).toEqual([]);
    harness.channel3.requests.length = 0;

    // From the top of the same Style Icons: Ava Stone's Outfit is Bolt, Jeanery and Stride again.
    await changeBudgetTier(harness.context(browser), consultationId, "low");
    await harness.stylings.runPending();

    expect(productSearchesSent().map(({ brandId, category }) => [brandId, category])).toEqual(
      expect.arrayContaining([
        ["c3-bolt", "top"],
        ["c3-jeanery", "bottom"],
        ["c3-stride", "shoes"],
      ]),
    );
    expect(await candidatesOf(consultationId)).toEqual([]);
  });

  it("are deleted when the Styling breaks, too", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    harness.ai.duringCall = async (call) => {
      if (call === "tailorPieces") throw new Error("The model is down.");
    };
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "failed", failureReason: "something_broke" })]);
    // Ava Stone's Top, Bottom, Shoes and One-Piece.
    expect(browseRequests()).toHaveLength(4);
    expect(await candidatesOf(consultationId)).toEqual([]);
  });

  it("are searched for at most 24 times in a Styling, leaving a position it can't fill within them unfilled, as when the Style Icons run out", async () => {
    // Bea Marsh's fans favour 20 Brands whose tops are never found, so her Top keeps moving on.
    const plainBrands = Array.from({ length: 20 }, (_, index) =>
      qlooBrand(`b-plain-${index + 1}`, `Plain${index + 1}`, { categories: ["apparel"], affinity: 0.8 - index / 100 }),
    );
    harness.qloo.respond = qlooAnswering({ female: WOMEN }, (styleIconId) =>
      styleIconId === "w-2" ? [...BRANDS.filter((b) => b.name === "Stride" || b.name === "Sole"), ...plainBrands] : BRANDS,
    );
    harness.channel3.respond = channel3SellingEveryBrand({
      products: (search) => (search.brandId.startsWith("c3-plain") && search.category === "top" ? [] : channel3SmallCatalogue(search)),
    });
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(browseRequests()).toHaveLength(24);
    // Ava Stone's Outfit was found within them; its One-Piece search, waiting on Bea Marsh's Top, never was.
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => [p.category, p.brand?.name])])).toEqual([
      [
        "Ava Stone",
        [
          ["top", "Bolt"],
          ["bottom", "Jeanery"],
          ["shoes", "Stride"],
        ],
      ],
    ]);
    expect(productSearchesSent().filter(({ category }) => category === "one_piece")).toEqual([]);
    expect(await stylingsOf(consultationId)).toEqual([
      expect.objectContaining({ status: "succeeded", outfitsWanted: 2, outfitsMade: 1, tailoringFailures: 0, productSearches: 24 }),
    ]);
    expect(await styleIconStatuses(consultationId)).toEqual([
      ["Ava Stone", "used"],
      ["Bea Marsh", "unused"],
      ["Cleo Hart", "unused"],
    ]);
    expect(harness.ai.tailoringRequests.map((request) => request.styleIconName)).toEqual(["Ava Stone"]);
  });

  it("count each search once, however many tries it takes, towards the Styling's 24 and this month's product searches", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    harness.stylings.searchRetries = 2;
    const selling = channel3SellingEveryBrand();
    let boltTopTries = 0;
    harness.channel3.respond = (request) => {
      if (request.url.pathname === "/v1/browse" && channel3Search(request).brandId === "c3-bolt" && channel3Search(request).category === "top") {
        boltTopTries += 1;
        if (boltTopTries <= 2) return Response.json({ detail: "Too many requests" }, { status: 429 });
      }
      return selling(request);
    };
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    // Ava Stone's Top, tried 3 times, and her Bottom, Shoes and One-Piece.
    expect(browseRequests()).toHaveLength(6);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 1, productSearches: 4 })]);
    expect(await harness.db.$count(usageRecord, eq(usageRecord.kind, "product_search"))).toBe(4);
  });

  it("come from the market of the user's Country as each Styling starts, which a Country change since doesn't move", async () => {
    // A fourth footwear Brand, so the later Outfits' Shoes needn't repeat.
    const tread = qlooBrand("b-tread", "Tread", { categories: ["footwear"], affinity: 0.75, price: [35, 75] });
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN }, () => [...BRANDS, tread]);
    await storeExchangeRates({ EUR: 0.89166 });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "US" });
    const userId = (await readSignedInUser(harness.context(browser)))!.id;
    const consultationId = await start(browser, "body_only");
    await harness.db.update(user).set({ countryCode: "DE" }).where(eq(user.id, userId));
    await harness.stylings.runPending();
    const firstMarkets = new Set(productSearchesSent().map(({ market }) => market));
    harness.channel3.requests.length = 0;

    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    expect(firstMarkets).toEqual(new Set(["US"]));
    expect(new Set(productSearchesSent().map(({ market }) => market))).toEqual(new Set(["DE"]));
    expect((await productPiecesOf(consultationId)).map(({ market }) => market)).toEqual(["US", "US", "US", "US", "US", "US", "DE", "DE", "DE", "DE", "DE", "DE"]);
  });
});

describe("a body photo's One-Pieces", () => {
  it.each([
    ["womenswear", WOMEN, "female", ["dresses", "jumpsuits-rompers", "overalls"]],
    ["menswear", MEN, "male", ["jumpsuits-rompers", "overalls"]],
  ] as const)(
    "are searched for once per %s Outfit, as its Top Brand's One-Pieces for the line, in the market, new and in stock, within the Brand's price range",
    async (stylePreference, people, gender, categoryIds) => {
      harness.qloo.respond = qlooAnswering({ [gender]: [people[0]] });
      const browser = await signedInUser({ stylePreference, countryCode: "US" });

      await start(browser, "body_only");
      await harness.stylings.runPending();

      // Bolt is the Top, at $20–$120.
      expect(browseRequests().filter((request) => channel3Search(request).category === "one_piece").map(({ body }) => body)).toEqual([
        {
          filters: {
            brand_ids: ["c3-bolt"],
            category_ids: categoryIds,
            gender,
            age: ["adult"],
            conditions: ["new"],
            availability: ["InStock"],
            price: { min_price: 20, max_price: 120 },
          },
          limit: 30,
          config: { country: "US" },
        },
      ]);
    },
  );

  it("are searched for on the Top Brand each Outfit ends up with, once its Top, Bottom and Shoes are found, never on a Brand its Top moved from", async () => {
    // Bolt's tops are all shown on a model.
    harness.channel3.respond = channel3SellingEveryBrand({
      products: (search) =>
        search.brandId === "c3-bolt" && search.category === "top"
          ? [channel3Product("bolt-on-model", { brandIds: ["c3-bolt"], images: [{ url: "https://images.example/bolt.jpg", cleaned_url: null, shot_type: "on_model" }] })]
          : channel3SmallCatalogue(search),
    });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "US" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.pieces.map((p) => p.brand?.name))).toEqual([
      ["Dune", "Jeanery", "Stride"],
      ["Jeanery", "Bolt", "Sole"],
    ]);
    // Dune has no price range, so its search has no price filter.
    expect(productSearchesSent().flatMap(({ brandId, category, priceRange }) => (category === "one_piece" ? [[brandId, priceRange]] : []))).toEqual([
      ["c3-dune", null],
      ["c3-jeanery", { min: 50, max: 110 }],
    ]);
  });

  it("are offered to tailoring beside the Top's candidates only when they pass every filter a Top or Bottom would: the Brand, the line or unisex, a garment-only photo, and a new, in-stock offer within the price range", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    // Bolt is the Top, at $20–$120.
    const boltOnePiece = (id: string, overrides: Parameters<typeof channel3Product>[1] = {}) =>
      channel3Product(id, { brandIds: ["c3-bolt"], gender: "female", offers: [channel3Offer({ price: 60 })], ...overrides });
    harness.channel3.respond = channel3SellingEveryBrand({
      products: (search) =>
        search.category === "one_piece"
          ? [
              boltOnePiece("linen-dress", { title: "Linen wrap midi dress", description: "A wrap midi dress in terracotta linen.", colors: ["#c0603f"] }),
              boltOnePiece("menswear-jumpsuit", { gender: "male" }),
              boltOnePiece("other-brand-dress", { brandIds: ["c3-someone-else"] }),
              boltOnePiece("on-model-dress", { images: [{ url: "https://images.example/on-model.jpg", cleaned_url: null, shot_type: "on_model" }] }),
              boltOnePiece("second-hand-dress", { offers: [channel3Offer({ price: 60, condition: "used" })] }),
              boltOnePiece("sold-out-dress", { offers: [channel3Offer({ price: 60, availability: "OutOfStock" })] }),
              boltOnePiece("pricey-dress", { offers: [channel3Offer({ price: 450 })] }),
              boltOnePiece("unisex-overalls", { gender: null, images: [{ url: "https://images.example/overalls.jpg", cleaned_url: null, shot_type: "flat_lay" }] }),
            ]
          : channel3SmallCatalogue(search),
    });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "US" });

    await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(harness.ai.tailoringRequests.map(({ pieces }) => pieces.map((p) => (p.category === "hairstyle" ? null : (p.onePieceCandidates ?? null))))).toEqual([
      [
        [
          { id: "linen-dress", title: "Linen wrap midi dress", description: "A wrap midi dress in terracotta linen.", colours: ["#c0603f"] },
          { id: "unisex-overalls", title: "Product unisex-overalls", description: "About product unisex-overalls.", colours: ["#1f2a44"] },
        ],
        null,
        null,
      ],
    ]);
  });

  it("make an Outfit one Product Piece in place of its Top and Bottom when tailoring picks one, which its card and Preview show as one", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    harness.ai.scenario = "one-piece";
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "US" });
    const consultationId = await start(browser, "body_only");
    harness.clock.set("2026-10-21T09:30:00Z");

    await harness.stylings.runPending();

    // The fake AI picks the Top Brand's first One-Piece: Bolt's.
    expect(await productPiecesOf(consultationId)).toEqual([
      {
        category: "one_piece",
        item: "Product c3-bolt-one_piece-1",
        details: null,
        brandName: "Bolt",
        productId: "c3-bolt-one_piece-1",
        productPhotoUrl: "https://cdn.channel3.test/c3-bolt-one_piece-1-cleaned.png",
        offerUrl: "https://shop.example/products/c3-bolt-one_piece-1",
        offerShopDomain: "shop.example",
        price: 45,
        currency: "USD",
        market: "US",
        pricedAt: new Date("2026-10-21T09:30:00Z"),
        available: true,
      },
      expect.objectContaining({ category: "shoes", item: "Product c3-stride-shoes-1", brandName: "Stride", price: 60 }),
    ]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toEqual([
      expect.objectContaining({
        styleIconName: "Ava Stone",
        // 45 and 60 dollars.
        total: "$105",
        pieces: [
          {
            category: "one_piece",
            item: "Product c3-bolt-one_piece-1",
            why: expect.stringContaining("Ava Stone"),
            brand: { name: "Bolt", priceRange: null, visitUrl: null },
            product: {
              available: true,
              price: "$45",
              pricedOn: "2026-10-21",
              url: "https://shop.example/products/c3-bolt-one_piece-1",
              shopDomain: "shop.example",
            },
          },
          expect.objectContaining({ category: "shoes", item: "Product c3-stride-shoes-1" }),
        ],
      }),
    ]);
    expect(harness.ai.previewRequests.map(({ pieces }) => pieces)).toEqual([
      [
        { category: "one_piece", title: "Product c3-bolt-one_piece-1", photo: productPhotoFingerprint("https://cdn.channel3.test/c3-bolt-one_piece-1-cleaned.png") },
        { category: "shoes", title: "Product c3-stride-shoes-1", photo: productPhotoFingerprint("https://cdn.channel3.test/c3-stride-shoes-1-cleaned.png") },
      ],
    ]);
  });

  it.each<[string, () => object[]]>([
    ["finds none that qualify", () => []],
    [
      "still errors after its retries",
      () => {
        throw new Error("Channel3 is failing.");
      },
    ],
  ])("leave an Outfit to separates when its One-Piece search %s, keeping its Top Brand and searching no other Brand's One-Pieces", async (_, onePieces) => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    harness.ai.scenario = "one-piece";
    harness.channel3.respond = channel3SellingEveryBrand({ products: (search) => (search.category === "one_piece" ? onePieces() : channel3SmallCatalogue(search)) });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "US" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.pieces.map((p) => [p.category, p.brand?.name]))).toEqual([
      [
        ["top", "Bolt"],
        ["bottom", "Jeanery"],
        ["shoes", "Stride"],
      ],
    ]);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 1, tailoringFailures: 0 })]);
    expect(productSearchesSent().flatMap(({ brandId, category }) => (category === "one_piece" ? [brandId] : []))).toEqual(["c3-bolt"]);
    // Tailoring is offered no One-Piece.
    expect(harness.ai.tailoringRequests.flatMap(({ pieces }) => pieces.filter((p) => p.category !== "hairstyle" && p.onePieceCandidates))).toEqual([]);
  });

  it('keep a One-Piece Outfit\'s left-out Bottom Brand reserved, so "Show 2 more Outfits" never gets it as a Bottom', async () => {
    // A fourth footwear Brand, so the later Outfits' Shoes needn't repeat.
    const tread = qlooBrand("b-tread", "Tread", { categories: ["footwear"], affinity: 0.75, price: [35, 75] });
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN }, () => [...BRANDS, tread]);
    harness.ai.styleIconScenarios = { "Ava Stone": "one-piece" };
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => [p.category, p.brand?.name])])).toEqual([
      // A One-Piece on Bolt, the Top Brand, which leaves out Jeanery, its Bottom Brand.
      [
        "Ava Stone",
        [
          ["one_piece", "Bolt"],
          ["shoes", "Stride"],
        ],
      ],
      [
        "Bea Marsh",
        [
          ["top", "Dune"],
          ["bottom", "Bolt"],
          ["shoes", "Sole"],
        ],
      ],
      // Jeanery, denim in Qloo's top 10, would be the Bottom if Ava Stone's Outfit hadn't kept it reserved.
      [
        "Cleo Hart",
        [
          ["top", "Jeanery"],
          ["bottom", "Dune"],
          ["shoes", "Pace"],
        ],
      ],
      [
        "Dana Reed",
        [
          ["top", "Ember"],
          ["bottom", "Hem"],
          ["shoes", "Tread"],
        ],
      ],
    ]);
  });
});

describe("a Consultation made before Products", () => {
  it("still shows each Piece as the item the AI described, with its Brand's price range and Visit link", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();

    await asMadeBeforeProducts(consultationId);

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toEqual([
      {
        id: expect.any(String),
        position: 1,
        styleIconName: "Ava Stone",
        preview: { state: "ready", url: expect.any(String) },
        // Stride 60–180, Bolt 20–120 and Jeanery 50–110.
        total: "$130–$410",
        leftOutOfTotal: 0,
        pieces: [
          { category: "hairstyle", item: expect.any(String), why: expect.stringContaining("Ava Stone"), brand: null, product: null },
          {
            category: "top",
            item: "Navy relaxed cotton overshirt",
            why: expect.any(String),
            brand: { name: "Bolt", priceRange: "$20–$120", visitUrl: "https://bolt.example/" },
            product: null,
          },
          // Jeanery has no official site, so no Visit link.
          {
            category: "bottom",
            item: "Navy relaxed cotton overshirt",
            why: expect.any(String),
            brand: { name: "Jeanery", priceRange: "$50–$110", visitUrl: null },
            product: null,
          },
          {
            category: "shoes",
            item: "Navy relaxed cotton overshirt",
            why: expect.any(String),
            brand: { name: "Stride", priceRange: "$60–$180", visitUrl: "https://stride.example/" },
            product: null,
          },
        ],
      },
      expect.objectContaining({
        position: 2,
        styleIconName: "Bea Marsh",
        // Sole 40–90 and Bolt 20–120; Dune has no price data.
        total: "$60–$210",
        pieces: [
          expect.objectContaining({ category: "hairstyle", brand: null, product: null }),
          expect.objectContaining({ category: "top", brand: { name: "Dune", priceRange: null, visitUrl: "https://dune.example/" }, product: null }),
          expect.objectContaining({ category: "bottom", brand: { name: "Bolt", priceRange: "$20–$120", visitUrl: "https://bolt.example/" }, product: null }),
          // Sole's official site is http, so no Visit link.
          expect.objectContaining({ category: "shoes", brand: { name: "Sole", priceRange: "$40–$90", visitUrl: null }, product: null }),
        ],
      }),
    ]);
  });

  it('never gets an older One-Piece Outfit\'s left-out Bottom Brand as a Bottom from "Show 2 more Outfits"', async () => {
    // A fourth footwear Brand, so the later Outfits' Shoes needn't repeat.
    const tread = qlooBrand("b-tread", "Tread", { categories: ["footwear"], affinity: 0.75, price: [35, 75] });
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN }, () => [...BRANDS, tread]);
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    await asMadeBeforeProducts(consultationId);
    // Ava Stone's Outfit was made as a One-Piece on Bolt, which left out Jeanery, its Bottom Brand.
    const [first] = await harness.db.select({ id: outfit.id }).from(outfit).where(and(eq(outfit.consultationId, consultationId), eq(outfit.position, 1)));
    await harness.db.delete(piece).where(and(eq(piece.outfitId, first!.id), eq(piece.category, "bottom")));
    await harness.db.update(piece).set({ category: "one_piece" }).where(and(eq(piece.outfitId, first!.id), eq(piece.category, "top")));

    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)])).toEqual([
      ["Ava Stone", ["Bolt", "Stride"]],
      ["Bea Marsh", ["Dune", "Bolt", "Sole"]],
      // Jeanery, denim in Qloo's top 10, would be the Bottom if Ava Stone's Outfit hadn't kept it reserved.
      ["Cleo Hart", ["Jeanery", "Dune", "Pace"]],
      ["Dana Reed", ["Ember", "Hem", "Tread"]],
    ]);
  });

  it.each([
    ['"Show 2 more Outfits"', (browser: TestBrowser, consultationId: string) => showMoreOutfits(harness.context(browser), consultationId)],
    ["a Budget Tier change", (browser: TestBrowser, consultationId: string) => changeBudgetTier(harness.context(browser), consultationId, "low")],
    ["a Photo Style change", (browser: TestBrowser, consultationId: string) => changePhotoStyle(harness.context(browser), consultationId, ["edgy"])],
  ])("gets Outfits whose Top, Bottom and Shoes are Products from %s", async (_, restyle) => {
    // A fourth footwear Brand, so the later Outfits' Shoes needn't repeat.
    const tread = qlooBrand("b-tread", "Tread", { categories: ["footwear"], affinity: 0.75, price: [35, 75] });
    harness.qloo.respond = qlooAnsweringByPhotoStyle({ casual: { female: SIX_WOMEN }, edgy: { female: EDGY_WOMEN } }, () => [...BRANDS, tread]);
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    await asMadeBeforeProducts(consultationId);
    const olderIds = (await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.id);

    expect(await restyle(browser, consultationId)).toEqual({ ok: true });
    await harness.stylings.runPending();

    const { outfits } = (await readConsultation(harness.context(browser), consultationId))!;
    const made = outfits.filter((o) => !olderIds.includes(o.id));
    expect(made.map((o) => o.pieces.map((p) => p.product !== null))).toEqual([
      [true, true, true],
      [true, true, true],
    ]);
    // Any older Outfit kept beside them is as it was.
    for (const older of outfits.filter((o) => olderIds.includes(o.id))) expect(older.pieces.map((p) => p.product)).toEqual([null, null, null]);
  });
});

describe("the prices a user sees", () => {
  it('are each Product\'s and the Outfit\'s total converted into the currency of the user\'s Country, marked "≈", each Product still dated', async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    await storeExchangeRates({ IDR: 17986, GBP: 0.74925 });
    // Indonesia searches the US market, whose Products are priced in dollars.
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "ID" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    const [shown] = (await readConsultation(harness.context(browser), consultationId))!.outfits;

    // 45, 50 and 60 dollars at 17,986 rupiah to the dollar.
    expect(shown).toMatchObject({
      total: "≈ Rp 2,787,830",
      pieces: [
        { category: "top", product: { price: "≈ Rp 809,370", pricedOn: "2026-10-16" } },
        { category: "bottom", product: { price: "≈ Rp 899,300", pricedOn: "2026-10-16" } },
        { category: "shoes", product: { price: "≈ Rp 1,079,160", pricedOn: "2026-10-16" } },
      ],
    });
  });

  it("are shown as their offers give them, unmarked, when they're in the currency of the user's Country", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "US" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits[0]).toMatchObject({
      total: "$155",
      pieces: [{ product: { price: "$45" } }, { product: { price: "$50" } }, { product: { price: "$60" } }],
    });
  });

  it("follow a change of Country into the new Country's currency, the Products themselves staying as they were found", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    await storeExchangeRates({ IDR: 17986, GBP: 0.74925 });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "ID" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    const found = await productPiecesOf(consultationId);
    const { username, stylePreference } = (await readSignedInUser(harness.context(browser)))!;

    expect(await updateProfile(harness.context(browser), { username, stylePreference, countryCode: "GB" })).toEqual({ ok: true });

    // 45, 50 and 60 dollars at 0.74925 pounds to the dollar.
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits[0]).toMatchObject({
      total: "≈ £116",
      pieces: [{ product: { price: "≈ £34" } }, { product: { price: "≈ £37" } }, { product: { price: "≈ £45" } }],
    });
    expect(await productPiecesOf(consultationId)).toEqual(found);
    expect(found.map(({ market, price, currency }) => [market, price, currency])).toEqual([
      ["US", 45, "USD"],
      ["US", 50, "USD"],
      ["US", 60, "USD"],
    ]);
  });

  it("stay in their offers' own currency, unmarked, when no rate is stored for the currency of the user's Country", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "ID" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits[0]).toMatchObject({
      total: "US$155",
      pieces: [{ product: { price: "US$45" } }, { product: { price: "US$50" } }, { product: { price: "US$60" } }],
    });
  });

  it("include an older Outfit's Brand price ranges, converted from US dollars the same way, its total a range", async () => {
    await storeExchangeRates({ GBP: 0.74925 });
    const browser = await signedInUser({ stylePreference: "womenswear", countryCode: "GB" });
    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();
    await asMadeBeforeProducts(consultationId);

    // Bolt 20–120, Jeanery 50–110 and Stride 60–180 dollars, which add up to 130–410.
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits[0]).toMatchObject({
      total: "≈ £97–£307",
      pieces: [
        { category: "hairstyle", brand: null },
        { category: "top", brand: { name: "Bolt", priceRange: "≈ £15–£90" }, product: null },
        { category: "bottom", brand: { name: "Jeanery", priceRange: "≈ £37–£82" }, product: null },
        { category: "shoes", brand: { name: "Stride", priceRange: "≈ £45–£135" }, product: null },
      ],
    });
  });
});

describe("each Outfit's Preview", () => {
  it("is stored privately as WebP once the Styling finishes, and shown through a link valid for 1 hour", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    harness.clock.set("2026-10-16T12:30:00Z");

    await harness.stylings.runPending();

    const { outfits, everyPreviewRefused } = (await readConsultation(harness.context(browser), consultationId))!;
    const stored = await previewsOf(consultationId);
    expect(stored).toEqual([
      { previewState: "ready", previewPathname: expect.stringMatching(`^consultations/${consultationId}/`), previewRefusalReason: null },
      { previewState: "ready", previewPathname: expect.stringMatching(`^consultations/${consultationId}/`), previewRefusalReason: null },
    ]);
    expect(outfits.map((o) => o.preview)).toEqual(
      stored.map(({ previewPathname }) => ({
        state: "ready",
        url: `https://blob.test/${previewPathname}?validUntil=2026-10-16T13:30:00.000Z`,
      })),
    );
    expect(everyPreviewRefused).toBe(false);
    for (const { previewPathname } of stored) {
      const preview = harness.blob.objects.get(previewPathname!)!;
      expect(preview.contentType).toBe("image/webp");
      // The fake draws the user's own photo with a banner, so it keeps the photo's size.
      expect(await sharp(preview.bytes).metadata()).toMatchObject({ format: "webp", width: 30, height: 40 });
    }
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", stage: "previews", outfitsMade: 2 })]);
  });

  it("is drawn from the photo, the Photo Type, the Hairstyle's details and each Product's title and Product photo, never the Style Icon", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();

    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    const hairstyle = (await piecesOf(consultationId)).find((p) => p.category === "hairstyle");
    expect(hairstyle).toMatchObject({ details: expect.any(String) });
    expect(harness.ai.previewRequests).toEqual([
      {
        photo: { mediaType: "image/jpeg", sha256: sha256(harness.blob.objects.get(stored!.photoPathname)!.bytes) },
        photoType: "full_body",
        pieces: [
          { category: "hairstyle", details: hairstyle!.details },
          { category: "top", title: "Product c3-bolt-top-1", photo: productPhotoFingerprint("https://cdn.channel3.test/c3-bolt-top-1-cleaned.png") },
          { category: "bottom", title: "Product c3-jeanery-bottom-1", photo: productPhotoFingerprint("https://cdn.channel3.test/c3-jeanery-bottom-1-cleaned.png") },
          { category: "shoes", title: "Product c3-stride-shoes-1", photo: productPhotoFingerprint("https://cdn.channel3.test/c3-stride-shoes-1-cleaned.png") },
        ],
      },
    ]);
    expect(JSON.stringify(harness.ai.previewRequests)).not.toContain("Ava Stone");
  });

  it.each<[string, (url: URL, signal: AbortSignal) => Response | Promise<Response>]>([
    ["can't be reached", () => Promise.reject(new TypeError("fetch failed"))],
    ["answers with an error", () => new Response("Not found", { status: 404 })],
    ["isn't an image, whatever its content type says", () => new Response("<html>Sold out</html>", { headers: { "content-type": "image/png" } })],
    ["answers too late", (_url, signal) => neverAnswering(signal)],
    ["is too big", (url) => new Response(new Uint8Array([...productPhotoBytes(url), ...new Uint8Array(PRODUCT_PHOTO_MAX_BYTES)]))],
  ])("draws a Product from its title when its photo %s, the Product staying real on the card", async (_how, respond) => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const topPhoto = "https://cdn.channel3.test/c3-bolt-top-1-cleaned.png";
    harness.productPhotos.respond = (url, signal) => (String(url) === topPhoto ? respond(url, signal) : productPhoto(url));

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect(harness.ai.previewRequests.map(({ pieces }) => pieces)).toEqual([
      [
        { category: "top", title: "Product c3-bolt-top-1", photo: null },
        { category: "bottom", title: "Product c3-jeanery-bottom-1", photo: productPhotoFingerprint("https://cdn.channel3.test/c3-jeanery-bottom-1-cleaned.png") },
        { category: "shoes", title: "Product c3-stride-shoes-1", photo: productPhotoFingerprint("https://cdn.channel3.test/c3-stride-shoes-1-cleaned.png") },
      ],
    ]);
    const { outfits } = (await readConsultation(harness.context(browser), consultationId))!;
    expect(outfits).toMatchObject([
      {
        preview: { state: "ready" },
        pieces: [
          { category: "top", item: "Product c3-bolt-top-1", product: { url: "https://shop.example/products/c3-bolt-top-1", shopDomain: "shop.example" } },
          { category: "bottom", item: "Product c3-jeanery-bottom-1" },
          { category: "shoes", item: "Product c3-stride-shoes-1" },
        ],
      },
    ]);
  });

  it("is tried again when a Product photo fails on a try the step will retry, without asking the image model", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    harness.stylings.previewRetries = 3;
    const topPhoto = "https://cdn.channel3.test/c3-bolt-top-1-cleaned.png";
    let topTries = 0;
    harness.productPhotos.respond = (url) => (String(url) === topPhoto && ++topTries === 1 ? new Response("Busy", { status: 503 }) : productPhoto(url));

    await start(await signedInUser({ stylePreference: "womenswear" }), "body_only");
    await harness.stylings.runPending();

    expect(topTries).toBe(2);
    expect(harness.ai.previewRequests.map(({ pieces }) => pieces)).toEqual([
      [
        { category: "top", title: "Product c3-bolt-top-1", photo: productPhotoFingerprint(topPhoto) },
        { category: "bottom", title: "Product c3-jeanery-bottom-1", photo: productPhotoFingerprint("https://cdn.channel3.test/c3-jeanery-bottom-1-cleaned.png") },
        { category: "shoes", title: "Product c3-stride-shoes-1", photo: productPhotoFingerprint("https://cdn.channel3.test/c3-stride-shoes-1-cleaned.png") },
      ],
    ]);
  });

  it("draws a Product from its title only once the step's last try still can't fetch its photo", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    harness.stylings.previewRetries = 3;
    const topPhoto = "https://cdn.channel3.test/c3-bolt-top-1-cleaned.png";
    let topTries = 0;
    harness.productPhotos.respond = (url) => (String(url) === topPhoto && ++topTries ? new Response("Busy", { status: 503 }) : productPhoto(url));

    const consultationId = await start(await signedInUser({ stylePreference: "womenswear" }), "body_only");
    await harness.stylings.runPending();

    expect(topTries).toBe(4);
    expect(harness.ai.previewRequests.map(({ pieces }) => pieces[0])).toEqual([{ category: "top", title: "Product c3-bolt-top-1", photo: null }]);
    expect(await previewsOf(consultationId)).toEqual([expect.objectContaining({ previewState: "ready" })]);
  });

  it("takes a Product photo as a JPEG, PNG or WebP image by its first bytes, whatever its content type says", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    const formats: Record<string, ProductPhotoFormat> = { top: "jpeg", bottom: "webp", shoes: "png" };
    harness.productPhotos.respond = (url) =>
      productPhoto(url, { format: formats[/-(top|bottom|shoes)-/.exec(url.pathname)![1]!], contentType: "application/octet-stream" });

    await start(await signedInUser({ stylePreference: "womenswear" }), "body_only");
    await harness.stylings.runPending();

    expect(harness.ai.previewRequests.map(({ pieces }) => pieces)).toEqual([
      [
        { category: "top", title: "Product c3-bolt-top-1", photo: productPhotoFingerprint("https://cdn.channel3.test/c3-bolt-top-1-cleaned.png", "jpeg") },
        { category: "bottom", title: "Product c3-jeanery-bottom-1", photo: productPhotoFingerprint("https://cdn.channel3.test/c3-jeanery-bottom-1-cleaned.png", "webp") },
        { category: "shoes", title: "Product c3-stride-shoes-1", photo: productPhotoFingerprint("https://cdn.channel3.test/c3-stride-shoes-1-cleaned.png", "png") },
      ],
    ]);
  });

  it("never keeps a Product photo: nothing of it reaches Blob, the database or the logs, even from a try that failed", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    // The first try of the Preview fails after fetching the photos, so its error goes by too.
    harness.stylings.previewRetries = 1;
    harness.ai.previewScenarios = ["preview-fails"];
    const logs = (["log", "info", "warn", "error"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    const photos = harness.productPhotos.requests.map((url) => productPhotoBytes(url));
    expect(photos).toHaveLength(6);
    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    const [preview] = await previewsOf(consultationId);
    expect(preview).toMatchObject({ previewState: "ready" });
    expect([...harness.blob.objects.keys()].toSorted()).toEqual([stored!.photoPathname, preview!.previewPathname].toSorted());
    for (const { bytes } of harness.blob.objects.values()) {
      for (const photo of photos) expect(Buffer.from(bytes).includes(Buffer.from(photo))).toBe(false);
    }
    const everywhere = [await everyRowAsText(), ...logs.flatMap((log) => log.mock.calls.map((args) => inspect(args, { depth: Infinity })))].join("\n");
    for (const photo of photos) {
      for (const encoding of ["base64", "hex", "utf8"] as const) expect(everywhere).not.toContain(Buffer.from(photo).toString(encoding));
    }
    expect(everywhere).not.toContain("the bytes of the Product photo");
  });

  it("fetches each Product's photo by the URL its Piece saved", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    const consultationId = await start(await signedInUser({ stylePreference: "womenswear" }), "body_only");

    await harness.stylings.runPending();

    const saved = (await productPiecesOf(consultationId)).map(({ productPhotoUrl }) => productPhotoUrl);
    expect(saved).toHaveLength(3);
    expect(harness.productPhotos.requests.map(String).toSorted()).toEqual(saved.toSorted());
  });

  it("is a placeholder when the image model declines, which is final, with every Piece still shown", async () => {
    harness.ai.scenario = "preview-refused";
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");

    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      everyPreviewRefused: true,
      outfits: [
        { styleIconName: "Ava Stone", preview: { state: "refused" }, pieces: [expect.objectContaining({ category: "hairstyle" })] },
        { styleIconName: "Bea Marsh", preview: { state: "refused" }, pieces: [expect.objectContaining({ category: "hairstyle" })] },
      ],
    });
    expect(await previewsOf(consultationId)).toEqual([
      { previewState: "refused", previewPathname: null, previewRefusalReason: "image_safety" },
      { previewState: "refused", previewPathname: null, previewRefusalReason: "image_safety" },
    ]);
    // Asked once each: a refusal is never asked again.
    expect(harness.ai.previewRequests).toHaveLength(2);
    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    expect([...harness.blob.objects.keys()]).toEqual([stored!.photoPathname]);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 2 })]);
  });

  it("is a placeholder when the image model fails without declining, marked failed as the Styling finishes", async () => {
    harness.ai.scenario = "preview-fails";
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");

    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      everyPreviewRefused: false,
      outfits: [
        { styleIconName: "Ava Stone", preview: { state: "failed" }, pieces: [expect.objectContaining({ category: "hairstyle" })] },
        { styleIconName: "Bea Marsh", preview: { state: "failed" }, pieces: [expect.objectContaining({ category: "hairstyle" })] },
      ],
    });
    expect(await previewsOf(consultationId)).toEqual([
      { previewState: "failed", previewPathname: null, previewRefusalReason: null },
      { previewState: "failed", previewPathname: null, previewRefusalReason: null },
    ]);
    expect(await stylingsOf(consultationId)).toEqual([
      expect.objectContaining({ status: "succeeded", outfitsMade: 2, failureReason: null }),
    ]);
  });

  it("hints at a different photo only when every Preview was refused", async () => {
    harness.ai.previewScenarios = ["preview-refused"];
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");

    await harness.stylings.runPending();

    const { outfits, everyPreviewRefused } = (await readConsultation(harness.context(browser), consultationId))!;
    expect(outfits.map((o) => o.preview.state).toSorted()).toEqual(["ready", "refused"]);
    expect(everyPreviewRefused).toBe(false);
  });
});

describe("what Qloo receives", () => {
  it("is nothing that identifies the user, their Consultation or their photo", async () => {
    const browser = await signedInUser({ username: "Ziggy.Quartz", email: "ziggy.quartz@example.com", stylePreference: "no_preference" });
    const consultationId = await start(browser, "full_body");
    const [stylingId] = harness.stylings.pending;

    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toHaveLength(2);
    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    const identifiers = [
      (await readSignedInUser(harness.context(browser)))!.id,
      "Ziggy.Quartz",
      "ziggy.quartz",
      "ziggy.quartz@example.com",
      "example.com",
      consultationId,
      stylingId!,
      stored!.photoPathname,
    ];
    // Two person calls, and Brand calls for the first 3 Style Icons.
    expect(harness.qloo.requests).toHaveLength(5);
    for (const request of harness.qloo.requests) {
      expect([...request.headers.keys()]).toEqual(["x-api-key"]);
      for (const sent of [decodeURIComponent(request.url.href), ...request.headers.values()]) {
        for (const identifier of identifiers) expect(sent.toLowerCase()).not.toContain(identifier.toLowerCase());
      }
    }
  });

  it("is the same for two users with the same profile, so nothing links two calls to one user", async () => {
    const profile = { stylePreference: "womenswear", countryCode: "FR", birthDate: { day: "1", month: "6", year: "1990" } } as const;
    await start(await signedInUser(profile), "full_body");
    await harness.stylings.runPending();
    await harness.db.delete(qlooCache);

    await start(await signedInUser(profile), "full_body");
    await harness.stylings.runPending();

    const firstUser = harness.qloo.requests.slice(0, harness.qloo.requests.length / 2);
    const secondUser = harness.qloo.requests.slice(harness.qloo.requests.length / 2);
    expect(secondUser.map((request) => request.url.href).toSorted()).toEqual(firstUser.map((request) => request.url.href).toSorted());
  });
});

describe("a first Styling that can't build anything", () => {
  it("fails as nothing could be built when Qloo finds no Style Icon, and the Consultation shows No Outfits", async () => {
    harness.qloo.respond = () => qlooResponse([]);
    const browser = await signedInUser();
    const consultationId = await start(browser, "full_body");
    harness.clock.set("2026-10-16T12:01:00Z");

    await harness.stylings.runPending();

    expect(await stylingsOf(consultationId)).toEqual([
      expect.objectContaining({
        status: "failed",
        failureReason: "nothing_built",
        outfitsMade: 0,
        finishedAt: new Date("2026-10-16T12:01:00Z"),
      }),
    ]);
    // The Consultation is kept, saying what it couldn't build at, so another Budget Tier or Photo
    // Style can be tried from the same photo.
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "no_outfits",
      outfits: [],
      failedStyling: { kind: "first", budgetTier: "no_budget", reason: "nothing_built" },
    });
    expect(await readStylingStatus(harness.context(browser), consultationId)).toEqual({ state: "no_outfits", progress: null });
  });

  it("keeps a Face Photo's Consultation too, with no Budget Tier to say it couldn't build at", async () => {
    harness.qloo.respond = () => qlooResponse([]);
    const browser = await signedInUser();
    const consultationId = await start(browser, "face");

    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "no_outfits",
      failedStyling: { kind: "first", budgetTier: null, reason: "nothing_built" },
    });
  });

  it("fails as something broke when Qloo keeps failing, keeping nothing", async () => {
    harness.qloo.respond = () => Response.json({ error: "Internal Server Error" }, { status: 500 });
    const browser = await signedInUser();
    const consultationId = await start(browser, "full_body");

    await harness.stylings.runPending();

    expect(await stylingsOf(consultationId)).toEqual([
      expect.objectContaining({ status: "failed", failureReason: "something_broke", stage: "style_icons", outfitsMade: 0 }),
    ]);
    expect(await harness.db.select().from(styleIcon).where(eq(styleIcon.consultationId, consultationId))).toEqual([]);
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "no_outfits",
      outfits: [],
      failedStyling: { kind: "first", budgetTier: "no_budget", reason: "something_broke" },
    });
  });

  it("makes the one Outfit it can when Qloo finds a single Style Icon, and succeeds", async () => {
    harness.qloo.respond = qlooAnswering({ male: [MEN[0]!, { ...MEN[1]!, properties: { date_of_death: "2020-01-01" } }] });
    const browser = await signedInUser({ stylePreference: "menswear" });
    const consultationId = await start(browser, "full_body");

    await harness.stylings.runPending();

    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsWanted: 2, outfitsMade: 1 })]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual([
      "Dev Rowe",
    ]);
  });
});

describe("a Styling that stops running while its steps are under way", () => {
  it("saves nothing late, and calls Qloo no more", async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser, "full_body");
    const [stylingId] = harness.stylings.pending;
    // As a cancelled or timed-out Styling is left.
    const ended = { status: "failed", failureReason: "something_broke", finishedAt: new Date("2026-10-16T12:05:00Z") } as const;
    await harness.db.update(styling).set(ended).where(eq(styling.id, stylingId!));

    await harness.stylings.runPending();

    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining(ended)]);
    expect(await harness.db.select().from(styleIcon).where(eq(styleIcon.consultationId, consultationId))).toEqual([]);
    expect(harness.qloo.requests).toEqual([]);
  });

  it("stops widening a thin pool, calling Qloo no more", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] }, () => []);
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only");
    const [stylingId] = harness.stylings.pending;
    const ended = { status: "failed", failureReason: "something_broke", finishedAt: new Date("2026-10-16T12:05:00Z") } as const;
    // Ends as the first Brand call is answered, as a cancelled Styling would.
    harness.qloo.duringRequest = async (request) => {
      if (request.url.searchParams.get("filter.type") === "urn:entity:brand") await harness.db.update(styling).set(ended).where(eq(styling.id, stylingId!));
    };

    await harness.stylings.runPending();

    expect(brandCalls()).toHaveLength(1);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining(ended)]);
  });
});

describe("the Styling status", () => {
  it("is only for the Consultation's owner", async () => {
    const consultationId = await start(await signedInUser(), "full_body");

    expect(await readStylingStatus(harness.context(await signedInUser()), consultationId)).toBeNull();
    expect(await readStylingStatus(harness.context(new TestBrowser()), consultationId)).toBeNull();
  });

  it("follows the stage the Styling has reached, counting each Preview once it's made or declined", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    const checklist = watchChecklist(browser, consultationId);
    harness.ai.previewScenarios = ["preview-refused"];
    let previews = 0;
    harness.ai.duringCall = async (call) => {
      // The second Preview is still being made once the first is declined.
      if (call === "renderPreview" && ++previews === 2) {
        await vi.waitFor(async () => expect((await checklist.look())?.previews.done).toBe(1));
      }
      await checklist.look();
    };

    await harness.stylings.runPending();

    expect(checklist.seen).toEqual([
      { kind: "first", stage: "style_icons", previews: { done: 0, of: 2 }, slow: false },
      { kind: "first", stage: "building_outfits", previews: { done: 0, of: 2 }, slow: false },
      { kind: "first", stage: "previews", previews: { done: 0, of: 2 }, slow: false },
      { kind: "first", stage: "previews", previews: { done: 1, of: 2 }, slow: false },
      // As the Stylist finishes.
      { kind: "first", stage: "previews", previews: { done: 2, of: 2 }, slow: false },
    ]);
  });

  it("counts Previews of the Outfits the Styling made, once it made fewer than it meant to", async () => {
    harness.qloo.respond = qlooAnswering({ male: [MEN[0]!] });
    const browser = await signedInUser({ stylePreference: "menswear" });
    const consultationId = await start(browser, "face");
    const checklist = watchChecklist(browser, consultationId);
    harness.ai.duringCall = async () => {
      await checklist.look();
    };

    await harness.stylings.runPending();

    expect(checklist.seen).toEqual([
      { kind: "first", stage: "style_icons", previews: { done: 0, of: 2 }, slow: false },
      { kind: "first", stage: "building_outfits", previews: { done: 0, of: 2 }, slow: false },
      { kind: "first", stage: "previews", previews: { done: 0, of: 1 }, slow: false },
      { kind: "first", stage: "previews", previews: { done: 1, of: 1 }, slow: false },
    ]);
  });

  it("says a stage is taking longer than usual once it has run for over 60 s", async () => {
    const browser = await signedInUser();
    harness.clock.set("2026-10-16T12:30:00Z");
    const consultationId = await start(browser, "face");
    const slow = async () => (await readStylingStatus(harness.context(browser), consultationId))?.progress?.slow;

    harness.clock.set("2026-10-16T12:31:00Z");
    expect(await slow()).toBe(false);
    harness.clock.set("2026-10-16T12:31:01Z");
    expect(await slow()).toBe(true);
  });

  it("times each stage from when the Styling reached it", async () => {
    const browser = await signedInUser();
    harness.clock.set("2026-10-16T12:30:00Z");
    const consultationId = await start(browser, "face");
    const slow = async () => (await readStylingStatus(harness.context(browser), consultationId))?.progress?.slow;
    // Finding Style Icons takes 2 minutes.
    harness.clock.set("2026-10-16T12:32:00Z");
    const seen: (boolean | undefined)[] = [];
    let looked = false;
    // The Stylist's second turn is its first at Building Outfits, once it has found the Style Icons.
    harness.ai.duringCall = async (call) => {
      if (call !== "stylistModel" || harness.ai.stylistRequests.at(-1)?.turn !== 2 || looked) return;
      looked = true;
      seen.push(await slow());
      harness.clock.set("2026-10-16T12:33:01Z");
      seen.push(await slow());
    };

    await harness.stylings.runPending();

    expect(seen).toEqual([false, true]);
  });
});

describe('"Show 2 more Outfits"', () => {
  it("adds a Face Photo's next two Style Icons' Hairstyles below the current Outfits, which stay meanwhile, without asking Qloo for Style Icons again", async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();

    expect(await showMoreOutfits(harness.context(browser), consultationId)).toEqual({ ok: true });
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual([
      "Ava Stone",
      "Bea Marsh",
    ]);
    await harness.stylings.runPending();

    const { outfits } = (await readConsultation(harness.context(browser), consultationId))!;
    expect(outfits.map((o) => [o.position, o.styleIconName, o.pieces.map((p) => p.category)])).toEqual([
      [1, "Ava Stone", ["hairstyle"]],
      [2, "Bea Marsh", ["hairstyle"]],
      [3, "Cleo Hart", ["hairstyle"]],
      [4, "Dana Reed", ["hairstyle"]],
    ]);
    expect(personCalls()).toHaveLength(1);
    expect(brandCalls()).toEqual([]);
  });

  it("builds a body photo's Outfits on the next Style Icons' Brands, repeating none in a Category across the current Outfits and the new ones", async () => {
    // A fourth footwear Brand, so the new Outfits' Shoes needn't repeat.
    const tread = qlooBrand("b-tread", "Tread", { categories: ["footwear"], affinity: 0.75, price: [35, 75] });
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN }, () => [...BRANDS, tread]);
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    await harness.db.delete(qlooCache);
    harness.qloo.requests.length = 0;

    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)])).toEqual([
      ["Ava Stone", ["Bolt", "Jeanery", "Stride"]],
      ["Bea Marsh", ["Dune", "Bolt", "Sole"]],
      ["Cleo Hart", ["Jeanery", "Dune", "Pace"]],
      ["Dana Reed", ["Ember", "Hem", "Tread"]],
    ]);
    // Brands only for the two Style Icons it needs, and no Style Icons asked for again.
    expect(brandCalls().map((params) => params.get("signal.interests.entities")).toSorted()).toEqual(["w-3", "w-4"]);
    expect(personCalls()).toEqual([]);
  });

  it("shows in the Styling status as adding to the Outfits, from Building Outfits: at Brands for a body photo, straight to tailoring for a Face Photo", async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    // Two users, since each runs one Styling at a time.
    const bodyOnlyUser = await signedInUser({ stylePreference: "womenswear" });
    const faceUser = await signedInUser({ stylePreference: "womenswear" });
    const bodyOnly = await start(bodyOnlyUser, "body_only");
    const face = await start(faceUser, "face");
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:10:00Z");

    await showMoreOutfits(harness.context(bodyOnlyUser), bodyOnly);
    await showMoreOutfits(harness.context(faceUser), face);

    expect(await readStylingStatus(harness.context(bodyOnlyUser), bodyOnly)).toEqual({
      state: "styling",
      progress: { kind: "more", stage: "brands", previews: { done: 0, of: 2 }, slow: false },
    });
    expect(await readStylingStatus(harness.context(faceUser), face)).toEqual({
      state: "styling",
      progress: { kind: "more", stage: "building_outfits", previews: { done: 0, of: 2 }, slow: false },
    });
    expect(await stylingsOfKind(face, "more")).toEqual([expect.objectContaining({ stageMovedAt: new Date("2026-10-16T12:10:00Z") })]);
  });

  it("makes what it can as the Style Icons run out, then says that's every Outfit and starts no more", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ everyOutfitBuilt: false });

    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      everyOutfitBuilt: true,
      outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }, { position: 3, styleIconName: "Cleo Hart" }],
    });
    expect(await stylingsOfKind(consultationId, "more")).toEqual([expect.objectContaining({ status: "succeeded", outfitsWanted: 2, outfitsMade: 1 })]);
    expect(await showMoreOutfits(harness.context(browser), consultationId)).toEqual({ ok: false, refusal: "every-outfit-built" });
    expect(harness.stylings.pending).toEqual([]);
  });

  it("keeps the current Outfits when it builds nothing, after fetching Brands for at most 6 Style Icons, and then says that's every Outfit", async () => {
    const tenWomen = [...SIX_WOMEN, ...["Gia Penn", "Hana Moor", "Ivy Lane", "Jo Park"].map((name, index) => qlooPerson(`w-${index + 7}`, name, 0.78 - index / 100))];
    // Only Ava Stone's, Bea Marsh's and Jo Park's fans favour Brands that make a whole Outfit.
    harness.qloo.respond = qlooAnswering({ female: tenWomen }, (styleIconId) => (["w-1", "w-2", "w-10"].includes(styleIconId) ? BRANDS : []));
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    await harness.db.delete(qlooCache);
    harness.qloo.requests.length = 0;

    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    expect(await stylingsOfKind(consultationId, "more")).toEqual([expect.objectContaining({ status: "failed", failureReason: "nothing_built", outfitsMade: 0 })]);
    expect(new Set(brandCalls().map((params) => params.get("signal.interests.entities")))).toEqual(new Set(["w-3", "w-4", "w-5", "w-6", "w-7", "w-8"]));
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      everyOutfitBuilt: true,
      outfits: [{ position: 1, styleIconName: "Ava Stone" }, { position: 2, styleIconName: "Bea Marsh" }],
    });
    expect(await showMoreOutfits(harness.context(browser), consultationId)).toEqual({ ok: false, refusal: "every-outfit-built" });
  });

  it("makes one Outfit when the Outfit Allowance has one left", async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();
    // With the first Styling's 2, that's 9 of the 10.
    const userId = (await readSignedInUser(harness.context(browser)))!.id;
    await recordUsage(harness.db, { kind: "outfit", userId, at: harness.clock.now() }, 7);

    await showMoreOutfits(harness.context(browser), consultationId);
    expect(await readStylingStatus(harness.context(browser), consultationId)).toMatchObject({ progress: { previews: { of: 1 } } });
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      everyOutfitBuilt: false,
      outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }, { position: 3, styleIconName: "Cleo Hart" }],
    });
    expect(await stylingsOfKind(consultationId, "more")).toEqual([expect.objectContaining({ status: "succeeded", outfitsWanted: 1, outfitsMade: 1 })]);
  });

  it("starts nothing more while a Styling runs on the Consultation", async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    expect(await showMoreOutfits(harness.context(browser), consultationId)).toEqual({ ok: false, refusal: "already-styling" });
    await harness.stylings.runPending();

    const [first, second] = await Promise.all([
      showMoreOutfits(harness.context(browser), consultationId),
      showMoreOutfits(harness.context(browser), consultationId),
    ]);

    expect([first, second]).toContainEqual({ ok: true });
    expect([first, second]).toContainEqual({ ok: false, refusal: "already-styling" });
    expect(harness.stylings.pending).toHaveLength(1);
  });

  it("goes through the shared start check, starting nothing once the Outfit Allowance is used up or from a country Gemini doesn't serve", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();
    const userId = (await readSignedInUser(harness.context(browser)))!.id;
    await recordUsage(harness.db, { kind: "outfit", userId, at: harness.clock.now() }, 8);

    expect(await showMoreOutfits(harness.context(browser), consultationId)).toEqual({
      ok: false,
      refusal: "allowance-used",
      moreFrom: new Date("2026-10-17T12:00:00Z"),
    });
    harness.clock.set("2026-10-17T12:00:00Z");
    browser.ipCountry = "RU";
    expect(await showMoreOutfits(harness.context(browser), consultationId)).toEqual({ ok: false, refusal: "unsupported-region" });
    expect(harness.stylings.pending).toEqual([]);
    expect(await stylingsOfKind(consultationId, "more")).toEqual([]);
  });

  it("is only for the Consultation's owner", async () => {
    const consultationId = await start(await signedInUser(), "face");
    await harness.stylings.runPending();

    expect(await showMoreOutfits(harness.context(await signedInUser()), consultationId)).toEqual({ ok: false, refusal: "not-found" });
    expect(await showMoreOutfits(harness.context(new TestBrowser()), consultationId)).toEqual({ ok: false, refusal: "signed-out" });
    expect(harness.stylings.pending).toEqual([]);
  });
});

describe("a Photo Style change", () => {
  it("starts at Style Icons for the new Photo Style, keeping the current Outfits and Photo Style meanwhile", async () => {
    harness.qloo.respond = qlooAnsweringByPhotoStyle({ casual: { female: WOMEN }, "chic+edgy": { female: EDGY_WOMEN } });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:10:00Z");

    expect(await changePhotoStyle(harness.context(browser), consultationId, ["edgy", "chic"])).toEqual({ ok: true });

    // The Styling step's checklist starts with the photo check ticked.
    expect(await readStylingStatus(harness.context(browser), consultationId)).toEqual({
      state: "styling",
      progress: { kind: "photo_style_change", stage: "style_icons", previews: { done: 0, of: 2 }, slow: false },
    });
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      photoStyle: ["casual"],
      outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }],
    });
    expect(await stylingsOfKind(consultationId, "photo_style_change")).toEqual([
      expect.objectContaining({ photoStyle: ["edgy", "chic"], budgetTier: null, status: "running", stageMovedAt: new Date("2026-10-16T12:10:00Z") }),
    ]);
  });

  it("asks Qloo for Style Icons in tune with the new Photo Style, then switches in their Outfits and the Photo Style together, replacing the current Outfits", async () => {
    harness.qloo.respond = qlooAnsweringByPhotoStyle({ casual: { female: WOMEN }, "chic+edgy": { female: EDGY_WOMEN } });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();
    harness.qloo.requests.length = 0;

    await changePhotoStyle(harness.context(browser), consultationId, ["edgy", "chic"]);
    await harness.stylings.runPending();

    expect(personCalls().map((params) => params.get("signal.interests.tags"))).toEqual([
      "urn:tag:personal_style:qloo:chic,urn:tag:personal_style:qloo:edgy",
    ]);
    const changed = (await readConsultation(harness.context(browser), consultationId))!;
    expect(changed).toMatchObject({ state: "ready", photoStyle: ["edgy", "chic"] });
    expect(changed.outfits.map((o) => [o.position, o.styleIconName])).toEqual([
      [1, "Gwen Black"],
      [2, "Hope Lark"],
    ]);
    // The Stylist built them for the new Photo Style, from the Style Icons it found for it.
    const lastTurn = harness.ai.stylistRequests.at(-1)!;
    expect(lastTurn.brief).toMatchObject({ styling: "Photo Style change", photoStyle: ["edgy", "chic"] });
    expect(lastTurn.toolResults.find((result) => result.toolName === "findStyleIcons")?.output).toMatchObject({
      styleIcons: [{ name: "Gwen Black" }, { name: "Hope Lark" }, { name: "Iris Moon" }],
    });
    expect(await stylingsOfKind(consultationId, "photo_style_change")).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 2 })]);
    // Each Outfit switched in counts, the first Styling's 2 and these 2.
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ outfitsLeft: 6 });
  });

  it("keeps the current Outfits and Photo Style when it builds nothing, saying which Photo Style it couldn't build", async () => {
    // Qloo finds no one for an edgy Photo Style.
    harness.qloo.respond = qlooAnsweringByPhotoStyle({ casual: { female: WOMEN } });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ failedStyling: null });
    harness.clock.set("2026-10-16T12:10:00Z");

    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();

    expect(await stylingsOfKind(consultationId, "photo_style_change")).toEqual([
      expect.objectContaining({ status: "failed", failureReason: "nothing_built", outfitsMade: 0 }),
    ]);
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      photoStyle: ["casual"],
      failedStyling: { kind: "photo_style_change", photoStyle: ["edgy"], reason: "nothing_built" },
      outfits: [
        { position: 1, styleIconName: "Ava Stone" },
        { position: 2, styleIconName: "Bea Marsh" },
      ],
    });
    // Only the first Styling's 2 count.
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ outfitsLeft: 8 });
  });

  it("keeps the current Outfits and Photo Style when it breaks, saying something went wrong rather than that nothing could be built", async () => {
    const answering = qlooAnsweringByPhotoStyle({ casual: { female: WOMEN } });
    // Qloo keeps failing on the edgy person call.
    harness.qloo.respond = (request) =>
      request.url.searchParams.get("signal.interests.tags") === "urn:tag:personal_style:qloo:edgy"
        ? Response.json({ error: "Internal Server Error" }, { status: 500 })
        : answering(request);
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:10:00Z");

    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      photoStyle: ["casual"],
      failedStyling: { kind: "photo_style_change", photoStyle: ["edgy"], reason: "something_broke" },
      outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }],
    });
  });

  it("builds new Outfits on going back to an earlier Photo Style, reusing only Qloo's answer", async () => {
    harness.qloo.respond = qlooAnsweringByPhotoStyle({ casual: { female: WOMEN }, edgy: { female: EDGY_WOMEN } });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();
    const firstOutfitIds = (await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.id);
    harness.clock.set("2026-10-16T12:10:00Z");
    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:20:00Z");

    await changePhotoStyle(harness.context(browser), consultationId, ["casual"]);
    await harness.stylings.runPending();

    const backAgain = (await readConsultation(harness.context(browser), consultationId))!;
    expect(backAgain).toMatchObject({ photoStyle: ["casual"], outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }] });
    expect(backAgain.outfits.map((o) => o.id)).not.toContain(firstOutfitIds[0]);
    expect(backAgain.outfits.map((o) => o.id)).not.toContain(firstOutfitIds[1]);
    expect(harness.ai.stylistRequests.at(-1)!.toolResults.filter((result) => result.toolName === "saveOutfit" && result.error === null)).toHaveLength(2);
    // The casual person call came from the cache.
    expect(personCalls()).toHaveLength(2);
  });

  it('makes its Style Icons the ones "Show 2 more Outfits" carries on down only once it succeeds', async () => {
    harness.qloo.respond = qlooAnsweringByPhotoStyle({ casual: { female: SIX_WOMEN }, edgy: { female: EDGY_WOMEN } });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();
    // It finds edgy Style Icons, but builds nothing from them.
    harness.ai.scenario = "tailoring-fails";
    harness.clock.set("2026-10-16T12:10:00Z");
    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();
    harness.ai.scenario = "pass";

    harness.clock.set("2026-10-16T12:20:00Z");
    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      // A later Styling has started since, so the failed change has nothing more to say.
      failedStyling: null,
      outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }, { styleIconName: "Cleo Hart" }, { styleIconName: "Dana Reed" }],
    });

    harness.clock.set("2026-10-16T12:30:00Z");
    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:40:00Z");
    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      everyOutfitBuilt: true,
      outfits: [
        { position: 1, styleIconName: "Gwen Black" },
        { position: 2, styleIconName: "Hope Lark" },
        { position: 3, styleIconName: "Iris Moon" },
      ],
    });
  });

  it("builds a body photo's Outfits on the new Style Icons' Brands at the Budget Tier, repeating none in a Category across the Outfits it builds, whatever the ones it replaces used", async () => {
    harness.qloo.respond = qlooAnsweringByPhotoStyle({ casual: { female: WOMEN }, edgy: { female: EDGY_WOMEN } });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only", "medium");
    await harness.stylings.runPending();
    const brandsShown = async () =>
      (await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)]);
    // Dune has no price, so Medium's price guard leaves it out.
    expect(await brandsShown()).toEqual([
      ["Ava Stone", ["Bolt", "Jeanery", "Stride"]],
      ["Bea Marsh", ["Jeanery", "Bolt", "Sole"]],
    ]);
    harness.qloo.requests.length = 0;

    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();

    // The same Brands as the Outfits it replaced, since every Style Icon's fans favour the same ones.
    expect(await brandsShown()).toEqual([
      ["Gwen Black", ["Bolt", "Jeanery", "Stride"]],
      ["Hope Lark", ["Jeanery", "Bolt", "Sole"]],
    ]);
    // A thin pool at Medium widens, but every call stays at the Budget Tier.
    expect(new Set(brandCalls().map((params) => params.get("signal.interests.entities")))).toEqual(new Set(["w-e1", "w-e2"]));
    expect(brandCalls().map((params) => params.get("filter.tags")!.split(",").includes("urn:tag:target_income_level:qloo:medium"))).not.toContain(false);
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ budgetTier: "medium", photoStyle: ["edgy"] });
  });

  it("works from a Consultation with No Outfits, which keeps No Outfits while a change builds nothing", async () => {
    // Qloo finds no one for the photo's own casual Photo Style, nor a sporty one.
    harness.qloo.respond = qlooAnsweringByPhotoStyle({ edgy: { female: EDGY_WOMEN } });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ state: "no_outfits" });

    harness.clock.set("2026-10-16T12:10:00Z");
    expect(await changePhotoStyle(harness.context(browser), consultationId, ["sporty"])).toEqual({ ok: true });
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "no_outfits",
      photoStyle: ["casual"],
      outfits: [],
      failedStyling: { kind: "photo_style_change", photoStyle: ["sporty"] },
    });

    harness.clock.set("2026-10-16T12:20:00Z");
    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      photoStyle: ["edgy"],
      failedStyling: null,
      outfits: [
        { position: 1, styleIconName: "Gwen Black" },
        { position: 2, styleIconName: "Hope Lark" },
      ],
    });
  });

  it("takes 1 or 2 different words from the list", () => {
    expect(photoStyleWordsSchema.safeParse(["edgy"]).success).toBe(true);
    expect(photoStyleWordsSchema.safeParse(["edgy", "chic"]).success).toBe(true);
    expect(photoStyleWordsSchema.safeParse([]).success).toBe(false);
    expect(photoStyleWordsSchema.safeParse(["edgy", "chic", "sporty"]).success).toBe(false);
    expect(photoStyleWordsSchema.safeParse(["edgy", "edgy"]).success).toBe(false);
    expect(photoStyleWordsSchema.safeParse(["goth"]).success).toBe(false);
  });

  it("starts nothing for the Photo Style the Consultation already has, in whatever order", async () => {
    harness.qloo.respond = qlooAnsweringByPhotoStyle({ casual: { female: WOMEN }, "chic+edgy": { female: EDGY_WOMEN } });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();

    expect(await changePhotoStyle(harness.context(browser), consultationId, ["casual"])).toEqual({ ok: false, refusal: "same-photo-style" });
    await changePhotoStyle(harness.context(browser), consultationId, ["edgy", "chic"]);
    await harness.stylings.runPending();
    expect(await changePhotoStyle(harness.context(browser), consultationId, ["chic", "edgy"])).toEqual({ ok: false, refusal: "same-photo-style" });
    expect(await stylingsOfKind(consultationId, "photo_style_change")).toHaveLength(1);
  });

  it("makes one Outfit when the Outfit Allowance has one left", async () => {
    harness.qloo.respond = qlooAnsweringByPhotoStyle({ casual: { female: WOMEN }, edgy: { female: EDGY_WOMEN } });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();
    const userId = (await readSignedInUser(harness.context(browser)))!.id;
    await recordUsage(harness.db, { kind: "outfit", userId, at: harness.clock.now() }, 7);

    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual(["Gwen Black"]);
    expect(await stylingsOfKind(consultationId, "photo_style_change")).toEqual([expect.objectContaining({ status: "succeeded", outfitsWanted: 1, outfitsMade: 1 })]);
  });

  it("starts nothing while a Styling runs on the Consultation", async () => {
    harness.qloo.respond = qlooAnsweringByPhotoStyle({ casual: { female: SIX_WOMEN } });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    expect(await changePhotoStyle(harness.context(browser), consultationId, ["edgy"])).toEqual({ ok: false, refusal: "already-styling" });
    await harness.stylings.runPending();

    const [change, more] = await Promise.all([
      changePhotoStyle(harness.context(browser), consultationId, ["edgy"]),
      showMoreOutfits(harness.context(browser), consultationId),
    ]);

    expect([change, more]).toContainEqual({ ok: true });
    expect([change, more]).toContainEqual({ ok: false, refusal: "already-styling" });
    expect(harness.stylings.pending).toHaveLength(1);
  });

  it("goes through the shared start check, starting nothing once the Outfit Allowance is used up or from a country Gemini doesn't serve", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();
    const userId = (await readSignedInUser(harness.context(browser)))!.id;
    await recordUsage(harness.db, { kind: "outfit", userId, at: harness.clock.now() }, 8);

    expect(await changePhotoStyle(harness.context(browser), consultationId, ["edgy"])).toEqual({
      ok: false,
      refusal: "allowance-used",
      moreFrom: new Date("2026-10-17T12:00:00Z"),
    });
    harness.clock.set("2026-10-17T12:00:00Z");
    browser.ipCountry = "RU";
    expect(await changePhotoStyle(harness.context(browser), consultationId, ["edgy"])).toEqual({ ok: false, refusal: "unsupported-region" });
    expect(harness.stylings.pending).toEqual([]);
    expect(await stylingsOfKind(consultationId, "photo_style_change")).toEqual([]);
  });

  it("is only for the Consultation's owner", async () => {
    const consultationId = await start(await signedInUser(), "face");
    await harness.stylings.runPending();

    expect(await changePhotoStyle(harness.context(await signedInUser()), consultationId, ["edgy"])).toEqual({ ok: false, refusal: "not-found" });
    expect(await changePhotoStyle(harness.context(new TestBrowser()), consultationId, ["edgy"])).toEqual({ ok: false, refusal: "signed-out" });
    expect(harness.stylings.pending).toEqual([]);
  });
});

describe("a Budget Tier change", () => {
  it("starts at Brands, past the Style Icons, keeping the current Outfits and Budget Tier meanwhile", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:10:00Z");

    expect(await changeBudgetTier(harness.context(browser), consultationId, "low")).toEqual({ ok: true });

    // The Styling step's checklist starts with the photo check and the Style Icons ticked.
    expect(await readStylingStatus(harness.context(browser), consultationId)).toEqual({
      state: "styling",
      progress: { kind: "budget_tier_change", stage: "brands", previews: { done: 0, of: 2 }, slow: false },
    });
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      budgetTier: "no_budget",
      outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }],
    });
    expect(await stylingsOfKind(consultationId, "budget_tier_change")).toEqual([
      expect.objectContaining({ budgetTier: "low", photoStyle: ["casual"], status: "running", stageMovedAt: new Date("2026-10-16T12:10:00Z") }),
    ]);
  });

  it("builds from the top of the same Style Icons at the new Budget Tier, then switches in their Outfits and the Budget Tier together, replacing the current Outfits", async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:10:00Z");
    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();
    const brandsShown = async () =>
      (await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.position, o.styleIconName, o.pieces.map((p) => p.brand?.name)]);
    const replaced = (await readConsultation(harness.context(browser), consultationId))!.outfits;
    expect(replaced.map((o) => o.styleIconName)).toEqual(["Ava Stone", "Bea Marsh", "Cleo Hart"]);
    const replacedIds = replaced.map((o) => o.id);
    // Qloo would now find others, with nothing left in the cache.
    harness.qloo.respond = qlooAnswering({ female: EDGY_WOMEN });
    await harness.db.delete(qlooCache);
    harness.qloo.requests.length = 0;
    harness.clock.set("2026-10-16T12:20:00Z");

    await changeBudgetTier(harness.context(browser), consultationId, "low");
    await harness.stylings.runPending();

    // The same Style Icons, from the top, whatever the replaced Outfits used. A thin pool at Low
    // widens, but every call stays at the new Budget Tier.
    expect(personCalls()).toEqual([]);
    expect(new Set(brandCalls().map((params) => params.get("signal.interests.entities")))).toEqual(new Set(["w-1", "w-2"]));
    expect(brandCalls().map((params) => params.get("filter.tags")!.split(",").includes("urn:tag:target_income_level:qloo:low_to_medium"))).not.toContain(false);
    // Dune has no price, so Low's price guard leaves it out. No Brand repeats in a Category across
    // the Outfits it builds, but they may repeat the replaced ones'.
    expect(await brandsShown()).toEqual([
      [1, "Ava Stone", ["Bolt", "Jeanery", "Stride"]],
      [2, "Bea Marsh", ["Jeanery", "Bolt", "Sole"]],
    ]);
    const changed = (await readConsultation(harness.context(browser), consultationId))!;
    expect(changed).toMatchObject({ state: "ready", budgetTier: "low", photoStyle: ["casual"], everyOutfitBuilt: false });
    expect(changed.outfits.map((o) => o.id)).not.toContain(replacedIds[0]);
    expect(changed.outfits.map((o) => o.id)).not.toContain(replacedIds[1]);
    expect(await stylingsOfKind(consultationId, "budget_tier_change")).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 2 })]);
    // Each Outfit switched in counts: the first Styling's 2, "Show 2 more Outfits"' 1 and these 2.
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ outfitsLeft: 5 });

    // "Show 2 more Outfits" carries on down the Style Icons from where it left off, though Cleo
    // Hart had inspired one of the replaced Outfits. Only Cleo's completes an Outfit at Low.
    harness.clock.set("2026-10-16T12:30:00Z");
    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.position, o.styleIconName])).toEqual([
      [1, "Ava Stone"],
      [2, "Bea Marsh"],
      [3, "Cleo Hart"],
    ]);
  });

  it("keeps the current Outfits, Budget Tier and Style Icons when it builds nothing, saying which Budget Tier it couldn't build at", async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    const before = (await readConsultation(harness.context(browser), consultationId))!;
    expect(before).toMatchObject({ failedStyling: null });
    harness.clock.set("2026-10-16T12:10:00Z");

    // No Brand's prices are Expensive.
    await changeBudgetTier(harness.context(browser), consultationId, "expensive");
    await harness.stylings.runPending();

    expect(await stylingsOfKind(consultationId, "budget_tier_change")).toEqual([
      expect.objectContaining({ status: "failed", failureReason: "nothing_built", outfitsMade: 0 }),
    ]);
    const kept = (await readConsultation(harness.context(browser), consultationId))!;
    expect(kept).toMatchObject({
      state: "ready",
      budgetTier: "no_budget",
      everyOutfitBuilt: false,
      failedStyling: { kind: "budget_tier_change", budgetTier: "expensive", reason: "nothing_built" },
    });
    expect(kept.outfits.map((o) => o.id)).toEqual(before.outfits.map((o) => o.id));
    // Only the first Styling's 2 count.
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ outfitsLeft: 8 });

    // "Show 2 more Outfits" carries on down the current Style Icons, untouched by the failed change.
    harness.clock.set("2026-10-16T12:20:00Z");
    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      budgetTier: "no_budget",
      failedStyling: null,
      outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }, { position: 3, styleIconName: "Cleo Hart" }],
    });
  });

  it("keeps the current Outfits and Budget Tier when it breaks, saying something went wrong rather than that nothing could be built", async () => {
    // Qloo keeps failing on the Expensive Brand calls.
    harness.qloo.respond = (request) =>
      request.url.searchParams.get("filter.tags")?.includes("urn:tag:target_income_level:qloo:high")
        ? Response.json({ error: "Internal Server Error" }, { status: 500 })
        : qlooAnswering({ female: WOMEN })(request);
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only", "medium");
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:10:00Z");

    await changeBudgetTier(harness.context(browser), consultationId, "expensive");
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      budgetTier: "medium",
      failedStyling: { kind: "budget_tier_change", budgetTier: "expensive", reason: "something_broke" },
      outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }],
    });
  });

  it("works from a Consultation with No Outfits, building from the top of the Style Icons its first Styling found", async () => {
    // Qloo finds no Brand at Medium, and no Brand's prices are Expensive.
    harness.qloo.respond = qlooAnswering({ female: WOMEN }, (_, query) =>
      query.get("filter.tags")!.includes("urn:tag:target_income_level:qloo:medium") ? [] : BRANDS,
    );
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only", "expensive");
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "no_outfits",
      failedStyling: { kind: "first", budgetTier: "expensive", reason: "nothing_built" },
    });

    harness.clock.set("2026-10-16T12:10:00Z");
    await changeBudgetTier(harness.context(browser), consultationId, "medium");
    expect(await readStylingStatus(harness.context(browser), consultationId)).toMatchObject({ progress: { stage: "brands" } });
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "no_outfits",
      budgetTier: "expensive",
      outfits: [],
      failedStyling: { kind: "budget_tier_change", budgetTier: "medium", reason: "nothing_built" },
    });

    harness.clock.set("2026-10-16T12:20:00Z");
    await changeBudgetTier(harness.context(browser), consultationId, "low");
    expect(await readStylingStatus(harness.context(browser), consultationId)).toMatchObject({ progress: { stage: "brands" } });
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      budgetTier: "low",
      failedStyling: null,
      outfits: [
        { position: 1, styleIconName: "Ava Stone" },
        { position: 2, styleIconName: "Bea Marsh" },
      ],
    });
    // Only the first Styling asked Qloo for Style Icons.
    expect(personCalls()).toHaveLength(1);
  });

  it("finds Style Icons of its own when the Consultation has none, as when its first Styling broke before Qloo answered", async () => {
    harness.qloo.respond = () => Response.json({ error: "Internal Server Error" }, { status: 500 });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ state: "no_outfits" });
    harness.qloo.respond = qlooAnswering({ female: WOMEN });
    harness.clock.set("2026-10-16T12:10:00Z");

    await changeBudgetTier(harness.context(browser), consultationId, "low");
    expect(await readStylingStatus(harness.context(browser), consultationId)).toMatchObject({ progress: { stage: "style_icons" } });
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      budgetTier: "low",
      outfits: [
        { position: 1, styleIconName: "Ava Stone" },
        { position: 2, styleIconName: "Bea Marsh" },
      ],
    });
  });

  it("builds new Outfits on going back to an earlier Budget Tier, reusing only Qloo's answers", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    const firstOutfitIds = (await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.id);
    harness.clock.set("2026-10-16T12:10:00Z");
    await changeBudgetTier(harness.context(browser), consultationId, "low");
    await harness.stylings.runPending();
    const tailoredSoFar = harness.ai.tailoringRequests.length;
    harness.qloo.requests.length = 0;
    harness.clock.set("2026-10-16T12:20:00Z");

    await changeBudgetTier(harness.context(browser), consultationId, "no_budget");
    await harness.stylings.runPending();

    const backAgain = (await readConsultation(harness.context(browser), consultationId))!;
    expect(backAgain).toMatchObject({ budgetTier: "no_budget", outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }] });
    expect(backAgain.outfits.map((o) => o.id)).not.toContain(firstOutfitIds[0]);
    expect(backAgain.outfits.map((o) => o.id)).not.toContain(firstOutfitIds[1]);
    expect(harness.ai.tailoringRequests).toHaveLength(tailoredSoFar + 2);
    // The No Budget Brand calls came from the cache.
    expect(harness.qloo.requests).toEqual([]);
  });

  it("starts nothing for the Budget Tier the Consultation already has, or for a Face Photo, which has none", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const bodyId = await start(browser, "body_only", "medium");
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:10:00Z");
    const faceId = await start(browser, "face");
    await harness.stylings.runPending();

    expect(await changeBudgetTier(harness.context(browser), bodyId, "medium")).toEqual({ ok: false, refusal: "same-budget-tier" });
    expect(await changeBudgetTier(harness.context(browser), faceId, "low")).toEqual({ ok: false, refusal: "no-budget-tier" });
    expect(harness.stylings.pending).toEqual([]);
    expect(await stylingsOfKind(bodyId, "budget_tier_change")).toEqual([]);
    expect(await stylingsOfKind(faceId, "budget_tier_change")).toEqual([]);
  });

  it("starts through the shared start check, only on the owner's Consultation and while no Styling runs on it", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only");
    expect(await changeBudgetTier(harness.context(browser), consultationId, "low")).toEqual({ ok: false, refusal: "already-styling" });
    await harness.stylings.runPending();

    expect(await changeBudgetTier(harness.context(await signedInUser()), consultationId, "low")).toEqual({ ok: false, refusal: "not-found" });
    expect(await changeBudgetTier(harness.context(new TestBrowser()), consultationId, "low")).toEqual({ ok: false, refusal: "signed-out" });
    const userId = (await readSignedInUser(harness.context(browser)))!.id;
    await recordUsage(harness.db, { kind: "outfit", userId, at: harness.clock.now() }, 8);
    expect(await changeBudgetTier(harness.context(browser), consultationId, "low")).toEqual({
      ok: false,
      refusal: "allowance-used",
      moreFrom: new Date("2026-10-17T12:00:00Z"),
    });
    expect(harness.stylings.pending).toEqual([]);
    expect(await stylingsOfKind(consultationId, "budget_tier_change")).toEqual([]);
  });
});

describe("Try again", () => {
  it("picks up a first Styling that broke at Style Icons there, without checking the photo again, then switches in its Outfits", async () => {
    harness.qloo.respond = () => Response.json({ error: "Internal Server Error" }, { status: 500 });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "full_body", "medium");
    await harness.stylings.runPending();
    const photoChecks = harness.ai.photoCheckCount;
    harness.qloo.respond = qlooAnswering({ female: WOMEN });
    harness.qloo.requests.length = 0;
    harness.clock.set("2026-10-16T12:10:00Z");

    expect(await tryAgain(harness.context(browser), consultationId)).toEqual({ ok: true });

    // The Styling step's checklist starts with the photo check ticked.
    expect(await readStylingStatus(harness.context(browser), consultationId)).toEqual({
      state: "styling",
      progress: { kind: "try_again", stage: "style_icons", previews: { done: 0, of: 2 }, slow: false },
    });
    expect(await stylingsOfKind(consultationId, "try_again")).toEqual([
      expect.objectContaining({ budgetTier: "medium", photoStyle: ["casual"], status: "running", startedAt: new Date("2026-10-16T12:10:00Z") }),
    ]);
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      budgetTier: "medium",
      failedStyling: null,
      outfits: [
        { position: 1, styleIconName: "Ava Stone" },
        { position: 2, styleIconName: "Bea Marsh" },
      ],
    });
    expect(personCalls()).toHaveLength(1);
    expect(harness.ai.photoCheckCount).toBe(photoChecks);
    expect(await usageRecordsOf(browser)).toEqual({ photo_check: 1, outfit: 2 });
  });

  it("carries on down the Style Icons found before it broke, with no person call, passing over the ones it had", async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    // Once the Stylist has found the Style Icons, Ava Stone is passed over, and the model goes down.
    harness.ai.duringCall = async (call) => {
      if (call !== "stylistModel" || harness.ai.stylistRequests.at(-1)?.turn !== 2) return;
      await harness.db.update(styleIcon).set({ status: "skipped" }).where(and(eq(styleIcon.consultationId, consultationId), eq(styleIcon.name, "Ava Stone")));
      throw new Error("The model is down.");
    };
    await harness.stylings.runPending();
    expect(await stylingsOfKind(consultationId, "first")).toEqual([
      expect.objectContaining({ status: "failed", failureReason: "something_broke", stage: "building_outfits" }),
    ]);
    harness.ai.duringCall = undefined;
    harness.qloo.requests.length = 0;
    const photoChecks = harness.ai.photoCheckCount;
    harness.clock.set("2026-10-16T12:10:00Z");

    await tryAgain(harness.context(browser), consultationId);

    // The checklist starts with the photo check and the Style Icons ticked.
    expect(await readStylingStatus(harness.context(browser), consultationId)).toMatchObject({
      progress: { kind: "try_again", stage: "building_outfits" },
    });
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.position, o.styleIconName])).toEqual([
      [1, "Bea Marsh"],
      [2, "Cleo Hart"],
    ]);
    expect(harness.qloo.requests).toEqual([]);
    expect(harness.ai.photoCheckCount).toBe(photoChecks);
    // The broken Styling's own list is as it left it.
    expect(await styleIconStatuses(consultationId, "first")).toEqual([
      ["Ava Stone", "skipped"],
      ["Bea Marsh", "unused"],
      ["Cleo Hart", "unused"],
      ["Dana Reed", "unused"],
      ["Esme Vale", "unused"],
      ["Fay Lowe", "unused"],
    ]);
  });

  it("builds as the Photo Style change it tries again: its Outfits, Style Icons and Photo Style switch in together", async () => {
    const answering = qlooAnsweringByPhotoStyle({ casual: { female: WOMEN }, edgy: { female: EDGY_WOMEN } });
    // Qloo keeps failing on the edgy person call, for now.
    let edgyFails = true;
    harness.qloo.respond = (request) =>
      edgyFails && request.url.searchParams.get("signal.interests.tags") === "urn:tag:personal_style:qloo:edgy"
        ? Response.json({ error: "Internal Server Error" }, { status: 500 })
        : answering(request);
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:10:00Z");
    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();
    edgyFails = false;
    harness.clock.set("2026-10-16T12:20:00Z");

    await tryAgain(harness.context(browser), consultationId);
    // It finds Style Icons for the Photo Style the broken change was for.
    expect(await stylingsOfKind(consultationId, "try_again")).toEqual([expect.objectContaining({ photoStyle: ["edgy"], stage: "style_icons" })]);
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      photoStyle: ["edgy"],
      failedStyling: null,
      outfits: [
        { position: 1, styleIconName: "Gwen Black" },
        { position: 2, styleIconName: "Hope Lark" },
      ],
    });
    // "Show 2 more Outfits" then carries on down its Style Icons.
    harness.clock.set("2026-10-16T12:30:00Z");
    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual([
      "Gwen Black",
      "Hope Lark",
      "Iris Moon",
    ]);
  });

  it("builds as the Budget Tier change it tries again: from Brands, switching in its Outfits and Budget Tier only once it succeeds", async () => {
    // Qloo keeps failing on the Low Brand calls, for now.
    let lowBrandsFail = true;
    harness.qloo.respond = (request) =>
      lowBrandsFail && request.url.searchParams.get("filter.tags")?.includes("urn:tag:target_income_level:qloo:low_to_medium")
        ? Response.json({ error: "Internal Server Error" }, { status: 500 })
        : qlooAnswering({ female: WOMEN })(request);
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    const before = (await readConsultation(harness.context(browser), consultationId))!;
    harness.clock.set("2026-10-16T12:10:00Z");
    await changeBudgetTier(harness.context(browser), consultationId, "low");
    await harness.stylings.runPending();
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      budgetTier: "no_budget",
      failedStyling: { kind: "budget_tier_change", budgetTier: "low", reason: "something_broke" },
    });
    lowBrandsFail = false;
    harness.qloo.requests.length = 0;
    harness.clock.set("2026-10-16T12:20:00Z");

    await tryAgain(harness.context(browser), consultationId);

    expect(await readStylingStatus(harness.context(browser), consultationId)).toMatchObject({
      progress: { kind: "try_again", stage: "brands" },
    });
    expect(await stylingsOfKind(consultationId, "try_again")).toEqual([expect.objectContaining({ budgetTier: "low", photoStyle: ["casual"] })]);
    // The current Outfits and Budget Tier stay meanwhile.
    const meanwhile = (await readConsultation(harness.context(browser), consultationId))!;
    expect(meanwhile).toMatchObject({ budgetTier: "no_budget" });
    expect(meanwhile.outfits.map((o) => o.id)).toEqual(before.outfits.map((o) => o.id));
    await harness.stylings.runPending();

    const changed = (await readConsultation(harness.context(browser), consultationId))!;
    expect(changed).toMatchObject({
      state: "ready",
      budgetTier: "low",
      failedStyling: null,
      outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }],
    });
    expect(changed.outfits.map((o) => o.id)).not.toContain(before.outfits[0]!.id);
    expect(personCalls()).toEqual([]);
    expect(brandCalls().map((params) => params.get("filter.tags")!.split(",").includes("urn:tag:target_income_level:qloo:low_to_medium"))).not.toContain(false);
  });

  it("says what it couldn't build as the Styling it tries again, and can itself be tried again once it breaks", async () => {
    const answering = qlooAnsweringByPhotoStyle({ casual: { female: WOMEN } });
    // Qloo keeps failing on the edgy person call, for now.
    let edgyFails = true;
    harness.qloo.respond = (request) =>
      edgyFails && request.url.searchParams.get("signal.interests.tags") === "urn:tag:personal_style:qloo:edgy"
        ? Response.json({ error: "Internal Server Error" }, { status: 500 })
        : answering(request);
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:10:00Z");
    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:20:00Z");

    expect(await tryAgain(harness.context(browser), consultationId)).toEqual({ ok: true });
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      photoStyle: ["casual"],
      failedStyling: { kind: "photo_style_change", photoStyle: ["edgy"], reason: "something_broke" },
      outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }],
    });

    // Qloo answers now, but finds no one edgy.
    edgyFails = false;
    harness.clock.set("2026-10-16T12:30:00Z");
    expect(await tryAgain(harness.context(browser), consultationId)).toEqual({ ok: true });
    await harness.stylings.runPending();

    expect(await stylingsOfKind(consultationId, "try_again")).toEqual([
      expect.objectContaining({ photoStyle: ["edgy"], status: "failed", failureReason: "something_broke" }),
      expect.objectContaining({ photoStyle: ["edgy"], status: "failed", failureReason: "nothing_built" }),
    ]);
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      photoStyle: ["casual"],
      failedStyling: { kind: "photo_style_change", photoStyle: ["edgy"], reason: "nothing_built" },
      outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }],
    });
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ outfitsLeft: 8 });
  });

  it("starts nothing unless the latest Styling broke: not after one that succeeded or built nothing, nor after a broken \"Show 2 more Outfits\"", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const succeededId = await start(browser, "face");
    await harness.stylings.runPending();
    harness.qloo.respond = () => qlooResponse([]);
    harness.clock.set("2026-10-16T12:10:00Z");
    const builtNothingId = await start(browser, "face");
    await harness.stylings.runPending();
    // "Show 2 more Outfits" breaks, with the model down.
    harness.clock.set("2026-10-16T12:20:00Z");
    await showMoreOutfits(harness.context(browser), succeededId);
    harness.ai.duringCall = async () => {
      throw new Error("The model is down.");
    };
    await harness.stylings.runPending();
    expect(await stylingsOfKind(succeededId, "more")).toEqual([expect.objectContaining({ failureReason: "something_broke" })]);
    harness.ai.duringCall = undefined;
    harness.clock.set("2026-10-16T12:30:00Z");

    expect(await tryAgain(harness.context(browser), succeededId)).toEqual({ ok: false, refusal: "nothing-to-try-again" });
    expect(await tryAgain(harness.context(browser), builtNothingId)).toEqual({ ok: false, refusal: "nothing-to-try-again" });
    expect(await readConsultation(harness.context(browser), succeededId)).toMatchObject({ failedStyling: null, everyOutfitBuilt: true });
    expect(harness.stylings.pending).toEqual([]);
  });

  it("starts through the shared start check, only on the owner's Consultation and while no Styling runs on it", async () => {
    harness.qloo.respond = () => Response.json({ error: "Internal Server Error" }, { status: 500 });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const consultationId = await start(browser, "face");
    expect(await tryAgain(harness.context(browser), consultationId)).toEqual({ ok: false, refusal: "already-styling" });
    await harness.stylings.runPending();

    expect(await tryAgain(harness.context(await signedInUser()), consultationId)).toEqual({ ok: false, refusal: "not-found" });
    expect(await tryAgain(harness.context(new TestBrowser()), consultationId)).toEqual({ ok: false, refusal: "signed-out" });
    const userId = (await readSignedInUser(harness.context(browser)))!.id;
    await recordUsage(harness.db, { kind: "outfit", userId, at: harness.clock.now() }, 10);
    // The usage summary that disables Try again says the same.
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({
      stylingStart: { ok: false, refusal: "allowance-used", moreFrom: new Date("2026-10-17T12:00:00Z") },
    });
    expect(await tryAgain(harness.context(browser), consultationId)).toEqual({
      ok: false,
      refusal: "allowance-used",
      moreFrom: new Date("2026-10-17T12:00:00Z"),
    });
    harness.clock.set("2026-10-17T12:00:00Z");
    browser.ipCountry = "RU";
    expect(await tryAgain(harness.context(browser), consultationId)).toEqual({ ok: false, refusal: "unsupported-region" });
    expect(harness.stylings.pending).toEqual([]);
    expect(await stylingsOfKind(consultationId, "try_again")).toEqual([]);
  });
});

describe("the Styling locks", () => {
  it("start no second Styling for a user while one runs on any of their Consultations, until it finishes", async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const styled = await start(browser, "face");
    await harness.stylings.runPending();
    await start(browser, "face");
    const photoChecks = harness.ai.photoCheckCount;
    const stored = [...harness.blob.objects.keys()];

    // "Get my Outfits" refuses before it checks the photo, storing nothing.
    expect(await getMyOutfits(browser)).toEqual({ ok: false, refusal: "already-styling" });
    expect(harness.ai.photoCheckCount).toBe(photoChecks);
    expect([...harness.blob.objects.keys()]).toEqual(stored);
    // So does every Styling on another Consultation, through the shared start check, and the usage
    // summary that disables their buttons says the same.
    expect(await showMoreOutfits(harness.context(browser), styled)).toEqual({ ok: false, refusal: "already-styling" });
    expect(await changePhotoStyle(harness.context(browser), styled, ["edgy"])).toEqual({ ok: false, refusal: "already-styling" });
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ stylingStart: { ok: false, refusal: "already-styling" } });
    expect(harness.stylings.pending).toHaveLength(1);

    await harness.stylings.runPending();

    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ stylingStart: { ok: true } });
    expect(await showMoreOutfits(harness.context(browser), styled)).toEqual({ ok: true });
  });

  it('refuse as the fourth check of "Get my Outfits", after the region gate and before the limits', async () => {
    const browser = await signedInUser();
    await start(browser, "face");
    const userId = (await readSignedInUser(harness.context(browser)))!.id;
    await recordUsage(harness.db, { kind: "outfit", userId, at: harness.clock.now() }, 10);

    expect(await getMyOutfits(browser)).toEqual({ ok: false, refusal: "already-styling" });
    browser.ipCountry = "RU";
    expect(await getMyOutfits(browser)).toEqual({ ok: false, refusal: "unsupported-region" });
  });

  it('hold in the database, so of two "Get my Outfits" pressed at once only one starts, and the other stores nothing', async () => {
    const browser = await signedInUser();
    // The second is pressed while the first's photo is checked: both are past the lock check.
    let pressed = false;
    let second: Awaited<ReturnType<typeof getMyOutfits>> | undefined;
    harness.ai.duringCall = async (call) => {
      if (call !== "checkPhoto" || pressed) return;
      pressed = true;
      second = await getMyOutfits(browser);
    };

    const first = await getMyOutfits(browser);

    expect(first).toEqual({ ok: false, refusal: "already-styling" });
    expect(second).toEqual({ ok: true, consultationId: expect.any(String) });
    expect((await listConsultations(harness.context(browser))).map(({ id }) => id)).toEqual([second?.ok && second.consultationId]);
    expect(harness.blob.objects.size).toBe(1);
    expect(harness.stylings.pending).toHaveLength(1);
  });

  it("let only one of two Stylings started at once on different Consultations start", async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const one = await start(browser, "face");
    await harness.stylings.runPending();
    const other = await start(browser, "face");
    await harness.stylings.runPending();

    const results = await Promise.all([
      showMoreOutfits(harness.context(browser), one),
      changePhotoStyle(harness.context(browser), other, ["edgy"]),
    ]);

    expect(results).toContainEqual({ ok: true });
    expect(results).toContainEqual({ ok: false, refusal: "already-styling" });
    expect(harness.stylings.pending).toHaveLength(1);
  });

  it("leave other users free to start a Styling", async () => {
    await start(await signedInUser(), "face");

    expect(await getMyOutfits(await signedInUser())).toEqual({ ok: true, consultationId: expect.any(String) });
  });
});

describe("a stuck Styling", () => {
  it("is finished by the Styling status poll once its stage hasn't moved for 10 minutes, as broken if it made nothing, for Try again", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    harness.clock.set("2026-10-16T12:30:00Z");
    const consultationId = await start(browser, "face");
    const [running] = await stylingsOf(consultationId);

    harness.clock.set("2026-10-16T12:39:59Z");
    expect(await readStylingStatus(harness.context(browser), consultationId)).toMatchObject({
      state: "styling",
      progress: { stage: "style_icons" },
    });
    harness.clock.set("2026-10-16T12:40:00Z");
    expect(await readStylingStatus(harness.context(browser), consultationId)).toEqual({ state: "no_outfits", progress: null });

    expect(await stylingsOf(consultationId)).toEqual([
      expect.objectContaining({ status: "failed", failureReason: "something_broke", finishedAt: new Date("2026-10-16T12:40:00Z") }),
    ]);
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      failedStyling: { kind: "first", reason: "something_broke" },
    });
    // Its Workflow run is cancelled, so it builds nothing, and both locks are released.
    expect(harness.stylings.cancelled).toEqual([running!.workflowRunId]);
    await harness.stylings.runPending();
    expect(harness.qloo.requests).toEqual([]);
    expect(await tryAgain(harness.context(browser), consultationId)).toEqual({ ok: true });
  });

  it("keeps what it made, as any Styling does: its Outfits switch in, Previews not ready fail, and they count against the Outfit Allowance", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    harness.clock.set("2026-10-16T12:30:00Z");
    const consultationId = await start(browser, "face");
    // The Previews hang for 10 minutes while the page polls.
    let polled: StylingStatusView | null = null;
    whileEveryAiCall("renderPreview", async () => {
      harness.clock.set("2026-10-16T12:40:00Z");
      polled = await readStylingStatus(harness.context(browser), consultationId);
    });

    await harness.stylings.runPending();

    expect(polled).toEqual({ state: "ready", progress: null });
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      failedStyling: null,
      outfits: [
        { styleIconName: "Ava Stone", preview: { state: "failed" } },
        { styleIconName: "Bea Marsh", preview: { state: "failed" } },
      ],
    });
    expect(await stylingsOf(consultationId)).toEqual([
      expect.objectContaining({ status: "succeeded", outfitsMade: 2, finishedAt: new Date("2026-10-16T12:40:00Z") }),
    ]);
    expect(await usageRecordsOf(browser)).toEqual({ outfit: 2, photo_check: 1 });
    // The Previews that came back late were never stored: only the photo is.
    expect(harness.blob.objects.size).toBe(1);
  });

  it("counts from when its stage last moved, not from when it started", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    harness.clock.set("2026-10-16T12:30:00Z");
    const consultationId = await start(browser, "face");
    // Finding Style Icons takes 8 minutes, then the Stylist's next turn hangs.
    harness.clock.set("2026-10-16T12:38:00Z");
    const seen: (string | undefined)[] = [];
    harness.ai.duringCall = async (call) => {
      if (call !== "stylistModel" || harness.ai.stylistRequests.at(-1)?.turn !== 2) return;
      harness.clock.set("2026-10-16T12:47:59Z");
      seen.push((await readStylingStatus(harness.context(browser), consultationId))?.state);
      harness.clock.set("2026-10-16T12:48:00Z");
      seen.push((await readStylingStatus(harness.context(browser), consultationId))?.state);
    };

    await harness.stylings.runPending();

    expect(seen).toEqual(["styling", "no_outfits"]);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "failed", outfitsMade: 0 })]);
  });

  it("is finished by My Consultations", async () => {
    const browser = await signedInUser();
    harness.clock.set("2026-10-16T12:30:00Z");
    const consultationId = await start(browser, "face");
    harness.clock.set("2026-10-16T12:40:00Z");

    expect(await listConsultations(harness.context(browser))).toEqual([
      expect.objectContaining({ id: consultationId, state: "no_outfits" }),
    ]);
  });

  it('is finished by "Get my Outfits", every other start and the usage summary that enables them, which then go ahead', async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    const browser = await signedInUser({ stylePreference: "womenswear" });
    const styled = await start(browser, "face");
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:30:00Z");
    const stuck = await start(browser, "face");

    harness.clock.set("2026-10-16T12:40:00Z");
    const next = await start(browser, "face");
    expect(await stylingsOf(stuck)).toEqual([expect.objectContaining({ status: "failed", failureReason: "something_broke" })]);
    // Each new one gets stuck too.
    harness.clock.set("2026-10-16T12:50:00Z");
    expect(await showMoreOutfits(harness.context(browser), styled)).toEqual({ ok: true });
    expect(await stylingsOf(next)).toEqual([expect.objectContaining({ status: "failed", failureReason: "something_broke" })]);
    harness.clock.set("2026-10-16T13:00:00Z");
    expect(await readUsageSummary(harness.context(browser))).toMatchObject({ stylingStart: { ok: true, outfitsWanted: 2 } });
    expect(await stylingsOfKind(styled, "more")).toEqual([expect.objectContaining({ status: "failed", failureReason: "something_broke" })]);
  });

  it("is finished even when its Workflow run can't be cancelled, which then saves nothing", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    harness.clock.set("2026-10-16T12:30:00Z");
    const consultationId = await start(browser, "face");
    harness.stylings.cancelFails = true;
    harness.clock.set("2026-10-16T12:40:00Z");

    expect(await readStylingStatus(harness.context(browser), consultationId)).toEqual({ state: "no_outfits", progress: null });
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ state: "no_outfits", outfits: [] });
    expect(await styleIconStatuses(consultationId)).toEqual([]);
  });
});

it("starts no Styling for a rejected photo", async () => {
  const browser = await signedInUser();
  harness.ai.scenario = "no-person";

  const result = await startConsultation(harness.context(browser), {
    photo: await jpeg(),
    photoType: "full_body",
    consent: BOTH_CONSENT_BOXES_TICKED,
  });

  expect(result).toMatchObject({ ok: false, refusal: "photo-rejected" });
  expect(harness.stylings.pending).toEqual([]);
  expect(await harness.db.select().from(styling)).not.toContainEqual(
    expect.objectContaining({ userId: (await readSignedInUser(harness.context(browser)))!.id }),
  );
});

/**
 * Answers each person call with the people for its `filter.gender`, or no one, and each Brand call
 * with the Brands for its Style Icon and query: BRANDS unless `brands` says otherwise.
 */
function qlooAnswering(
  people: { female?: readonly object[]; male?: readonly object[] },
  brands: (styleIconEntityId: string, query: URLSearchParams) => readonly object[] = () => BRANDS,
) {
  return (request: RecordedQlooRequest) => {
    const params = request.url.searchParams;
    if (params.get("filter.type") === "urn:entity:brand") return qlooResponse(brands(params.get("signal.interests.entities") ?? "", params));
    const gender = params.get("filter.gender");
    return qlooResponse((gender === "female" || gender === "male" ? people[gender] : undefined) ?? []);
  };
}

/**
 * Like `qlooAnswering`, but each person call is answered with the people for the Photo Style it's in
 * tune with, by its words in alphabetical order joined with "+", or no one.
 */
function qlooAnsweringByPhotoStyle(
  peopleByPhotoStyle: Record<string, { female?: readonly object[]; male?: readonly object[] }>,
  brands?: (styleIconEntityId: string, query: URLSearchParams) => readonly object[],
) {
  return (request: RecordedQlooRequest) => {
    const tags = request.url.searchParams.get("signal.interests.tags") ?? "";
    const photoStyle = tags
      .split(",")
      .map((tag) => tag.replace("urn:tag:personal_style:qloo:", ""))
      .toSorted()
      .join("+");
    return qlooAnswering(peopleByPhotoStyle[photoStyle] ?? {}, brands)(request);
  };
}

/** The Qloo requests that went out for Style Icons. */
function personCalls(): URLSearchParams[] {
  return harness.qloo.requests.map((request) => request.url.searchParams).filter((params) => params.get("filter.type") === "urn:entity:person");
}

/** The Qloo requests that went out for Brands. */
function brandCalls(): URLSearchParams[] {
  return harness.qloo.requests.map((request) => request.url.searchParams).filter((params) => params.get("filter.type") === "urn:entity:brand");
}

/** The product searches that went out to Channel3. */
function browseRequests() {
  return harness.channel3.requests.filter(({ url }) => url.pathname === "/v1/browse");
}

/** What each product search sent to Channel3 asked for, by Brand and Category. */
function productSearchesSent(): Channel3Search[] {
  return browseRequests()
    .map(channel3Search)
    .toSorted((a, b) => `${a.brandId} ${a.category}`.localeCompare(`${b.brandId} ${b.category}`));
}

/** The names of the Brands looked up in the product search, Channel3, in the order the lookups went out. */
function brandLookups(): string[] {
  return harness.channel3.requests.filter(({ url }) => url.pathname === "/v1/brands/search").map(({ url }) => url.searchParams.get("query") ?? "");
}

/** What a page polling the Styling status would show: `seen` holds each change, in order, as `look()` finds it. */
function watchChecklist(browser: TestBrowser, consultationId: string) {
  const seen: (StylingProgressView | null)[] = [];
  return {
    seen,
    async look(): Promise<StylingProgressView | null> {
      const progress = (await readStylingStatus(harness.context(browser), consultationId))?.progress ?? null;
      if (!isDeepStrictEqual(seen.at(-1), progress)) seen.push(progress);
      return progress;
    },
  };
}

/**
 * Holds every AI call of `call`'s kind until `meanwhile` has run, once, as if the model hung while
 * it ran.
 */
function whileEveryAiCall(call: keyof AiProvider, meanwhile: () => Promise<void>): void {
  let running: Promise<void> | undefined;
  harness.ai.duringCall = async (made) => {
    if (made === call) await (running ??= meanwhile());
  };
}

/** Presses "Get my Outfits" with a plain JPEG Face Photo, agreeing on the consent sheet, returning what the operation returns. */
async function getMyOutfits(browser: TestBrowser) {
  return startConsultation(harness.context(browser), { photo: await jpeg(), photoType: "face", consent: BOTH_CONSENT_BOXES_TICKED });
}

/** Presses "Get my Outfits" with a plain JPEG, agreeing on the consent sheet, returning the new Consultation's id. */
async function start(browser: TestBrowser, photoType: PhotoType, budgetTier?: BudgetTier): Promise<string> {
  const result = await startConsultation(harness.context(browser), {
    photo: await jpeg(),
    photoType,
    budgetTier,
    consent: BOTH_CONSENT_BOXES_TICKED,
  });
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
  return result.consultationId;
}

async function stylingsOf(consultationId: string) {
  return harness.db.select().from(styling).where(eq(styling.consultationId, consultationId));
}

/** The Consultation's Stylings of one kind, such as its "Show 2 more Outfits" ones, in the order they started. */
async function stylingsOfKind(consultationId: string, kind: StylingKind) {
  return harness.db
    .select()
    .from(styling)
    .where(and(eq(styling.consultationId, consultationId), eq(styling.kind, kind)))
    .orderBy(asc(styling.startedAt));
}

/**
 * Each ranked Style Icon's name and whether it was used, best first: only those on the list of the
 * Consultation's Styling of `kind`, when it's given.
 */
async function styleIconStatuses(consultationId: string, kind?: StylingKind) {
  const icons = await harness.db
    .select({ name: styleIcon.name, status: styleIcon.status })
    .from(styleIcon)
    .innerJoin(styling, eq(styling.id, styleIcon.stylingId))
    .where(and(eq(styleIcon.consultationId, consultationId), kind && eq(styling.kind, kind)))
    .orderBy(asc(styleIcon.position));
  return icons.map(({ name, status }) => [name, status]);
}

/** How many usage records the browser's user has, of each kind. */
async function usageRecordsOf(browser: TestBrowser): Promise<Record<string, number>> {
  const userId = (await readSignedInUser(harness.context(browser)))!.id;
  const counts: Record<string, number> = {};
  for (const { kind } of await harness.db.select({ kind: usageRecord.kind }).from(usageRecord).where(eq(usageRecord.userId, userId))) {
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

/** The stored Pieces of the Consultation's Outfits, in Outfit order. */
async function piecesOf(consultationId: string) {
  return harness.db
    .select({ category: piece.category, item: piece.item, details: piece.details, why: piece.why, unknownCut: piece.unknownCut })
    .from(piece)
    .innerJoin(outfit, eq(outfit.id, piece.outfitId))
    .where(eq(outfit.consultationId, consultationId))
    .orderBy(asc(outfit.position));
}

/** Each of the Consultation's Outfits' Brand Pieces with the Brand it keeps, in Outfit and Category order. */
async function brandPiecesOf(consultationId: string) {
  const rows = await harness.db
    .select({
      position: outfit.position,
      category: piece.category,
      brandEntityId: piece.brandEntityId,
      brandName: piece.brandName,
      brandOfficialSite: piece.brandOfficialSite,
      brandPriceUsdMin: piece.brandPriceUsdMin,
      brandPriceUsdMax: piece.brandPriceUsdMax,
    })
    .from(piece)
    .innerJoin(outfit, eq(outfit.id, piece.outfitId))
    .where(eq(outfit.consultationId, consultationId))
    .orderBy(asc(outfit.position));
  const positions = [...new Set(rows.map((row) => row.position))];
  return positions.map((position) =>
    rows
      .filter((row) => row.position === position && row.category !== "hairstyle")
      .toSorted(byCategoryOrder)
      .map(({ position: _, ...brandPiece }) => brandPiece),
  );
}

/** Stores these rates to the US dollar, as the daily sweep does when Frankfurter gives them. */
async function storeExchangeRates(rates: Record<string, number>): Promise<void> {
  harness.exchangeRates.respond = () => frankfurterRates(rates);
  expect(await refreshExchangeRates(harness)).toBe("frankfurter");
}

/** The stored Product Pieces of the Consultation's Outfits, in Outfit and Category order. */
async function productPiecesOf(consultationId: string) {
  const rows = await harness.db
    .select({
      position: outfit.position,
      category: piece.category,
      item: piece.item,
      details: piece.details,
      brandName: piece.brandName,
      productId: piece.productId,
      productPhotoUrl: piece.productPhotoUrl,
      offerUrl: piece.offerUrl,
      offerShopDomain: piece.offerShopDomain,
      price: piece.price,
      currency: piece.currency,
      market: piece.market,
      pricedAt: piece.pricedAt,
      available: piece.available,
    })
    .from(piece)
    .innerJoin(outfit, eq(outfit.id, piece.outfitId))
    .where(eq(outfit.consultationId, consultationId));
  return rows
    .filter((row) => row.productId !== null)
    .toSorted((a, b) => a.position - b.position || byCategoryOrder(a, b))
    .map(({ position: _, ...productPiece }) => productPiece);
}

/**
 * Makes the Consultation's Product Pieces as Pieces were made before Products existed: an item the
 * AI described, with a hidden description for the Preview, and no Product.
 */
async function asMadeBeforeProducts(consultationId: string): Promise<void> {
  const outfitIds = (await harness.db.select({ id: outfit.id }).from(outfit).where(eq(outfit.consultationId, consultationId))).map(({ id }) => id);
  await harness.db
    .update(piece)
    .set({
      item: "Navy relaxed cotton overshirt",
      details: "A navy cotton overshirt with a relaxed fit, a straight hem and two chest pockets.",
      productId: null,
      productPhotoUrl: null,
      offerUrl: null,
      offerShopDomain: null,
      price: null,
      currency: null,
      market: null,
      pricedAt: null,
      available: null,
    })
    .where(and(inArray(piece.outfitId, outfitIds), isNotNull(piece.productId)));
}

/** The candidates kept for the Consultation's Stylings' Piece searches. */
async function candidatesOf(consultationId: string) {
  return harness.db
    .select({ styleIconId: pieceCandidates.styleIconId, category: pieceCandidates.category, candidates: pieceCandidates.candidates })
    .from(pieceCandidates)
    .innerJoin(styling, eq(styling.id, pieceCandidates.stylingId))
    .where(eq(styling.consultationId, consultationId));
}

/** What each of the Consultation's Outfits stored about its Preview, in Outfit order. */
async function previewsOf(consultationId: string) {
  return harness.db
    .select({
      previewState: outfit.previewState,
      previewPathname: outfit.previewPathname,
      previewRefusalReason: outfit.previewRefusalReason,
    })
    .from(outfit)
    .where(eq(outfit.consultationId, consultationId))
    .orderBy(asc(outfit.position));
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Every row of every table in the database, each as its JSON text. */
async function everyRowAsText(): Promise<string> {
  const { rows: tables } = (await harness.db.execute(
    sql`select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
  )) as unknown as { rows: { name: string }[] };
  expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining(["piece", "outfit", "consultation"]));
  const texts: string[] = [];
  for (const { name } of tables) {
    const { rows } = (await harness.db.execute(sql`select row_to_json(t)::text as row from ${sql.identifier(name)} t`)) as unknown as {
      rows: { row: string }[];
    };
    texts.push(...rows.map(({ row }) => row));
  }
  return texts.join("\n");
}

/** The fingerprint of the Product photo a seller serves at `url`, as the fake image model records it. */
function productPhotoFingerprint(url: string, format: ProductPhotoFormat = "png") {
  return { mediaType: `image/${format}`, sha256: sha256(productPhotoBytes(url, format)) };
}

let userCount = 0;

/** A new user, signed in, who has verified their email by its link. */
async function signedInUser(overrides: Partial<SignUpInput> = {}): Promise<TestBrowser> {
  userCount += 1;
  const browser = new TestBrowser();
  const email = `styling.user${userCount}@example.com`;
  const result = await signUp(harness.context(browser), {
    birthDate: { day: "2", month: "2", year: "1992" },
    username: `styling_user_${userCount}`,
    email,
    password: "a long enough password",
    stylePreference: "menswear",
    countryCode: "US",
    acceptedTerms: true,
    ...overrides,
  });
  expect(result).toEqual({ ok: true });
  await harness.openEmailedLink(overrides.email ?? email, browser);
  return browser;
}

async function jpeg(): Promise<Blob> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}
