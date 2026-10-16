import { and, asc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type BudgetTier, byCategoryOrder, type PhotoType } from "@/config/consultations";
import { consultation, outfit, piece, qlooCache, styleIcon, styling, user } from "@/server/db/schema";
import { readConsultation, startConsultation } from "@/server/operations/consultations";
import { readSignedInUser } from "@/server/operations/session";
import { readStylingStatus, type StylingProgressView } from "@/server/operations/stylings";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { qlooPerson, qlooResponse, type RecordedQlooRequest } from "@/server/qloo/fake";
import { createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// Made-up people, shaped like Qloo's person entities.
const WOMEN = [qlooPerson("w-1", "Ava Stone", 0.94), qlooPerson("w-2", "Bea Marsh", 0.91), qlooPerson("w-3", "Cleo Hart", 0.88)];
const MEN = [qlooPerson("m-1", "Dev Rowe", 0.93), qlooPerson("m-2", "Eli Frost", 0.9), qlooPerson("m-3", "Finn Ash", 0.85)];
const SIX_WOMEN = [
  ...WOMEN,
  qlooPerson("w-4", "Dana Reed", 0.86),
  qlooPerson("w-5", "Esme Vale", 0.84),
  qlooPerson("w-6", "Fay Lowe", 0.8),
];

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
  harness.ai.duringCall = undefined;
  harness.stylings.pending.length = 0;
  harness.qloo.requests.length = 0;
  harness.qloo.respond = qlooAnswering({ female: WOMEN, male: MEN });
  harness.qloo.duringRequest = undefined;
  await harness.db.delete(qlooCache);
});

describe("a new Consultation's first Styling", () => {
  it("starts with the Consultation, which shows Styling… until it finishes", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });
    harness.clock.set("2026-10-16T12:30:00Z");

    const consultationId = await start(browser, "full_body");

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ state: "styling", outfits: [] });
    expect(await readStylingStatus(harness.context(browser), consultationId)).toEqual({
      state: "styling",
      progress: { stage: "style_icons", previews: { done: 0, of: 2 }, slow: false },
    });
    expect(await stylingsOf(consultationId)).toEqual([
      {
        id: harness.stylings.pending[0],
        consultationId,
        userId: (await readSignedInUser(harness.context(browser)))!.id,
        kind: "first",
        budgetTier: "no_budget",
        photoStyle: ["casual"],
        status: "running",
        stage: "style_icons",
        stageMovedAt: new Date("2026-10-16T12:30:00Z"),
        outfitsWanted: 2,
        outfitsMade: 0,
        tailoringFailures: 0,
        failureReason: null,
        workflowRunId: expect.any(String),
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
        priceRange: null,
        pieces: [{ category: "hairstyle", item: expect.any(String), why: expect.stringContaining("Ava Stone"), brand: null }],
      },
      {
        id: expect.any(String),
        position: 2,
        styleIconName: "Bea Marsh",
        preview: { state: "ready", url: expect.any(String) },
        priceRange: null,
        pieces: [{ category: "hairstyle", item: expect.any(String), why: expect.stringContaining("Bea Marsh"), brand: null }],
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

  it("come from the next Style Icon, quietly taking the place of one whose tailoring failed after its retry", async () => {
    harness.ai.styleIconScenarios = { "Ava Stone": "tailoring-fails" };
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toEqual([
      expect.objectContaining({ position: 1, styleIconName: "Cleo Hart", pieces: [expect.objectContaining({ category: "hairstyle" })] }),
      expect.objectContaining({ position: 2, styleIconName: "Bea Marsh", pieces: [expect.objectContaining({ category: "hairstyle" })] }),
    ]);
    expect(await styleIconStatuses(consultationId)).toEqual([
      ["Ava Stone", "skipped"],
      ["Bea Marsh", "used"],
      ["Cleo Hart", "used"],
    ]);
    expect(await stylingsOf(consultationId)).toEqual([
      expect.objectContaining({ status: "succeeded", outfitsMade: 2, tailoringFailures: 1 }),
    ]);
    expect(harness.ai.tailoringRequests.map((request) => request.styleIconName).toSorted()).toEqual([
      "Ava Stone",
      "Ava Stone",
      "Bea Marsh",
      "Cleo Hart",
    ]);
  });

  it("stop coming from substitutes after 2, so a broken model can't burn through the Style Icons", async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    harness.ai.styleIconScenarios = { "Ava Stone": "tailoring-fails", "Cleo Hart": "tailoring-fails", "Dana Reed": "tailoring-fails" };
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toEqual([
      expect.objectContaining({ position: 1, styleIconName: "Bea Marsh" }),
    ]);
    expect(await styleIconStatuses(consultationId)).toEqual([
      ["Ava Stone", "skipped"],
      ["Bea Marsh", "used"],
      ["Cleo Hart", "skipped"],
      ["Dana Reed", "skipped"],
      ["Esme Vale", "unused"],
      ["Fay Lowe", "unused"],
    ]);
    expect(await stylingsOf(consultationId)).toEqual([
      expect.objectContaining({ status: "succeeded", outfitsWanted: 2, outfitsMade: 1, tailoringFailures: 3 }),
    ]);
  });

  it("fail the Styling as nothing could be built when tailoring keeps failing, after 2 substitutes", async () => {
    harness.qloo.respond = qlooAnswering({ female: SIX_WOMEN });
    harness.ai.scenario = "tailoring-fails";
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "face");
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ state: "no_outfits", outfits: [] });
    expect(await stylingsOf(consultationId)).toEqual([
      expect.objectContaining({ status: "failed", failureReason: "nothing_built", outfitsMade: 0, tailoringFailures: 4 }),
    ]);
    expect((await styleIconStatuses(consultationId)).map(([, status]) => status)).toEqual([
      "skipped",
      "skipped",
      "skipped",
      "skipped",
      "unused",
      "unused",
    ]);
    // Each Style Icon's bad reply was retried once.
    expect(harness.ai.tailoringRequests).toHaveLength(8);
  });

  it("are tailored from the photo itself and the Outfit, with each Brand Piece's Brand, never the Country or the Budget Tier", async () => {
    harness.qloo.respond = qlooAnswering({ male: [MEN[0]!] });
    const browser = await signedInUser({ stylePreference: "menswear", countryCode: "FR", birthDate: { day: "2", month: "2", year: "1992" } });

    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();

    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
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
          { category: "top", brand: { name: "Bolt", categoryTags: ["apparel"], priceRangeUsd: { min: 20, max: 120 } } },
          { category: "bottom", brand: { name: "Jeanery", categoryTags: ["apparel", "denim"], priceRangeUsd: { min: 50, max: 110 } } },
          { category: "shoes", brand: { name: "Stride", categoryTags: ["footwear"], priceRangeUsd: { min: 60, max: 180 } } },
        ],
      },
    ]);
  });
});

describe("a body photo's Outfits", () => {
  it("are built on Brands: a Full-Body Photo's have a Hairstyle, Top, Bottom and Shoes, with each Brand's price range and Visit link", async () => {
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();

    const { outfits } = (await readConsultation(harness.context(browser), consultationId))!;
    expect(outfits).toEqual([
      {
        id: expect.any(String),
        position: 1,
        styleIconName: "Ava Stone",
        preview: { state: "ready", url: expect.any(String) },
        // Stride 60–180, Bolt 20–120 and Jeanery 50–110.
        priceRange: { min: 130, max: 410 },
        pieces: [
          { category: "hairstyle", item: expect.any(String), why: expect.stringContaining("Ava Stone"), brand: null },
          {
            category: "top",
            item: expect.any(String),
            why: expect.stringContaining("Ava Stone"),
            brand: { name: "Bolt", priceRange: { min: 20, max: 120 }, visitUrl: "https://bolt.example/" },
          },
          // Jeanery has no official site, so no Visit link.
          { category: "bottom", item: expect.any(String), why: expect.any(String), brand: { name: "Jeanery", priceRange: { min: 50, max: 110 }, visitUrl: null } },
          {
            category: "shoes",
            item: expect.any(String),
            why: expect.any(String),
            brand: { name: "Stride", priceRange: { min: 60, max: 180 }, visitUrl: "https://stride.example/" },
          },
        ],
      },
      expect.objectContaining({
        position: 2,
        styleIconName: "Bea Marsh",
        // Sole 40–90 and Bolt 20–120; Dune has no price data.
        priceRange: { min: 60, max: 210 },
        pieces: [
          expect.objectContaining({ category: "hairstyle", brand: null }),
          expect.objectContaining({ category: "top", brand: { name: "Dune", priceRange: null, visitUrl: "https://dune.example/" } }),
          expect.objectContaining({ category: "bottom", brand: { name: "Bolt", priceRange: { min: 20, max: 120 }, visitUrl: "https://bolt.example/" } }),
          // Sole's official site is http, so no Visit link.
          expect.objectContaining({ category: "shoes", brand: { name: "Sole", priceRange: { min: 40, max: 90 }, visitUrl: null } }),
        ],
      }),
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

  it("can make the Top and Bottom one One-Piece on the Top Brand, shown as one row, with the Bottom Brand left out but kept reserved", async () => {
    harness.ai.styleIconScenarios = { "Ava Stone": "one-piece" };
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();

    const { outfits } = (await readConsultation(harness.context(browser), consultationId))!;
    expect(outfits[0]).toEqual({
      id: expect.any(String),
      position: 1,
      styleIconName: "Ava Stone",
      preview: { state: "ready", url: expect.any(String) },
      // Bolt 20–120 and Stride 60–180: Jeanery, the Bottom Brand Qloo picked, is left out.
      priceRange: { min: 80, max: 300 },
      pieces: [
        expect.objectContaining({ category: "hairstyle", brand: null }),
        {
          category: "one_piece",
          item: expect.any(String),
          why: expect.stringContaining("Ava Stone"),
          brand: { name: "Bolt", priceRange: { min: 20, max: 120 }, visitUrl: "https://bolt.example/" },
        },
        expect.objectContaining({ category: "shoes", brand: { name: "Stride", priceRange: { min: 60, max: 180 }, visitUrl: "https://stride.example/" } }),
      ],
    });
    expect(outfits[1]!.pieces.map((p) => p.category)).toEqual(["hairstyle", "top", "bottom", "shoes"]);
    expect(harness.ai.previewRequests.map((request) => request.pieces.map((p) => p.category))).toContainEqual(["hairstyle", "one_piece", "shoes"]);
    const [picks] = await harness.db
      .select({ top: outfit.topBrandEntityId, bottom: outfit.bottomBrandEntityId, shoes: outfit.shoesBrandEntityId })
      .from(outfit)
      .where(and(eq(outfit.consultationId, consultationId), eq(outfit.position, 1)));
    expect(picks).toEqual({ top: "b-bolt", bottom: "b-jeanery", shoes: "b-stride" });
  });

  it("never offer a One-Piece Outfit's left-out Bottom Brand to a later Outfit as its Bottom", async () => {
    // Bea Marsh's tailoring fails, so Cleo Hart's Outfit is planned after Ava Stone's One-Piece is saved.
    harness.ai.styleIconScenarios = { "Ava Stone": "one-piece", "Bea Marsh": "tailoring-fails" };
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => [p.category, p.brand?.name])])).toEqual([
      ["Ava Stone", [["one_piece", "Bolt"], ["shoes", "Stride"]]],
      // Jeanery, denim in Qloo's top 10, would be the Bottom if Ava Stone's Outfit hadn't kept it reserved.
      ["Cleo Hart", [["top", "Dune"], ["bottom", "Bolt"], ["shoes", "Sole"]]],
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

  it("is drawn from the photo, the Photo Type and each Piece's details, never the Style Icon", async () => {
    harness.qloo.respond = qlooAnswering({ female: [WOMEN[0]!] });
    const browser = await signedInUser({ stylePreference: "womenswear" });

    const consultationId = await start(browser, "full_body");
    await harness.stylings.runPending();

    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    const pieces = (await piecesOf(consultationId)).toSorted(byCategoryOrder);
    expect(pieces.map((p) => p.category)).toEqual(["hairstyle", "top", "bottom", "shoes"]);
    expect(harness.ai.previewRequests).toEqual([
      {
        photo: { mediaType: "image/jpeg", sha256: sha256(harness.blob.objects.get(stored!.photoPathname)!.bytes) },
        photoType: "full_body",
        pieces: pieces.map(({ category, details }) => ({ category, details })),
      },
    ]);
    expect(JSON.stringify(harness.ai.previewRequests)).not.toContain("Ava Stone");
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
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ state: "no_outfits", outfits: [] });
    expect(await readStylingStatus(harness.context(browser), consultationId)).toEqual({ state: "no_outfits", progress: null });
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
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({ state: "no_outfits", outfits: [] });
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
      { stage: "building_outfits", previews: { done: 0, of: 2 }, slow: false },
      { stage: "previews", previews: { done: 0, of: 2 }, slow: false },
      { stage: "previews", previews: { done: 1, of: 2 }, slow: false },
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
      { stage: "building_outfits", previews: { done: 0, of: 2 }, slow: false },
      { stage: "previews", previews: { done: 0, of: 1 }, slow: false },
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
    harness.ai.duringCall = async (call) => {
      if (call !== "tailorPieces" || looked) return;
      looked = true;
      seen.push(await slow());
      harness.clock.set("2026-10-16T12:33:01Z");
      seen.push(await slow());
    };

    await harness.stylings.runPending();

    expect(seen).toEqual([false, true]);
  });
});

it("starts no Styling for a rejected photo", async () => {
  const browser = await signedInUser();
  harness.ai.scenario = "no-person";

  const result = await startConsultation(harness.context(browser), { photo: await jpeg(), photoType: "full_body" });

  expect(result).toMatchObject({ ok: false, refusal: "photo-rejected" });
  expect(harness.stylings.pending).toEqual([]);
  expect(await harness.db.select().from(styling)).not.toContainEqual(
    expect.objectContaining({ userId: (await readSignedInUser(harness.context(browser)))!.id }),
  );
});

/** A Qloo Brand entity, as Qloo sends it, for everyone unless `targetGender` says otherwise. */
function qlooBrand(
  entityId: string,
  name: string,
  {
    categories,
    affinity,
    price,
    officialSite = null,
    targetGender = ["Male", "Female"],
  }: { categories: string[]; affinity: number; price?: [number, number]; officialSite?: string | null; targetGender?: string[] },
) {
  return {
    entity_id: entityId,
    name,
    type: "urn:entity",
    subtype: "urn:entity:brand",
    properties: {
      target_gender: targetGender,
      price_range_usd_min: price?.[0] ?? null,
      price_range_usd_max: price?.[1] ?? null,
      official_site: officialSite,
    },
    tags: [
      { id: "urn:tag:genre:brand:fashion", type: "urn:tag:genre:brand" },
      ...categories.map((category) => ({ id: `urn:tag:product_category:qloo:${category}`, type: "urn:tag:product_category:qloo" })),
    ],
    query: { affinity },
  };
}

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

/** The Qloo requests that went out for Style Icons. */
function personCalls(): URLSearchParams[] {
  return harness.qloo.requests.map((request) => request.url.searchParams).filter((params) => params.get("filter.type") === "urn:entity:person");
}

/** The Qloo requests that went out for Brands. */
function brandCalls(): URLSearchParams[] {
  return harness.qloo.requests.map((request) => request.url.searchParams).filter((params) => params.get("filter.type") === "urn:entity:brand");
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

/** Presses "Get my Outfits" with a plain JPEG, returning the new Consultation's id. */
async function start(browser: TestBrowser, photoType: PhotoType, budgetTier?: BudgetTier): Promise<string> {
  const result = await startConsultation(harness.context(browser), { photo: await jpeg(), photoType, budgetTier });
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
  return result.consultationId;
}

async function stylingsOf(consultationId: string) {
  return harness.db.select().from(styling).where(eq(styling.consultationId, consultationId));
}

/** Each ranked Style Icon's name and whether it was used, best first. */
async function styleIconStatuses(consultationId: string) {
  const icons = await harness.db
    .select({ name: styleIcon.name, status: styleIcon.status })
    .from(styleIcon)
    .where(eq(styleIcon.consultationId, consultationId))
    .orderBy(asc(styleIcon.position));
  return icons.map(({ name, status }) => [name, status]);
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

let userCount = 0;

/** Signs up a new adult user and returns their signed-in browser. */
async function signedInUser(overrides: Partial<SignUpInput> = {}): Promise<TestBrowser> {
  userCount += 1;
  const browser = new TestBrowser();
  const result = await signUp(harness.context(browser), {
    birthDate: { day: "2", month: "2", year: "1992" },
    username: `styling_user_${userCount}`,
    email: `styling.user${userCount}@example.com`,
    password: "a long enough password",
    stylePreference: "menswear",
    countryCode: "US",
    acceptedTerms: true,
    ...overrides,
  });
  expect(result).toEqual({ ok: true });
  return browser;
}

async function jpeg(): Promise<Blob> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}
