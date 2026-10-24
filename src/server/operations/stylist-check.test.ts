import type { LanguageModelV4Usage } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AiProvider } from "@/server/ai/provider";
import { qlooCache } from "@/server/db/schema";
import {
  checkStylist,
  type PreviewDrawer,
  type StylistCheckApp,
  StylistCheckAi,
  StylistCheckBlob,
  type StylistCheckResult,
} from "@/server/operations/stylist-check";
import { ProductPhotos } from "@/server/product-photos/photos";
import { productPhoto } from "@/server/product-photos/fake";
import { channel3Search, channel3SellingEveryBrand } from "@/server/product-search/fake-channel3";
import { QlooClient } from "@/server/qloo/client";
import { qlooBrand, qlooPerson, qlooResponse, type RecordedQlooRequest } from "@/server/qloo/fake";
import { InlineStylingRunner } from "@/server/stylings/inline-runner";
import { createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// The Stylist check (the Haiku check): the team's script runs the real Stylist on fixed photos,
// each as a new user would be styled, and reports what came of it. Here it runs on the fake AI's
// scripted Stylist, with Qloo and Channel3 faked, on a check app of its own, as the script builds one.

// Made-up people and Brands, shaped like Qloo's entities. A body photo's first Outfit is Stride,
// Bolt and Jeanery (denim, so the Bottom), its second Sole, Dune and Bolt.
const STYLE_ICONS = [qlooPerson("w-1", "Ava Stone", 0.94), qlooPerson("w-2", "Bea Marsh", 0.91), qlooPerson("w-3", "Cleo Hart", 0.88)];
const BRANDS = [
  qlooBrand("b-stride", "Stride", { categories: ["footwear"], affinity: 0.97, price: [60, 180] }),
  qlooBrand("b-bolt", "Bolt", { categories: ["apparel"], affinity: 0.95, price: [20, 120] }),
  qlooBrand("b-sole", "Sole", { categories: ["footwear"], affinity: 0.93, price: [40, 90] }),
  qlooBrand("b-dune", "Dune", { categories: ["apparel"], affinity: 0.9 }),
  qlooBrand("b-jeanery", "Jeanery", { categories: ["apparel", "denim"], affinity: 0.88, price: [50, 110] }),
  qlooBrand("b-ember", "Ember", { categories: ["apparel"], affinity: 0.85, price: [15, 60] }),
];

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness({ botCheck: false });
});

beforeEach(async () => {
  harness.clock.set("2026-10-16T12:00:00Z");
  harness.ai.scenario = "pass";
  harness.ai.stylistRequests.length = 0;
  harness.ai.previewRequests.length = 0;
  harness.ai.previewScenarios = [];
  harness.ai.previewVerdicts = [];
  harness.ai.verdictRequests.length = 0;
  harness.ai.stylistTurn = undefined;
  harness.ai.duringCall = undefined;
  harness.ai.styleIconScenarios = {};
  harness.qloo.requests.length = 0;
  harness.qloo.respond = qlooAnswering(STYLE_ICONS);
  harness.channel3.requests.length = 0;
  harness.channel3.respond = channel3SellingEveryBrand();
  harness.productPhotos.respond = (url) => productPhoto(url);
  await harness.db.delete(qlooCache);
});

describe("the Stylist check", () => {
  it("styles the photo as a new user in the United States would be, at everyone's limits, and reports its Outfits", async () => {
    const result = await checkStylist(checkApp(), { photoType: "full_body", photo: await jpegPhoto(), stylePreference: "menswear" });

    expect(result).toMatchObject({
      styled: true,
      outfitsWanted: 2,
      outfits: [
        {
          position: 1,
          styleIconName: "Ava Stone",
          pieces: [
            { category: "hairstyle", brand: null },
            { category: "top", item: "Product c3-bolt-top-1", brand: "Bolt" },
            { category: "bottom", item: "Product c3-jeanery-bottom-1", brand: "Jeanery" },
            { category: "shoes", item: "Product c3-stride-shoes-1", brand: "Stride" },
          ],
          preview: "kept",
          correction: null,
        },
        {
          position: 2,
          styleIconName: "Bea Marsh",
          pieces: [{ category: "hairstyle" }, { brand: "Dune" }, { brand: "Bolt" }, { brand: "Sole" }],
          preview: "kept",
          correction: null,
        },
      ],
      ending: "finished",
      turnCap: 30,
      problems: [],
    });
    // Every search was in the menswear line, in the United States.
    const searches = harness.channel3.requests.filter(({ url }) => url.pathname === "/v1/browse").map(channel3Search);
    expect(new Set(searches.map(({ gender, market }) => `${gender} in ${market}`))).toEqual(new Set(["male in US"]));
  });

  it("reports how long the Styling took, the product searches it made and the Stylist's Notes", async () => {
    // Each of the Stylist's turns, each Preview and each verdict takes a second.
    harness.ai.duringCall = async (call) => {
      if (call !== "checkPhoto") harness.clock.set(new Date(harness.clock.now().getTime() + 1000));
    };

    const result = await checkStylist(checkApp(), { photoType: "body_only", photo: await jpegPhoto(), stylePreference: "menswear" });

    const calls = harness.ai.stylistRequests.length + harness.ai.previewRequests.length + harness.ai.verdictRequests.length;
    const searches = harness.channel3.requests.filter(({ url }) => url.pathname === "/v1/browse");
    expect(searches.length).toBeGreaterThan(0);
    expect(result).toMatchObject({ styled: true, durationMs: calls * 1000, productSearches: searches.length });
    expect(result.styled && result.notes).toEqual(
      expect.arrayContaining([
        { kind: "step", text: "Saved Outfit 1, inspired by Ava Stone" },
        { kind: "step", text: "Saved Outfit 2, inspired by Bea Marsh" },
      ]),
    );
  });

  it("styles each photo as a new user, so one Styling never limits the next, and reports each Styling's own turns", async () => {
    const app = checkApp();
    await checkStylist(app, { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear" });
    harness.ai.stylistRequests.length = 0;

    const result = await checkStylist(app, { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear" });

    expect(result).toMatchObject({ styled: true, outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }], problems: [] });
    expect(result.styled && result.turns).toHaveLength(harness.ai.stylistRequests.length);
  });

  it("says why when the photo check rejects the photo, styling nothing", async () => {
    harness.ai.scenario = "unclear-main-person";

    const result = await checkStylist(checkApp(), { photoType: "full_body", photo: await jpegPhoto(), stylePreference: "menswear" });

    expect(result).toEqual({ styled: false, refusal: "photo-rejected", rejection: { reason: "unclear-main-person" } });
    expect(harness.qloo.requests).toEqual([]);
  });
});

describe("the Stylist check's turns", () => {
  it("reports the Stylist's cost from each turn's token usage, priced by the model that ran it, and its largest prompt", async () => {
    // Claude Haiku 5.5's prices per million tokens: $0.10 input and $0.50 output for a prompt of up
    // to 100,000 tokens, $0.50 and $2.50 past that, its cache writes 1.25 times its input and its
    // cache reads 0.1 times. Turn 2's prompt is past 100,000 tokens.
    const ai = claudeLike("claude-haiku-5-5", (turn) =>
      turn === 2 ? usage({ noCache: 10_000, cacheWrite: 20_000, cacheRead: 100_000, output: 2_000 }) : usage({ noCache: 1_000, cacheWrite: 3_000, cacheRead: 20_000, output: 500 }),
    );

    const result = await checkStylist(checkApp(ai), { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear" });

    const turns = harness.ai.stylistRequests.length;
    expect(result).toMatchObject({ styled: true, ending: "finished", largestPromptTokens: 130_000 });
    expect(result.styled && result.turns).toHaveLength(turns);
    // Each smaller turn: 1,000 × $0.10 + 3,000 × $0.125 + 20,000 × $0.01 + 500 × $0.50 per million
    // is $0.000925. Turn 2: 10,000 × $0.50 + 20,000 × $0.625 + 100,000 × $0.05 + 2,000 × $2.50 per
    // million is $0.0275.
    expect(result.styled && result.costUsd).toBeCloseTo((turns - 1) * 0.000925 + 0.0275, 9);
  });

  it("reports what the prompt cache saved, and the least each turn after the first read from it", async () => {
    const ai = claudeLike("claude-haiku-5-5", (turn) =>
      turn === 1
        ? usage({ noCache: 1_000, cacheWrite: 7_000, cacheRead: 0, output: 500 })
        : turn === 2
          ? usage({ noCache: 10_000, cacheWrite: 20_000, cacheRead: 100_000, output: 2_000 })
          : usage({ noCache: 1_000, cacheWrite: 3_000, cacheRead: 20_000, output: 500 }),
    );

    const result = await checkStylist(checkApp(ai), { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear" });

    const turns = harness.ai.stylistRequests.length;
    expect(result).toMatchObject({ styled: true, leastCacheReadAfterFirstTurn: 20_000 });
    // With nothing cached, every prompt token is input. Turn 1: 8,000 × $0.10 + 500 × $0.50 per
    // million is $0.00105. Turn 2: 130,000 × $0.50 + 2,000 × $2.50 per million is $0.07. Each turn
    // after: 24,000 × $0.10 + 500 × $0.50 per million is $0.00265.
    expect(result.styled && result.uncachedCostUsd).toBeCloseTo(0.00105 + 0.07 + (turns - 2) * 0.00265, 9);
  });

  it("reports a Stylist that ran out of turns as making no valid Outfit, and the tool calls refused on its way", async () => {
    harness.ai.scenario = "tailoring-fails";

    const result = await checkStylist(checkApp(), { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear" });

    // What the Stylist read on its last turn: every refusal it was given before.
    const refused = harness.ai.stylistRequests.at(-1)!.toolResults.filter(({ error }) => error !== null);
    expect(refused.length).toBeGreaterThan(1);
    expect(result).toMatchObject({
      styled: true,
      outfits: [],
      ending: "turn-cap",
      turnCap: 30,
      toolCallsRefused: refused.length,
      problems: ["made no Outfit", "ran out of turns"],
    });
    expect(result.styled && result.turns).toHaveLength(30);
  });

  it("says so when the Styling makes fewer Outfits than it could", async () => {
    harness.qloo.respond = qlooAnswering(STYLE_ICONS.slice(0, 1));

    const result = await checkStylist(checkApp(), { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear" });

    expect(result).toMatchObject({ styled: true, outfitsWanted: 2, outfits: [{ styleIconName: "Ava Stone" }], ending: "finished", problems: ["made 1 of 2 Outfits"] });
  });

  it("has no cost for a model it knows no price for", async () => {
    const result = await checkStylist(checkApp(), { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear" });

    expect(result).toMatchObject({ styled: true, costUsd: null });
  });
});

describe("the Stylist check's Previews", () => {
  it("has the Previews the run draws judged, in place of the image model's, and reports which were redrawn, with what correction, and which image was kept", async () => {
    harness.ai.scenario = "preview-redrawn";

    const result = await checkStylist(checkApp(), { photoType: "full_body", photo: await jpegPhoto(), stylePreference: "menswear", drawPreview: drawnIn(GREEN, PURPLE) });

    const correction = "Draw each garment exactly as its seller's photo shows it.";
    expect(result).toMatchObject({
      styled: true,
      outfits: [
        { position: 1, preview: "redrawn-kept-redraw", correction },
        { position: 2, preview: "redrawn-kept-redraw", correction },
      ],
    });
    expect(await coloursOf(result)).toEqual([
      [GREEN, PURPLE],
      [GREEN, PURPLE],
    ]);
    // The image model was never asked.
    expect(harness.ai.previewRequests).toEqual([]);
  });

  it("tells the check's drawer which Outfit each Preview is for, by its number and Style Icon", async () => {
    harness.ai.scenario = "preview-redrawn";
    const drawn: { outfit: unknown; redraw: boolean }[] = [];

    await checkStylist(checkApp(), {
      photoType: "full_body",
      photo: await jpegPhoto(),
      stylePreference: "menswear",
      drawPreview: async ({ correction }, outfit) => {
        drawn.push({ outfit, redraw: Boolean(correction) });
        return { refused: false, image: await png(GREEN) };
      },
    });

    expect(drawn).toHaveLength(4);
    expect(drawn).toEqual(
      expect.arrayContaining([
        { outfit: { position: 1, styleIconName: "Ava Stone" }, redraw: false },
        { outfit: { position: 1, styleIconName: "Ava Stone" }, redraw: true },
        { outfit: { position: 2, styleIconName: "Bea Marsh" }, redraw: false },
        { outfit: { position: 2, styleIconName: "Bea Marsh" }, redraw: true },
      ]),
    );
  });

  it("gives each Outfit the images drawn for it, even when two Outfits' Pieces are alike", async () => {
    // The fake's Face Photo Outfits have the same Hairstyle. Each first try is drawn in a colour of its own.
    harness.ai.scenario = "preview-redrawn";
    const firstColours = [GREEN, BLUE];

    const result = await checkStylist(checkApp(), {
      photoType: "face",
      photo: await jpegPhoto(),
      stylePreference: "menswear",
      drawPreview: async ({ correction }) => ({ refused: false, image: await png(correction ? PURPLE : firstColours.shift()!) }),
    });

    const [first, second] = await coloursOf(result);
    expect(first).toEqual([expect.any(String), PURPLE]);
    expect(second).toEqual([expect.any(String), PURPLE]);
    expect([first![0], second![0]].toSorted()).toEqual([GREEN, BLUE].toSorted());
  });

  it("reports an Outfit left with no Preview when neither of its images was kept", async () => {
    harness.ai.scenario = "preview-unfixable";

    const result = await checkStylist(checkApp(), { photoType: "body_only", photo: await jpegPhoto(), stylePreference: "menswear", drawPreview: drawnIn(GREEN, PURPLE) });

    const correction = "Never add a face or a head where the photo shows none.";
    expect(result).toMatchObject({
      styled: true,
      outfits: [
        { position: 1, preview: "redrawn-kept-none", correction },
        { position: 2, preview: "redrawn-kept-none", correction },
      ],
    });
    expect(await coloursOf(result)).toEqual([
      [GREEN, PURPLE],
      [GREEN, PURPLE],
    ]);
  });

  it("reports a Preview the image model declined, or that couldn't be drawn", async () => {
    let previews = 0;

    const result = await checkStylist(checkApp(), {
      photoType: "face",
      photo: await jpegPhoto(),
      stylePreference: "menswear",
      drawPreview: async () => {
        previews += 1;
        if (previews === 1) return { refused: true, reason: "image_safety" };
        throw new Error("The image model keeps failing.");
      },
    });

    expect(result).toMatchObject({
      styled: true,
      outfits: [
        { position: 1, preview: "declined", correction: null, images: [] },
        { position: 2, preview: "failed", correction: null, images: [] },
      ],
    });
  });
});

/**
 * A check app on the harness's services, as the script builds one on its own: Stylings run in this
 * process, on `ai` and the harness's Blob store, both watched by the check.
 */
function checkApp(ai: AiProvider = harness.ai): StylistCheckApp {
  const checkAi = new StylistCheckAi(ai);
  const blob = new StylistCheckBlob(harness.blob);
  const { requestHeaders: _headers, responseCookies: _cookies, stylings: _stylings, ...services } = harness.context(new TestBrowser());
  const stylings = new InlineStylingRunner({
    db: harness.db,
    clock: harness.clock,
    qloo: new QlooClient({ db: harness.db, clock: harness.clock, transport: harness.qloo.send, apiUrl: "https://qloo.test", apiKey: "test-qloo-key" }),
    ai: checkAi,
    blob,
    productSearch: services.productSearch,
    productPhotos: new ProductPhotos({ transport: harness.productPhotos.send }),
  });
  return { ...services, ai: checkAi, blob, stylings };
}

/**
 * The fake AI with its Stylist's model standing in for a Claude model, by its ID, each turn reporting
 * the token usage `usageOf` gives for its number, from 1.
 */
function claudeLike(modelId: string, usageOf: (turn: number) => LanguageModelV4Usage): AiProvider {
  return {
    checkPhoto: (input) => harness.ai.checkPhoto(input),
    stylistModel: () =>
      wrapLanguageModel({
        model: harness.ai.stylistModel(),
        modelId,
        middleware: {
          wrapGenerate: async ({ doGenerate, params }) => ({
            ...(await doGenerate()),
            usage: usageOf(params.prompt.filter(({ role }) => role === "assistant").length + 1),
          }),
        },
      }),
    renderPreview: (input) => harness.ai.renderPreview(input),
    judgePreview: harness.ai.judgePreview.bind(harness.ai),
  };
}

/** A turn's token usage, as Claude's model reports it: its prompt is every input token, cached or not. */
function usage({ noCache, cacheWrite, cacheRead, output }: { noCache: number; cacheWrite: number; cacheRead: number; output: number }): LanguageModelV4Usage {
  return {
    inputTokens: { total: noCache + cacheWrite + cacheRead, noCache, cacheRead, cacheWrite },
    outputTokens: { total: output, text: undefined, reasoning: undefined },
  };
}

/** Qloo answering each person call with these people, whatever its line, and each Brand call with BRANDS. */
function qlooAnswering(people: readonly object[]) {
  return ({ url }: RecordedQlooRequest) => qlooResponse(url.searchParams.get("filter.type") === "urn:entity:brand" ? BRANDS : people);
}

// The colours a test's Previews are drawn in.
const GREEN = "#2f6f4f";
const PURPLE = "#6f2f4f";
const BLUE = "#2f4f6f";

/** A plain PNG of one colour, as an image model sends a Preview. */
async function png(colour: string): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width: 30, height: 40, channels: 3, background: colour } }).png().toBuffer());
}

/** Draws each Preview as a plain image of one colour: its first try in `first`, its redraw in `redraw`. */
function drawnIn(first: string, redraw: string): PreviewDrawer {
  return async ({ correction }) => ({ refused: false, image: await png(correction ? redraw : first) });
}

/**
 * The colour of each image drawn for each of the result's Outfits: the one of the test's colours it
 * was drawn in, near enough after the Preview was stored as WebP, or what it is when it's none of them.
 */
async function coloursOf(result: StylistCheckResult): Promise<string[][]> {
  if (!result.styled) return [];
  return Promise.all(result.outfits.map(({ images }) => Promise.all(images.map(colourOf))));
}

async function colourOf(image: Uint8Array): Promise<string> {
  const { channels } = await sharp(image).stats();
  const rgb = channels.slice(0, 3).map(({ mean }) => Math.round(mean));
  const drawnIn = [GREEN, PURPLE, BLUE].find((colour) => rgbOf(colour).every((channel, index) => Math.abs(channel - rgb[index]!) <= 3));
  return drawnIn ?? `rgb(${rgb.join(", ")})`;
}

function rgbOf(colour: string): number[] {
  return [1, 3, 5].map((start) => Number.parseInt(colour.slice(start, start + 2), 16));
}

/** A plain JPEG, as a photo file. */
async function jpegPhoto(): Promise<Blob> {
  const bytes = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}
