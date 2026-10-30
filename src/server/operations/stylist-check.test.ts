import type { LanguageModelV4Usage } from "@ai-sdk/provider";
import { type LanguageModelMiddleware, wrapLanguageModel } from "ai";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AnthropicAiProvider } from "@/server/ai/anthropic";
import { anthropicJson, FakeAnthropic } from "@/server/ai/fake-anthropic";
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
          redrawn: null,
        },
        {
          position: 2,
          styleIconName: "Bea Marsh",
          pieces: [{ category: "hairstyle" }, { brand: "Dune" }, { brand: "Bolt" }, { brand: "Sole" }],
          preview: "kept",
          redrawn: null,
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

    const result = await checkStylist(checkApp(() => ai), { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear" });

    const turns = harness.ai.stylistRequests.length;
    expect(result).toMatchObject({ styled: true, ending: "finished", largestPromptTokens: 130_000 });
    expect(result.styled && result.turns).toHaveLength(turns);
    // Each smaller turn: 1,000 × $0.10 + 3,000 × $0.125 + 20,000 × $0.01 + 500 × $0.50 per million
    // is $0.000925. Turn 2: 10,000 × $0.50 + 20,000 × $0.625 + 100,000 × $0.05 + 2,000 × $2.50 per
    // million is $0.0275.
    expect(result.styled && result.stylistCostUsd).toBeCloseTo((turns - 1) * 0.000925 + 0.0275, 9);
  });

  it("reports Claude's cost across both models: the Stylist's turns at its model's prices, each verdict call at the verdict's, and the two together", async () => {
    // Each of the Stylist's turns costs $0.000925 on Claude Haiku 5.5, as above. Each verdict is
    // asked of Claude Opus 5.5, whose prices per million tokens are $4 input, $5 cache writes,
    // $0.20 cache reads and $20 output: 1,000 × $4 + 2,000 × $5 + 4,000 × $0.20 + 500 × $20 per
    // million is $0.0248. On Haiku's prices it would be $0.00064.
    const anthropic = new FakeAnthropic();
    anthropic.respond = () =>
      anthropicJson({ verdict: { judged: "first draw", right: true } }, { input_tokens: 1_000, cache_creation_input_tokens: 2_000, cache_read_input_tokens: 4_000, output_tokens: 500 });
    const stylist = claudeLike("claude-haiku-5-5", () => usage({ noCache: 1_000, cacheWrite: 3_000, cacheRead: 20_000, output: 500 }));

    const result = await checkStylist(
      checkApp((verdictMiddleware) => {
        const claude = new AnthropicAiProvider({ apiKey: "test-api-key", fetch: anthropic.fetch, verdictMiddleware });
        return { ...stylist, judgePreview: claude.judgePreview.bind(claude) };
      }),
      { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear" },
    );

    // A Face Photo's two Outfits, each Preview judged once.
    const turns = harness.ai.stylistRequests.length;
    expect(result).toMatchObject({ styled: true, outfits: [{ preview: "kept" }, { preview: "kept" }] });
    expect(result.styled && result.verdictCalls.map(({ modelId }) => modelId)).toEqual(["claude-opus-5-5", "claude-opus-5-5"]);
    expect(result.styled && result.stylistCostUsd).toBeCloseTo(turns * 0.000925, 9);
    expect(result.styled && result.verdictCostUsd).toBeCloseTo(2 * 0.0248, 9);
    expect(result.styled && result.costUsd).toBeCloseTo(turns * 0.000925 + 2 * 0.0248, 9);
  });

  it("reports what the prompt cache saved, and the least each turn after the first read from it", async () => {
    const ai = claudeLike("claude-haiku-5-5", (turn) =>
      turn === 1
        ? usage({ noCache: 1_000, cacheWrite: 7_000, cacheRead: 0, output: 500 })
        : turn === 2
          ? usage({ noCache: 10_000, cacheWrite: 20_000, cacheRead: 100_000, output: 2_000 })
          : usage({ noCache: 1_000, cacheWrite: 3_000, cacheRead: 20_000, output: 500 }),
    );

    const result = await checkStylist(checkApp(() => ai), { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear" });

    const turns = harness.ai.stylistRequests.length;
    expect(result).toMatchObject({ styled: true, leastCacheReadAfterFirstTurn: 20_000 });
    // With nothing cached, every prompt token is input. Turn 1: 8,000 × $0.10 + 500 × $0.50 per
    // million is $0.00105. Turn 2: 130,000 × $0.50 + 2,000 × $2.50 per million is $0.07. Each turn
    // after: 24,000 × $0.10 + 500 × $0.50 per million is $0.00265.
    expect(result.styled && result.uncachedStylistCostUsd).toBeCloseTo(0.00105 + 0.07 + (turns - 2) * 0.00265, 9);
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

    expect(result).toMatchObject({ styled: true, stylistCostUsd: null, costUsd: null });
  });
});

describe("the Stylist check's pass-overs", () => {
  it("reports the Style Icons passed over for hair length, each with the reason the user read, and how many of its tries were refused", async () => {
    harness.qloo.respond = qlooAnswering([...STYLE_ICONS, qlooPerson("w-4", "Dana Reed", 0.86), qlooPerson("w-5", "Esme Vale", 0.84)]);
    const forHairLength = (styleIcon: number, cut: string) => ({ styleIcon, reasonKind: "hairLength", reason: `Her signature ${cut} needs much more length than a cut from yours can reach.` });
    const forStyle = { styleIcon: 3, reasonKind: "style", reason: "Her signature sleek bob doesn't go with your casual Photo Style." };
    // Its third try for hair length is refused, as a Styling may pass over only 2 for it.
    harness.ai.stylistTurn = ({ turn }) =>
      turn === 2
        ? { calls: [forHairLength(1, "long, loose mane"), forHairLength(2, "hip-length layered cut"), forStyle, forHairLength(4, "waist-length blowout")].map((input) => ({ tool: "passOverStyleIcon", input })) }
        : undefined;

    const result = await checkStylist(checkApp(), { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear" });

    expect(result).toMatchObject({
      styled: true,
      outfits: [{ styleIconName: "Dana Reed" }, { styleIconName: "Esme Vale" }],
      hairLengthPassOvers: [
        { styleIconName: "Ava Stone", reason: "Her signature long, loose mane needs much more length than a cut from yours can reach." },
        { styleIconName: "Bea Marsh", reason: "Her signature hip-length layered cut needs much more length than a cut from yours can reach." },
      ],
      hairLengthPassOversRefused: 1,
    });
  });

  it("reports no pass-over for hair length of a Face Photo's Style Icon passed over already, for style, which goes through with nothing done", async () => {
    harness.qloo.respond = qlooAnswering([...STYLE_ICONS, qlooPerson("w-4", "Dana Reed", 0.86)]);
    const forStyle = { styleIcon: 1, reasonKind: "style", reason: "Her signature sleek bob doesn't go with your casual Photo Style." };
    const forHairLength = (styleIcon: number) => ({ styleIcon, reasonKind: "hairLength", reason: "Her signature long, loose mane needs much more length than a cut from yours can reach." });
    harness.ai.stylistTurn = ({ turn }) =>
      turn === 2
        ? { calls: [{ tool: "passOverStyleIcon", input: forStyle }] }
        : turn === 3
          ? { calls: [forHairLength(1), forHairLength(2)].map((input) => ({ tool: "passOverStyleIcon", input })) }
          : undefined;

    const result = await checkStylist(checkApp(), { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear" });

    expect(result).toMatchObject({
      styled: true,
      outfits: [{ styleIconName: "Cleo Hart" }, { styleIconName: "Dana Reed" }],
      hairLengthPassOvers: [{ styleIconName: "Bea Marsh" }],
      hairLengthPassOversRefused: 0,
    });
  });

  it("reports no pass-over for hair length of a body photo's Style Icon passed over already, as its Brands can't complete an Outfit", async () => {
    // Ava Stone's fans favour no shoe Brand, so her Brands can't complete an Outfit.
    harness.qloo.respond = ({ url }) => {
      if (url.searchParams.get("filter.type") !== "urn:entity:brand") return qlooResponse(STYLE_ICONS);
      return qlooResponse(url.searchParams.get("signal.interests.entities") === "w-1" ? BRANDS.filter(({ name }) => name !== "Stride" && name !== "Sole") : BRANDS);
    };
    const forHairLength = { styleIcon: 1, reasonKind: "hairLength", reason: "Her signature long, loose mane needs much more length than a cut from yours can reach." };
    harness.ai.stylistTurn = ({ toolResults }) =>
      toolResults.some(({ toolName, output }) => toolName === "fetchBrands" && (output as { passedOver?: string } | null)?.passedOver) &&
      !toolResults.some(({ toolName }) => toolName === "passOverStyleIcon")
        ? { calls: [{ tool: "passOverStyleIcon", input: forHairLength }] }
        : undefined;

    const result = await checkStylist(checkApp(), { photoType: "full_body", photo: await jpegPhoto(), stylePreference: "menswear" });

    const passOver = harness.ai.stylistRequests.at(-1)!.toolResults.find(({ toolName }) => toolName === "passOverStyleIcon");
    expect(passOver).toMatchObject({ output: { styleIcon: 1 }, error: null });
    expect(result).toMatchObject({ styled: true, outfits: [{ styleIconName: "Bea Marsh" }, { styleIconName: "Cleo Hart" }], hairLengthPassOvers: [], hairLengthPassOversRefused: 0 });
  });

  it("reports no Style Icon passed over for hair length when the Stylist passed over none", async () => {
    const result = await checkStylist(checkApp(), { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear" });

    expect(result).toMatchObject({ styled: true, hairLengthPassOvers: [], hairLengthPassOversRefused: 0 });
  });
});

describe("the Stylist check's Previews", () => {
  it("has the Previews the run draws judged, in place of the image model's, and reports which were redrawn, with what correction, and which image was kept", async () => {
    harness.ai.scenario = "preview-redrawn";

    const result = await checkStylist(checkApp(), { photoType: "full_body", photo: await jpegPhoto(), stylePreference: "menswear", drawPreview: drawnIn(GREEN, PURPLE) });

    // Each first image is wrong, breaking no hard rule, and its redraw, within them, is better.
    const redrawn = {
      firstBreaksHardRule: false,
      correction: "Draw each garment exactly as its seller's photo shows it.",
      redraw: { verdict: { breaksHardRule: false, better: "redraw" } },
    };
    expect(result).toMatchObject({
      styled: true,
      outfits: [
        { position: 1, preview: "redrawn-kept-redraw", redrawn },
        { position: 2, preview: "redrawn-kept-redraw", redrawn },
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

  it("gives each Outfit the images drawn for it, and the correction it was redrawn with, even when two Outfits' Pieces are alike", async () => {
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
    const redrawn = { correction: "Draw the cut exactly as its details describe it." };
    expect(result).toMatchObject({ styled: true, outfits: [{ redrawn }, { redrawn }] });
  });

  it("reports a redraw the image model declined, or that couldn't be drawn, which leaves the first image kept", async () => {
    const correction = "The shoes should be the low-tops in their seller's photo.";
    const wrong = { right: false as const, breaksHardRule: false, correction, note: "Your shoes should be the low-tops in their seller's photo." };
    harness.ai.previewVerdicts = [wrong, wrong];

    const result = await checkStylist(checkApp(), {
      photoType: "full_body",
      photo: await jpegPhoto(),
      stylePreference: "menswear",
      drawPreview: async ({ correction: redrawing }, outfit) => {
        if (!redrawing) return { refused: false, image: await png(GREEN) };
        if (outfit?.position === 1) return { refused: true, reason: "image_safety" };
        throw new Error("The image model keeps failing.");
      },
    });

    expect(result).toMatchObject({
      styled: true,
      outfits: [
        { position: 1, preview: "redrawn-kept-first", redrawn: { firstBreaksHardRule: false, correction, redraw: "declined" } },
        { position: 2, preview: "redrawn-kept-first", redrawn: { firstBreaksHardRule: false, correction, redraw: "failed" } },
      ],
    });
    expect(await coloursOf(result)).toEqual([[GREEN], [GREEN]]);
  });

  it("reports an Outfit left with no Preview when neither of its images was kept", async () => {
    harness.ai.scenario = "preview-unfixable";

    const result = await checkStylist(checkApp(), { photoType: "body_only", photo: await jpegPhoto(), stylePreference: "menswear", drawPreview: drawnIn(GREEN, PURPLE) });

    // Both images break a hard rule, though the verdict calls the first better.
    const redrawn = {
      firstBreaksHardRule: true,
      correction: "Never add a face or a head where the photo shows none.",
      redraw: { verdict: { breaksHardRule: true, better: "first" } },
    };
    expect(result).toMatchObject({
      styled: true,
      outfits: [
        { position: 1, preview: "redrawn-kept-none", redrawn },
        { position: 2, preview: "redrawn-kept-none", redrawn },
      ],
    });
    expect(await coloursOf(result)).toEqual([
      [GREEN, PURPLE],
      [GREEN, PURPLE],
    ]);
  });

  it.each([
    { redrawVerdict: { refused: true } as const, verdict: null },
    { redrawVerdict: { breaksHardRule: false, better: "first" as const, note: "Your first Preview shows your Outfit better." }, verdict: { breaksHardRule: false, better: "first" } },
  ])("reports a redraw whose verdict was $redrawVerdict, which leaves the first image kept", async ({ redrawVerdict, verdict }) => {
    // One Style Icon, so one Outfit, whose verdicts come in order.
    harness.qloo.respond = qlooAnswering(STYLE_ICONS.slice(0, 1));
    const correction = "Draw the cut exactly as its details describe it.";
    harness.ai.previewVerdicts = [{ right: false, breaksHardRule: false, correction, note: "Your cut should be just as its details describe it." }, redrawVerdict];

    const result = await checkStylist(checkApp(), { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear", drawPreview: drawnIn(GREEN, PURPLE) });

    expect(result).toMatchObject({
      styled: true,
      outfits: [{ position: 1, preview: "redrawn-kept-first", redrawn: { firstBreaksHardRule: false, correction, redraw: { verdict } } }],
    });
    expect(await coloursOf(result)).toEqual([[GREEN, PURPLE]]);
  });

  it("reports a Preview drawn but never checked, as its verdict was refused, so the Outfit has none", async () => {
    harness.ai.previewVerdicts = [{ refused: true }, { refused: true }];

    const result = await checkStylist(checkApp(), { photoType: "face", photo: await jpegPhoto(), stylePreference: "menswear", drawPreview: drawnIn(GREEN, PURPLE) });

    expect(result).toMatchObject({
      styled: true,
      outfits: [
        { position: 1, preview: "unchecked", redrawn: null },
        { position: 2, preview: "unchecked", redrawn: null },
      ],
    });
    expect(await coloursOf(result)).toEqual([[GREEN], [GREEN]]);
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
        { position: 1, preview: "declined", redrawn: null, images: [] },
        { position: 2, preview: "failed", redrawn: null, images: [] },
      ],
    });
  });
});

/**
 * A check app on the harness's services, as the script builds one on its own: Stylings run in this
 * process, on the AI `buildAi` builds and the harness's Blob store, both watched by the check.
 */
function checkApp(buildAi: (verdictMiddleware: LanguageModelMiddleware) => AiProvider = () => harness.ai): StylistCheckApp {
  const checkAi = new StylistCheckAi(buildAi);
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
