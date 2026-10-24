import { and, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PhotoType } from "@/config/consultations";
import type { FakeScriptedVerdict } from "@/server/ai/fake";
import type { FakeStylistRequest, FakeStylistTurn } from "@/server/ai/fake-stylist";
import { brandMatch, consultation, outfit, piece, qlooCache, styleIcon, styling, stylistNote, usageRecord } from "@/server/db/schema";
import { deleteAccount } from "@/server/operations/account";
import { deleteConsultation, readConsultation, startConsultation } from "@/server/operations/consultations";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import {
  changeBudgetTier,
  changePhotoStyle,
  readStylingStatus,
  showMoreOutfits,
  type StylistNoteView,
  tryAgain,
} from "@/server/operations/stylings";
import { productPhoto, productPhotoBytes } from "@/server/product-photos/fake";
import { channel3Product, channel3SellingEveryBrand, channel3SmallCatalogue } from "@/server/product-search/fake-channel3";
import { qlooBrand, qlooPerson, qlooResponse, type RecordedQlooRequest } from "@/server/qloo/fake";
import { BOTH_CONSENT_BOXES_TICKED, createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// Stylings carried out by the Stylist: the AI SDK's Workflow agent, here on the fake AI's scripted
// fake model, working through its tools. The Stylist's turns are the fake model's calls, which a
// test can script. A Face Photo's Outfits are a Hairstyle alone; a body photo's are built on Brands.

// Made-up people, shaped like Qloo's person entities.
const WOMEN = [qlooPerson("w-1", "Ava Stone", 0.94), qlooPerson("w-2", "Bea Marsh", 0.91), qlooPerson("w-3", "Cleo Hart", 0.88)];
const SIX_WOMEN = [...WOMEN, qlooPerson("w-4", "Dana Reed", 0.86), qlooPerson("w-5", "Esme Vale", 0.84), qlooPerson("w-6", "Fay Lowe", 0.8)];
const SEVEN_WOMEN = [...SIX_WOMEN, qlooPerson("w-7", "Gia Penn", 0.78)];

// Made-up Brands, shaped like Qloo's Brand entities, that every Style Icon's fans favour. A body
// photo's first Outfit is Stride, Bolt and Jeanery (denim, in Qloo's top 10, so the Bottom), its
// second Sole, Dune and Bolt. There are 10, so the pool isn't thin.
const BRANDS = [
  qlooBrand("b-stride", "Stride", { categories: ["footwear"], affinity: 0.97, price: [60, 180] }),
  qlooBrand("b-bolt", "Bolt", { categories: ["apparel"], affinity: 0.95, price: [20, 120] }),
  qlooBrand("b-sole", "Sole", { categories: ["footwear", "sneakers"], affinity: 0.93, price: [40, 90] }),
  qlooBrand("b-dune", "Dune", { categories: ["apparel", "outerwear"], affinity: 0.9 }),
  qlooBrand("b-jeanery", "Jeanery", { categories: ["apparel", "denim"], affinity: 0.88, price: [50, 110] }),
  qlooBrand("b-ember", "Ember", { categories: ["apparel"], affinity: 0.85, price: [15, 60] }),
  qlooBrand("b-pace", "Pace", { categories: ["footwear"], affinity: 0.8, price: [30, 70] }),
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
  harness.ai.stylistRequests.length = 0;
  harness.ai.stylistTurn = undefined;
  harness.ai.previewRequests.length = 0;
  harness.ai.previewScenarios = [];
  harness.ai.verdictRequests.length = 0;
  harness.ai.previewVerdicts = [];
  harness.ai.duringCall = undefined;
  harness.ai.styleIconScenarios = {};
  harness.stylings.pending.length = 0;
  harness.stylings.previewRetries = 0;
  harness.qloo.requests.length = 0;
  harness.qloo.respond = qlooAnswering(WOMEN);
  harness.channel3.requests.length = 0;
  harness.channel3.respond = channel3SellingEveryBrand();
  harness.productPhotos.requests.length = 0;
  harness.productPhotos.respond = (url) => productPhoto(url);
  await harness.db.delete(qlooCache);
  await harness.db.delete(brandMatch);
  await harness.db.delete(usageRecord);
});

describe("the Stylist's conversation", () => {
  it("holds the photo once, as the first message gave it, on every turn, and no other image", async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    const photo = { mediaType: "image/jpeg", sha256: sha256(harness.blob.objects.get(stored!.photoPathname)!.bytes) };
    expect(harness.ai.stylistRequests.length).toBeGreaterThan(1);
    for (const { images, links } of harness.ai.stylistRequests) {
      expect(images).toEqual([photo]);
      expect(links).toEqual([]);
    }
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual([
      "Ava Stone",
      "Bea Marsh",
    ]);
  });
});

describe("the Stylist's prompt", () => {
  /** The prompt the Stylist's model was sent on a first Styling's turns, which must be the same on each. */
  async function promptSent(): Promise<string> {
    const browser = await signedInUser();
    await start(browser);
    await harness.stylings.runPending();
    const prompts = new Set(harness.ai.stylistRequests.map(({ instructions }) => instructions));
    expect(prompts.size).toBe(1);
    return [...prompts][0]!;
  }

  it("is sent on every turn, unchanged, and tells the Stylist it's an AI Stylist", async () => {
    const prompt = await promptSent();

    expect(harness.ai.stylistRequests.length).toBeGreaterThan(1);
    expect(prompt).toMatch(/you are the AI Stylist in a styling app/i);
  });

  it("styles only the Main Person, named as the most prominent person in the photo", async () => {
    const prompt = await promptSent();

    expect(prompt).toMatch(/you style only the most prominent person in the photo/i);
    expect(prompt).toMatch(/anyone else in the photo isn't styled/i);
    expect(prompt).toMatch(/match colours to what they're wearing, never to anyone else/i);
  });

  it("never guesses age or gender, never infers ethnicity, skin tone, body measurements or health, and never states a price", async () => {
    const prompt = await promptSent();

    expect(prompt).toContain("Never guess the person's age or gender from the photo");
    expect(prompt).toContain("Never infer their ethnicity, skin tone, body measurements or health");
    expect(prompt).toMatch(/nothing you write states a price, currency or cost/i);
  });

  it("prefers separates to a One-Piece", async () => {
    const prompt = await promptSent();

    expect(prompt).toMatch(/prefer separates/i);
  });

  it("carries the Hairstyle's rules: the Style Icon's signature cut when known, achievable from the person's own hair", async () => {
    const prompt = await promptSent();

    expect(prompt).toMatch(/work from the Style Icon's name alone/i);
    expect(prompt).toMatch(/if you know the Style Icon's signature haircut, base the cut on it, and set cutKnown to true/i);
    expect(prompt).toMatch(/set cutKnown to false and base the cut on the Outfit and the Photo Style/i);
    expect(prompt).toMatch(/achievable from the person's current hair/i);
    expect(prompt).toMatch(/keep their own hair colour/i);
  });

  it("asks for notes to the user: in the second person, in English, short and about style, naming Qloo but no other service", async () => {
    const prompt = await promptSent();

    expect(prompt).toMatch(/notes/i);
    expect(prompt).toMatch(/to the user as "you"/i);
    expect(prompt).toMatch(/in English/);
    expect(prompt).toMatch(/one or two short sentences/i);
    expect(prompt).toMatch(/about style/i);
    expect(prompt).toMatch(/Qloo/);
    expect(prompt).toMatch(/never name any other service/i);
  });

  it("asks for each note through writeNote, called first in the turn, beside the calls it explains", async () => {
    const prompt = await promptSent();

    expect(prompt).toMatch(/write the user a note on what you're doing and why, with writeNote/i);
    expect(prompt).toMatch(/call writeNote first, in the same turn as the tool calls it explains/i);
    expect(prompt).toMatch(/writeNote is only for these notes/i);
  });

  it("has the Stylist save every Outfit it'll make, then finish, leaving each Preview to be drawn and checked once it has", async () => {
    const prompt = await promptSent();

    expect(prompt).toMatch(/finish: once you've saved every Outfit you'll make, call it/i);
    expect(prompt).toMatch(/each Outfit's Preview is drawn and checked for you/i);
    expect(prompt).not.toMatch(/startPreviews|renderPreview|redrawPreview|keepPreview|Checking each Preview|hard rule/);
  });

  it("never writes about what covers the person's hair", async () => {
    const prompt = await promptSent();

    // Only whether the hair is covered is ever kept (ADR-0005).
    expect(prompt).toMatch(/nothing you write, whether a note, a why, a cut or its details, mentions .* what covers their hair/i);
  });

  it("covers every tool the Stylist has", async () => {
    const prompt = await promptSent();

    for (const tool of harness.ai.stylistRequests[0]!.tools) expect(prompt).toContain(tool);
  });

  it("covers every tool a body photo's Stylist has, which fetches Brands and searches for Products besides", async () => {
    harness.qloo.respond = qlooWithBrands(WOMEN);
    await start(await signedInUser(), "body_only");

    await harness.stylings.runPending();

    const [first] = harness.ai.stylistRequests;
    // No Preview tool: Previews are drawn and judged once the Stylist finishes.
    expect(first!.tools.toSorted()).toEqual(["fetchBrands", "findStyleIcons", "finish", "passOverStyleIcon", "saveOutfit", "searchProducts", "writeNote"]);
    for (const tool of first!.tools) expect(first!.instructions).toContain(tool);
    expect(first!.instructions).toMatch(/top 3 Brands/i);
    expect(first!.instructions).toMatch(/One-Piece/);
  });

  it.each(["face", "body_only"] as const)("offers the same tools on every turn of a Styling, writeNote among them from the first, for a %s photo", async (photoType) => {
    harness.qloo.respond = qlooWithBrands(WOMEN);
    await start(await signedInUser(), photoType);

    await harness.stylings.runPending();

    const [first, ...later] = harness.ai.stylistRequests;
    expect(later.length).toBeGreaterThan(0);
    expect(first!.tools).toContain("writeNote");
    for (const { tools } of later) expect(tools).toEqual(first!.tools);
  });

  it("explains how to choose each Category's Brand among a Style Icon's top 3, weighing the photo, the Photo Style and the rest of the Outfit", async () => {
    const prompt = await promptSent();

    expect(prompt).toMatch(/choose whichever of its top 3 Brands best suits/i);
    expect(prompt).toMatch(/what the person is wearing in the photo/i);
    expect(prompt).toMatch(/their Photo Style/i);
    expect(prompt).toMatch(/the rest of the Outfit/i);
    expect(prompt).toMatch(/Qloo decides which Style Icons and Brands you choose among/i);
  });

  it("explains passing over a Style Icon that doesn't suit the photo, giving reasons about style, never about the user or the Style Icon as a person", async () => {
    const prompt = await promptSent();

    expect(prompt).toMatch(/pass over a Style Icon whose style doesn't suit the photo/i);
    expect(prompt).toContain("her shoe Brands only sell heels, which don't fit your sporty Photo Style");
    expect(prompt).toMatch(/reasons? (are|is) about style, or for hairLength the length a cut needs, never about the user or the Style Icon as a person/i);
  });

  it("carries the Face Photo rule: pass over a Style Icon whose cut needs much more length than the person's hair has, at most twice, never for the hair's texture", async () => {
    const prompt = await promptSent();

    expect(prompt).toMatch(/on a Face Photo: the Hairstyle is the whole Outfit, so pass over a Style Icon whose signature cut needs much more length than the person's hair has/i);
    expect(prompt).toMatch(/with passOverStyleIcon and the reasonKind hairLength, giving a reason about the cut's length/i);
    expect(prompt).toMatch(/pass over at most 2 Style Icons for hair length in a Styling\. After that, and on every other Photo Type, adapt the cut/i);
    expect(prompt).toMatch(/never pass over a Style Icon for the hair's texture, and never write about it: adapt the cut instead/i);
    // The rest of the Hairstyle's rules are unchanged.
    expect(prompt).toMatch(/achievable from the person's current hair: shorter, or restyled, without adding much length or changing its texture/i);
  });
});

describe("each kind of Styling's brief", () => {
  it("has a first Styling find its own Style Icons", async () => {
    const browser = await signedInUser({ birthDate: { day: "2", month: "2", year: "1992" } });
    await start(browser);

    await harness.stylings.runPending();

    const [first] = harness.ai.stylistRequests;
    expect(first!.brief).toEqual({
      styling: "First Styling",
      photo: "Face Photo",
      pieces: ["Hairstyle"],
      photoStyle: ["casual"],
      ageGroup: "30–34",
      outfits: 2,
    });
    expect(first!.tools.toSorted()).toEqual(["findStyleIcons", "finish", "passOverStyleIcon", "saveOutfit", "writeNote"]);
  });

  it('gives "Show 2 more Outfits" the next unused Style Icons, and those already used, to carry on down without asking Qloo', async () => {
    harness.qloo.respond = qlooAnswering(SIX_WOMEN);
    const browser = await signedInUser();
    const consultationId = await start(browser);
    await harness.stylings.runPending();
    harness.ai.stylistRequests.length = 0;
    harness.qloo.requests.length = 0;

    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    const [first] = harness.ai.stylistRequests;
    expect(first!.brief).toMatchObject({
      styling: "Show 2 more Outfits",
      outfits: 2,
      styleIcons: [
        { number: 3, name: "Cleo Hart", line: "womenswear" },
        { number: 4, name: "Dana Reed", line: "womenswear" },
        { number: 5, name: "Esme Vale", line: "womenswear" },
        { number: 6, name: "Fay Lowe", line: "womenswear" },
      ],
      styleIconsUsed: [
        { number: 1, name: "Ava Stone", line: "womenswear" },
        { number: 2, name: "Bea Marsh", line: "womenswear" },
      ],
    });
    expect(first!.tools).not.toContain("findStyleIcons");
    expect(harness.qloo.requests).toEqual([]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.position, o.styleIconName])).toEqual([
      [1, "Ava Stone"],
      [2, "Bea Marsh"],
      [3, "Cleo Hart"],
      [4, "Dana Reed"],
    ]);
  });

  it("has a Photo Style change find new Style Icons for the new Photo Style", async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser);
    await harness.stylings.runPending();
    harness.ai.stylistRequests.length = 0;

    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();

    const [first] = harness.ai.stylistRequests;
    expect(first!.brief).toEqual(expect.objectContaining({ styling: "Photo Style change", photoStyle: ["edgy"] }));
    expect(first!.brief).not.toHaveProperty("styleIcons");
    expect(first!.tools).toContain("findStyleIcons");
  });

  it('gives a body photo\'s "Show 2 more Outfits" the Brands the current Outfits use, a One-Piece\'s left-out Bottom Brand included', async () => {
    harness.qloo.respond = qlooWithBrands(SIX_WOMEN);
    // Ava Stone's Outfit is a One-Piece on Bolt, its Top Brand, which leaves out Jeanery, its Bottom Brand.
    harness.ai.styleIconScenarios = { "Ava Stone": "one-piece" };
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    harness.ai.stylistRequests.length = 0;

    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[0]!.brief).toMatchObject({
      styling: "Show 2 more Outfits",
      brandsInUse: { top: ["Bolt", "Dune"], bottom: ["Jeanery", "Bolt"], shoes: ["Stride", "Sole"] },
    });
  });

  it("gives a Budget Tier change the current Style Icons, all of them from the top, and its new Budget Tier", async () => {
    harness.qloo.respond = qlooWithBrands(WOMEN);
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    harness.ai.stylistRequests.length = 0;

    await changeBudgetTier(harness.context(browser), consultationId, "low");
    await harness.stylings.runPending();

    const [first] = harness.ai.stylistRequests;
    expect(first!.brief).toEqual({
      styling: "Budget Tier change",
      photo: "Body-Only Photo",
      pieces: ["Top", "Bottom", "Shoes"],
      photoStyle: ["casual"],
      ageGroup: "30–34",
      outfits: 2,
      budgetTier: "Low",
      styleIcons: [
        { number: 1, name: "Ava Stone", line: "womenswear" },
        { number: 2, name: "Bea Marsh", line: "womenswear" },
        { number: 3, name: "Cleo Hart", line: "womenswear" },
      ],
    });
    expect(first!.tools).not.toContain("findStyleIcons");
  });

  it("gives Try again the Style Icons the broken Styling passed over and left, and never checks the photo again", async () => {
    harness.qloo.respond = qlooAnswering(SIX_WOMEN);
    const browser = await signedInUser();
    const consultationId = await start(browser);
    // Once the Stylist has found the Style Icons, Ava Stone is passed over, and the model goes down.
    harness.ai.duringCall = async (made) => {
      if (made !== "stylistModel" || harness.ai.stylistRequests.at(-1)?.turn !== 2) return;
      await harness.db.update(styleIcon).set({ status: "skipped" }).where(and(eq(styleIcon.consultationId, consultationId), eq(styleIcon.name, "Ava Stone")));
      throw new Error("The model is down.");
    };
    await harness.stylings.runPending();
    harness.ai.duringCall = undefined;
    harness.ai.stylistRequests.length = 0;
    const photoChecks = harness.ai.photoCheckCount;

    expect(await tryAgain(harness.context(browser), consultationId)).toEqual({ ok: true });
    await harness.stylings.runPending();

    const [first] = harness.ai.stylistRequests;
    expect(first!.brief).toMatchObject({
      styling: "Try again",
      styleIcons: [
        { number: 2, name: "Bea Marsh" },
        { number: 3, name: "Cleo Hart" },
        { number: 4, name: "Dana Reed" },
        { number: 5, name: "Esme Vale" },
        { number: 6, name: "Fay Lowe" },
      ],
      styleIconsPassedOver: [{ number: 1, name: "Ava Stone", line: "womenswear" }],
    });
    expect(first!.tools).not.toContain("findStyleIcons");
    expect(harness.ai.photoCheckCount).toBe(photoChecks);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual([
      "Bea Marsh",
      "Cleo Hart",
    ]);
  });
});

describe("the turn cap", () => {
  it("finishes the Styling with the Outfits the Stylist saved once its 30 turns are used up, drawing and judging their Previews", async () => {
    // It saves Ava Stone's Outfit, then keeps asking for its Style Icons again, never finishing.
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? save(hairstyleOutfit(1)) : turn > 2 ? call("findStyleIcons", {}) : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests.map(({ turn }) => turn)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      outfits: [{ position: 1, styleIconName: "Ava Stone", preview: { state: "ready" } }],
    });
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 1 })]);
    expect(harness.ai.previewRequests).toHaveLength(1);
    expect(harness.ai.verdictRequests).toHaveLength(1);
  });
});

describe("the Stylist's tools", () => {
  it("refuse a save that breaks a rule, saying why, so the Stylist can correct it on its next turn", async () => {
    const priced = hairstyleOutfit(1, { why: "Ava Stone's cut, yours for about $40." });
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? save(priced) : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[2]!.toolResults.at(-1)).toEqual({
      toolName: "saveOutfit",
      input: priced,
      output: null,
      error: "Refused: The Hairstyle's why must not state a price.",
    });
    const { outfits } = (await readConsultation(harness.context(browser), consultationId))!;
    expect(outfits.map((o) => [o.position, o.styleIconName, o.preview.state])).toEqual([
      [1, "Ava Stone", "ready"],
      [2, "Bea Marsh", "ready"],
    ]);
    expect(outfits.flatMap((o) => o.pieces.map((p) => p.why))).toEqual([expect.not.stringContaining("$"), expect.not.stringContaining("$")]);
  });

  it.each([
    ["an empty cut", { cut: " " }, "Refused: The Hairstyle's cut is empty."],
    ["an empty why and details", { why: "", details: "  " }, "Refused: The Hairstyle's details and why are empty."],
    ["a price in its details", { details: "A soft layered cut, about £25 at most salons." }, "Refused: The Hairstyle's details must not state a price."],
  ])("refuse a Hairstyle with %s", async (_name, hairstyle, refusal) => {
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? save(hairstyleOutfit(1, hairstyle)) : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[2]!.toolResults.at(-1)).toMatchObject({ toolName: "saveOutfit", error: refusal });
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toHaveLength(2);
  });

  it("refuse an Outfit from a Style Icon out of Qloo's order, one not on the list, or one already used", async () => {
    harness.ai.stylistTurn = ({ turn }) =>
      turn === 2 ? save(hairstyleOutfit(2), hairstyleOutfit(4)) : turn === 3 ? save(hairstyleOutfit(1), hairstyleOutfit(1)) : undefined;
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[3]!.toolResults.slice(1).map(({ error }) => error)).toEqual([
      "Refused: Ava Stone, Style Icon 1, comes first: save their Outfit before Bea Marsh's.",
      "Refused: There's no Style Icon 4 on your list.",
      null,
      "Refused: Ava Stone has already inspired an Outfit: save the next Style Icon's.",
    ]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual([
      "Ava Stone",
      "Bea Marsh",
    ]);
  });

  it("refuse more Outfits than the Styling may make", async () => {
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? save(hairstyleOutfit(1), hairstyleOutfit(2), hairstyleOutfit(3)) : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[2]!.toolResults.at(-1)).toMatchObject({
      error: "Refused: This Styling makes at most 2 Outfits, and you've saved them all: finish.",
    });
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toHaveLength(2);
  });

  it("find Style Icons once, giving them again without asking Qloo when asked twice", async () => {
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? call("findStyleIcons", {}) : undefined);
    const browser = await signedInUser();
    await start(browser);

    await harness.stylings.runPending();

    const styleIcons = [
      { number: 1, name: "Ava Stone", line: "womenswear" },
      { number: 2, name: "Bea Marsh", line: "womenswear" },
      { number: 3, name: "Cleo Hart", line: "womenswear" },
    ];
    expect(harness.ai.stylistRequests[2]!.toolResults.map(({ output }) => output)).toEqual([{ styleIcons }, { styleIcons }]);
    expect(harness.qloo.requests).toHaveLength(1);
  });
});

describe("passing over a Style Icon", () => {
  const REASON = "Ava Stone's signature cut is a sleek bob, which doesn't go with your casual Photo Style.";

  it("marks it skipped, and adds a step saying so to the Stylist's Notes, then the Stylist's reason, so the next Style Icons' Outfits are made", async () => {
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? call("passOverStyleIcon", { styleIcon: 1, reasonKind: "style", reason: `  ${REASON}\n` }) : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[2]!.toolResults.at(-1)).toMatchObject({ toolName: "passOverStyleIcon", output: { styleIcon: 1 }, error: null });
    expect(await styleIconStatusesOf(consultationId)).toEqual(["skipped", "used", "used"]);
    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown.outfits.map((o) => [o.position, o.styleIconName])).toEqual([
      [1, "Bea Marsh"],
      [2, "Cleo Hart"],
    ]);
    expect(shown.stylistNotes[0]!.notes.slice(1, 4)).toEqual([
      { kind: "step", text: "Asked Qloo for Style Icons popular in the United States with a casual Photo Style: 3 found" },
      { kind: "step", text: "Passed over Ava Stone" },
      { kind: "note", text: REASON },
    ]);
  });

  it("adds the reason once when the Stylist wrote it with writeNote in the same turn, before the step", async () => {
    harness.ai.stylistTurn = ({ turn }) =>
      turn === 2 ? { calls: [...call("writeNote", { text: REASON }).calls, ...call("passOverStyleIcon", { styleIcon: 1, reasonKind: "style", reason: REASON }).calls] } : undefined;
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(await styleIconStatusesOf(consultationId)).toEqual(["skipped", "used", "used"]);
    const { notes } = (await readConsultation(harness.context(browser), consultationId))!.stylistNotes[0]!;
    expect(notes.slice(1, 4)).toEqual([
      { kind: "step", text: "Asked Qloo for Style Icons popular in the United States with a casual Photo Style: 3 found" },
      { kind: "note", text: REASON },
      { kind: "step", text: "Passed over Ava Stone" },
    ]);
    expect(notes.filter(({ text }) => text === REASON)).toHaveLength(1);
  });

  it.each([
    ["no reason", { styleIcon: 1, reasonKind: "style", reason: " \n " }, "Refused: Say why you're passing over Ava Stone, about style."],
    ["a reason that states a price", { styleIcon: 1, reasonKind: "style", reason: "Her signature cut costs about $90 to keep up." }, "Refused: Your reason for passing over Ava Stone must not state a price."],
    [
      "a reason too long for a note",
      { styleIcon: 1, reasonKind: "style", reason: `Her signature cut is ${"very ".repeat(60)}sleek.` },
      "Refused: Your reason for passing over Ava Stone is too long: keep it to a sentence.",
    ],
    ["a Style Icon not on the list", { styleIcon: 4, reasonKind: "style", reason: REASON }, "Refused: There's no Style Icon 4 on your list."],
    ["no kind of reason", { styleIcon: 1, reason: REASON }, expect.stringContaining("reasonKind")],
  ])("refuses to pass over a Style Icon with %s, passing nothing over", async (_name, input, refusal) => {
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? call("passOverStyleIcon", input) : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[2]!.toolResults.at(-1)).toMatchObject({ toolName: "passOverStyleIcon", output: null, error: refusal });
    expect(await styleIconStatusesOf(consultationId)).toEqual(["used", "used", "unused"]);
    expect(JSON.stringify((await readConsultation(harness.context(browser), consultationId))!.stylistNotes)).not.toContain("Passed over");
  });

  it("refuses to pass over a Style Icon that has inspired an Outfit", async () => {
    harness.ai.stylistTurn = ({ turn }) => (turn === 3 ? call("passOverStyleIcon", { styleIcon: 1, reasonKind: "style", reason: REASON }) : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(saveResults().map(({ error }) => error)).toEqual([null, null]);
    expect(harness.ai.stylistRequests.at(-1)!.toolResults.filter(({ toolName }) => toolName === "passOverStyleIcon").map(({ error }) => error)).toEqual([
      "Refused: Ava Stone has already inspired an Outfit.",
    ]);
    expect(await styleIconStatusesOf(consultationId)).toEqual(["used", "used", "unused"]);
  });
});

describe("passing over a Style Icon for hair length", () => {
  it("passes over 2 of a Face Photo's Style Icons for hair length, each with its reason, and refuses a third, whose cut is to be adapted instead", async () => {
    harness.qloo.respond = qlooAnswering(SIX_WOMEN);
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? call("passOverStyleIcon", forHairLength(1), forHairLength(2), forHairLength(3)) : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[2]!.toolResults.slice(-3).map(({ output, error }) => [output, error])).toEqual([
      [{ styleIcon: 1 }, null],
      [{ styleIcon: 2 }, null],
      [null, "Refused: You've passed over 2 Style Icons for hair length, the most a Styling may: adapt Cleo Hart's signature cut to what the person's hair can do instead."],
    ]);
    expect(await styleIconStatusesOf(consultationId)).toEqual(["skipped", "skipped", "used", "used", "unused", "unused"]);
    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown.outfits.map((o) => o.styleIconName)).toEqual(["Cleo Hart", "Dana Reed"]);
    expect(shown.stylistNotes[0]!.notes.slice(2, 6)).toEqual([
      { kind: "step", text: "Passed over Ava Stone" },
      { kind: "note", text: "Her signature long, loose mane needs much more length than a cut from yours can reach." },
      { kind: "step", text: "Passed over Bea Marsh" },
      { kind: "note", text: "Her signature hip-length layered cut needs much more length than a cut from yours can reach." },
    ]);
  });

  it("still passes over a Face Photo's Style Icon for style once it has passed over 2 for hair length", async () => {
    harness.qloo.respond = qlooAnswering(SIX_WOMEN);
    const forStyle = { styleIcon: 3, reasonKind: "style", reason: "Cleo Hart's signature cut is a sleek bob, which doesn't go with your casual Photo Style." };
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? call("passOverStyleIcon", forHairLength(1), forHairLength(2), forStyle) : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[2]!.toolResults.slice(-3).map(({ error }) => error)).toEqual([null, null, null]);
    expect(await styleIconStatusesOf(consultationId)).toEqual(["skipped", "skipped", "skipped", "used", "used", "unused"]);
  });

  it("refuses to pass over a Style Icon for hair length with no reason, asking for one about the cut's length", async () => {
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? call("passOverStyleIcon", { ...forHairLength(1), reason: " " }) : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[2]!.toolResults.at(-1)).toMatchObject({
      toolName: "passOverStyleIcon",
      output: null,
      error: "Refused: Say why you're passing over Ava Stone, about the length their signature cut needs.",
    });
    expect(await styleIconStatusesOf(consultationId)).toEqual(["used", "used", "unused"]);
  });

  it.each(["full_body", "body_only"] as const)("refuses to pass over a %s photo's Style Icon for hair length, whose cut is to be adapted instead", async (photoType) => {
    harness.qloo.respond = qlooWithBrands(WOMEN);
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? call("passOverStyleIcon", forHairLength(1)) : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser, photoType);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[2]!.toolResults.at(-1)).toMatchObject({
      toolName: "passOverStyleIcon",
      output: null,
      error: "Refused: Only a Face Photo's Style Icons are passed over for hair length: adapt Ava Stone's signature cut to what the person's hair can do instead.",
    });
    expect(await styleIconStatusesOf(consultationId)).toEqual(["used", "used", "unused"]);
    expect(JSON.stringify((await readConsultation(harness.context(browser), consultationId))!.stylistNotes)).not.toContain("Passed over");
  });

  it('lets "Show 2 more Outfits" pass over 2 more for hair length, whatever the Styling before it passed over', async () => {
    harness.qloo.respond = qlooAnswering(SEVEN_WOMEN);
    harness.ai.stylistTurn = ({ turn, brief }) =>
      brief?.styling === "First Styling" && turn === 2
        ? call("passOverStyleIcon", forHairLength(1), forHairLength(2))
        : brief?.styling === "Show 2 more Outfits" && turn === 1
          ? call("passOverStyleIcon", forHairLength(5), forHairLength(6))
          : undefined;
    const browser = await signedInUser();
    const consultationId = await start(browser);
    await harness.stylings.runPending();

    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests.at(-1)!.toolResults.filter(({ toolName }) => toolName === "passOverStyleIcon").map(({ error }) => error)).toEqual([null, null]);
    expect(await styleIconStatusesOf(consultationId)).toEqual(["skipped", "skipped", "used", "used", "skipped", "skipped", "used"]);
  });

  it("lets Try again pass over 2 more for hair length, whatever the broken Styling passed over", async () => {
    harness.qloo.respond = qlooAnswering(SIX_WOMEN);
    harness.ai.stylistTurn = ({ turn, brief }) =>
      brief?.styling === "First Styling" && turn === 2
        ? call("passOverStyleIcon", forHairLength(1), forHairLength(2))
        : brief?.styling === "Try again" && turn === 1
          ? call("passOverStyleIcon", forHairLength(3), forHairLength(4))
          : undefined;
    // Once it has passed over 2, the model goes down.
    harness.ai.duringCall = async (made) => {
      if (made === "stylistModel" && harness.ai.stylistRequests.at(-1)?.turn === 3) throw new Error("The model is down.");
    };
    const browser = await signedInUser();
    const consultationId = await start(browser);
    await harness.stylings.runPending();
    harness.ai.duringCall = undefined;

    expect(await tryAgain(harness.context(browser), consultationId)).toEqual({ ok: true });
    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests.at(-1)!.toolResults.filter(({ toolName }) => toolName === "passOverStyleIcon").map(({ error }) => error)).toEqual([null, null]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual(["Esme Vale", "Fay Lowe"]);
  });
});

describe("the fake Stylist's scenarios", () => {
  it("pass over a Face Photo's first Style Icon, saying why, in style-icon-passed-over", async () => {
    harness.ai.scenario = "style-icon-passed-over";
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(await styleIconStatusesOf(consultationId)).toEqual(["skipped", "used", "used"]);
    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown.outfits.map((o) => o.styleIconName)).toEqual(["Bea Marsh", "Cleo Hart"]);
    expect(shown.stylistNotes[0]!.notes.slice(2, 5)).toEqual([
      { kind: "note", text: "I'll pass over Ava Stone, and go on to the next Style Icon." },
      { kind: "step", text: "Passed over Ava Stone" },
      { kind: "note", text: "Ava Stone's signature cut doesn't go with your casual Photo Style." },
    ]);
  });

  it("pass over a body photo's first Style Icon once its Brands are fetched, saying why, in style-icon-passed-over", async () => {
    harness.ai.scenario = "style-icon-passed-over";
    harness.qloo.respond = qlooWithBrands(WOMEN);
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");

    await harness.stylings.runPending();

    expect(await styleIconStatusesOf(consultationId)).toEqual(["skipped", "used", "used"]);
    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)])).toEqual([
      ["Bea Marsh", ["Bolt", "Jeanery", "Stride"]],
      ["Cleo Hart", ["Dune", "Bolt", "Sole"]],
    ]);
    const notes = shown.stylistNotes[0]!.notes.map(({ text }) => text);
    expect(notes.indexOf("Passed over Ava Stone")).toBeGreaterThan(notes.indexOf("Asked Qloo for the Brands Ava Stone's fans favour"));
    expect(notes[notes.indexOf("Passed over Ava Stone") + 1]).toBe("The Brands Ava Stone's fans favour don't go with your casual Photo Style.");
  });

  it("take each Category's second Brand still in play in second-brand, from Qloo's Brand calls as ever", async () => {
    harness.ai.scenario = "second-brand";
    harness.qloo.respond = qlooWithBrands(WOMEN);
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");

    await harness.stylings.runPending();

    expect(saveResults().map(({ error }) => error)).toEqual([null, null]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)])).toEqual([
      ["Ava Stone", ["Dune", "Bolt", "Sole"]],
      ["Bea Marsh", ["Jeanery", "Dune", "Pace"]],
    ]);
    // The Photo Style steers only the Style Icons Qloo picks, never their Brands (ADR-0002).
    expect(brandCalls()).toHaveLength(3);
    for (const params of brandCalls()) expect(params.has("signal.interests.tags")).toBe(false);
  });
});

describe("the fake verdict's scenarios", () => {
  it("find each first draw wrong, breaking no hard rule, and its redraw better, in preview-redrawn", async () => {
    harness.ai.scenario = "preview-redrawn";
    harness.qloo.respond = qlooWithBrands(WOMEN);
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");

    await harness.stylings.runPending();

    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown.outfits.map((o) => o.preview)).toEqual([
      { state: "ready", url: expect.stringContaining("-redraw.webp") },
      { state: "ready", url: expect.stringContaining("-redraw.webp") },
    ]);
    expect(harness.ai.previewRequests.map(({ correction }) => correction).toSorted()).toEqual([
      "Draw each garment exactly as its seller's photo shows it.",
      "Draw each garment exactly as its seller's photo shows it.",
      undefined,
      undefined,
    ]);
    const notes = shown.stylistNotes[0]!.notes.map(({ text }) => text);
    expect(notes.filter((text) => text === "Each Piece should look just as its seller's photo shows it.")).toHaveLength(2);
    expect(notes).toEqual(expect.arrayContaining(["Kept Outfit 1's redrawn Preview", "Kept Outfit 2's redrawn Preview"]));
  });

  it("find each first draw and its redraw both breaking a hard rule in preview-unfixable, leaving every Outfit without a Preview", async () => {
    harness.ai.scenario = "preview-unfixable";
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown.outfits.map((o) => o.preview)).toEqual([
      { state: "refused", by: "stylist" },
      { state: "refused", by: "stylist" },
    ]);
    expect(harness.ai.previewRequests.map(({ correction }) => correction).toSorted()).toEqual([
      "Keep the person's face exactly as it is in their photo.",
      "Keep the person's face exactly as it is in their photo.",
      undefined,
      undefined,
    ]);
    const notes = shown.stylistNotes[0]!.notes.map(({ text }) => text);
    expect(notes.filter((text) => text === "Neither Preview showed you as you are in your photo, so this Outfit has none.")).toHaveLength(2);
    expect(notes).toEqual(expect.arrayContaining(["Left Outfit 1 without a Preview", "Left Outfit 2 without a Preview"]));
  });
});

describe("a body photo's Stylist", () => {
  /** Ava Stone's Outfit as the Stylist saves it by default: Bolt's, Jeanery's and Stride's first Products. */
  const AVAS_OUTFIT = {
    styleIcon: 1,
    brands: { top: "Bolt", bottom: "Jeanery", shoes: "Stride" },
    top: { product: "c3-bolt-top-1", why: "An easy top for your casual Photo Style." },
    bottom: { product: "c3-jeanery-bottom-1", why: "Straight denim that grounds the Outfit." },
    shoes: { product: "c3-stride-shoes-1", why: "Shoes that finish the Outfit." },
  };

  /** Whether this is the turn the fake Stylist would save on: right after its last search, Ava Stone's One-Pieces. */
  function aboutToSave({ toolResults }: FakeStylistRequest): boolean {
    return toolResults.at(-1)?.toolName === "searchProducts" && (toolResults.at(-1)!.input as { category: string }).category === "onePiece";
  }

  it.each([
    [
      "a 4th Brand for a Category, beyond the Style Icon's top 3",
      { brands: { ...AVAS_OUTFIT.brands, top: "Ember" } },
      "Refused: Ember isn't among Ava Stone's top 3 Top Brands still in play: Bolt, Dune and Jeanery.",
    ],
    ["a Brand Qloo didn't give for the Category", { brands: { ...AVAS_OUTFIT.brands, top: "Stride" } }, "Refused: Stride isn't one of Ava Stone's Top Brands that the product search knows."],
    ["a Brand Qloo didn't give at all", { brands: { ...AVAS_OUTFIT.brands, shoes: "Gucci" } }, "Refused: Gucci isn't one of Ava Stone's Shoes Brands that the product search knows."],
    ["no Brands", { brands: undefined }, "Refused: Name the Outfit's Brands: its top, bottom and shoes, each by its name as fetchBrands listed it."],
    [
      "a Product its Brand's search didn't find",
      { top: { ...AVAS_OUTFIT.top, product: "c3-bolt-top-9" } },
      "Refused: c3-bolt-top-9 isn't one of the Tops searchProducts found for Bolt and Ava Stone's Outfit.",
    ],
    [
      "a Top as its One-Piece",
      { top: undefined, bottom: undefined, onePiece: AVAS_OUTFIT.top },
      "Refused: c3-bolt-top-1 isn't one of the One-Pieces searchProducts found for Bolt and Ava Stone's Outfit.",
    ],
    [
      "a One-Piece beside its Top and Bottom",
      { onePiece: { product: "c3-bolt-one_piece-1", why: "A one-and-done dress." } },
      "Refused: A One-Piece takes the place of the Top and the Bottom: give no top or bottom with it.",
    ],
    ["no Bottom", { bottom: undefined }, "Refused: The Outfit needs its top and bottom, or a One-Piece in their place."],
    ["no Shoes", { shoes: undefined }, "Refused: The Outfit needs its shoes."],
    ["a price in a why", { shoes: { ...AVAS_OUTFIT.shoes, why: "Shoes that finish the Outfit, about $60." } }, "Refused: The Shoes' why must not state a price."],
    ["an empty why", { top: { ...AVAS_OUTFIT.top, why: " " } }, "Refused: The Top's why is empty."],
    [
      "a Hairstyle, which a Body-Only Photo's Outfits have none of",
      { hairstyle: { cut: "Soft layered cut", details: "A soft layered cut.", cutKnown: true, why: "A soft cut for you." } },
      "Refused: This photo's Outfits have no Hairstyle: leave it out.",
    ],
  ])("refuses an Outfit with %s, saying why, then saves it corrected", async (_name, change, refusal) => {
    harness.qloo.respond = qlooWithBrands([WOMEN[0]!]);
    let tried = false;
    harness.ai.stylistTurn = (request) => {
      if (tried || !aboutToSave(request)) return undefined;
      tried = true;
      return save({ ...AVAS_OUTFIT, ...change });
    };
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");

    await harness.stylings.runPending();

    expect(saveResults().map(({ error }) => error)).toEqual([refusal, null]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.pieces.map((p) => [p.category, p.brand?.name, p.item]))).toEqual([
      [
        ["top", "Bolt", "Product c3-bolt-top-1"],
        ["bottom", "Jeanery", "Product c3-jeanery-bottom-1"],
        ["shoes", "Stride", "Product c3-stride-shoes-1"],
      ],
    ]);
  });

  it("saves an Outfit on any of a Style Icon's top 3 Brands for a Category, such as its second or third", async () => {
    harness.qloo.respond = qlooWithBrands([WOMEN[0]!]);
    // Ava Stone's third Top Brand, her second Bottom Brand and her second Shoes Brand.
    const outfit = {
      styleIcon: 1,
      brands: { top: "Jeanery", bottom: "Bolt", shoes: "Sole" },
      top: { product: "c3-jeanery-top-1", why: "A relaxed denim shirt for your casual Photo Style." },
      bottom: { product: "c3-bolt-bottom-1", why: "Easy trousers that keep the Outfit light." },
      shoes: { product: "c3-sole-shoes-1", why: "Trainers that finish the Outfit." },
    };
    harness.ai.stylistTurn = ({ toolResults }) => {
      if (toolResults.at(-1)?.toolName === "fetchBrands") {
        return call(
          "searchProducts",
          { styleIcon: 1, category: "top", brand: "Jeanery" },
          { styleIcon: 1, category: "bottom", brand: "Bolt" },
          { styleIcon: 1, category: "shoes", brand: "Sole" },
        );
      }
      return toolResults.at(-1)?.toolName === "searchProducts" && !toolResults.some(({ toolName }) => toolName === "saveOutfit") ? save(outfit) : undefined;
    };
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");

    await harness.stylings.runPending();

    expect(saveResults().map(({ error }) => error)).toEqual([null]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.pieces.map((p) => [p.category, p.brand?.name, p.item]))).toEqual([
      [
        ["top", "Jeanery", "Product c3-jeanery-top-1"],
        ["bottom", "Bolt", "Product c3-bolt-bottom-1"],
        ["shoes", "Sole", "Product c3-sole-shoes-1"],
      ],
    ]);
  });

  it("lets a Category's 4th Brand into its top 3 once the first's search finds nothing, for the Stylist to search for, save, and see when it fetches again", async () => {
    harness.qloo.respond = qlooWithBrands([WOMEN[0]!]);
    // Bolt's tops are all shown on a model, so its search for Ava Stone's Top finds none.
    harness.channel3.respond = channel3SellingEveryBrand({
      products: (search) =>
        search.brandId === "c3-bolt" && search.category === "top"
          ? [channel3Product("bolt-on-model", { brandIds: ["c3-bolt"], images: [{ url: "https://images.example/bolt.jpg", cleaned_url: null, shot_type: "on_model" }] })]
          : channel3SmallCatalogue(search),
    });
    const emberTop = { styleIcon: 1, category: "top", brand: "Ember" };
    const outfit = {
      ...AVAS_OUTFIT,
      brands: { ...AVAS_OUTFIT.brands, top: "Ember" },
      top: { product: "c3-ember-top-1", why: "A soft knit that keeps the Outfit easy." },
    };
    // Having fetched Ava Stone's Brands, it tries Ember's Tops, then searches Bolt's, then fetches again.
    const turns: Record<number, FakeStylistTurn> = {
      3: call("searchProducts", emberTop),
      4: call("searchProducts", { styleIcon: 1, category: "top", brand: "Bolt" }, { styleIcon: 1, category: "bottom", brand: "Jeanery" }, { styleIcon: 1, category: "shoes", brand: "Stride" }),
      5: call("fetchBrands", { styleIcon: 1 }),
      6: call("searchProducts", emberTop),
      7: save(outfit),
    };
    harness.ai.stylistTurn = ({ turn }) => turns[turn];
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");

    await harness.stylings.runPending();

    const results = harness.ai.stylistRequests.at(-1)!.toolResults;
    expect(results.filter(({ input }) => isDeepStrictEqual(input, emberTop)).map(({ output, error }) => [error, (output as { candidates?: string[] } | null)?.candidates?.length])).toEqual([
      ["Refused: Ember isn't among Ava Stone's top 3 Top Brands still in play: Bolt, Dune and Jeanery.", undefined],
      [null, 2],
    ]);
    expect(results.filter(({ toolName }) => toolName === "fetchBrands").map(({ output }) => (output as { brands: { top: string[] } }).brands.top)).toEqual([
      ["Bolt", "Dune", "Jeanery"],
      ["Dune", "Jeanery", "Ember"],
    ]);
    expect(saveResults().map(({ error }) => error)).toEqual([null]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.pieces.map((p) => p.brand?.name))).toEqual([["Ember", "Jeanery", "Stride"]]);
  });

  it("refuses a Brand another Outfit uses in the same Category, a current Outfit's included", async () => {
    harness.qloo.respond = qlooWithBrands(SIX_WOMEN);
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    // "Show 2 more Outfits" tries Bolt, the first Outfit's Top, as Cleo Hart's.
    let tried = false;
    harness.ai.stylistTurn = ({ toolResults }) => {
      if (tried || toolResults.at(-1)?.toolName !== "searchProducts") return undefined;
      tried = true;
      return save({ ...AVAS_OUTFIT, styleIcon: 3, brands: { top: "Bolt", bottom: "Dune", shoes: "Pace" } });
    };
    harness.ai.stylistRequests.length = 0;

    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    expect(saveResults()[0]!.error).toBe("Refused: Bolt is already another Outfit's Top: no Brand repeats within a Category.");
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => [o.styleIconName, o.pieces.map((p) => p.brand?.name)])).toEqual([
      ["Ava Stone", ["Bolt", "Jeanery", "Stride"]],
      ["Bea Marsh", ["Dune", "Bolt", "Sole"]],
      ["Cleo Hart", ["Jeanery", "Dune", "Pace"]],
    ]);
  });

  it("refuses the Brands of a 7th Style Icon, having fetched 6", async () => {
    harness.qloo.respond = qlooWithBrands(SEVEN_WOMEN);
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? call("fetchBrands", ...[1, 2, 3, 4, 5, 6, 7].map((styleIcon) => ({ styleIcon }))) : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[2]!.toolResults.map(({ error }) => error)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "Refused: This Styling has fetched the Brands of 6 Style Icons, as many as it may.",
    ]);
    expect(new Set(brandCalls().map((params) => params.get("signal.interests.entities")))).toEqual(new Set(["w-1", "w-2", "w-3", "w-4", "w-5", "w-6"]));
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual(["Ava Stone", "Bea Marsh"]);
  });

  it("refuses a 25th search, counting 24 towards the Styling's and this month's product searches", async () => {
    harness.qloo.respond = qlooWithBrands(WOMEN);
    // Each of Ava Stone's and Bea Marsh's top 3 Brands, for every Piece it can be, then one more.
    const everySearch = [
      ...[1, 2].flatMap((styleIcon) => [
        ...["Bolt", "Dune", "Jeanery"].flatMap((brand) => ["top", "bottom", "onePiece"].map((category) => ({ styleIcon, category, brand }))),
        ...["Stride", "Sole", "Pace"].map((brand) => ({ styleIcon, category: "shoes", brand })),
      ]),
      { styleIcon: 3, category: "top", brand: "Bolt" },
    ];
    harness.ai.stylistTurn = ({ toolResults }) =>
      toolResults.at(-1)?.toolName === "fetchBrands" ? call("searchProducts", ...everySearch) : undefined;
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");

    await harness.stylings.runPending();

    const searched = harness.ai.stylistRequests.find(({ toolResults }) => toolResults.length > 0 && toolResults.at(-1)!.toolName === "searchProducts")!;
    // Whichever was set going last: one whose Brand had to be looked up first may come after another.
    const searches = searched.toolResults.filter(({ toolName }) => toolName === "searchProducts");
    expect(searches).toHaveLength(25);
    expect(searches.flatMap(({ error }) => error ?? [])).toEqual(["Refused: This Styling has made all 24 of its product searches."]);
    expect(harness.channel3.requests.filter(({ url }) => url.pathname === "/v1/browse")).toHaveLength(24);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ productSearches: 24, outfitsMade: 2 })]);
    expect(await harness.db.$count(usageRecord, eq(usageRecord.kind, "product_search"))).toBe(24);
  });

  it("refuses a search for a Brand that isn't the Style Icon's for the Piece, or is out of the Category", async () => {
    harness.qloo.respond = qlooWithBrands(WOMEN);
    // Bolt's tops are all shown on a model, so its search for Ava Stone's Top finds none.
    harness.channel3.respond = channel3SellingEveryBrand({
      products: (search) =>
        search.brandId === "c3-bolt" && search.category === "top"
          ? [channel3Product("bolt-on-model", { brandIds: ["c3-bolt"], images: [{ url: "https://images.example/bolt.jpg", cleaned_url: null, shot_type: "on_model" }] })]
          : channel3SmallCatalogue(search),
    });
    let tried = false;
    harness.ai.stylistTurn = ({ toolResults }) => {
      const boltTopSearched = toolResults.some(({ input }) => (input as { brand?: string }).brand === "Bolt" && (input as { category?: string }).category === "top");
      if (tried || !boltTopSearched) return undefined;
      tried = true;
      return call("searchProducts", { styleIcon: 2, category: "top", brand: "Bolt" }, { styleIcon: 2, category: "shoes", brand: "Bolt" });
    };
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");

    await harness.stylings.runPending();

    const afterTrying = harness.ai.stylistRequests.find(({ toolResults }) => toolResults.some(({ error }) => error !== null))!;
    expect(afterTrying.toolResults.slice(-2).map(({ error }) => error)).toEqual([
      "Refused: Bolt is out of Tops for the rest of this Styling: its search found none.",
      "Refused: Bolt isn't one of Bea Marsh's Shoes Brands.",
    ]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.pieces.map((p) => p.brand?.name))).toEqual([
      ["Dune", "Jeanery", "Stride"],
      ["Jeanery", "Bolt", "Sole"],
    ]);
  });

  it("finishes the Styling with the Outfits it saved once its 30 turns are used up, however often it gets another wrong, with their Previews", async () => {
    harness.qloo.respond = qlooWithBrands(WOMEN);
    harness.ai.styleIconScenarios = { "Bea Marsh": "tailoring-fails" };
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests).toHaveLength(30);
    expect(saveResults().filter(({ error }) => error !== null).length).toBeGreaterThan(20);
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      outfits: [{ position: 1, styleIconName: "Ava Stone", preview: { state: "ready" } }],
    });
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 1 })]);
    expect(await styleIconStatusesOf(consultationId)).toEqual(["used", "unused", "unused"]);
  });
});

describe("the Stylist's Notes", () => {
  it("are the notes the Stylist writes each turn, each before the steps its tools then write, in order, as the status gives them while it runs", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    const browser = await signedInUser();
    const consultationId = await start(browser);
    const notes = watchNotes(browser, consultationId);
    harness.ai.duringCall = () => notes.poll();

    await harness.stylings.runPending();

    expect(notes.seen).toEqual([
      { kind: "note", text: "I'll ask Qloo for Style Icons in tune with your casual Photo Style." },
      { kind: "step", text: "Asked Qloo for Style Icons popular in the United States with a casual Photo Style: 1 found" },
      { kind: "note", text: "I'm saving an Outfit inspired by Ava Stone, whose style suits your casual Photo Style." },
      { kind: "step", text: "Saved Outfit 1, inspired by Ava Stone" },
      { kind: "note", text: "That's every Outfit for this Styling, so next come the Previews." },
      { kind: "step", text: "Drew Outfit 1's Preview" },
    ]);
  });

  it("have a step for each search, written from the data: Qloo's names, the Brand, the Category and counts, never naming the product search", async () => {
    harness.qloo.respond = qlooWithBrands([WOMEN[0]!]);
    // Bolt sells no Tops, so Dune's take their place.
    harness.channel3.respond = channel3SellingEveryBrand({
      products: (search) => (search.brandId === "c3-bolt" && search.category === "top" ? [] : channel3SmallCatalogue(search)),
    });
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");
    const notes = watchNotes(browser, consultationId);
    harness.ai.duringCall = () => notes.poll();

    await harness.stylings.runPending();

    const steps = notes.seen.flatMap(({ kind, text }) => (kind === "step" ? [text] : []));
    const expected = [
      "Asked Qloo for Style Icons popular in the United States with a casual Photo Style: 1 found",
      "Asked Qloo for the Brands Ava Stone's fans favour",
      "Searched Bolt's tops: none in stock",
      "Searched Jeanery's bottoms: 2 in stock",
      "Searched Stride's shoes: 2 in stock",
      "Searched Dune's tops: 2 in stock",
      "Searched Dune's One-Pieces: 2 in stock",
      "Saved Outfit 1, inspired by Ava Stone",
      "Drew Outfit 1's Preview",
    ];
    // Searches made at once are written as each answers.
    expect(steps).toEqual(expect.arrayContaining(expected));
    expect(steps).toHaveLength(expected.length);
    expect(steps.at(-2)).toBe("Saved Outfit 1, inspired by Ava Stone");
    // The product search calls Bolt "Brand c3-bolt".
    expect(JSON.stringify(notes.seen)).not.toMatch(/channel3|c3-/i);
  });

  it("have a step for a Preview the image model declined, and for one it still couldn't draw after its retries", async () => {
    harness.qloo.respond = qlooAnswering(WOMEN.slice(0, 2));
    harness.ai.previewScenarios = ["preview-refused", "preview-fails", "preview-fails"];
    harness.stylings.previewRetries = 1;
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    // The Previews are drawn at once, once the Stylist has finished.
    const { notes } = (await readConsultation(harness.context(browser), consultationId))!.stylistNotes[0]!;
    expect(notes.at(-3)).toEqual({ kind: "note", text: "That's every Outfit for this Styling, so next come the Previews." });
    expect(notes.slice(-2).toSorted((a, b) => a.text.localeCompare(b.text))).toEqual([
      { kind: "step", text: "Couldn't draw Outfit 2's Preview" },
      { kind: "step", text: "The image model declined to draw Outfit 1's Preview" },
    ]);
  });

  it("drop, silently, a note that states a price, is empty, or runs too long, keeping the turn's others", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    const text = [
      "Ava Stone's soft layers suit your casual Photo Style.",
      "Yours for about $40 at most salons.",
      "   ",
      `This cut is ${"really ".repeat(45)}easy to keep.`,
      "It frames your face without much upkeep.",
    ].join("\n");
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? { ...save(hairstyleOutfit(1)), text } : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);
    const notes = watchNotes(browser, consultationId);
    harness.ai.duringCall = () => notes.poll();

    await harness.stylings.runPending();

    expect(notes.seen.slice(2, 5)).toEqual([
      { kind: "note", text: "Ava Stone's soft layers suit your casual Photo Style." },
      { kind: "note", text: "It frames your face without much upkeep." },
      { kind: "step", text: "Saved Outfit 1, inspired by Ava Stone" },
    ]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toHaveLength(1);
  });

  it("keep a note the Stylist writes with writeNote, before the steps its turn's other tools write", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    const note = "Ava Stone's soft layers suit your casual Photo Style, so her cut comes first.";
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? { calls: [...call("writeNote", { text: note }).calls, ...save(hairstyleOutfit(1)).calls] } : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);
    const notes = watchNotes(browser, consultationId);
    harness.ai.duringCall = () => notes.poll();

    await harness.stylings.runPending();

    expect(notes.seen.slice(2, 4)).toEqual([
      { kind: "note", text: note },
      { kind: "step", text: "Saved Outfit 1, inspired by Ava Stone" },
    ]);
    expect(harness.ai.stylistRequests[2]!.toolResults.find(({ toolName }) => toolName === "writeNote")).toMatchObject({ output: { shown: true }, error: null });
  });

  it("keep a turn's notes written with writeNote after its text and before its steps, in the order written, wherever writeNote is called among its tools", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    const [first, second] = ["Ava Stone's soft layers suit your casual Photo Style.", "Her cut is easy to reach from your current length."];
    harness.ai.stylistTurn = ({ turn }) =>
      turn === 2
        ? {
            text: "Here's your first Outfit.",
            calls: [...call("writeNote", { text: first }).calls, ...save(hairstyleOutfit(1)).calls, ...call("writeNote", { text: second }).calls],
          }
        : undefined;
    const browser = await signedInUser();
    const consultationId = await start(browser);
    const notes = watchNotes(browser, consultationId);
    harness.ai.duringCall = () => notes.poll();

    await harness.stylings.runPending();

    expect(notes.seen.slice(2, 6)).toEqual([
      { kind: "note", text: "Here's your first Outfit." },
      { kind: "note", text: first },
      { kind: "note", text: second },
      { kind: "step", text: "Saved Outfit 1, inspired by Ava Stone" },
    ]);
  });

  it("refuse a note written with writeNote that states a price, is empty, or runs too long, saying why, so the Stylist can write it again, keeping the turn's others", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    const kept = "It frames your face without much upkeep.";
    const texts = ["Yours for about $40 at most salons.", "   ", `This cut is ${"really ".repeat(45)}easy to keep.`, `  ${kept}\n`];
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? { calls: [...call("writeNote", ...texts.map((text) => ({ text }))).calls, ...save(hairstyleOutfit(1)).calls] } : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);
    const notes = watchNotes(browser, consultationId);
    harness.ai.duringCall = () => notes.poll();

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[2]!.toolResults.filter(({ toolName }) => toolName === "writeNote").map(({ output, error }) => output ?? error)).toEqual([
      "Refused: Your note states a price, so it wasn't shown: nothing you write states a price.",
      "Refused: Your note is empty, so it wasn't shown.",
      "Refused: Your note is too long, so it wasn't shown: keep each note to one or two short sentences.",
      { shown: true },
    ]);
    expect(notes.seen.slice(2, 4)).toEqual([
      { kind: "note", text: kept },
      { kind: "step", text: "Saved Outfit 1, inspired by Ava Stone" },
    ]);
  });

  it("keep a note once when writeNote is given it twice in a turn, or the turn's text gave it already", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    const [written, twice] = ["Ava Stone's soft layers suit your casual Photo Style.", "Her cut is easy to reach from your current length."];
    harness.ai.stylistTurn = ({ turn }) =>
      turn === 2
        ? { text: written, calls: [...call("writeNote", { text: written }, { text: twice }, { text: ` ${twice}` }).calls, ...save(hairstyleOutfit(1)).calls] }
        : undefined;
    const browser = await signedInUser();
    const consultationId = await start(browser);
    const notes = watchNotes(browser, consultationId);
    harness.ai.duringCall = () => notes.poll();

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[2]!.toolResults.filter(({ toolName }) => toolName === "writeNote").map(({ output }) => output)).toEqual([
      { shown: true },
      { shown: true },
      { shown: true },
    ]);
    expect(notes.seen.slice(2, 5)).toEqual([
      { kind: "note", text: written },
      { kind: "note", text: twice },
      { kind: "step", text: "Saved Outfit 1, inspired by Ava Stone" },
    ]);
  });

  it("come from the status only after the index the page asks for", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    const browser = await signedInUser();
    const consultationId = await start(browser);
    const asked: Record<number, StylistNoteView[]> = {};
    harness.ai.duringCall = async (call) => {
      if (call !== "renderPreview") return;
      for (const notesAfter of [0, 3, 6, 9]) {
        asked[notesAfter] = (await readStylingStatus(harness.context(browser), consultationId, { notesAfter }))!.progress!.notes;
      }
    };

    await harness.stylings.runPending();

    expect(asked[0]).toHaveLength(5);
    expect(asked[3]).toEqual([
      { kind: "step", text: "Saved Outfit 1, inspired by Ava Stone" },
      { kind: "note", text: "That's every Outfit for this Styling, so next come the Previews." },
    ]);
    expect(asked[6]).toEqual([]);
    expect(asked[9]).toEqual([]);
  });

  it("keep what the Stylist wrote in a turn with no tool call, its last, after the steps before it", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? { text: "I couldn't find a cut that suits you, so I'll stop here." } : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    const [ran] = await stylingsOf(consultationId);
    const stored = await harness.db
      .select({ position: stylistNote.position, kind: stylistNote.kind, text: stylistNote.text })
      .from(stylistNote)
      .where(eq(stylistNote.stylingId, ran!.id));
    expect(stored.toSorted((a, b) => a.position - b.position).map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "note", text: "I'll ask Qloo for Style Icons in tune with your casual Photo Style." },
      { kind: "step", text: "Asked Qloo for Style Icons popular in the United States with a casual Photo Style: 1 found" },
      { kind: "note", text: "I couldn't find a cut that suits you, so I'll stop here." },
    ]);
  });

  it("go with their Consultation, and with the account", async () => {
    const browser = await signedInUser();
    const deleted = await start(browser);
    await harness.stylings.runPending();
    const kept = await start(browser);
    await harness.stylings.runPending();
    const notesOf = async (consultationId: string) =>
      (
        await harness.db
          .select({ position: stylistNote.position })
          .from(stylistNote)
          .innerJoin(styling, eq(styling.id, stylistNote.stylingId))
          .where(eq(styling.consultationId, consultationId))
      ).length;
    expect(await notesOf(deleted)).toBeGreaterThan(0);

    await deleteConsultation(harness.context(browser), deleted);

    expect(await notesOf(deleted)).toBe(0);
    expect(await notesOf(kept)).toBeGreaterThan(0);

    await deleteAccount(harness.context(browser), { password: "a long enough password" });

    expect(await notesOf(kept)).toBe(0);
  });
});

describe("the Stylist's Notes once Outfits appear", () => {
  it("stay below the Outfits they explain, in an entry for the Styling that made them", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.stylistNotes).toEqual([
      {
        styling: { kind: "first" },
        notes: [
          { kind: "note", text: "I'll ask Qloo for Style Icons in tune with your casual Photo Style." },
          { kind: "step", text: "Asked Qloo for Style Icons popular in the United States with a casual Photo Style: 1 found" },
          { kind: "note", text: "I'm saving an Outfit inspired by Ava Stone, whose style suits your casual Photo Style." },
          { kind: "step", text: "Saved Outfit 1, inspired by Ava Stone" },
          { kind: "note", text: "That's every Outfit for this Styling, so next come the Previews." },
          { kind: "step", text: "Drew Outfit 1's Preview" },
        ],
      },
    ]);
  });

  it('keep both Stylings\' entries once "Show 2 more Outfits" adds to the Outfits, oldest first, each with its own notes', async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser);
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:05:00Z");

    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    const { stylistNotes } = (await readConsultation(harness.context(browser), consultationId))!;
    expect(stylistNotes.map(({ styling, notes }) => [styling, notes.flatMap(({ text }) => (text.startsWith("Saved") ? [text] : []))])).toEqual([
      [{ kind: "first" }, ["Saved Outfit 1, inspired by Ava Stone", "Saved Outfit 2, inspired by Bea Marsh"]],
      [{ kind: "more" }, ["Saved Outfit 3, inspired by Cleo Hart"]],
    ]);
    expect(await kindsWithNotesStored(consultationId)).toEqual(["first", "more"]);
  });

  it("go with the Outfits a Photo Style change replaces, deleted as its own Outfits switch in", async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser);
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:05:00Z");

    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.stylistNotes.map(({ styling }) => styling)).toEqual([
      { kind: "photo_style_change", photoStyle: ["edgy"] },
    ]);
    expect(await kindsWithNotesStored(consultationId)).toEqual(["photo_style_change"]);
  });

  it("go with the Outfits a Budget Tier change replaces, deleted as its own Outfits switch in", async () => {
    harness.qloo.respond = qlooWithBrands(SIX_WOMEN);
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:05:00Z");
    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();
    expect(await kindsWithNotesStored(consultationId)).toEqual(["first", "more"]);
    harness.clock.set("2026-10-16T12:10:00Z");

    await changeBudgetTier(harness.context(browser), consultationId, "low");
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.stylistNotes.map(({ styling }) => styling)).toEqual([
      { kind: "budget_tier_change", budgetTier: "low" },
    ]);
    expect(await kindsWithNotesStored(consultationId)).toEqual(["budget_tier_change"]);
  });

  it("stay under a failed Styling's line, beside the entries of the Outfits it kept", async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser);
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:05:00Z");
    // The Photo Style change's Stylist finds new Style Icons, then is refused on its second turn.
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? { refused: true } : undefined);

    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();

    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown.failedStyling).toEqual({
      kind: "photo_style_change",
      photoStyle: ["edgy"],
      reason: "something_broke",
      notes: [
        { kind: "note", text: "I'll ask Qloo for Style Icons in tune with your edgy Photo Style." },
        { kind: "step", text: "Asked Qloo for Style Icons popular in the United States with an edgy Photo Style: 3 found" },
      ],
    });
    expect(shown.stylistNotes.map(({ styling }) => styling)).toEqual([{ kind: "first" }]);
  });

  it("go from under a failed Styling's line once a later Styling takes its place, and a Try again's entry is the Styling it tried again", async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser);
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:05:00Z");
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? { refused: true } : undefined);
    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:10:00Z");
    harness.ai.stylistTurn = ({ turn }) => (turn === 1 ? { text: "I've lost my place, so I'll stop here." } : undefined);

    await tryAgain(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    expect((await readConsultation(harness.context(browser), consultationId))!.failedStyling).toMatchObject({
      notes: [{ kind: "note", text: "I've lost my place, so I'll stop here." }],
    });
    expect(await kindsWithNotesStored(consultationId)).toEqual(["first", "try_again"]);
    harness.clock.set("2026-10-16T12:15:00Z");
    harness.ai.stylistTurn = undefined;

    await tryAgain(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown.failedStyling).toBeNull();
    expect(shown.stylistNotes.map(({ styling }) => styling)).toEqual([{ kind: "photo_style_change", photoStyle: ["edgy"] }]);
    expect(await kindsWithNotesStored(consultationId)).toEqual(["try_again"]);
  });

  it('leave nothing of a failed "Show 2 more Outfits", which has no line of its own to sit under', async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser);
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:05:00Z");
    harness.ai.stylistTurn = ({ turn }) => (turn === 1 ? { text: "I've lost my place, so I'll stop here." } : undefined);

    await showMoreOutfits(harness.context(browser), consultationId);
    await harness.stylings.runPending();

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      failedStyling: null,
      everyOutfitBuilt: true,
      stylistNotes: [{ styling: { kind: "first" } }],
    });
    expect(await kindsWithNotesStored(consultationId)).toEqual(["first"]);
  });

  it("have no entries, and nothing under a failed Styling's line, on a Consultation made before them", async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser);
    await harness.stylings.runPending();
    harness.clock.set("2026-10-16T12:05:00Z");
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? { refused: true } : undefined);
    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();
    // Its Stylings ran before the Stylist's Notes, so they have none.
    const stylingIds = (await stylingsOf(consultationId)).map(({ id }) => id);
    await harness.db.delete(stylistNote).where(inArray(stylistNote.stylingId, stylingIds));

    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      outfits: [{ styleIconName: "Ava Stone" }, { styleIconName: "Bea Marsh" }],
      failedStyling: { kind: "photo_style_change", notes: [] },
      stylistNotes: [],
    });
  });
});

describe("the Preview phase", () => {
  it("draws and judges each Outfit's Preview once the Stylist finishes, keeping one judged right as it was drawn, with no redraw and no note of its verdict's", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    harness.ai.previewVerdicts = [{ right: true }];
    const browser = await signedInUser();
    const consultationId = await start(browser);
    const turnsBefore: [string, number][] = [];
    harness.ai.duringCall = async (made) => {
      if (made !== "stylistModel") turnsBefore.push([made, harness.ai.stylistRequests.length]);
    };

    await harness.stylings.runPending();

    // Both once the Stylist's last turn, its finish, is done.
    const turns = harness.ai.stylistRequests.length;
    expect(turnsBefore).toEqual([
      ["renderPreview", turns],
      ["judgePreview", turns],
    ]);
    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    const [drawn] = await harness.db.select().from(outfit).where(eq(outfit.consultationId, consultationId));
    const [hairstyle] = await harness.db.select().from(piece).where(eq(piece.outfitId, drawn!.id));
    expect(harness.ai.verdictRequests).toEqual([
      {
        draw: "first",
        photo: { mediaType: "image/jpeg", sha256: sha256(harness.blob.objects.get(stored!.photoPathname)!.bytes) },
        photoType: "face",
        hairCovered: false,
        pieces: [{ category: "hairstyle", details: hairstyle!.details }],
        preview: { mediaType: "image/webp", sha256: sha256(harness.blob.objects.get(drawn!.previewPathname!)!.bytes) },
      },
    ]);
    expect(harness.ai.previewRequests.map(({ correction }) => correction)).toEqual([undefined]);
    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown.outfits).toMatchObject([{ preview: { state: "ready", url: expect.not.stringContaining("-redraw") } }]);
    expect(shown.stylistNotes[0]!.notes.slice(-2)).toEqual([
      { kind: "note", text: "That's every Outfit for this Styling, so next come the Previews." },
      { kind: "step", text: "Drew Outfit 1's Preview" },
    ]);
  });

  it.each([
    ["redraw", "redrawn"],
    ["first", "first"],
  ] as const)("redraws a Preview judged wrong once, with its verdict's correction and note, and keeps the image the redraw's verdict calls better: the %s", async (better, keptAs) => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    harness.ai.previewVerdicts = [WRONG, { breaksHardRule: false, better, note: "The redraw shows your cut as its details describe it." }];
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.previewRequests.map(({ correction }) => correction)).toEqual([undefined, WRONG.correction]);
    const [firstVerdict, redrawVerdict] = harness.ai.verdictRequests;
    expect(harness.ai.verdictRequests).toHaveLength(2);
    expect(redrawVerdict).toEqual({
      ...firstVerdict,
      draw: "redraw",
      preview: undefined,
      first: firstVerdict!.draw === "first" && firstVerdict!.preview,
      redraw: expect.objectContaining({ mediaType: "image/webp" }),
      firstVerdict: WRONG,
    });
    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    const [drawn] = await harness.db.select().from(outfit).where(eq(outfit.consultationId, consultationId));
    const keptImage = { mediaType: "image/webp", sha256: sha256(harness.blob.objects.get(drawn!.previewPathname!)!.bytes) };
    expect(keptImage).toEqual(redrawVerdict!.draw === "redraw" && redrawVerdict![better]);
    // The image not kept goes.
    expect([...harness.blob.objects.keys()].toSorted()).toEqual([stored!.photoPathname, drawn!.previewPathname].toSorted());
    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown.outfits).toMatchObject([{ preview: { state: "ready", url: better === "redraw" ? expect.stringContaining("-redraw.webp") : expect.not.stringContaining("-redraw") } }]);
    expect(shown.stylistNotes[0]!.notes.slice(-4)).toEqual([
      { kind: "step", text: "Drew Outfit 1's Preview" },
      { kind: "note", text: WRONG.note },
      { kind: "step", text: "Redrew Outfit 1's Preview" },
      { kind: "step", text: `Kept Outfit 1's ${keptAs} Preview` },
    ]);
  });

  it("leaves an Outfit with no Preview, as a refusal does, when both its images break a hard rule, with the redraw's verdict's note", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    const neither = "Neither Preview showed your face as it is in your photo, so this Outfit has none.";
    harness.ai.previewVerdicts = [BREAKS_A_HARD_RULE, { breaksHardRule: true, better: "redraw", note: neither }];
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    // Redrawn once only, however the redraw came out.
    expect(harness.ai.previewRequests.map(({ correction }) => correction)).toEqual([undefined, BREAKS_A_HARD_RULE.correction]);
    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown).toMatchObject({ state: "ready", everyPreviewRefused: false, outfits: [{ preview: { state: "refused", by: "stylist" } }] });
    const [drawn] = await harness.db.select().from(outfit).where(eq(outfit.consultationId, consultationId));
    expect(drawn).toMatchObject({ previewState: "refused", previewPathname: null, previewRefusalReason: "not_kept" });
    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    expect([...harness.blob.objects.keys()]).toEqual([stored!.photoPathname]);
    expect(shown.stylistNotes[0]!.notes.slice(-5)).toEqual([
      { kind: "step", text: "Drew Outfit 1's Preview" },
      { kind: "note", text: BREAKS_A_HARD_RULE.note },
      { kind: "step", text: "Redrew Outfit 1's Preview" },
      { kind: "note", text: neither },
      { kind: "step", text: "Left Outfit 1 without a Preview" },
    ]);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 1 })]);
  });

  it.each([
    ["only the first breaks a hard rule", BREAKS_A_HARD_RULE, false, "first", "redrawn"],
    ["only the redraw breaks a hard rule", WRONG, true, "redraw", "first"],
  ] as const)("keeps the image that breaks no hard rule when %s, even when the redraw's verdict calls the other better", async (_name, firstVerdict, redrawBreaksHardRule, better, keptAs) => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    const note = "The other Preview shows your cut better.";
    harness.ai.previewVerdicts = [firstVerdict, { breaksHardRule: redrawBreaksHardRule, better, note }];
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown.outfits).toMatchObject([{ preview: { state: "ready", url: keptAs === "redrawn" ? expect.stringContaining("-redraw.webp") : expect.not.stringContaining("-redraw") } }]);
    // The redraw's verdict's note leaves no Outfit without a Preview, so it isn't shown.
    expect(shown.stylistNotes[0]!.notes.slice(-2)).toEqual([
      { kind: "step", text: "Redrew Outfit 1's Preview" },
      { kind: "step", text: `Kept Outfit 1's ${keptAs} Preview` },
    ]);
  });

  it("goes ahead once the Stylist calls finish in the same turn as its last saveOutfit, with that Outfit's Preview", async () => {
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? { calls: [...save(hairstyleOutfit(1), hairstyleOutfit(2)).calls, { tool: "finish", input: {} }] } : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests).toHaveLength(2);
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      outfits: [
        { styleIconName: "Ava Stone", preview: { state: "ready" } },
        { styleIconName: "Bea Marsh", preview: { state: "ready" } },
      ],
    });
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 2 })]);
  });

  it("never sends the Stylist's model a Preview or a seller photo: each verdict is sent its Products' seller photos, fetched within its own step", async () => {
    harness.qloo.respond = qlooWithBrands([WOMEN[0]!]);
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");

    await harness.stylings.runPending();

    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    const photo = { mediaType: "image/jpeg", sha256: sha256(harness.blob.objects.get(stored!.photoPathname)!.bytes) };
    for (const { images, links } of harness.ai.stylistRequests) {
      expect(images).toEqual([photo]);
      expect(links).toEqual([]);
    }
    const [drawn] = await harness.db.select().from(outfit).where(eq(outfit.consultationId, consultationId));
    const sellerPhotos = (await harness.db.select().from(piece).where(eq(piece.outfitId, drawn!.id)))
      .toSorted((a, b) => ["top", "bottom", "shoes"].indexOf(a.category) - ["top", "bottom", "shoes"].indexOf(b.category))
      .map(({ item, category, productPhotoUrl }) => ({ category, title: item, url: productPhotoUrl! }));
    expect(harness.ai.verdictRequests).toEqual([
      expect.objectContaining({
        photoType: "body_only",
        pieces: sellerPhotos.map(({ category, title, url }) => ({ category, title, photo: { mediaType: "image/png", sha256: sha256(productPhotoBytes(url)) } })),
      }),
    ]);
    // Fetched once to draw the Preview and once to judge it, and never for the Stylist's model.
    const urls = sellerPhotos.map(({ url }) => url);
    expect(harness.productPhotos.requests.map(String).toSorted()).toEqual([...urls, ...urls].toSorted());
  });

  it("leaves an Outfit with no Preview when its Styling ends before either of its redrawn images is kept, deleting both", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    harness.ai.previewVerdicts = [WRONG];
    const browser = await signedInUser();
    const consultationId = await start(browser);
    // The Styling is finished as stuck while its redraw is drawn.
    harness.ai.duringCall = async (made) => {
      if (made !== "renderPreview" || harness.ai.previewRequests.length !== 2) return;
      harness.clock.set("2026-10-16T12:11:00Z");
      await readStylingStatus(harness.context(browser), consultationId);
    };

    await harness.stylings.runPending();

    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown).toMatchObject({ state: "ready", outfits: [{ preview: { state: "failed" } }] });
    expect(shown.stylistNotes[0]!.notes.slice(-2)).toEqual([
      { kind: "step", text: "Drew Outfit 1's Preview" },
      { kind: "note", text: WRONG.note },
    ]);
    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    expect([...harness.blob.objects.keys()]).toEqual([stored!.photoPathname]);
  });

  it("leaves an Outfit with no Preview when its Styling ends before its first draw is judged, deleting it, so no unchecked Preview is shown", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    const browser = await signedInUser();
    const consultationId = await start(browser);
    // The Styling is finished as stuck while its Preview is judged, which then judges it right.
    harness.ai.duringCall = async (made) => {
      if (made !== "judgePreview") return;
      harness.clock.set("2026-10-16T12:11:00Z");
      await readStylingStatus(harness.context(browser), consultationId);
    };

    await harness.stylings.runPending();

    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown).toMatchObject({ state: "ready", outfits: [{ preview: { state: "failed" } }] });
    expect(shown.stylistNotes[0]!.notes.at(-1)).toEqual({ kind: "step", text: "Drew Outfit 1's Preview" });
    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    expect([...harness.blob.objects.keys()]).toEqual([stored!.photoPathname]);
  });

  it("drops, silently, a verdict's note that states a price, as it drops any note that does, keeping the Preview's steps", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    harness.ai.previewVerdicts = [
      { ...BREAKS_A_HARD_RULE, note: "A cut like this one costs about $40 at most salons." },
      { breaksHardRule: true, better: "first", note: "Neither Preview was worth the £25 it would cost." },
    ];
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    const { notes } = (await readConsultation(harness.context(browser), consultationId))!.stylistNotes[0]!;
    expect(notes.slice(-3)).toEqual([
      { kind: "step", text: "Drew Outfit 1's Preview" },
      { kind: "step", text: "Redrew Outfit 1's Preview" },
      { kind: "step", text: "Left Outfit 1 without a Preview" },
    ]);
    expect(JSON.stringify(notes)).not.toMatch(/[$£]/);
  });

  it("clears a verdict's note of the braces and tags a model can leave in it, keeping its words", async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    // As Claude Sonnet 5.5 returned both of a Styling's redraw verdicts in the check's run 14-54-16.
    const asReturned = "This Preview didn't show you as you are.}}</br>";
    harness.ai.previewVerdicts = [
      { ...BREAKS_A_HARD_RULE, note: `${BREAKS_A_HARD_RULE.note}<br/>` },
      { breaksHardRule: true, better: "first", note: asReturned },
    ];
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    const { notes } = (await readConsultation(harness.context(browser), consultationId))!.stylistNotes[0]!;
    expect(notes.slice(-5)).toEqual([
      { kind: "step", text: "Drew Outfit 1's Preview" },
      { kind: "note", text: BREAKS_A_HARD_RULE.note },
      { kind: "step", text: "Redrew Outfit 1's Preview" },
      { kind: "note", text: "This Preview didn't show you as you are." },
      { kind: "step", text: "Left Outfit 1 without a Preview" },
    ]);
  });

  it('moves the Styling on to "Generating Previews" as it starts, counting the Previews kept, refused or failed, so a redraw doesn\'t move the count', async () => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    harness.ai.previewVerdicts = [WRONG];
    const browser = await signedInUser();
    const consultationId = await start(browser);
    const seen: [string, string, string][] = [];
    harness.ai.duringCall = async (made) => {
      const progress = (await readStylingStatus(harness.context(browser), consultationId))!.progress!;
      seen.push([made, progress.stage, `${progress.previews.done} of ${progress.previews.of}`]);
    };

    await harness.stylings.runPending();

    expect(seen.slice(-5)).toEqual([
      // The Stylist's last turn, its finish, of the 2 Outfits it may make.
      ["stylistModel", "building_outfits", "0 of 2"],
      ["renderPreview", "previews", "0 of 1"],
      ["judgePreview", "previews", "1 of 1"],
      // The redraw.
      ["renderPreview", "previews", "1 of 1"],
      ["judgePreview", "previews", "1 of 1"],
    ]);
  });

  it.each([
    ["declined", "preview-refused", "The image model declined to redraw Outfit 1's Preview", WRONG, { state: "ready", url: expect.not.stringContaining("-redraw") }, "Kept Outfit 1's first Preview"],
    ["declined", "preview-refused", "The image model declined to redraw Outfit 1's Preview", BREAKS_A_HARD_RULE, { state: "refused", by: "stylist" }, "Left Outfit 1 without a Preview"],
    ["couldn't draw", "preview-fails", "Couldn't redraw Outfit 1's Preview", WRONG, { state: "ready", url: expect.not.stringContaining("-redraw") }, "Kept Outfit 1's first Preview"],
    ["couldn't draw", "preview-fails", "Couldn't redraw Outfit 1's Preview", BREAKS_A_HARD_RULE, { state: "refused", by: "stylist" }, "Left Outfit 1 without a Preview"],
  ] as const)("keeps the first image when the image model %s the redraw, or none when the first breaks a hard rule", async (_how, redrawScenario, redrawStep, firstVerdict, preview, keptStep) => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    harness.ai.previewScenarios = ["pass", redrawScenario];
    harness.ai.previewVerdicts = [firstVerdict];
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    // No redraw to judge.
    expect(harness.ai.verdictRequests.map(({ draw }) => draw)).toEqual(["first"]);
    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown.outfits.map((o) => o.preview)).toEqual([preview]);
    expect(shown.stylistNotes[0]!.notes.slice(-4)).toEqual([
      { kind: "step", text: "Drew Outfit 1's Preview" },
      { kind: "note", text: firstVerdict.note },
      { kind: "step", text: redrawStep },
      { kind: "step", text: keptStep },
    ]);
    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    const [drawn] = await harness.db.select().from(outfit).where(eq(outfit.consultationId, consultationId));
    expect([...harness.blob.objects.keys()].toSorted()).toEqual([stored!.photoPathname, ...(drawn!.previewPathname ? [drawn!.previewPathname] : [])].toSorted());
  });

  it.each([
    ["still fails after its retries", failingVerdicts("first"), 2],
    ["is refused", refusedVerdicts([]), 1],
  ] as const)("leaves an Outfit with no Preview, as when the image model kept failing, when its first draw's verdict %s, saying it couldn't be checked", async (_how, verdictFails, verdictsAsked) => {
    harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
    verdictFails();
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    // Never redrawn, and never shown unchecked.
    expect(harness.ai.previewRequests).toHaveLength(1);
    expect(harness.ai.verdictRequests).toHaveLength(verdictsAsked);
    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown).toMatchObject({ state: "ready", everyPreviewRefused: false, outfits: [{ preview: { state: "failed" } }] });
    expect(shown.stylistNotes[0]!.notes.slice(-2)).toEqual([
      { kind: "step", text: "Drew Outfit 1's Preview" },
      { kind: "step", text: "Couldn't check Outfit 1's Preview" },
    ]);
    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    expect([...harness.blob.objects.keys()]).toEqual([stored!.photoPathname]);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 1 })]);
  });

  it("carries on with the other Outfits' Previews when one's can't be judged, completing the Styling with every Outfit it saved", async () => {
    const crop = "A short crop, trimmed close at the sides.";
    harness.ai.stylistTurn = ({ turn }) =>
      turn === 2 ? { calls: [...save(hairstyleOutfit(1), hairstyleOutfit(2, { details: crop })).calls, { tool: "finish", input: {} }] } : undefined;
    harness.stylings.previewRetries = 1;
    // Outfit 1's verdict keeps failing, and Outfit 2's judges it right.
    harness.ai.duringCall = async (made) => {
      const judged = harness.ai.verdictRequests.at(-1)?.pieces[0];
      if (made === "judgePreview" && judged?.category === "hairstyle" && judged.details !== crop) throw new Error("The verdict model is down.");
    };
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    const shown = (await readConsultation(harness.context(browser), consultationId))!;
    expect(shown).toMatchObject({
      state: "ready",
      outfits: [
        { styleIconName: "Ava Stone", preview: { state: "failed" } },
        { styleIconName: "Bea Marsh", preview: { state: "ready" } },
      ],
    });
    expect(shown.stylistNotes[0]!.notes).toContainEqual({ kind: "step", text: "Couldn't check Outfit 1's Preview" });
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 2 })]);
  });

  it.each([
    ["still fails after its retries", failingVerdicts("redraw", [WRONG]), 3, WRONG, { state: "ready", url: expect.not.stringContaining("-redraw") }, "Kept Outfit 1's first Preview"],
    ["still fails after its retries", failingVerdicts("redraw", [BREAKS_A_HARD_RULE]), 3, BREAKS_A_HARD_RULE, { state: "refused", by: "stylist" }, "Left Outfit 1 without a Preview"],
    ["is refused", refusedVerdicts([WRONG]), 2, WRONG, { state: "ready", url: expect.not.stringContaining("-redraw") }, "Kept Outfit 1's first Preview"],
    ["is refused", refusedVerdicts([BREAKS_A_HARD_RULE]), 2, BREAKS_A_HARD_RULE, { state: "refused", by: "stylist" }, "Left Outfit 1 without a Preview"],
  ] as const)(
    "keeps the first image when the redraw's verdict %s, or none when the first breaks a hard rule, never the redraw",
    async (_how, verdictFails, verdictsAsked, firstVerdict, preview, keptStep) => {
      harness.qloo.respond = qlooAnswering([WOMEN[0]!]);
      verdictFails();
      const browser = await signedInUser();
      const consultationId = await start(browser);

      await harness.stylings.runPending();

      expect(harness.ai.verdictRequests.map(({ draw }) => draw)).toEqual(["first", ...Array.from({ length: verdictsAsked - 1 }, () => "redraw")]);
      const shown = (await readConsultation(harness.context(browser), consultationId))!;
      expect(shown.outfits.map((o) => o.preview)).toEqual([preview]);
      expect(shown.stylistNotes[0]!.notes.slice(-4)).toEqual([
        { kind: "step", text: "Drew Outfit 1's Preview" },
        { kind: "note", text: firstVerdict.note },
        { kind: "step", text: "Redrew Outfit 1's Preview" },
        { kind: "step", text: keptStep },
      ]);
      // The redraw goes, and so does the first unless it's kept.
      const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
      const [drawn] = await harness.db.select().from(outfit).where(eq(outfit.consultationId, consultationId));
      expect([...harness.blob.objects.keys()].toSorted()).toEqual([stored!.photoPathname, ...(drawn!.previewPathname ? [drawn!.previewPathname] : [])].toSorted());
      expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 1 })]);
    },
  );
});

/**
 * Scripts these verdicts, then makes every verdict on a `draw` throw, as a model that keeps erroring
 * does, each Preview step tried once more, so it still fails after its retries.
 */
function failingVerdicts(draw: "first" | "redraw", before: readonly FakeScriptedVerdict[] = []) {
  return () => {
    harness.ai.previewVerdicts = [...before];
    harness.stylings.previewRetries = 1;
    harness.ai.duringCall = async (made) => {
      if (made === "judgePreview" && harness.ai.verdictRequests.at(-1)?.draw === draw) throw new Error("The verdict model is down.");
    };
  };
}

/** Scripts these verdicts, then the model refusing to judge the next Preview. */
function refusedVerdicts(before: readonly FakeScriptedVerdict[]) {
  return () => {
    harness.ai.previewVerdicts = [...before, { refused: true }];
  };
}

/** A first draw's verdict that finds it wrong, breaking no hard rule. */
const WRONG = {
  right: false,
  breaksHardRule: false,
  correction: "The cut should have the soft layers its details describe.",
  note: "Your cut was drawn without the soft layers it should have.",
} as const;

/** A first draw's verdict that finds it breaks a hard rule. */
const BREAKS_A_HARD_RULE = {
  right: false,
  breaksHardRule: true,
  correction: "Keep the face exactly as it is in the photo.",
  note: "Your Preview didn't show your face as it is in your photo.",
} as const;

describe("a Styling the Stylist can't carry out", () => {
  it("breaks when a turn still fails, keeping the Outfits saved before it, with no Preview drawn", async () => {
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? save(hairstyleOutfit(1)) : undefined);
    harness.ai.duringCall = async (made) => {
      if (made === "stylistModel" && harness.ai.stylistRequests.at(-1)?.turn === 3) throw new Error("The model is down.");
    };
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests).toHaveLength(3);
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      outfits: [{ styleIconName: "Ava Stone", preview: { state: "failed" } }],
    });
    expect(harness.ai.previewRequests).toEqual([]);
    expect(harness.ai.verdictRequests).toEqual([]);
    expect((await stylingsOf(consultationId))[0]!.stage).toBe("building_outfits");
  });

  it("breaks when the model refuses a turn part-way, keeping the earlier Outfits and offering Try again", async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser);
    await harness.stylings.runPending();
    harness.ai.stylistRequests.length = 0;
    harness.clock.set("2026-10-16T12:05:00Z");
    // The Photo Style change's Stylist finds new Style Icons, then is refused on its second turn.
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? { refused: true } : undefined);

    await changePhotoStyle(harness.context(browser), consultationId, ["edgy"]);
    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests).toHaveLength(2);
    expect((await stylingsOf(consultationId)).toSorted((a, b) => a.startedAt.getTime() - b.startedAt.getTime())).toEqual([
      expect.objectContaining({ kind: "first", status: "succeeded" }),
      expect.objectContaining({ kind: "photo_style_change", status: "failed", failureReason: "something_broke" }),
    ]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.styleIconName)).toEqual([
      "Ava Stone",
      "Bea Marsh",
    ]);
    expect(await tryAgain(harness.context(browser), consultationId)).toEqual({ ok: true });
  });

  it("breaks, for Try again, when the model refuses its last turn, the 30th, rather than finishing at the turn cap", async () => {
    // Having found the Style Icons, it keeps asking for them again rather than saving anything, then refuses its 30th turn.
    harness.ai.stylistTurn = ({ turn }) => (turn === 30 ? { refused: true } : turn > 1 ? call("findStyleIcons", {}) : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests).toHaveLength(30);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "failed", failureReason: "something_broke" })]);
  });

  it("breaks, for Try again, when the Stylist stops without finishing, having saved nothing", async () => {
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? { text: "I'm done." } : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests).toHaveLength(2);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "failed", failureReason: "something_broke" })]);
  });

  it("fails as nothing could be built when the Stylist finishes having saved nothing", async () => {
    harness.qloo.respond = qlooAnswering([]);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests.map(({ toolResults }) => toolResults.at(-1)?.output ?? null)).toEqual([null, { styleIcons: [] }]);
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "failed", failureReason: "nothing_built" })]);
  });
});

/** A turn that saves these Outfits, at once. */
function save(...outfits: object[]) {
  return { calls: outfits.map((input) => ({ tool: "saveOutfit", input })) };
}

/** A turn that calls `tool` once with each input, at once. */
function call(tool: string, ...inputs: object[]) {
  return { calls: inputs.map((input) => ({ tool, input })) };
}

/** The signature cuts `forHairLength` passes Style Icons over for, by their number: each needs far more length. */
const LONG_CUTS = ["long, loose mane", "hip-length layered cut", "long curtain-fringed cut", "long sleek ponytail", "waist-length blowout"];

/** Passing over Style Icon `styleIcon` for hair length, with a reason about its signature cut's length. */
function forHairLength(styleIcon: number) {
  return {
    styleIcon,
    reasonKind: "hairLength",
    reason: `Her signature ${LONG_CUTS[(styleIcon - 1) % LONG_CUTS.length]} needs much more length than a cut from yours can reach.`,
  };
}

/** An Outfit as the Stylist saves it: a Hairstyle from Style Icon `styleIcon`, with anything `hairstyle` changes. */
function hairstyleOutfit(styleIcon: number, hairstyle: object = {}) {
  return {
    styleIcon,
    hairstyle: {
      cut: "Soft layered cut",
      details: "A soft layered cut, trimmed to shape from your current length.",
      cutKnown: true,
      why: "A soft cut that carries your casual Photo Style.",
      ...hairstyle,
    },
  };
}

/**
 * The Stylist's Notes as a page waiting on the Styling sees them: each `poll()` asks the status for
 * the notes after those it has, and adds them to `seen`. Like the page's, each poll waits for the
 * one before it, even when two AI calls at once ask for one.
 */
function watchNotes(browser: TestBrowser, consultationId: string) {
  const seen: StylistNoteView[] = [];
  let polled = Promise.resolve();
  return {
    seen,
    poll(): Promise<void> {
      polled = polled.then(async () => {
        const status = await readStylingStatus(harness.context(browser), consultationId, { notesAfter: seen.length });
        seen.push(...(status?.progress?.notes ?? []));
      });
      return polled;
    },
  };
}

/** Every save the Stylist asked for in this test's Stylings, and what came back, oldest first. */
function saveResults() {
  // Each Styling's last turn was sent every tool call before it.
  const lastTurns = harness.ai.stylistRequests.filter((request, index, requests) => requests[index + 1]?.turn !== request.turn + 1);
  return lastTurns.flatMap(({ toolResults }) => toolResults.filter(({ toolName }) => toolName === "saveOutfit"));
}

/** The Qloo requests that went out for Brands. */
function brandCalls(): URLSearchParams[] {
  return harness.qloo.requests.map((request) => request.url.searchParams).filter((params) => params.get("filter.type") === "urn:entity:brand");
}

async function styleIconStatusesOf(consultationId: string) {
  const icons = await harness.db.select({ position: styleIcon.position, status: styleIcon.status }).from(styleIcon).where(eq(styleIcon.consultationId, consultationId));
  return icons.toSorted((a, b) => a.position - b.position).map(({ status }) => status);
}

/** The kinds of the Consultation's Stylings whose Stylist's Notes are still stored, oldest first. */
async function kindsWithNotesStored(consultationId: string) {
  const stored = await harness.db
    .selectDistinct({ id: styling.id, kind: styling.kind, startedAt: styling.startedAt })
    .from(stylistNote)
    .innerJoin(styling, eq(styling.id, stylistNote.stylingId))
    .where(eq(styling.consultationId, consultationId));
  return stored.toSorted((a, b) => a.startedAt.getTime() - b.startedAt.getTime()).map(({ kind }) => kind);
}

async function stylingsOf(consultationId: string) {
  return harness.db.select().from(styling).where(eq(styling.consultationId, consultationId));
}

/** Answers each person call with `people`, whatever its line. */
function qlooAnswering(people: readonly object[]) {
  return (_request: RecordedQlooRequest) => qlooResponse(people);
}

/** Answers each person call with `people`, whatever its line, and each Brand call with BRANDS. */
function qlooWithBrands(people: readonly object[]) {
  return ({ url }: RecordedQlooRequest) => qlooResponse(url.searchParams.get("filter.type") === "urn:entity:brand" ? BRANDS : people);
}

/** Presses "Get my Outfits" with a plain JPEG, a Face Photo unless it says, agreeing on the consent sheet, returning the new Consultation's id. */
async function start(browser: TestBrowser, photoType: PhotoType = "face"): Promise<string> {
  const result = await startConsultation(harness.context(browser), { photo: await jpeg(), photoType, consent: BOTH_CONSENT_BOXES_TICKED });
  if (!result.ok) throw new Error(`Couldn't start a Consultation: ${result.refusal}`);
  return result.consultationId;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

let userCount = 0;

/** A new womenswear user, signed in, who has verified their email by its link. */
async function signedInUser(overrides: Partial<SignUpInput> = {}): Promise<TestBrowser> {
  userCount += 1;
  const browser = new TestBrowser();
  const email = `stylist.user${userCount}@example.com`;
  const result = await signUp(harness.context(browser), {
    birthDate: { day: "2", month: "2", year: "1992" },
    username: `stylist_user_${userCount}`,
    email,
    password: "a long enough password",
    stylePreference: "womenswear",
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
