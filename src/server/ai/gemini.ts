import { createGoogleGenerativeAI, type GoogleLanguageModelOptions, type GoogleProviderMetadata } from "@ai-sdk/google";
import { generateText, type LanguageModel } from "ai";

import { GEMINI_PREVIEW_MODEL } from "@/config/ai";
import { CATEGORY_LABELS, type PieceCategory } from "@/config/consultations";

import { photoPart, withoutRequest } from "./ai-sdk";
import type { AiProvider, Photo, PreviewInput, PreviewPiece, PreviewResult } from "./provider";

// The Gemini adapter (spec: "AI provider interface", Gemini adapter): Previews on Gemini, through
// the Vercel AI SDK, which appears nowhere but the adapters. The photo check and the Stylist run on
// Claude (ADR-0011). It owns the Preview's instruction. Photos are always sent inline, as the
// request's own bytes, never through the Files API.

export interface GeminiAiOptions {
  apiKey: string;
  /** Tests send Gemini's requests to a fake. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Previews on real Gemini, which costs money: it runs only when AI_PROVIDER switches real AI on. A
 * Preview has no retries of the AI SDK's own: its Workflow step retries it.
 */
export class GeminiAiProvider implements Pick<AiProvider, "renderPreview"> {
  private readonly previewModel: LanguageModel;

  constructor({ apiKey, fetch }: GeminiAiOptions) {
    const google = createGoogleGenerativeAI({ apiKey, fetch });
    this.previewModel = google(GEMINI_PREVIEW_MODEL);
  }

  // A refusal is final: asking again is billed, and would likely be refused again. Anything else
  // that brings no image throws, for the Workflow step to retry, so the AI SDK doesn't retry too.
  async renderPreview(input: PreviewInput): Promise<PreviewResult> {
    try {
      const reply = await generateText({
        model: this.previewModel,
        // The instruction goes before the photo in one message, with no system instruction, as
        // the Preview bake-off sent it. Each Product's photo follows the user's, in Piece order.
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: previewInstruction(input) }, photoPart(input.photo), ...productPhotos(input.pieces).map(photoPart)],
          },
        ],
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

// The instruction asks only for what the interface returns, and never for age, ethnicity, skin
// tone, body measurements or health (ADR-0005).

/** Text from a seller, its line breaks and runs of spaces made single spaces. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** What the Preview instruction calls each Piece. */
const PREVIEW_PIECE_LABELS: Record<PieceCategory, string> = {
  ...CATEGORY_LABELS,
  one_piece: `${CATEGORY_LABELS.one_piece}, in place of both the top and the bottom`,
};

/** The Product photos a Preview sends after the user's photo, in Piece order: image 2 onwards. */
function productPhotos(pieces: readonly PreviewPiece[]): Photo[] {
  return pieces.flatMap((piece) => (piece.category !== "hairstyle" && piece.photo ? [piece.photo] : []));
}

/**
 * The instruction for one Preview: change only the Pieces, the Hairstyle by its details and each
 * Product by its seller's photo, named by its image, or by its title when it has none, on the
 * Main Person alone, named only as the most prominent person (ADR-0009). Keep everything else,
 * everyone else in the photo included. It never names the Style Icon, which the Preview isn't told.
 */
function previewInstruction({ photoType, pieces }: PreviewInput): string {
  const changesHair = pieces.some(({ category }) => category === "hairstyle");
  // The user's photo is image 1; the Product photos follow it, as the request sends them.
  const photos = productPhotos(pieces);
  const withProductPhotos = photos.length > 0;
  const changes = pieces.map((piece) => {
    const label = PREVIEW_PIECE_LABELS[piece.category];
    if (piece.category === "hairstyle") return `- ${label}: ${piece.details}`;
    const title = oneLine(piece.title);
    return piece.photo ? `- ${label}: the garment in image ${photos.indexOf(piece.photo) + 2}, "${title}"` : `- ${label}: ${title}`;
  });
  const kept = [
    "the most prominent person's face and identity",
    "their body shape and size: never slim, reshape or beautify them",
    "their skin tone",
    "their pose, the background and the lighting",
    "every other person in the photo, exactly as they are",
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
      ? "Edit this photo of a person. Change only the hair of the most prominent person in the photo, to this:"
      : withProductPhotos
        ? "Image 1 is a photo of a person. Edit it so the most prominent person in the photo is wearing the outfit below. Change only these items:"
        : "Edit this photo so the most prominent person in the photo is wearing the outfit below. Change only these items:",
    ...changes,
    ...(withProductPhotos
      ? [
          "",
          "Each image after image 1 is a seller's photo of one of these garments. Take only the garment from it: its shape, colour, fabric and details. Ignore any person, mannequin or other clothing in it, and never take anyone's face, body, skin or hair from it.",
        ]
      : []),
    "",
    "Keep everything else exactly as it is:",
    ...kept.map((keep) => `- ${keep}`),
    ...(changesHair ? ["", "Keep their own hair colour."] : []),
    ...(photoType === "body_only"
      ? ["", "If any part of their face is visible, leave it exactly as it is. Never add a face or a head that isn't in the photo."]
      : []),
  ].join("\n");
}
