import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { consultation, qlooCache, styleIcon, styling, usageRecord } from "@/server/db/schema";
import { readConsultation, startConsultation } from "@/server/operations/consultations";
import { signUp, type SignUpInput } from "@/server/operations/sign-up";
import { changePhotoStyle, showMoreOutfits, tryAgain } from "@/server/operations/stylings";
import { qlooPerson, qlooResponse, type RecordedQlooRequest } from "@/server/qloo/fake";
import { BOTH_CONSENT_BOXES_TICKED, createTestHarness, TestBrowser, type TestHarness } from "@/test/harness";

// A Face Photo's Stylings, carried out by the Stylist: the AI SDK's Workflow agent, here on the fake
// AI's scripted fake model, working through its tools. The Stylist's turns are the fake model's
// calls, which a test can script.

// Made-up people, shaped like Qloo's person entities.
const WOMEN = [qlooPerson("w-1", "Ava Stone", 0.94), qlooPerson("w-2", "Bea Marsh", 0.91), qlooPerson("w-3", "Cleo Hart", 0.88)];
const SIX_WOMEN = [...WOMEN, qlooPerson("w-4", "Dana Reed", 0.86), qlooPerson("w-5", "Esme Vale", 0.84), qlooPerson("w-6", "Fay Lowe", 0.8)];

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
  harness.stylings.pending.length = 0;
  harness.qloo.requests.length = 0;
  harness.qloo.respond = qlooAnswering(WOMEN);
  await harness.db.delete(qlooCache);
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

async function stylingsOf(consultationId: string) {
  return harness.db.select().from(styling).where(eq(styling.consultationId, consultationId));
}

/** Answers each person call with `people`, whatever its line. */
function qlooAnswering(people: readonly object[]) {
  return (_request: RecordedQlooRequest) => qlooResponse(people);
}

/** Presses "Get my Outfits" with a plain JPEG Face Photo, agreeing on the consent sheet, returning the new Consultation's id. */
async function start(browser: TestBrowser): Promise<string> {
  const result = await startConsultation(harness.context(browser), { photo: await jpeg(), photoType: "face", consent: BOTH_CONSENT_BOXES_TICKED });
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
