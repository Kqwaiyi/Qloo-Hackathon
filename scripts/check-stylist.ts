// A live check, opt-in and never run in CI, which costs money: the Haiku check (spec: "Fakes and the
// check"). Is the Stylist good enough for production, its model, CLAUDE_STYLIST_MODEL (Claude Haiku
// 5.5), driving it, and the verdict's, CLAUDE_PREVIEW_VERDICT_MODEL (Claude Sonnet 5.5), judging each
// Preview (ADR-0012)? It runs the real Stylist, on real Claude, with live Qloo and Channel3, on
// fixed, AI-generated photos: the landing page's Full-Body sample photo, and a Face Photo and a
// Body-Only Photo cut from it, one of each Photo Type. Each is styled once as a new user in the
// United States would be, on an app of its own that lives only while it runs. Drawn on Nano Banana
// 2.1, as in production, each Preview should be judged right, and kept as it was drawn.
//
// Then it shows the verdicts deliberately bad Previews. The bake-off's were never kept, so it makes
// its own: Nano Banana 2 Lite on the Body-Only Photo, which has no face, where Lite invented one in the
// bake-off; and Previews with known faults, made from the photos themselves: the photo unchanged,
// wearing none of the Outfit; the Face Photo with its face pixelated; and the Body-Only Photo zoomed
// out to show the head it leaves out. The Preview phase should redraw each fault, then keep the
// redraw, or keep neither when both break a hard rule, as a face added twice does. Whether Lite
// invented a face this time only the eye can tell, so the report leaves its Previews to the eye.
//
// For each Styling it reports whether its Outfits are valid, the Stylist's turns, the time it took,
// what Claude cost, the Stylist's turns and the verdicts each on its own model's prices, the turns
// against what they'd cost with nothing cached, its largest prompt, the Style Icons passed over for
// hair length, and what the Preview phase did with each Preview: a report to paste into the
// cheaper-stylist spec's ticket 07. It saves no photo or Preview to the repository: they go, with each
// Styling's Stylist's Notes and turns, to a folder of the system's temporary files, to check by eye.
//
// It says first roughly what a run costs, and spends it only with --go-ahead, once the team has
// agreed to the cost. --image-model draws every Preview that Nano Banana 2.1 would on another image
// model, such as the cheaper Nano Banana 2 Lite. Those Previews aren't production's, so the report
// leaves them to the eye. --previews-from draws none at all: it serves each Preview an image model
// would draw from the folder an earlier run saved, for the Outfit of the same Style Icon there, run
// with the same --image-model so its cases match. One with no saved image is declined, as the image
// model can decline. The faults the check makes itself are made as ever.
//
//   npm run check:stylist
//   npm run check:stylist -- --go-ahead
//   npm run check:stylist -- --go-ahead --image-model gemini-3.1-flash-lite-image
//   npm run check:stylist -- --go-ahead --image-model gemini-3.1-flash-lite-image --previews-from <folder>
//
// It needs QLOO_API_URL, QLOO_API_KEY, CHANNEL3_API_KEY, ANTHROPIC_API_KEY and GEMINI_API_KEY in
// .env.local, whatever AI_PROVIDER and PRODUCT_SEARCH say.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";
import sharp, { type Sharp } from "sharp";

import { STYLE_PREFERENCE_LABELS, type StylePreference } from "@/config/accounts";
import {
  CLAUDE_PHOTO_CHECK_MODEL,
  CLAUDE_PREVIEW_VERDICT_EFFORT,
  CLAUDE_PREVIEW_VERDICT_MODEL,
  CLAUDE_STYLIST_EFFORT,
  CLAUDE_STYLIST_MODEL,
  GEMINI_PREVIEW_MODEL,
  GEMINI_PREVIEW_MODELS,
  GEMINI_PREVIEW_PRICES_USD,
  type GeminiPreviewModel,
} from "@/config/ai";
import { CATEGORY_LABELS, type PhotoType } from "@/config/consultations";
import { EVERYONES_STYLING_LIMITS, OUTFITS_PER_STYLING } from "@/config/stylings";
import { realAiFromEnvironment } from "@/server/ai/environment";
import { GeminiAiProvider } from "@/server/ai/gemini";
import type { AiProvider } from "@/server/ai/provider";
import { MemoryBlobStore } from "@/server/blob/memory";
import { closeDatabase } from "@/server/db/connect";
import { LANDING_SAMPLES } from "@/server/landing-samples";
import {
  type CheckedOutfit,
  checkStylist,
  claudeCostUsd,
  type PreviewDrawer,
  type PreviewHandling,
  type PreviewRedrawn,
  StylistCheckAi,
  StylistCheckBlob,
  type StylistCheckResult,
} from "@/server/operations/stylist-check";

import { createFreshApp } from "./fresh-app";
import { publicFile } from "./landing-sample-files";
import { exitWithUsage } from "./team-script";

const USAGE = `npm run check:stylist -- [--go-ahead] [--image-model <${Object.values(GEMINI_PREVIEW_MODELS).join(" | ")}>] [--previews-from <folder>]`;

const KEYS = ["QLOO_API_URL", "QLOO_API_KEY", "CHANNEL3_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"] as const;

// The fixed photos are cut from the landing page's Full-Body sample photo, by where its person is in
// it, measured by eye on the 1024 px square it is. A sample made again with another photo needs them
// measured again.
const SAMPLE_PHOTO_SIZE = 1024;
/** The Face Photo: the head and shoulders. */
const FACE_PHOTO_AREA = { left: 440, top: 30, width: 290, height: 340 };
/** The face in the Face Photo, from the brows to the chin, which the face-changed fault pixelates. */
const FACE_IN_FACE_PHOTO = { left: 98, top: 62, width: 94, height: 120 };
/** The Body-Only Photo: from the shoulders to the feet, the face left out. */
const BODY_ONLY_PHOTO_AREA = { left: 255, top: 236, width: 600, height: 768 };
/** How far above the person's hair the face-added fault zooms out to, so it shows the whole head. */
const ABOVE_THE_HAIR = 40;

/** How many turns a Styling's Stylist takes, as the estimate has it. */
const ROUGH_STYLIST_TURNS = 20;
/**
 * One of the Stylist's turns, as the estimate has it: a prompt of about 20,000 tokens, most of it, the
 * photo included, read from cache, and its note, tool calls and thinking.
 */
const ROUGH_STYLIST_TURN_TOKENS = { noCache: 250, cacheWrite: 1_750, cacheRead: 17_500, output: 1_500 };
/** A photo check, as the estimate has it. */
const ROUGH_PHOTO_CHECK_TOKENS = { noCache: 2_000, cacheWrite: 0, cacheRead: 0, output: 1_000 };
/**
 * One Preview's verdict, as the estimate has it: its rules and the photo read from cache, then the
 * Outfit's Pieces, their seller photos and the images to judge, and its verdict and thinking. On
 * Claude Sonnet 5.5 that's about $0.017, as the cheaper-stylist spec estimates a verdict.
 */
const ROUGH_VERDICT_TOKENS = { noCache: 4_000, cacheWrite: 0, cacheRead: 3_000, output: 800 };
/** A body photo's Styling makes about this many product searches (spec: "Cost", real Products). */
const ROUGH_PRODUCT_SEARCHES = 8;
/** One Channel3 credit, past its free credits, as the real-products spec prices them: one search each. */
const PRODUCT_SEARCH_CREDIT_USD = 0.007;

/** How a check case draws a Preview: on one of the Gemini image models, or as a fault the check makes itself, which costs nothing. */
type Drawing = { model: GeminiPreviewModel } | { fault: "unchanged" | "face-pixelated" | "face-added" };

/** One of the fixed photos, and how a new user styled from it signs up. */
interface FixedPhoto {
  name: string;
  photoType: PhotoType;
  stylePreference: StylePreference;
  bytes: Uint8Array<ArrayBuffer>;
}

/** What the Preview phase should do with a Preview: keep it as drawn, or redraw it and keep the redraw, or neither. */
type ExpectedHandling = Extract<PreviewHandling, "kept" | "redrawn-kept-redraw" | "redrawn-kept-none">;

/** What the report says the Preview phase should have done instead, for each thing it should do. */
const SHOULD_HAVE: Record<ExpectedHandling, string> = {
  kept: "kept it as drawn",
  "redrawn-kept-redraw": "redrawn it and kept the redraw",
  "redrawn-kept-none": "redrawn it and kept neither",
};

/**
 * One Styling the check runs: a fixed photo, how its Previews are drawn, first tries and redraws, and
 * what the Preview phase should do with each, or null when only the eye can tell.
 */
interface CheckCase {
  name: string;
  photo: FixedPhoto;
  first: Drawing;
  redraw: Drawing;
  expected: ExpectedHandling | null;
  /** What to look at, when the report can't say. */
  note?: string;
}

const NANO_BANANA_2_LITE: Drawing = { model: GEMINI_PREVIEW_MODELS.nanoBanana2Lite };

const { goAhead, imageModel, previewsFrom } = readOptions();
/** Previews drawn as production draws them: on production's image model, unless --image-model names another. */
const AS_IN_PRODUCTION: Drawing = { model: imageModel };
/** Whether those are production's own, which the Preview phase should keep as drawn. Another model's are left to the eye. */
const onProductionsModel = imageModel === GEMINI_PREVIEW_MODEL;
const photos = await fixedPhotos();
const asInProduction = (name: string, photo: FixedPhoto): CheckCase => ({
  name,
  photo,
  first: AS_IN_PRODUCTION,
  redraw: AS_IN_PRODUCTION,
  ...(onProductionsModel
    ? { expected: "kept" }
    : { expected: null, note: `Drawn on ${imageModel}, not production's ${GEMINI_PREVIEW_MODEL}: check its Previews by eye, to see whether each verdict on them was right.` }),
});
const CASES: CheckCase[] = [
  asInProduction("Full-Body Photo", photos.fullBody),
  asInProduction("Face Photo", photos.face),
  asInProduction("Body-Only Photo", photos.bodyOnly),
  // With every Preview on Lite already, this would be the Body-Only Photo's again.
  ...(imageModel === NANO_BANANA_2_LITE.model
    ? []
    : [
        {
          name: "Body-Only Photo, first drawn on Nano Banana 2 Lite",
          photo: photos.bodyOnly,
          first: NANO_BANANA_2_LITE,
          redraw: AS_IN_PRODUCTION,
          expected: null,
          note: "Lite invented a face on a Body-Only Photo in the bake-off, but may not have this time: check its first Previews by eye, to see whether each verdict on them was right.",
        },
      ]),
  { name: "Full-Body Photo, first drawn as the photo unchanged", photo: photos.fullBody, first: { fault: "unchanged" }, redraw: AS_IN_PRODUCTION, expected: "redrawn-kept-redraw" },
  { name: "Face Photo, first drawn with the face pixelated", photo: photos.face, first: { fault: "face-pixelated" }, redraw: AS_IN_PRODUCTION, expected: "redrawn-kept-redraw" },
  { name: "Body-Only Photo, drawn and redrawn with a face added", photo: photos.bodyOnly, first: { fault: "face-added" }, redraw: { fault: "face-added" }, expected: "redrawn-kept-none" },
];

console.log(planText());
const missing = KEYS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`\n${missing.join(", ")} must be set, as in .env.local.`);
  process.exit(1);
}
if (!goAhead) {
  console.log("\nNothing was spent. Once the team has agreed to the cost, run it again with --go-ahead.");
  process.exit(0);
}

const folder = path.join(os.tmpdir(), `stylist-check-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}`);
/** Each case's Previews served from the earlier run, or declined for want of one, by the case's name: what the report says of them. */
const served = new Map<string, string[]>();
const imageModels = new Map(
  Object.values(GEMINI_PREVIEW_MODELS).map((model) => [model, new GeminiAiProvider({ apiKey: process.env.GEMINI_API_KEY!, model })]),
);
const previewsDrawn = new Map<GeminiPreviewModel, number>();
const app = await createFreshApp({
  ai: new StylistCheckAi((verdictMiddleware) => {
    const ai = realAiFromEnvironment({ verdictMiddleware });
    return previewsFrom ? neverDrawing(ai) : ai;
  }),
  blob: new StylistCheckBlob(new MemoryBlobStore()),
});
const checked: { checkCase: CheckCase; result: StylistCheckResult | { error: string } }[] = [];
try {
  for (const [index, checkCase] of CASES.entries()) {
    console.log(`\n${index + 1} of ${CASES.length}: styling the ${checkCase.name}…`);
    const { photo } = checkCase;
    try {
      const result = await checkStylist(app, {
        photoType: photo.photoType,
        photo: new Blob([photo.bytes], { type: "image/jpeg" }),
        stylePreference: photo.stylePreference,
        drawPreview: await drawerFor(checkCase),
      });
      checked.push({ checkCase, result });
      await saveCase(path.join(folder, `${index + 1}-${slug(checkCase.name)}`), photo, result);
    } catch (error) {
      checked.push({ checkCase, result: { error: error instanceof Error ? error.message : String(error) } });
      process.exitCode = 1;
    }
    console.log(`  ${progressLine(checked.at(-1)!.result)}`);
  }
} finally {
  await closeDatabase(app.db);
}
console.log(`\nThe report, for the cheaper-stylist spec's ticket 07:\n\n${reportText()}`);

function readOptions(): { goAhead: boolean; imageModel: GeminiPreviewModel; previewsFrom: string | undefined } {
  try {
    const { values } = parseArgs({
      options: {
        "go-ahead": { type: "boolean", default: false },
        "image-model": { type: "string", default: GEMINI_PREVIEW_MODEL },
        "previews-from": { type: "string" },
      },
    });
    const model = values["image-model"];
    if (!isImageModel(model)) exitWithUsage(USAGE);
    return { goAhead: values["go-ahead"], imageModel: model, previewsFrom: values["previews-from"] };
  } catch {
    exitWithUsage(USAGE);
  }
}

/** The real AI, its image model never asked: the check serves every Preview itself, and one that reached it would be a bug. */
function neverDrawing(ai: AiProvider): AiProvider {
  return {
    checkPhoto: (input) => ai.checkPhoto(input),
    stylistModel: () => ai.stylistModel(),
    renderPreview: async () => {
      throw new Error("The check serves its Previews from an earlier run's, so it asks the image model for none.");
    },
    judgePreview: ai.judgePreview.bind(ai),
  };
}

function isImageModel(model: string): model is GeminiPreviewModel {
  return (Object.values(GEMINI_PREVIEW_MODELS) as string[]).includes(model);
}

/** The fixed photos: the landing page's Full-Body sample photo, and the others cut from it, with those its faults are made from. */
async function fixedPhotos() {
  const photoPath = LANDING_SAMPLES.full_body.images?.photoPath;
  if (!photoPath) {
    console.error("The Full-Body sample has no photo, which the check's photos are cut from.");
    process.exit(1);
  }
  const sample = await readFile(publicFile(photoPath));
  const { width, height } = await sharp(sample).metadata();
  if (width !== SAMPLE_PHOTO_SIZE || height !== SAMPLE_PHOTO_SIZE) {
    console.error(`public${photoPath} isn't the ${SAMPLE_PHOTO_SIZE} px square photo the check's photos are cut from: measure them again.`);
    process.exit(1);
  }
  const jpeg = async (image: Sharp) => new Uint8Array(await image.jpeg({ quality: 90 }).toBuffer());
  const face = await jpeg(sharp(sample).extract(FACE_PHOTO_AREA));
  // A mosaic of a few big squares in place of the face.
  const shrunk = await sharp(face).extract(FACE_IN_FACE_PHOTO).resize(7, 9).toBuffer();
  const mosaic = await sharp(shrunk).resize(FACE_IN_FACE_PHOTO.width, FACE_IN_FACE_PHOTO.height, { kernel: "nearest" }).toBuffer();
  // The Body-Only Photo's framing, zoomed out to show the head above it, as Lite did in the bake-off.
  const { left, top, width: areaWidth, height: areaHeight } = BODY_ONLY_PHOTO_AREA;
  const zoomedHeight = top + areaHeight - ABOVE_THE_HAIR;
  const zoomedWidth = Math.round((zoomedHeight * areaWidth) / areaHeight);
  const zoomed = { left: Math.round(left + areaWidth / 2 - zoomedWidth / 2), top: ABOVE_THE_HAIR, width: zoomedWidth, height: zoomedHeight };
  const photo = (name: string, photoType: PhotoType, stylePreference: StylePreference, bytes: Uint8Array<ArrayBuffer>): FixedPhoto => ({ name, photoType, stylePreference, bytes });
  return {
    // As the landing sample is styled: No preference, whose Outfits alternate lines, womenswear first.
    fullBody: photo("the landing page's Full-Body sample photo", "full_body", LANDING_SAMPLES.full_body.stylePreference, new Uint8Array(sample)),
    face: photo("a Face Photo of its head and shoulders", "face", "menswear", face),
    bodyOnly: photo("a Body-Only Photo from its shoulders to its feet", "body_only", "menswear", await jpeg(sharp(sample).extract(BODY_ONLY_PHOTO_AREA))),
    facePixelated: await jpeg(sharp(face).composite([{ input: mosaic, left: FACE_IN_FACE_PHOTO.left, top: FACE_IN_FACE_PHOTO.top }])),
    faceAdded: await jpeg(sharp(sample).extract(zoomed).resize(areaWidth, areaHeight)),
  };
}

/** Draws the case's Previews: its first tries one way, its redraws, which carry a correction, the other. */
async function drawerFor(checkCase: CheckCase): Promise<PreviewDrawer> {
  const savedOutfits = previewsFrom ? await savedOutfitsOf(checkCase) : null;
  const [drawFirst, drawRedraw] = [drawing(checkCase, checkCase.first, savedOutfits), drawing(checkCase, checkCase.redraw, savedOutfits)];
  return (input, outfit) => (input.correction ? drawRedraw(input, outfit) : drawFirst(input, outfit));
}

/** Where the earlier run saved a case's Previews, and the number its Outfit had there for each Style Icon, as its notes say. */
async function savedOutfitsOf({ name }: CheckCase): Promise<{ caseFolder: string; numberOf: Map<string, number> }> {
  const caseFolderName = (await readdir(previewsFrom!)).find((entry) => entry.replace(/^\d+-/, "") === slug(name));
  if (!caseFolderName) throw new Error(`${previewsFrom} has no saved Previews for the ${name}.`);
  const caseFolder = path.join(previewsFrom!, caseFolderName);
  const notes = await readFile(path.join(caseFolder, "notes.txt"), "utf-8");
  const numberOf = new Map([...notes.matchAll(/^Step: Saved Outfit (\d+), inspired by (.+)$/gm)].map(([, number, styleIconName]) => [styleIconName!.trim(), Number(number)]));
  return { caseFolder, numberOf };
}

function drawing(checkCase: CheckCase, how: Drawing, savedOutfits: Awaited<ReturnType<typeof savedOutfitsOf>> | null): PreviewDrawer {
  if ("model" in how && savedOutfits) return servedFrom(checkCase, savedOutfits);
  if ("model" in how) {
    return async (input) => {
      previewsDrawn.set(how.model, (previewsDrawn.get(how.model) ?? 0) + 1);
      return imageModels.get(how.model)!.renderPreview(input);
    };
  }
  switch (how.fault) {
    case "unchanged":
      return async ({ photo }) => ({ refused: false, image: photo.bytes });
    case "face-pixelated":
      return async () => ({ refused: false, image: photos.facePixelated });
    case "face-added":
      return async () => ({ refused: false, image: photos.faceAdded });
  }
}

/**
 * Serves each Preview from the earlier run's saved images: the first try or the redraw of the Outfit
 * there of the same Style Icon. One it has no image for is declined, as the image model declines,
 * so nothing is drawn.
 */
function servedFrom({ name }: CheckCase, { caseFolder, numberOf }: { caseFolder: string; numberOf: Map<string, number> }): PreviewDrawer {
  const say = (line: string) => served.set(name, [...(served.get(name) ?? []), line]);
  return async ({ correction }, outfit) => {
    const which = correction ? "redraw" : "first";
    const savedNumber = outfit && numberOf.get(outfit.styleIconName);
    const saved = savedNumber ? (await readdir(caseFolder)).find((entry) => entry.startsWith(`outfit-${savedNumber}-${which}.`)) : undefined;
    const whose = outfit ? `Outfit ${outfit.position}'s ${correction ? "redraw" : "Preview"} (${outfit.styleIconName})` : `A ${correction ? "redraw" : "Preview"} of an Outfit it couldn't tell`;
    if (!saved) {
      say(`${whose}: no saved image, so it was declined.`);
      return { refused: true, reason: "no_image" };
    }
    say(`${whose}: served the earlier run's ${saved}.`);
    return { refused: false, image: new Uint8Array(await readFile(path.join(caseFolder, saved))) };
  };
}

/** What the check will do and roughly what it costs, before anything is spent. */
function planText(): string {
  const stylings = CASES.length;
  const stylistUsd = stylings * ROUGH_STYLIST_TURNS * (claudeCostUsd(CLAUDE_STYLIST_MODEL, usage(ROUGH_STYLIST_TURN_TOKENS)) ?? 0);
  const photoChecksUsd = stylings * (claudeCostUsd(CLAUDE_PHOTO_CHECK_MODEL, usage(ROUGH_PHOTO_CHECK_TOKENS)) ?? 0);
  const previewUsd = (how: Drawing) => ("model" in how && !previewsFrom ? GEMINI_PREVIEW_PRICES_USD[how.model] : 0);
  const onGemini = (how: Drawing) => ("model" in how && !previewsFrom ? 1 : 0);
  // Previews drawn as in production aren't expected to be redrawn; every bad one is.
  const redraws = ({ first, redraw }: CheckCase) => (first === AS_IN_PRODUCTION && redraw === AS_IN_PRODUCTION ? 0 : OUTFITS_PER_STYLING);
  // Each Preview drawn is judged once, and each redraw once more.
  const verdictUsd = claudeCostUsd(CLAUDE_PREVIEW_VERDICT_MODEL, usage(ROUGH_VERDICT_TOKENS)) ?? 0;
  const verdicts = sum(CASES.map((checkCase) => OUTFITS_PER_STYLING + redraws(checkCase)));
  // At most, each Preview is judged, then its one redraw.
  const verdictsAtMost = stylings * OUTFITS_PER_STYLING * 2;
  const claudeUsd = stylistUsd + verdicts * verdictUsd + photoChecksUsd;
  const previews = sum(CASES.map((checkCase) => OUTFITS_PER_STYLING * onGemini(checkCase.first) + redraws(checkCase) * onGemini(checkCase.redraw)));
  const geminiUsd = sum(CASES.map((checkCase) => OUTFITS_PER_STYLING * previewUsd(checkCase.first) + redraws(checkCase) * previewUsd(checkCase.redraw)));
  const geminiAtMostUsd = sum(CASES.map((checkCase) => OUTFITS_PER_STYLING * (previewUsd(checkCase.first) + previewUsd(checkCase.redraw))));
  const bodyStylings = CASES.filter(({ photo }) => photo.photoType !== "face").length;
  const searches = bodyStylings * ROUGH_PRODUCT_SEARCHES;
  const searchesAtMost = bodyStylings * EVERYONES_STYLING_LIMITS.productSearches;
  return [
    `The Haiku check runs ${stylings} Stylings on ${CLAUDE_STYLIST_MODEL} at ${CLAUDE_STYLIST_EFFORT} effort, each Preview judged by ${CLAUDE_PREVIEW_VERDICT_MODEL} at ${CLAUDE_PREVIEW_VERDICT_EFFORT} effort, with live Qloo and Channel3, each a new user's first, in the United States, at No Budget.`,
    previewsFrom
      ? `Previews production would draw on ${GEMINI_PREVIEW_MODEL} are served from ${previewsFrom}, which an earlier run drew on ${imageModel}: no image model is asked for any.`
      : `Previews production would draw on ${GEMINI_PREVIEW_MODEL} are drawn on ${imageModel}${onProductionsModel ? ", as in production" : ", which is cheaper, so the report leaves them to the eye"}.`,
    `Its photos, all AI-generated, are ${photos.fullBody.name}, and ${photos.face.name} and ${photos.bodyOnly.name}:`,
    ...CASES.map(({ name, first, redraw }, index) => `  ${index + 1}. ${name}: ${previewsText(first, redraw)}.`),
    "",
    `It costs roughly ${dollars(claudeUsd + geminiUsd + searches * PRODUCT_SEARCH_CREDIT_USD)}: about ${dollars(claudeUsd)} of Claude, ${dollars(geminiUsd)} of Gemini for about ${previews} Previews, and ${dollars(searches * PRODUCT_SEARCH_CREDIT_USD)} for about ${searches} product searches, one Channel3 credit each.`,
    `Claude's is about ${dollars(stylistUsd)} for the Stylist's turns on ${CLAUDE_STYLIST_MODEL}, ${dollars(verdicts * verdictUsd)} for about ${verdicts} verdicts on ${CLAUDE_PREVIEW_VERDICT_MODEL}, and ${dollars(photoChecksUsd)} for the photo checks.`,
    `If the Preview phase redraws every Preview and every Styling makes all the searches it may, the verdicts come to about ${dollars(verdictsAtMost * verdictUsd)}, Gemini to about ${dollars(geminiAtMostUsd)} and Channel3 to about ${dollars(searchesAtMost * PRODUCT_SEARCH_CREDIT_USD)}.`,
  ].join("\n");
}

/** How a case draws its Previews, first tries and redraws. */
function previewsText(first: Drawing, redraw: Drawing): string {
  const drawn = (how: Drawing) =>
    "model" in how
      ? previewsFrom
        ? `as the earlier run's, which it drew on ${how.model}`
        : `on ${how.model}`
      : { unchanged: "as the photo unchanged", "face-pixelated": "as the photo with its face pixelated", "face-added": "as the photo zoomed out to show the head" }[how.fault];
  if (isDeepStrictEqual(first, redraw)) return `each Preview and redraw drawn ${drawn(first)}`;
  return `each Preview first drawn ${drawn(first)}, and redrawn ${drawn(redraw)}`;
}

/** Saves a case's photo, every Preview drawn for each Outfit, and its Styling's notes, turns and verdict calls, outside the repository. */
async function saveCase(caseFolder: string, photo: FixedPhoto, result: StylistCheckResult): Promise<void> {
  await mkdir(caseFolder, { recursive: true });
  await writeFile(path.join(caseFolder, "photo.jpg"), photo.bytes);
  if (!result.styled) return;
  for (const outfit of result.outfits) {
    for (const [index, image] of outfit.images.entries()) {
      const format = (await sharp(image).metadata()).format ?? "png";
      await writeFile(path.join(caseFolder, `outfit-${outfit.position}-${index === 0 ? "first" : "redraw"}.${format}`), image);
    }
  }
  await writeFile(path.join(caseFolder, "notes.txt"), result.notes.map(({ kind, text }) => `${kind === "note" ? "Note" : "Step"}: ${text}`).join("\n") + "\n");
  const turns = result.turns.map(({ modelId, usage: { inputTokens, outputTokens }, calls, finishReason, refusedBefore }, index) => ({
    turn: index + 1,
    modelId,
    tools: calls.map(({ tool }) => tool),
    callsRefusedBefore: refusedBefore.length,
    finishReason,
    inputTokens,
    outputTokens,
  }));
  await writeFile(path.join(caseFolder, "turns.json"), `${JSON.stringify(turns, null, 2)}\n`);
  const verdictCalls = result.verdictCalls.map(({ modelId, usage: { inputTokens, outputTokens } }, index) => ({ call: index + 1, modelId, inputTokens, outputTokens }));
  await writeFile(path.join(caseFolder, "verdicts.json"), `${JSON.stringify(verdictCalls, null, 2)}\n`);
}

/** One line on how a case's Styling went, as it finishes. */
function progressLine(result: StylistCheckResult | { error: string }): string {
  if ("error" in result) return `Errored: ${result.error}`;
  if (!result.styled) return refusalText(result);
  return `${validityText(result)} ${turnsText(result)}`;
}

/** The report to paste into the cheaper-stylist spec's ticket 07's Comments. */
function reportText(): string {
  const styled = checked.flatMap(({ checkCase, result }) => ("styled" in result && result.styled ? [{ checkCase, result }] : []));
  const valid = styled.filter(({ result }) => result.problems.length === 0);
  const searches = sum(styled.map(({ result }) => result.productSearches));
  const geminiUsd = sum([...previewsDrawn].map(([model, drawn]) => drawn * GEMINI_PREVIEW_PRICES_USD[model]));
  const unchecked = styled.flatMap(({ result }) => result.outfits).filter(({ preview }) => preview === "unchecked");
  // Only Previews the image model drew, for cases whose right answer is known, are counted.
  const judged = styled.flatMap(({ checkCase: { expected }, result }) =>
    expected === null ? [] : result.outfits.filter(({ preview }) => preview !== "declined" && preview !== "failed").map(({ preview }) => ({ expected, preview })),
  );
  const good = judged.filter(({ expected }) => expected === "kept");
  const bad = judged.filter(({ expected }) => expected !== "kept");
  const fixable = bad.filter(({ expected }) => expected === "redrawn-kept-redraw");
  const unfixable = bad.filter(({ expected }) => expected === "redrawn-kept-none");
  const byEye = styled.filter(({ checkCase }) => checkCase.expected === null).flatMap(({ result }) => result.outfits);
  const date = new Date().toISOString().slice(0, 10);
  return [
    `- ${date}: **The Haiku check** (\`npm run check:stylist\`) on ${CLAUDE_STYLIST_MODEL} at ${CLAUDE_STYLIST_EFFORT} effort, each Preview judged by ${CLAUDE_PREVIEW_VERDICT_MODEL} at ${CLAUDE_PREVIEW_VERDICT_EFFORT} effort, with live Qloo and Channel3. Each Styling was a new user's first, in the United States, at No Budget, with everyone's limits.`,
    `  - Previews production would draw on ${GEMINI_PREVIEW_MODEL} were ${previewsFrom ? `served from an earlier run's, saved in ${previewsFrom}, which it drew on` : "drawn on"} ${imageModel}${onProductionsModel ? ", as in production." : `, which is cheaper. So the "good" Previews here are ${imageModel}'s, which may have faults of their own, and only the eye can judge whether the verdicts on them were right.`}`,
    ...(previewsFrom
      ? [
          "  - No image model was asked for any Preview. Each was the earlier run's image for the Outfit of the same Style Icon, so its garments are that Outfit's, which may not be this one's. A Preview with no saved image was declined, as the image model can decline.",
        ]
      : []),
    ...checked.flatMap(({ checkCase, result }) => caseLines(checkCase, result)),
    [
      `  - **Totals:** valid Outfits in ${valid.length} of ${checked.length} Stylings.`,
      `${sum(styled.map(({ result }) => result.turns.length))} turns.`,
      `${claudeCostText(
        {
          costUsd: totalUsd(styled.map(({ result }) => result.costUsd)),
          stylistCostUsd: totalUsd(styled.map(({ result }) => result.stylistCostUsd)),
          uncachedStylistCostUsd: totalUsd(styled.map(({ result }) => result.uncachedStylistCostUsd)),
          verdictCostUsd: totalUsd(styled.map(({ result }) => result.verdictCostUsd)),
          verdictCalls: sum(styled.map(({ result }) => result.verdictCalls.length)),
        },
        { withModels: true },
      )} (photo checks aside).`,
      `Largest prompt ${tokens(Math.max(0, ...styled.map(({ result }) => result.largestPromptTokens)))}.`,
      `${sum([...previewsDrawn.values()])} Previews on Gemini, about ${dollars(geminiUsd)}. ${searches} product searches, about ${dollars(searches * PRODUCT_SEARCH_CREDIT_USD)}.`,
    ].join(" "),
    [
      `  - **The Preview check:** the Preview phase kept ${count(bad, keptFromTheUser)} of ${bad.length} bad Previews from the user, redrawing each on its verdict and keeping a redraw that put it right, or neither.`,
      `Kept the redraw for ${count(fixable, ({ preview }) => preview === "redrawn-kept-redraw")} of the ${fixable.length} a redraw could put right,`,
      `and rightly kept neither image for ${count(unfixable, ({ preview }) => preview === "redrawn-kept-none")} of the ${unfixable.length} whose redraws broke a hard rule too.`,
      ...(good.length > 0 ? [`Kept ${count(good, ({ preview }) => preview === "kept")} of ${good.length} good Previews as drawn.`] : []),
      ...(byEye.length > 0 ? [`Of the ${byEye.length} Previews left to the eye, it redrew ${count(byEye, ({ preview }) => preview.startsWith("redrawn"))}.`] : []),
      ...(unchecked.length > 0 ? [`${unchecked.length === 1 ? "1 Preview" : `${unchecked.length} Previews`} drawn had no verdict, as it was refused or failed, so none was shown.`] : []),
      ...(judged.length < sum(styled.filter(({ checkCase }) => checkCase.expected !== null).map(({ result }) => result.outfits.length))
        ? ["Previews the image model declined, or that couldn't be drawn, aren't counted."]
        : []),
    ].join(" "),
    `  - The photos, every Preview drawn, and each Styling's Stylist's Notes, turns and verdict calls are in ${folder}, outside the repository.`,
  ].join("\n");
}

/**
 * Whether the verdicts kept a bad Preview from the user: redrawn, and the redraw kept where a redraw
 * could put it right, or neither image kept. One never shown as it had no verdict isn't counted: the
 * report says how many had none.
 */
function keptFromTheUser({ expected, preview }: { expected: ExpectedHandling; preview: PreviewHandling }): boolean {
  return preview === "redrawn-kept-none" || (expected === "redrawn-kept-redraw" && preview === "redrawn-kept-redraw");
}

/**
 * A case's lines in the report: how its Styling went, then what the Preview phase did with each
 * Outfit's Preview, and the Style Icons passed over for hair length.
 */
function caseLines({ name, photo, expected, note }: CheckCase, result: StylistCheckResult | { error: string }): string[] {
  const heading = `  - **${name}** (${STYLE_PREFERENCE_LABELS[photo.stylePreference]}):`;
  if ("error" in result) return [`${heading} errored: ${result.error}`];
  if (!result.styled) return [`${heading} ${refusalText(result)}`];
  return [
    `${heading} ${validityText(result)} ${turnsText(result)}${note ? ` ${note}` : ""}`,
    ...result.outfits.map((outfit) => `    - ${outfitText(outfit)}: ${handlingText(outfit)}${expectationText(outfit.preview, expected)}.`),
    `    - ${passOversText(result)}`,
    ...(served.has(name) ? [`    - Previews served: ${served.get(name)!.join(" ")}`] : []),
  ];
}

function refusalText(result: Extract<StylistCheckResult, { styled: false }>): string {
  if (result.refusal === "photo-rejected") return `the photo check rejected the photo (${result.rejection.reason}), so it styled nothing.`;
  return result.refusal === "check-errored" ? "the photo check errored, so it styled nothing." : "the photo isn't one the app takes, so it styled nothing.";
}

function validityText(result: Extract<StylistCheckResult, { styled: true }>): string {
  const made = `${result.outfits.length} of ${result.outfitsWanted} Outfits`;
  return result.problems.length === 0 ? `Valid: ${made}.` : `Not valid: it ${result.problems.join(", and ")}.`;
}

function turnsText(result: Extract<StylistCheckResult, { styled: true }>): string {
  const refused = result.toolCallsRefused === 1 ? "1 tool call refused" : `${result.toolCallsRefused} tool calls refused`;
  const capped = result.turns.filter(({ finishReason }) => finishReason === "length").length;
  const written = result.notes.filter(({ kind }) => kind === "note").length;
  return [
    `${result.turns.length} of ${result.turnCap} turns, ${duration(result.durationMs)}.`,
    `${claudeCostText({ ...result, verdictCalls: result.verdictCalls.length })}.`,
    `Largest prompt ${tokens(result.largestPromptTokens)}; each turn after the first read at least ${tokens(result.leastCacheReadAfterFirstTurn)} from the cache.`,
    `${result.productSearches} product searches, ${refused}, ${written === 1 ? "1 note" : `${written} notes`} written to the user.${capped > 0 ? ` ${capped} turns stopped at their output cap.` : ""}`,
  ].join(" ");
}

function outfitText({ position, styleIconName, pieces }: CheckedOutfit): string {
  const piecesText = pieces.map(({ category, item, brand }) => `${CATEGORY_LABELS[category]}: ${brand ?? item}`).join(", ");
  return `Outfit ${position}, inspired by ${styleIconName} (${piecesText})`;
}

/**
 * What Claude cost: the Stylist's turns, against what they'd cost with nothing cached, and the
 * verdict calls, each on its own model's prices, and the two in all. With models, it names them.
 */
function claudeCostText(
  cost: Pick<Extract<StylistCheckResult, { styled: true }>, "costUsd" | "stylistCostUsd" | "uncachedStylistCostUsd" | "verdictCostUsd"> & { verdictCalls: number },
  { withModels = false } = {},
): string {
  const known = (usd: number | null) => (usd === null ? "an unknown cost" : dollars(usd));
  const calls = cost.verdictCalls === 1 ? "1 verdict call" : `${cost.verdictCalls} verdict calls`;
  return [
    `${known(cost.costUsd)} of Claude:`,
    `${known(cost.stylistCostUsd)} for the Stylist's turns${withModels ? ` on ${CLAUDE_STYLIST_MODEL}` : ""}, against ${known(cost.uncachedStylistCostUsd)} with nothing cached,`,
    `and ${known(cost.verdictCostUsd)} for ${calls}${withModels ? ` on ${CLAUDE_PREVIEW_VERDICT_MODEL}` : ""}`,
  ].join(" ");
}

/** The Style Icons the Stylist passed over for hair length, each with its reason, and how many more tries its tool refused. */
function passOversText({ hairLengthPassOvers, hairLengthPassOversRefused }: Extract<StylistCheckResult, { styled: true }>): string {
  const passedOver = hairLengthPassOvers.length === 0 ? "none" : hairLengthPassOvers.map(({ styleIconName, reason }) => `${styleIconName} ("${reason}")`).join(", ");
  const refused = hairLengthPassOversRefused === 0 ? "" : ` ${hairLengthPassOversRefused === 1 ? "1 more try was" : `${hairLengthPassOversRefused} more tries were`} refused.`;
  return `Passed over for hair length: ${passedOver}.${refused}`;
}

/** What the Preview phase did with an Outfit's Preview. */
function handlingText({ preview, redrawn }: CheckedOutfit): string {
  switch (preview) {
    case "kept":
      return "its Preview was judged right, and kept as drawn";
    case "unchecked":
      return "its Preview was drawn, but its verdict was refused or failed, so it has none";
    case "declined":
      return "the image model declined to draw its Preview";
    case "failed":
      return "its Preview couldn't be drawn";
    case "redrawn-kept-first":
    case "redrawn-kept-redraw":
    case "redrawn-kept-none":
      return redrawnText(preview, redrawn!);
  }
}

/** What the Preview phase found of a Preview it redrew, and which image it kept. */
function redrawnText(preview: Extract<PreviewHandling, `redrawn-${string}`>, { firstBreaksHardRule, correction, redraw }: PreviewRedrawn): string {
  const kept = { "redrawn-kept-first": "the first was kept", "redrawn-kept-redraw": "the redraw was kept", "redrawn-kept-none": "neither was kept, and it has no Preview" }[preview];
  const redrawn =
    redraw === "declined"
      ? "the image model declined the redraw"
      : redraw === "failed"
        ? "the redraw couldn't be drawn"
        : redraw.verdict === null
          ? "the redraw's verdict was refused or failed"
          : `the redraw was judged ${redraw.verdict.breaksHardRule ? "to break a hard rule" : "within the hard rules"}, and the ${redraw.verdict.better} better`;
  return `its Preview was judged wrong${firstBreaksHardRule ? ", breaking a hard rule" : ""}, and redrawn ("${correction}"): ${redrawn}, so ${kept}`;
}

function expectationText(preview: PreviewHandling, expected: ExpectedHandling | null): string {
  if (expected === null || preview === "declined" || preview === "failed") return "";
  return preview === expected ? ", as expected" : `, where it should have ${SHOULD_HAVE[expected]}`;
}

function usage({ noCache, cacheWrite, cacheRead, output }: typeof ROUGH_STYLIST_TURN_TOKENS) {
  return {
    inputTokens: { total: noCache + cacheWrite + cacheRead, noCache, cacheWrite, cacheRead },
    outputTokens: { total: output, text: undefined, reasoning: undefined },
  };
}

/** What some costs in US dollars add up to, or null when one of them is unknown. */
function totalUsd(costs: readonly (number | null)[]): number | null {
  return costs.includes(null) ? null : sum(costs as number[]);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function count<T>(values: readonly T[], test: (value: T) => boolean): number {
  return values.filter(test).length;
}

/** An amount in US dollars: to the cent from a dollar, and to two significant figures below one. */
function dollars(amount: number): string {
  if (amount === 0) return "$0";
  return `$${amount >= 1 ? amount.toFixed(2) : amount.toPrecision(2)}`;
}

function tokens(amount: number): string {
  return `${amount.toLocaleString("en-US")} tokens`;
}

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
