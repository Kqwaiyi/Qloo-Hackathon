import { and, eq, inArray, isNotNull } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { brandMatch, exchangeRate, outfit, piece, qlooCache, usageRecord } from "@/server/db/schema";
import { updateProfile } from "@/server/operations/account";
import { readConsultation, startConsultation } from "@/server/operations/consultations";
import { refreshPrices } from "@/server/operations/price-refresh";
import { readSignedInUser } from "@/server/operations/session";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import {
  channel3NotFound,
  channel3Offer,
  channel3Product,
  channel3ProductCheck,
  channel3ProductDetail,
  channel3SellingEveryBrand,
  channel3TooManyRequests,
} from "@/server/product-search/fake-channel3";
import type { ProductCheck } from "@/server/product-search/provider";
import { qlooBrand, qlooPerson, qlooResponse } from "@/server/qloo/fake";
import { BOTH_CONSENT_BOXES_TICKED, createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// Made-up Brands, shaped like Qloo's Brand entities. A womenswear Body-Only Photo's one Outfit is
// Bolt's Top, Jeanery's Bottom (denim) and Stride's Shoes, which the fake Channel3 sells for 45, 50
// and 60 dollars in the US market: the nearest to 45 within each Brand's price range.
const BRANDS = [
  qlooBrand("b-stride", "Stride", { categories: ["footwear"], affinity: 0.97, price: [60, 180], officialSite: "https://stride.example/" }),
  qlooBrand("b-bolt", "Bolt", { categories: ["apparel"], affinity: 0.95, price: [20, 120], officialSite: "https://bolt.example/" }),
  qlooBrand("b-sole", "Sole", { categories: ["footwear"], affinity: 0.93, price: [40, 90] }),
  qlooBrand("b-dune", "Dune", { categories: ["apparel"], affinity: 0.9 }),
  qlooBrand("b-jeanery", "Jeanery", { categories: ["apparel", "denim"], affinity: 0.88, price: [50, 110] }),
];

/** The one Style Icon Qloo finds, so each Consultation has one Outfit. */
const STYLE_ICON = qlooPerson("w-1", "Ava Stone", 0.94);

/** The Outfit's Products, as the fake Channel3 sells them and the fake AI picks them: each Category's first. */
const TOP = "c3-bolt-top-1";
const BOTTOM = "c3-jeanery-bottom-1";
const SHOES = "c3-stride-shoes-1";

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

beforeEach(async () => {
  harness.clock.set("2026-10-16T12:00:00Z");
  harness.ai.scenario = "pass";
  harness.stylings.pending.length = 0;
  harness.qloo.respond = (request) =>
    qlooResponse(request.url.searchParams.get("filter.type") === "urn:entity:brand" ? BRANDS : [STYLE_ICON]);
  harness.channel3.requests.length = 0;
  harness.channel3.respond = channel3SellingEveryBrand();
  harness.channel3.duringRequest = undefined;
  await harness.db.delete(qlooCache);
  await harness.db.delete(brandMatch);
  await harness.db.delete(exchangeRate);
  // The app-wide caps count every user's Outfits, so each test starts with none made.
  await harness.db.delete(usageRecord);
});

describe("the price refresh", () => {
  it("is asked for by the Consultation's page, once it has shown the stored prices, only while one of its Products wasn't checked today", async () => {
    const browser = await signedInUser();
    const consultationId = await styledConsultation(browser);
    harness.channel3.respond = channel3SellingEveryBrand({ checks: ({ productId }) => offeredAt(productId, 52) });
    expect(await consultationShown(browser, consultationId)).toMatchObject({ productsToCheck: false });

    harness.clock.set("2026-10-17T09:00:00Z");
    expect(await consultationShown(browser, consultationId)).toMatchObject({
      productsToCheck: true,
      outfits: [{ total: "$155", pieces: [{ product: { price: "$45", pricedOn: "2026-10-16" } }, {}, {}] }],
    });

    await refreshPrices(harness.context(browser), consultationId);
    expect(await consultationShown(browser, consultationId)).toMatchObject({ productsToCheck: false });
  });

  it("checks each Product found before today in the market it was found in, storing the price it's offered at now, dated today", async () => {
    const browser = await signedInUser({ countryCode: "US" });
    const consultationId = await styledConsultation(browser);
    harness.clock.set("2026-10-17T09:00:00Z");
    harness.channel3.requests.length = 0;
    harness.channel3.respond = channel3SellingEveryBrand({ checks: ({ productId }) => offeredAt(productId, 52) });

    expect(await refreshPrices(harness.context(browser), consultationId)).toEqual({ ok: true });

    expect(productChecks()).toEqual([
      { productId: TOP, market: "US" },
      { productId: BOTTOM, market: "US" },
      { productId: SHOES, market: "US" },
    ]);
    // 52 dollars each, now.
    expect(await outfitShown(browser, consultationId)).toMatchObject({
      total: "$156",
      pieces: [
        { category: "top", product: { price: "$52", pricedOn: "2026-10-17" } },
        { category: "bottom", product: { price: "$52", pricedOn: "2026-10-17" } },
        { category: "shoes", product: { price: "$52", pricedOn: "2026-10-17" } },
      ],
    });
  });

  it("links each Product to the offer the offer rule picks again: the Brand's own store's, or else the first new, in-stock one, never a second-hand one", async () => {
    const browser = await signedInUser();
    const consultationId = await styledConsultation(browser);
    harness.clock.set("2026-10-17T09:00:00Z");
    const offers: Record<string, object[]> = {
      // Bolt's official site is bolt.example.
      [TOP]: [
        channel3Offer({ url: "https://shop.example/products/overshirt", domain: "shop.example", price: 52 }),
        channel3Offer({ url: "https://www.bolt.example/used/overshirt", domain: "www.bolt.example", price: 30, condition: "used" }),
        channel3Offer({ url: "https://www.bolt.example/overshirt", domain: "www.bolt.example", price: 49 }),
      ],
      // Jeanery has no official site.
      [BOTTOM]: [
        channel3Offer({ url: "https://resale.example/jeans", domain: "resale.example", price: 20, condition: "used" }),
        channel3Offer({ url: "https://shop.example/products/jeans", domain: "shop.example", price: 40, availability: "OutOfStock" }),
        channel3Offer({ url: "https://outlet.example/jeans", domain: "outlet.example", price: 55 }),
      ],
      [SHOES]: [channel3Offer({ url: "https://shop.example/products/trainers", domain: "shop.example", price: 61 })],
    };
    harness.channel3.respond = channel3SellingEveryBrand({
      checks: ({ productId }) => channel3ProductDetail(channel3Product(productId, { offers: offers[productId] })),
    });

    await refreshPrices(harness.context(browser), consultationId);

    expect(await outfitShown(browser, consultationId)).toMatchObject({
      total: "$165",
      pieces: [
        { category: "top", product: { price: "$49", pricedOn: "2026-10-17", url: "https://www.bolt.example/overshirt", shopDomain: "www.bolt.example" } },
        { category: "bottom", product: { price: "$55", pricedOn: "2026-10-17", url: "https://outlet.example/jeans", shopDomain: "outlet.example" } },
        { category: "shoes", product: { price: "$61", pricedOn: "2026-10-17", url: "https://shop.example/products/trainers", shopDomain: "shop.example" } },
      ],
    });
  });

  it.each<[string, () => Response]>([
    ["no longer knows it", () => channel3NotFound()],
    ["has no offer of it there", () => channel3ProductDetail(channel3Product(BOTTOM, { offers: [] }))],
    [
      "offers it only out of stock or second-hand",
      () =>
        channel3ProductDetail(
          channel3Product(BOTTOM, { offers: [channel3Offer({ availability: "OutOfStock" }), channel3Offer({ condition: "used" })] }),
        ),
    ],
  ])(
    "shows a Product as no longer available once the check %s, keeping its name, why and Brand, and leaves it out of the total",
    async (_, noOffer) => {
      const browser = await signedInUser();
      const consultationId = await styledConsultation(browser);
      const before = (await outfitShown(browser, consultationId))!.pieces[1];
      harness.clock.set("2026-10-17T09:00:00Z");
      harness.channel3.respond = channel3SellingEveryBrand({ checks: ({ productId }) => (productId === BOTTOM ? noOffer() : offeredAt(productId, 52)) });

      await refreshPrices(harness.context(browser), consultationId);

      // Bolt's and Stride's, at 52 dollars each.
      expect(await outfitShown(browser, consultationId)).toMatchObject({
        preview: { state: "ready" },
        total: "$104",
        leftOutOfTotal: 1,
        pieces: [
          { category: "top", product: { available: true, price: "$52" } },
          { category: "bottom", item: before!.item, why: before!.why, brand: before!.brand, product: { available: false } },
          { category: "shoes", product: { available: true, price: "$52" } },
        ],
      });
      expect((await outfitShown(browser, consultationId))!.pieces[1]!.product).toEqual({ available: false });
    },
  );

  it("checks a Product that's no longer available again the next day, not before, and shows it again once it's offered", async () => {
    const browser = await signedInUser();
    const consultationId = await styledConsultation(browser);
    harness.clock.set("2026-10-17T09:00:00Z");
    harness.channel3.respond = channel3SellingEveryBrand({ checks: ({ productId }) => (productId === BOTTOM ? channel3NotFound() : offeredAt(productId, 52)) });
    await refreshPrices(harness.context(browser), consultationId);
    harness.clock.set("2026-10-17T18:00:00Z");
    await refreshPrices(harness.context(browser), consultationId);
    expect(productChecks().filter(({ productId }) => productId === BOTTOM)).toHaveLength(1);

    harness.clock.set("2026-10-18T09:00:00Z");
    harness.channel3.respond = channel3SellingEveryBrand({ checks: ({ productId }) => offeredAt(productId, productId === BOTTOM ? 58 : 52) });
    await refreshPrices(harness.context(browser), consultationId);

    expect(await outfitShown(browser, consultationId)).toMatchObject({
      total: "$162",
      leftOutOfTotal: 0,
      pieces: [
        { category: "top", product: { available: true, price: "$52", pricedOn: "2026-10-18" } },
        {
          category: "bottom",
          product: { available: true, price: "$58", pricedOn: "2026-10-18", url: `https://shop.example/products/${BOTTOM}`, shopDomain: "shop.example" },
        },
        { category: "shoes", product: { available: true, price: "$52", pricedOn: "2026-10-18" } },
      ],
    });
  });

  it.each<[string, () => Response]>([
    ["answers with an error", () => Response.json({ detail: "Bad gateway" }, { status: 502 })],
    ["answers too many requests", () => channel3TooManyRequests()],
    [
      "can't reach Channel3",
      () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])("changes nothing of a Product whose check %s, and checks it again on the next visit that day", async (_, error) => {
    const browser = await signedInUser();
    const consultationId = await styledConsultation(browser);
    const bottomBefore = (await outfitShown(browser, consultationId))!.pieces[1];
    harness.clock.set("2026-10-17T09:00:00Z");
    harness.channel3.respond = channel3SellingEveryBrand({ checks: ({ productId }) => (productId === BOTTOM ? error() : offeredAt(productId, 52)) });

    expect(await refreshPrices(harness.context(browser), consultationId)).toEqual({ ok: true });

    // Bolt's and Stride's at 52 dollars now, and Jeanery's still at the 50 it was found at.
    expect(await consultationShown(browser, consultationId)).toMatchObject({
      productsToCheck: true,
      outfits: [
        {
          total: "$154",
          pieces: [
            { category: "top", product: { price: "$52", pricedOn: "2026-10-17" } },
            { ...bottomBefore, product: { available: true, price: "$50", pricedOn: "2026-10-16" } },
            { category: "shoes", product: { price: "$52", pricedOn: "2026-10-17" } },
          ],
        },
      ],
    });

    harness.channel3.requests.length = 0;
    harness.channel3.respond = channel3SellingEveryBrand({ checks: ({ productId }) => offeredAt(productId, 52) });
    harness.clock.set("2026-10-17T10:00:00Z");
    await refreshPrices(harness.context(browser), consultationId);

    expect(productChecks()).toEqual([{ productId: BOTTOM, market: "US" }]);
    expect(await outfitShown(browser, consultationId)).toMatchObject({ total: "$156" });
  });

  it("is only for the Consultation's owner: anyone else's, or a signed-out visitor's, is refused as not found, checking nothing", async () => {
    const owner = await signedInUser();
    const consultationId = await styledConsultation(owner);
    harness.clock.set("2026-10-17T09:00:00Z");
    harness.channel3.respond = channel3SellingEveryBrand({ checks: ({ productId }) => offeredAt(productId, 52) });

    expect(await refreshPrices(harness.context(await signedInUser()), consultationId)).toEqual({ ok: false, refusal: "not-found" });
    expect(await refreshPrices(harness.context(new TestBrowser()), consultationId)).toEqual({ ok: false, refusal: "signed-out" });

    expect(productChecks()).toEqual([]);
    expect(await consultationShown(owner, consultationId)).toMatchObject({ productsToCheck: true, outfits: [{ total: "$155" }] });
  });

  it("never checks a Piece made before Products, so it isn't asked for on a Consultation of them", async () => {
    const browser = await signedInUser();
    const consultationId = await styledConsultation(browser);
    await asMadeBeforeProducts(consultationId);
    harness.clock.set("2026-10-17T09:00:00Z");
    harness.channel3.respond = channel3SellingEveryBrand({ checks: ({ productId }) => offeredAt(productId, 52) });
    expect(await consultationShown(browser, consultationId)).toMatchObject({ productsToCheck: false });

    expect(await refreshPrices(harness.context(browser), consultationId)).toEqual({ ok: true });

    expect(productChecks()).toEqual([]);
    // Bolt 20–120, Jeanery 50–110 and Stride 60–180 dollars.
    expect(await outfitShown(browser, consultationId)).toMatchObject({
      total: "$130–$410",
      pieces: [{ product: null }, { product: null }, { product: null }],
    });
  });

  it("sends at most 3 checks at once, as Channel3's rate limit is shared with every Styling's calls", async () => {
    harness.qloo.respond = (request) =>
      qlooResponse(request.url.searchParams.get("filter.type") === "urn:entity:brand" ? BRANDS : [STYLE_ICON, qlooPerson("w-2", "Bea Marsh", 0.91)]);
    const browser = await signedInUser();
    const consultationId = await styledConsultation(browser);
    harness.clock.set("2026-10-17T09:00:00Z");
    harness.channel3.respond = channel3SellingEveryBrand({ checks: ({ productId }) => offeredAt(productId, 52) });
    let inFlight = 0;
    let mostInFlight = 0;
    harness.channel3.duringRequest = async () => {
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    };

    await refreshPrices(harness.context(browser), consultationId);

    // The two Outfits' Products: Bolt's, Jeanery's and Stride's, then Dune's, Bolt's and Sole's.
    expect(productChecks()).toHaveLength(6);
    expect(mostInFlight).toBe(3);
  });

  it("checks each Product in the market it was found in, which a change of Country since doesn't move", async () => {
    // Indonesia searches the US market.
    const browser = await signedInUser({ countryCode: "ID" });
    const consultationId = await styledConsultation(browser);
    const { username, stylePreference } = (await readSignedInUser(harness.context(browser)))!;
    expect(await updateProfile(harness.context(browser), { username, stylePreference, countryCode: "GB" })).toEqual({ ok: true });
    harness.clock.set("2026-10-17T09:00:00Z");
    harness.channel3.respond = channel3SellingEveryBrand({ checks: ({ productId }) => offeredAt(productId, 52) });

    await refreshPrices(harness.context(browser), consultationId);

    expect(productChecks().map(({ market }) => market)).toEqual(["US", "US", "US"]);
  });

  it("checks only the Products not found or checked today, so each at most once a day, however often it's opened", async () => {
    const browser = await signedInUser();
    const consultationId = await styledConsultation(browser);
    harness.channel3.respond = channel3SellingEveryBrand({ checks: ({ productId }) => offeredAt(productId, 52) });

    // Late on the day they were found, in UTC, as their prices are dated.
    harness.clock.set("2026-10-16T23:30:00Z");
    await refreshPrices(harness.context(browser), consultationId);
    expect(productChecks()).toEqual([]);

    harness.clock.set("2026-10-17T00:30:00Z");
    await refreshPrices(harness.context(browser), consultationId);
    harness.clock.set("2026-10-17T23:30:00Z");
    await refreshPrices(harness.context(browser), consultationId);
    expect(productChecks()).toEqual([
      { productId: TOP, market: "US" },
      { productId: BOTTOM, market: "US" },
      { productId: SHOES, market: "US" },
    ]);
  });
});

/** Channel3's answer to a Product check: the Product, offered new and in stock at shop.example for `price` dollars. */
function offeredAt(productId: string, price: number): Response {
  return channel3ProductDetail(
    channel3Product(productId, { offers: [channel3Offer({ url: `https://shop.example/products/${productId}`, price })] }),
  );
}

/** The Product checks that went out to Channel3, by Product. */
function productChecks(): ProductCheck[] {
  return harness.channel3.requests
    .flatMap((request) => channel3ProductCheck(request) ?? [])
    .toSorted((a, b) => a.productId.localeCompare(b.productId));
}

/** The Consultation, as its owner is shown it. */
async function consultationShown(browser: TestBrowser, consultationId: string) {
  return (await readConsultation(harness.context(browser), consultationId))!;
}

/** The Consultation's one Outfit, as its owner is shown it. */
async function outfitShown(browser: TestBrowser, consultationId: string) {
  return (await consultationShown(browser, consultationId)).outfits[0];
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

/** A Body-Only Photo Consultation whose first Styling has finished, with its one Outfit of three Products. */
async function styledConsultation(browser: TestBrowser): Promise<string> {
  const result = await startConsultation(harness.context(browser), { photo: await jpeg(), photoType: "body_only", consent: BOTH_CONSENT_BOXES_TICKED });
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
  await harness.stylings.runPending();
  return result.consultationId;
}

let userCount = 0;

/** A new womenswear user, signed in, who has verified their email by its link. */
async function signedInUser(overrides: Partial<SignUpInput> = {}): Promise<TestBrowser> {
  userCount += 1;
  const browser = new TestBrowser();
  const email = `price.refresh${userCount}@example.com`;
  const result = await signUp(harness.context(browser), {
    birthDate: { day: "2", month: "2", year: "1992" },
    username: `price_refresh_${userCount}`,
    email,
    password: "a long enough password",
    stylePreference: "womenswear",
    countryCode: "US",
    acceptedTerms: true,
    ...overrides,
  });
  expect(result).toEqual({ ok: true });
  await harness.openEmailedLink(email, browser);
  return browser;
}

async function jpeg(): Promise<Blob> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}
