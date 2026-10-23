import { createGoogleGenerativeAI, type GoogleLanguageModelOptions, type GoogleProviderMetadata } from "@ai-sdk/google";
import { generateText, type LanguageModel, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai";

import { GEMINI_PREVIEW_MODEL, GEMINI_TAILORING_MODEL } from "@/config/ai";
import { AGE_GROUP_LABELS, CATEGORY_LABELS, PHOTO_TYPE_LABELS, type PieceCategory, photoStyleText } from "@/config/consultations";

import { photoPart, withoutRequest } from "./ai-sdk";
import {
  type AiProvider,
  type Photo,
  type PreviewInput,
  type PreviewPiece,
  type PreviewResult,
  tailoredPiecesSchema,
  type TailoringBrand,
  type TailoringCandidate,
  type TailoringInput,
  type TailoringPiece,
} from "./provider";

// The Gemini adapter (spec: "AI provider interface", Gemini adapter): tailoring and Previews on
// Gemini, through the Vercel AI SDK, which appears nowhere but the adapters. The photo check runs
// on Claude (ADR-0011). It owns its prompts. Photos are always sent inline, as the request's own
// bytes, never through the Files API.

export interface GeminiAiOptions {
  apiKey: string;
  /** Tests send Gemini's requests to a fake. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Tailoring and Previews on real Gemini, which costs money: it runs only when AI_PROVIDER switches
 * real AI on. Tailoring relies on the AI SDK's own retries, 2 by default. A Preview has none: its
 * Workflow step retries it.
 */
export class GeminiAiProvider implements Omit<AiProvider, "checkPhoto"> {
  private readonly tailoringModel: LanguageModel;
  private readonly previewModel: LanguageModel;

  constructor({ apiKey, fetch }: GeminiAiOptions) {
    const google = createGoogleGenerativeAI({ apiKey, fetch });
    this.tailoringModel = google(GEMINI_TAILORING_MODEL);
    this.previewModel = google(GEMINI_PREVIEW_MODEL);
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

/** The model's reply: its JSON when it wrote JSON, otherwise its text. */
function replyAsItCame(text: string | undefined): unknown {
  if (text === undefined) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

// The prompts. Each asks only for what the interface returns, and never for age, ethnicity, skin
// tone, body measurements or health (ADR-0005).

const TAILORING_PROMPT = `You are the stylist in a styling app. For the most prominent person in the photo, you make one Outfit concrete. Anyone else in the photo isn't styled: ignore them, and "the person" always means the most prominent one. The Outfit's picks are already made: the Style Icon who inspires it, and the Brand each clothing Piece comes from. Each clothing Piece comes with its Brand's real products, as candidates: you pick one of them. For the Hairstyle, you choose one haircut. Choose so that the Outfit goes together and suits the person, their Photo Style and the Style Icon. You may use the photo to match colours to what they're wearing, not to anyone else.

Reply with one Piece per category you're given, in the order given, or with a one_piece in place of the top and the bottom (see below), each with:
- category: the Piece's category, as given.
- productId: for a clothing Piece only, the id of the candidate you pick, exactly as given. Only ever one of that Piece's own candidates: for a one_piece, one of its one_piece candidates.
- item: for the Hairstyle only, the cut, as a label of about 6 words.
- details: for the Hairstyle only, one sentence on the cut, used to picture the person with it. It describes the cut alone: it never names the Style Icon or anyone else.
- why: one line of about 20 words, in English, speaking to the person as "you", on why it suits them.
- unknownCut: for the Hairstyle only. See below.

Nothing you write states a price, currency or cost.

For the Top, pick one garment that works as the main visible upper layer.

One-Piece: when the top comes with one_piece candidates as well, its Brand's dresses, jumpsuits or overalls, you may pick one of those instead: a Piece with category "one_piece", in place of both the top and the bottom, so you give no top and no bottom. The bottom's Brand is then left out. Only do it when that garment suits the person, the Style Icon and the Photo Style better than separates would. Prefer separates.

Each why may describe the product you picked, and mention the Style Icon, the Photo Style, the person's hair and what they're already wearing. It never mentions their body size or shape, weight, skin colour, ethnicity, gender or age.

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
    ...pieces.flatMap(pieceRequest),
  ].join("\n");
}

/**
 * One Piece's lines: a clothing Piece's Brand and its candidates, by their words alone, and for a
 * Top whose Brand has One-Pieces, those candidates after its own.
 */
function pieceRequest(piece: TailoringPiece): string[] {
  if (piece.category === "hairstyle") return [`- hairstyle (${CATEGORY_LABELS.hairstyle}): a haircut.`];
  const onePieces = piece.onePieceCandidates ?? [];
  return [
    `- ${piece.category} (${CATEGORY_LABELS[piece.category]}): from ${brandRequest(piece.brand)}. Its candidates:`,
    ...piece.candidates.map(candidateRequest),
    ...(onePieces.length > 0
      ? [`  Or a one_piece (${CATEGORY_LABELS.one_piece}) from ${piece.brand.name}, in place of both the top and the bottom. Its candidates:`, ...onePieces.map(candidateRequest)]
      : []),
  ];
}

function brandRequest({ name, categoryTags }: TailoringBrand): string {
  return categoryTags.length > 0 ? `${name}, which makes ${categoryTags.map((tag) => tag.replaceAll("_", " ")).join(", ")}` : name;
}

/** A candidate on one line: its id, title, description and colours, as the product search gave them. */
function candidateRequest({ id, title, description, colours }: TailoringCandidate): string {
  const about = [`id: ${id}`, `title: ${oneLine(title)}`];
  if (description) about.push(`description: ${oneLine(description)}`);
  if (colours.length > 0) about.push(`colours: ${colours.join(", ")}`);
  return `  - ${about.join(" | ")}`;
}

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
