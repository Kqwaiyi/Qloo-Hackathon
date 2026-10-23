import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PhotoType } from "@/config/consultations";
import type { FakeStylistRequest } from "@/server/ai/fake-stylist";
import { brandMatch, consultation, qlooCache, styleIcon, styling, usageRecord } from "@/server/db/schema";
import { readConsultation, startConsultation } from "@/server/operations/consultations";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { changeBudgetTier, changePhotoStyle, showMoreOutfits, tryAgain } from "@/server/operations/stylings";
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
  harness.ai.duringCall = undefined;
  harness.ai.styleIconScenarios = {};
  harness.stylings.pending.length = 0;
  harness.qloo.requests.length = 0;
  harness.qloo.respond = qlooAnswering(WOMEN);
  harness.channel3.requests.length = 0;
  harness.channel3.respond = channel3SellingEveryBrand();
  await harness.db.delete(qlooCache);
  await harness.db.delete(brandMatch);
  await harness.db.delete(usageRecord);
});

describe("the Stylist's conversation", () => {
  it("holds the photo once, as the first message gave it, on every turn", async () => {
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    const [stored] = await harness.db.select().from(consultation).where(eq(consultation.id, consultationId));
    const photo = { mediaType: "image/jpeg", sha256: sha256(harness.blob.objects.get(stored!.photoPathname)!.bytes) };
    expect(harness.ai.stylistRequests.length).toBeGreaterThan(1);
    for (const request of harness.ai.stylistRequests) expect(request.images).toEqual([photo]);
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

  it("covers every tool the Stylist has", async () => {
    const prompt = await promptSent();

    for (const tool of harness.ai.stylistRequests[0]!.tools) expect(prompt).toContain(tool);
  });

  it("covers every tool a body photo's Stylist has, which fetches Brands and searches for Products besides", async () => {
    harness.qloo.respond = qlooWithBrands(WOMEN);
    await start(await signedInUser(), "body_only");

    await harness.stylings.runPending();

    const [first] = harness.ai.stylistRequests;
    expect(first!.tools.toSorted()).toEqual(["fetchBrands", "findStyleIcons", "finish", "renderPreview", "saveOutfit", "searchProducts", "startPreviews"]);
    for (const tool of first!.tools) expect(first!.instructions).toContain(tool);
    expect(first!.instructions).toMatch(/first Brand on its list that's still in play/i);
    expect(first!.instructions).toMatch(/One-Piece/);
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
    expect(first!.tools.toSorted()).toEqual(["findStyleIcons", "finish", "renderPreview", "saveOutfit", "startPreviews"]);
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
  it("finishes the Styling with the Outfits the Stylist saved once its 30 turns are used up", async () => {
    // It saves Ava Stone's Outfit, then keeps asking for a Preview before starting the Previews.
    harness.ai.stylistTurn = ({ turn }) => (turn === 2 ? save(hairstyleOutfit(1)) : turn > 2 ? call("renderPreview", { outfit: 1 }) : undefined);
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests.map(({ turn }) => turn)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      outfits: [{ position: 1, styleIconName: "Ava Stone", preview: { state: "failed" } }],
    });
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 1 })]);
    expect(harness.ai.previewRequests).toEqual([]);
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
      error: "Refused: This Styling makes at most 2 Outfits, and you've saved them all: start the Previews.",
    });
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits).toHaveLength(2);
  });

  it("refuse a Preview asked for before the Stylist says it has saved every Outfit, and a save after it says so", async () => {
    harness.ai.stylistTurn = ({ turn }) =>
      turn === 2
        ? save(hairstyleOutfit(1))
        : turn === 3
          ? call("renderPreview", { outfit: 1 })
          : turn === 4
            ? call("startPreviews", {})
            : turn === 5
              ? save(hairstyleOutfit(2))
              : undefined;
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests[3]!.toolResults.at(-1)).toMatchObject({
      toolName: "renderPreview",
      error: "Refused: Say you've saved every Outfit first, with startPreviews.",
    });
    expect(harness.ai.stylistRequests[4]!.toolResults.at(-1)).toEqual({ toolName: "startPreviews", input: {}, output: { outfits: [1] }, error: null });
    expect(harness.ai.stylistRequests[5]!.toolResults.at(-1)).toMatchObject({
      toolName: "saveOutfit",
      error: "Refused: You've started the Previews, so no more Outfits can be saved.",
    });
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      outfits: [{ styleIconName: "Ava Stone", preview: { state: "ready" } }],
    });
    // Drawn once, after the Previews started.
    expect(harness.ai.previewRequests).toHaveLength(1);
  });

  it("refuse a second Preview of the same Outfit, and one of an Outfit the Stylist hasn't saved", async () => {
    harness.ai.stylistTurn = ({ toolResults }) =>
      toolResults.at(-1)?.toolName === "startPreviews" ? call("renderPreview", { outfit: 1 }, { outfit: 1 }, { outfit: 3 }) : undefined;
    const browser = await signedInUser();
    const consultationId = await start(browser);

    await harness.stylings.runPending();

    const afterDrawing = harness.ai.stylistRequests.find(({ toolResults }) => toolResults.at(-1)?.toolName === "renderPreview")!;
    expect(afterDrawing.toolResults.slice(-3)).toEqual([
      { toolName: "renderPreview", input: { outfit: 1 }, output: { outfit: 1, preview: "drawn" }, error: null },
      { toolName: "renderPreview", input: { outfit: 1 }, output: null, error: "Refused: Outfit 1's Preview is already being drawn." },
      { toolName: "renderPreview", input: { outfit: 3 }, output: null, error: "Refused: You haven't saved an Outfit 3." },
    ]);
    expect((await readConsultation(harness.context(browser), consultationId))!.outfits.map((o) => o.preview.state)).toEqual(["ready", "ready"]);
    expect(harness.ai.previewRequests).toHaveLength(2);
  });

  it("say when the image model declines a Preview", async () => {
    harness.ai.previewScenarios = ["preview-refused"];
    const browser = await signedInUser();
    await start(browser);

    await harness.stylings.runPending();

    const drawn = harness.ai.stylistRequests.at(-1)!.toolResults.filter(({ toolName }) => toolName === "renderPreview");
    expect(drawn.map(({ output }) => output)).toEqual([
      { outfit: 1, preview: "declined" },
      { outfit: 2, preview: "drawn" },
    ]);
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
    ["Brands that aren't each Category's first still in play", { brands: { ...AVAS_OUTFIT.brands, top: "Dune" } }, "Refused: Bolt is Ava Stone's first Top Brand still in play, not Dune."],
    ["a Brand Qloo didn't give for the Category", { brands: { ...AVAS_OUTFIT.brands, top: "Stride" } }, "Refused: Stride isn't one of Ava Stone's Top Brands that the product search knows."],
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
    // Every Brand Ava Stone's fans favour, for every Piece it can be, then one more.
    const everySearch = [
      ...["Bolt", "Dune", "Jeanery", "Ember", "Hem", "Loom", "Weft"].flatMap((brand) =>
        ["top", "bottom", "onePiece"].map((category) => ({ styleIcon: 1, category, brand })),
      ),
      ...["Stride", "Sole", "Pace"].map((brand) => ({ styleIcon: 1, category: "shoes", brand })),
      { styleIcon: 2, category: "top", brand: "Bolt" },
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
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ productSearches: 24, outfitsMade: 1 })]);
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

  it("finishes the Styling with the Outfits it saved once its 30 turns are used up, however often it gets another wrong", async () => {
    harness.qloo.respond = qlooWithBrands(WOMEN);
    harness.ai.styleIconScenarios = { "Bea Marsh": "tailoring-fails" };
    const browser = await signedInUser();
    const consultationId = await start(browser, "body_only");

    await harness.stylings.runPending();

    expect(harness.ai.stylistRequests).toHaveLength(30);
    expect(saveResults().filter(({ error }) => error !== null).length).toBeGreaterThan(20);
    expect(await readConsultation(harness.context(browser), consultationId)).toMatchObject({
      state: "ready",
      outfits: [{ position: 1, styleIconName: "Ava Stone", preview: { state: "failed" } }],
    });
    expect(await stylingsOf(consultationId)).toEqual([expect.objectContaining({ status: "succeeded", outfitsMade: 1 })]);
    expect(await styleIconStatusesOf(consultationId)).toEqual(["used", "unused", "unused"]);
  });
});

describe("a Styling the Stylist can't carry out", () => {
  it("breaks when a turn still fails, keeping the Outfits saved before it", async () => {
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
    // Having found the Style Icons, it keeps asking for a Preview before saving anything, then refuses its 30th turn.
    harness.ai.stylistTurn = ({ turn }) => (turn === 30 ? { refused: true } : turn > 1 ? call("renderPreview", { outfit: 1 }) : undefined);
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
