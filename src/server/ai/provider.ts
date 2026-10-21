import * as z from "zod";

import type { Line } from "@/config/accounts";
import {
  type AgeGroup,
  type BrandCategory,
  PIECE_CATEGORIES,
  type PhotoStyleWords,
  type PhotoType,
  type ProductCategory,
} from "@/config/consultations";
import type { PreviewRefusalReason } from "@/config/stylings";

// Our own AI provider interface (spec: "AI provider interface"). The domain depends only on this,
// never on the AI SDK or Gemini. Nothing it returns guesses age, ethnicity, skin tone, body
// measurements or health (ADR-0005): the age group tailoring receives comes from sign-up.

export const PHOTO_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoMediaType = (typeof PHOTO_MEDIA_TYPES)[number];

export function isPhotoMediaType(contentType: string): contentType is PhotoMediaType {
  return (PHOTO_MEDIA_TYPES as readonly string[]).includes(contentType);
}

/** A photo's bytes, exactly as the browser shrank them. */
export interface Photo {
  bytes: Uint8Array;
  mediaType: PhotoMediaType;
}

export interface PhotoCheckInput {
  photo: Photo;
  /** The Photo Type the user chose. */
  photoType: PhotoType;
}

/** Which parts of the person the photo shows. */
export interface PhotoVisibility {
  face: boolean;
  hair: boolean;
  upperBody: boolean;
  legs: boolean;
  feet: boolean;
}

/** What the model reports seeing. Our code, not the model, decides whether the photo is accepted. */
export interface PhotoCheckReport {
  peopleCount: number;
  visible: PhotoVisibility;
  /** Yes or no only: what covers the hair is never returned or stored. */
  hairCovered: boolean;
  clearEnough: boolean;
  explicit: boolean;
  photoStyle: PhotoStyleWords;
}

/** What the model reported, or that Google blocked the photo, so the model reported nothing. */
export type PhotoCheckResult = { blocked: true } | { blocked: false; report: PhotoCheckReport };

/** What tailoring is told about the Brand a Piece is built on. */
export interface TailoringBrand {
  name: string;
  /** Qloo's product categories for it, such as apparel, footwear or denim. */
  categoryTags: readonly string[];
}

/**
 * One of a Brand's real Products a Piece may be, as tailoring is told it: its words, never its
 * images or its price.
 */
export interface TailoringCandidate {
  /** The product search's ID for it, which the reply gives back for the one picked. */
  id: string;
  title: string;
  description: string | null;
  /** Its colours, as hex codes, the most prominent first. */
  colours: readonly string[];
}

/**
 * One Piece to tailor: the Hairstyle, from the Style Icon's name alone, or a Piece built on its
 * Brand, which is one of the Brand's candidate Products.
 */
export type TailoringPiece =
  | { category: "hairstyle" }
  | {
      category: BrandCategory;
      brand: TailoringBrand;
      candidates: readonly TailoringCandidate[];
      /**
       * The Top only, in an Outfit with a Bottom, when its Brand has One-Pieces: those candidates,
       * any one of which may take the place of the Top and the Bottom (ADR-0003).
       */
      onePieceCandidates?: readonly TailoringCandidate[];
    };

/**
 * What one Outfit's Pieces are tailored from. Never the Country or the Budget Tier: the Brands
 * already reflect them.
 */
export interface TailoringInput {
  /** The photo itself, never a stored text description of the person. */
  photo: Photo;
  photoType: PhotoType;
  ageGroup: AgeGroup;
  photoStyle: PhotoStyleWords;
  /** The Outfit's line. The model never guesses it from the photo. */
  line: Line;
  /** The Hairstyle is built from the Style Icon's name alone, never Qloo's image of them. */
  styleIconName: string;
  /** One per Piece to tailor, in Category order. */
  pieces: readonly TailoringPiece[];
}

/**
 * The structured output a model is asked for: one Piece per Category it was given, or one One-Piece
 * in place of the Top and Bottom when the Top came with One-Piece candidates (ADR-0003). A Product
 * Piece is the candidate it picked, by ID; the Hairstyle is the cut it describes.
 * Models don't always keep to it, so our code checks every reply against it and our own rules.
 */
export const tailoredPiecesSchema = z.object({
  pieces: z.array(
    z.object({
      category: z.enum(PIECE_CATEGORIES),
      /** A Product Piece only: the ID of the candidate Product picked, as given. */
      productId: z.string().optional(),
      /** The Hairstyle only: the cut, as a card label of about 6 words. */
      item: z.string().optional(),
      /** The Hairstyle only: one sentence on the cut, for the Preview. Not shown. */
      details: z.string().optional(),
      /** One line of about 20 words, in English and second person, on why it suits the user. Never a price. */
      why: z.string(),
      /** The Hairstyle only: the model didn't know the Style Icon's signature cut, so based it on the Outfit. */
      unknownCut: z.boolean().optional(),
    }),
  ),
});
export type TailoredPieces = z.infer<typeof tailoredPiecesSchema>;

/**
 * One Piece a Preview draws: the Hairstyle by its details, or a Product by its seller's own photo
 * (ADR-0008), or by its title alone when its photo couldn't be fetched.
 */
export type PreviewPiece =
  | { category: "hairstyle"; details: string }
  | { category: ProductCategory; title: string; photo: Photo | null };

/** What one Preview is drawn from. Never the Style Icon's name or image. */
export interface PreviewInput {
  photo: Photo;
  /** A Face Photo's Preview changes only the hair; a Body-Only Preview never invents a face. */
  photoType: PhotoType;
  /** The Pieces the user is shown wearing, in Category order: only these change. */
  pieces: readonly PreviewPiece[];
}

/** The image the model drew, in whatever format it sent, or its refusal and why. */
export type PreviewResult = { refused: false; image: Uint8Array } | { refused: true; reason: PreviewRefusalReason };

/**
 * An AI call that failed in a way asking again can't change, such as a request the provider
 * rejects or an API key it refuses. Every other error a provider throws is worth retrying.
 */
export class UnretryableAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnretryableAiError";
  }
}

export interface AiProvider {
  /** Checks a photo and reads its Photo Style. Throws if the check still errors after the AI SDK's own retries. */
  checkPhoto(input: PhotoCheckInput): Promise<PhotoCheckResult>;
  /**
   * Tailors one Outfit's Pieces to the photo, returning the model's reply as it came: meant to match
   * `tailoredPiecesSchema`, but unchecked. A reply that doesn't match still comes back rather than
   * throwing, since our code checks it and asks again. Throws only on errors worth retrying, or an
   * `UnretryableAiError` for one that isn't.
   *
   * Each Brand Piece is one of its candidates, real Products of its Brand (ADR-0008): the model picks
   * one per Category, by their words alone, so the Outfit goes together and suits the user, and says
   * why. When the Top comes with One-Piece candidates, it may pick one of those in place of the Top
   * and Bottom instead, though it prefers separates (ADR-0003). The "why" may describe the Product
   * but never states a price. The Hairstyle is a cut it describes, as before.
   */
  tailorPieces(input: TailoringInput): Promise<unknown>;
  /**
   * Renders one Preview: the photo with only the Pieces changed. A refusal comes back, and is final:
   * nothing asks again. Throws only on errors worth retrying, or an `UnretryableAiError` for one
   * that isn't. There's no quality check.
   */
  renderPreview(input: PreviewInput): Promise<PreviewResult>;
}
