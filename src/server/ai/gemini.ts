import { createGoogleGenerativeAI, type GoogleLanguageModelOptions, type GoogleProviderMetadata } from "@ai-sdk/google";
import {
  APICallError,
  type FilePart,
  generateText,
  type LanguageModel,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  RetryError,
} from "ai";
import * as z from "zod";

import { GEMINI_PHOTO_CHECK_MODEL, GEMINI_PREVIEW_MODEL, GEMINI_TAILORING_MODEL } from "@/config/ai";
import {
  AGE_GROUP_LABELS,
  CATEGORY_LABELS,
  PHOTO_STYLES,
  PHOTO_TYPE_LABELS,
  type PieceCategory,
  type PhotoStyle,
  type PhotoStyleWords,
  photoStyleText,
} from "@/config/consultations";

import {
  type AiProvider,
  type Photo,
  type PhotoCheckInput,
  type PhotoCheckResult,
  type PreviewInput,
  type PreviewResult,
  tailoredPiecesSchema,
  type TailoringBrand,
  type TailoringInput,
  type TailoringPiece,
  UnretryableAiError,
} from "./provider";

// The Gemini adapter (spec: "AI provider interface", Gemini adapter): our interface on the Vercel
// AI SDK, which appears nowhere else in the code. It owns its prompts. Photos are always sent
// inline, as the request's own bytes, never through the Files API.

export interface GeminiAiOptions {
  apiKey: string;
  /** Tests send Gemini's requests to a fake. */
  fetch?: typeof globalThis.fetch;
}

/**
 * The AI provider on real Gemini, which costs money: it runs only when AI_PROVIDER switches it on.
 * The photo check and tailoring rely on the AI SDK's own retries, 2 by default. A Preview has none:
 * its Workflow step retries it.
 */
export class GeminiAiProvider implements AiProvider {
  private readonly photoCheckModel: LanguageModel;
  private readonly tailoringModel: LanguageModel;
  private readonly previewModel: LanguageModel;

  constructor({ apiKey, fetch }: GeminiAiOptions) {
    const google = createGoogleGenerativeAI({ apiKey, fetch });
    this.photoCheckModel = google(GEMINI_PHOTO_CHECK_MODEL);
    this.tailoringModel = google(GEMINI_TAILORING_MODEL);
    this.previewModel = google(GEMINI_PREVIEW_MODEL);
  }

  // The model isn't told which Photo Type was chosen, so it can't lean towards it: it reports what
  // it sees, and our code judges the photo against the Photo Type.
  async checkPhoto({ photo }: PhotoCheckInput): Promise<PhotoCheckResult> {
    try {
      const reply = await generateText({
        model: this.photoCheckModel,
        system: PHOTO_CHECK_PROMPT,
        messages: [{ role: "user", content: [photoPart(photo)] }],
        output: Output.object({ schema: photoCheckReplySchema }),
      });
      // Google blocked the request, and with it the photo, so the model wrote nothing.
      if (reply.finishReason === "content-filter") return { blocked: true };
      const { output } = reply;
      return { blocked: false, report: { ...output, photoStyle: photoStyleWords(output.photoStyle) } };
    } catch (error) {
      // Google can stop the reply part-way, leaving what was written so far, which isn't the report.
      if (NoObjectGeneratedError.isInstance(error) && error.finishReason === "content-filter") return { blocked: true };
      throw withoutRequest("The photo check", error);
    }
  }

  // A reply that breaks the schema comes back as it came, since our code checks every reply and
  // asks again. Asking the model in structured output only makes a good reply likelier.
  async tailorPieces(input: TailoringInput): Promise<unknown> {
    try {
      const { output } = await generateText({
        model: this.tailoringModel,
        system: TAILORING_PROMPT,
        messages: [{ role: "user", content: [{ type: "text", text: tailoringRequest(input) }, photoPart(input.photo)] }],
        output: Output.object({ schema: tailoredPiecesSchema }),
      });
      return output;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) return replyAsItCame(error.text);
      // Google blocked the request, so the model wrote nothing. The same request would be blocked
      // again, so it isn't an error worth retrying: no reply, which our code asks again for.
      if (NoOutputGeneratedError.isInstance(error)) return null;
      throw withoutRequest("Tailoring", error);
    }
  }

  // A refusal is final: asking again is billed, and would likely be refused again. Anything else
  // that brings no image throws, for the Workflow step to retry, so the AI SDK doesn't retry too.
  async renderPreview(input: PreviewInput): Promise<PreviewResult> {
    try {
      const reply = await generateText({
        model: this.previewModel,
        // The instruction goes before the photo in one message, with no system instruction, as
        // the Preview bake-off sent it.
        messages: [{ role: "user", content: [{ type: "text", text: previewInstruction(input) }, photoPart(input.photo)] }],
        providerOptions: { google: PREVIEW_OPTIONS },
        maxRetries: 0,
      });
      // The image it finished with. Any it drew while thinking isn't among the reply's files.
      const image = reply.files.findLast(({ mediaType }) => mediaType.startsWith("image/"));
      if (image) return { refused: false, image: image.uint8Array };
      const googleMetadata = reply.finalStep.providerMetadata?.google as GoogleProviderMetadata | undefined;
      if (googleMetadata?.promptFeedback?.blockReason) return { refused: true, reason: "blocked" };
      const finishReason = reply.rawFinishReason ?? "none";
      if (FILTERED_FINISH_REASONS.has(finishReason)) return { refused: true, reason: "image_safety" };
      // The model answered in text, or Google says it drew no image.
      if (reply.text || NO_IMAGE_FINISH_REASONS.has(finishReason)) return { refused: true, reason: "no_image" };
      throw new Error(`Gemini sent no image and no refusal, finishing with ${finishReason}.`);
    } catch (error) {
      throw withoutRequest("The Preview", error);
    }
  }
}

/** The Gemini adapter on GEMINI_API_KEY. */
export function geminiAiFromEnvironment(): GeminiAiProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY must be set when AI_PROVIDER is gemini.");
  return new GeminiAiProvider({ apiKey });
}

/**
 * A failed Gemini call as an error with only its message. The AI SDK's own errors carry the
 * request, and with it the photo, which must never reach a log or a Workflow run's stored error.
 * One that Gemini will refuse again, such as a bad request or key, is an UnretryableAiError.
 */
function withoutRequest(call: string, error: unknown): Error {
  const message = `${call} failed: ${error instanceof Error ? error.message : "unknown error"}`;
  const last = RetryError.isInstance(error) ? error.lastError : error;
  return APICallError.isInstance(last) && !last.isRetryable ? new UnretryableAiError(message) : new Error(message);
}

/**
 * How each Preview is asked for, as the Preview bake-off asked: an image alone, with thinking
 * minimal, set explicitly. No imageConfig, so the image keeps the photo's aspect ratio, at about 1K.
 */
const PREVIEW_OPTIONS = {
  responseModalities: ["IMAGE"],
  thinkingConfig: { thinkingLevel: "minimal" },
} satisfies GoogleLanguageModelOptions;

// The finish reasons Google stops an image with, which it then doesn't return. No Preview was
// refused in the bake-off, so these come from Google's API reference.

/** Google's filters caught the image: a refusal for image safety. */
const FILTERED_FINISH_REASONS: ReadonlySet<string> = new Set([
  "IMAGE_SAFETY",
  "IMAGE_PROHIBITED_CONTENT",
  "IMAGE_RECITATION",
  "SAFETY",
  "PROHIBITED_CONTENT",
  "BLOCKLIST",
  "SPII",
  "RECITATION",
]);

/** The model drew no image, or stopped it for another reason: a refusal with no image. */
const NO_IMAGE_FINISH_REASONS: ReadonlySet<string> = new Set(["NO_IMAGE", "IMAGE_OTHER"]);

/** The photo as the request's own bytes, which the AI SDK sends inline. */
function photoPart({ bytes, mediaType }: Photo): FilePart {
  return { type: "file", mediaType, data: bytes };
}

/** The model's reply: its JSON when it wrote JSON, otherwise its text. */
function replyAsItCame(text: string | undefined): unknown {
  if (text === undefined) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * What the photo check asks Gemini for: just what the interface's report holds. The Photo Style
 * is a plain list here, which structured output handles better than a choice of two tuples.
 */
const photoCheckReplySchema = z.object({
  peopleCount: z.number().int().min(0),
  visible: z.object({ face: z.boolean(), hair: z.boolean(), upperBody: z.boolean(), legs: z.boolean(), feet: z.boolean() }),
  hairCovered: z.boolean(),
  clearEnough: z.boolean(),
  explicit: z.boolean(),
  photoStyle: z.array(z.enum(PHOTO_STYLES)).min(1).max(2),
});

/** One or two words, strongest first, each once. */
function photoStyleWords([strongest, second]: PhotoStyle[]): PhotoStyleWords {
  return second && second !== strongest ? [strongest!, second] : [strongest!];
}

// The prompts. Each asks only for what the interface returns, and never for age, ethnicity, skin
// tone, body measurements or health (ADR-0005).

const PHOTO_CHECK_PROMPT = `You check one photo for a styling app, which suggests clothes and a haircut to the person in it. Report only what you can see in the photo. Never guess anything you can't see.

Reply with:
- peopleCount: how many people are in the photo. Count only real people, not people in pictures, posters or screens.
- visible: whether each of these shows in the photo, for the person in it:
  - face: their face, seen from the front or the side, not turned away or cut off.
  - hair: their hair. False when it is hidden, cut off by the frame or covered.
  - upperBody: their shoulders, chest and waist.
  - legs: their legs, from the hips to the ankles.
  - feet: both feet, with whatever they're wearing on them.
- hairCovered: true or false only: whether something covers most of their hair, such as a hijab, a turban or a cap. Never say what covers it.
- clearEnough: whether the photo is sharp, well lit and unfiltered enough to see the person and what they're wearing.
- explicit: whether the photo shows nudity or sexual content.
- photoStyle: one or two words for the style of what they're wearing, strongest first, from this list only: ${PHOTO_STYLES.join(", ")}. A plain photo with no clear style is casual.

When there is nobody in the photo, every part of visible is false and photoStyle is casual. When there is more than one person, report on the most prominent one.

Never guess the person's age. Never infer their ethnicity, skin tone, body measurements or health, and never mention them.`;

const TAILORING_PROMPT = `You are the stylist in a styling app. For the person in the photo, you make one Outfit concrete. Its picks are already made: the Style Icon who inspires it, and the Brand each clothing Piece is built on. You choose each Piece: one garment from its Brand, or for the Hairstyle one haircut, to suit the person in the photo, their Photo Style and the Style Icon. You may use the photo to match colours to what they're wearing.

Reply with one Piece per category you're given, in the order given, each with:
- category: the Piece's category, as given.
- item: a label of about 6 words, colour included, such as "Washed-black relaxed cargo trousers". For the Hairstyle, the cut.
- details: one sentence on the colour, fabric, fit and cut, used to picture the person wearing it. It describes the item alone: it never names the Style Icon or anyone else.
- why: one line of about 20 words, in English, speaking to the person as "you", on why it suits them.
- unknownCut: for the Hairstyle only. See below.

Every item:
- is generic: never a product name or a model name;
- has no price, currency or cost anywhere in what you write;
- is something its Brand plausibly makes, going by the Brand's product categories;
- for the Top, is one garment: the main visible upper layer.

Each why may mention the garment, the Style Icon, the Photo Style, the person's hair and what they're already wearing. It never mentions their body size or shape, weight, skin colour, ethnicity, gender or age.

A Brand's price range tells you how to pitch its item. Never repeat it.

One-Piece: when you're given both a Top and a Bottom, you may make them one garment, a Piece with category "one_piece" built on the Top's Brand, in place of the Top and the Bottom. The Bottom's Brand is then left out. Only do it when the Top's Brand plausibly makes such a garment and it fits the Outfit's line: a dress for womenswear, or a jumpsuit or overalls for menswear or womenswear. Prefer separates.

Hairstyle: work from the Style Icon's name alone.
- If you know the Style Icon's signature haircut, base the cut on it, and set unknownCut to false.
- If you don't, set unknownCut to true and base the cut on the Outfit and the Photo Style instead. The why must then not claim it's the Style Icon's cut.
- The cut must be achievable from the person's current hair: shorter, or restyled, without adding much length or changing its texture. Keep their own hair colour.

Never guess the person's age or gender from the photo: you're given their age group, and the line is the Outfit's. Never infer their ethnicity, skin tone, body measurements or health.`;

/** What one Outfit is tailored from, as the request's text. The photo goes with it. */
function tailoringRequest({ photoType, ageGroup, photoStyle, line, styleIconName, pieces }: TailoringInput): string {
  return [
    `The photo: a ${PHOTO_TYPE_LABELS[photoType]}.`,
    `The Outfit's line: ${line}.`,
    `The person's age group: ${AGE_GROUP_LABELS[ageGroup]}.`,
    `Their Photo Style: ${photoStyleText(photoStyle)}.`,
    `The Style Icon: ${styleIconName}.`,
    "",
    "The Pieces, in order:",
    ...pieces.map((piece) => `- ${pieceRequest(piece)}`),
  ].join("\n");
}

function pieceRequest(piece: TailoringPiece): string {
  if (piece.category === "hairstyle") return `hairstyle (${CATEGORY_LABELS.hairstyle}): a haircut.`;
  return `${piece.category} (${CATEGORY_LABELS[piece.category]}): ${brandRequest(piece.brand)}`;
}

function brandRequest({ name, categoryTags, priceRangeUsd }: TailoringBrand): string {
  const makes = categoryTags.length > 0 ? `, which makes ${categoryTags.map((tag) => tag.replaceAll("_", " ")).join(", ")}` : "";
  const price = priceRangeUsd ? ` Its prices run from ${priceRangeUsd.min} to ${priceRangeUsd.max} US dollars.` : "";
  return `from ${name}${makes}.${price}`;
}

/** What the Preview instruction calls each Piece. */
const PREVIEW_PIECE_LABELS: Record<PieceCategory, string> = {
  ...CATEGORY_LABELS,
  one_piece: `${CATEGORY_LABELS.one_piece}, in place of both the top and the bottom`,
};

/**
 * The instruction for one Preview: change only the Pieces, each by its details, and keep
 * everything else. It never names the Style Icon, which the Preview isn't told.
 */
function previewInstruction({ photoType, pieces }: PreviewInput): string {
  const changesHair = pieces.some(({ category }) => category === "hairstyle");
  const kept = [
    "the person's face and identity",
    "their body shape and size: never slim, reshape or beautify them",
    "their skin tone",
    "their pose, the background and the lighting",
    "the framing and aspect ratio of the photo",
    "any glasses, jewellery and bags",
    "any head covering: never remove or change it",
    // A Face Photo changes only the hair, even when the photo shows what they're wearing.
    ...(photoType === "face" ? ["everything they're wearing"] : []),
    // Covered hair, or a Body-Only Photo, has no Hairstyle Piece.
    ...(changesHair ? [] : ["their hair, and anything covering it"]),
  ];
  return [
    photoType === "face"
      ? "Edit this photo of a person. Change only their hair, to this:"
      : "Edit this photo so the person is wearing the outfit below. Change only these items:",
    ...pieces.map(({ category, details }) => `- ${PREVIEW_PIECE_LABELS[category]}: ${details}`),
    "",
    "Keep everything else exactly as it is:",
    ...kept.map((keep) => `- ${keep}`),
    ...(changesHair ? ["", "Keep their own hair colour."] : []),
    ...(photoType === "body_only"
      ? ["", "If any part of their face is visible, leave it exactly as it is. Never add a face or a head that isn't in the photo."]
      : []),
  ].join("\n");
}
