import * as z from "zod";

import type { Line } from "@/config/accounts";
import {
  type AgeGroup,
  type BrandCategory,
  CATEGORIES,
  type Category,
  type PhotoStyleWords,
  type PhotoType,
  type PriceRangeUsd,
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
  /** Qloo's product categories for it, such as apparel, footwear or denim: what it plausibly makes. */
  categoryTags: readonly string[];
  /** Its price range in US dollars, when Qloo has one, to pitch the item. Never repeated in the reply. */
  priceRangeUsd: PriceRangeUsd | null;
}

/** One Piece to tailor: the Hairstyle, from the Style Icon's name alone, or a Piece built on its Brand. */
export type TailoringPiece = { category: "hairstyle" } | { category: BrandCategory; brand: TailoringBrand };

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
 * The structured output a model is asked for: one Piece per Category it was given. Models don't
 * always keep to it, so our code checks every reply against it and our own rules.
 */
export const tailoredPiecesSchema = z.object({
  pieces: z.array(
    z.object({
      category: z.enum(CATEGORIES),
      /** A card label of about 6 words, colour included. For the Hairstyle, the cut. */
      item: z.string(),
      /** One sentence on colour, fabric, fit and cut, for the Preview. Not shown. */
      details: z.string(),
      /** One line of about 20 words, in English and second person, on why it suits the user. */
      why: z.string(),
      /** The Hairstyle only: the model didn't know the Style Icon's signature cut, so based it on the Outfit. */
      unknownCut: z.boolean().optional(),
    }),
  ),
});
export type TailoredPieces = z.infer<typeof tailoredPiecesSchema>;

/** What one Preview is drawn from. Never the Style Icon's name or image. */
export interface PreviewInput {
  photo: Photo;
  /** A Face Photo's Preview changes only the hair; a Body-Only Preview never invents a face. */
  photoType: PhotoType;
  /** The Pieces the user is shown wearing, each by its `details`: only these change. */
  pieces: readonly { category: Category; details: string }[];
}

/** The image the model drew, in whatever format it sent, or its refusal and why. */
export type PreviewResult = { refused: false; image: Uint8Array } | { refused: true; reason: PreviewRefusalReason };

export interface AiProvider {
  /** Checks a photo and reads its Photo Style. Throws if the check still errors after the AI SDK's own retries. */
  checkPhoto(input: PhotoCheckInput): Promise<PhotoCheckResult>;
  /**
   * Tailors one Outfit's Pieces to the photo, returning the model's reply as it came: meant to match
   * `tailoredPiecesSchema`, but unchecked. A reply that doesn't match still comes back rather than
   * throwing, since our code checks it and asks again. Throws only on errors worth retrying.
   *
   * The model is told the rules: items are generic, never product or model names; never a price;
   * only an item the Brand plausibly makes; and the Top is one garment, the main visible upper layer.
   */
  tailorPieces(input: TailoringInput): Promise<unknown>;
  /**
   * Renders one Preview: the photo with only the Pieces changed. A refusal comes back, and is final:
   * nothing asks again. Throws only on errors worth retrying, and there's no quality check.
   */
  renderPreview(input: PreviewInput): Promise<PreviewResult>;
}
