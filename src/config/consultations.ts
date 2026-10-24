// Consultation rules and vocabulary. Every number and word list lives here so it can change
// without hunting through code.

export const PHOTO_TYPES = ["face", "full_body", "body_only"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

/** Full-Body Photo is the default: it unlocks the most complete Outfits. */
export const DEFAULT_PHOTO_TYPE: PhotoType = "full_body";

export const PHOTO_TYPE_LABELS: Record<PhotoType, string> = {
  face: "Face Photo",
  full_body: "Full-Body Photo",
  body_only: "Body-Only Photo",
};

export const CATEGORIES = ["hairstyle", "top", "bottom", "shoes"] as const;
export type Category = (typeof CATEGORIES)[number];

/** The Categories whose Pieces are built on a Brand: every one but the Hairstyle. */
export const BRAND_CATEGORIES = ["top", "bottom", "shoes"] as const satisfies readonly Category[];
export type BrandCategory = (typeof BRAND_CATEGORIES)[number];

export function isBrandCategory(category: Category): category is BrandCategory {
  return (BRAND_CATEGORIES as readonly Category[]).includes(category);
}

/** A price range in US dollars, from Qloo's Brand data. No price ever comes from the AI. */
export interface PriceRangeUsd {
  min: number;
  max: number;
}

/** A price in one currency, as a Product's seller gives it. No price ever comes from the AI. */
export interface Price {
  amount: number;
  /** An ISO 4217 code, such as `EUR`. */
  currency: string;
}

/**
 * What a Piece fills: one Category, or for a One-Piece both the Top and the Bottom, with one garment
 * built on the Top Brand (ADR-0003). In card order, a One-Piece where the Top and Bottom would be.
 */
export const PIECE_CATEGORIES = ["hairstyle", "top", "bottom", "one_piece", "shoes"] as const;
export type PieceCategory = (typeof PIECE_CATEGORIES)[number];

/** What a Product can be in an Outfit: a Top, Bottom or Shoes Piece, or a One-Piece. */
export type ProductCategory = Exclude<PieceCategory, "hairstyle">;

/** Sorts Pieces into card order: Hairstyle, Top, Bottom (or a One-Piece in their place), Shoes. */
export function byCategoryOrder(a: { category: PieceCategory }, b: { category: PieceCategory }): number {
  return PIECE_CATEGORIES.indexOf(a.category) - PIECE_CATEGORIES.indexOf(b.category);
}

export const CATEGORY_LABELS: Record<PieceCategory, string> = {
  hairstyle: "Hairstyle",
  top: "Top",
  bottom: "Bottom",
  one_piece: "One-Piece",
  shoes: "Shoes",
};

/** The Categories each Photo Type unlocks. A Full-Body Photo with covered hair gets no Hairstyle. */
export const PHOTO_TYPE_CATEGORIES: Record<PhotoType, readonly Category[]> = {
  face: ["hairstyle"],
  full_body: ["hairstyle", "top", "bottom", "shoes"],
  body_only: ["top", "bottom", "shoes"],
};

/** The words the AI may read as a photo's Photo Style. A plain photo reads as casual. */
export const PHOTO_STYLES = [
  "casual",
  "classic",
  "elegant",
  "streetwear",
  "preppy",
  "edgy",
  "bohemian",
  "chic",
  "glamorous",
  "sporty",
  "rugged",
] as const;
export type PhotoStyle = (typeof PHOTO_STYLES)[number];

/** A Photo Style: one or two words from the list, strongest first. */
export type PhotoStyleWords = readonly [PhotoStyle] | readonly [PhotoStyle, PhotoStyle];

/** Words in a sentence, such as "Top, Bottom and Shoes". */
export function inASentence(words: readonly string[]): string {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** A Photo Style in a sentence, such as "edgy and chic". */
export function photoStyleText(words: readonly PhotoStyle[]): string {
  return words.join(" and ");
}

/** Whether two Photo Styles have the same words, in whatever order: Qloo hears them as the same. */
export function isSamePhotoStyle(a: readonly PhotoStyle[], b: readonly PhotoStyle[]): boolean {
  return a.length === b.length && a.every((word) => b.includes(word));
}

export const BUDGET_TIERS = ["no_budget", "low", "medium", "expensive"] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number];

/** Body photos start at No Budget. A Face Photo has no Budget Tier, since a Hairstyle has no price. */
export const DEFAULT_BUDGET_TIER: BudgetTier = "no_budget";

export const BUDGET_TIER_LABELS: Record<BudgetTier, string> = {
  no_budget: "No Budget",
  low: "Low",
  medium: "Medium",
  expensive: "Expensive",
};

/** Whether a photo of this Photo Type has a Budget Tier: only those whose Outfits are built on Brands. */
export function hasBudgetTier(photoType: PhotoType): boolean {
  return PHOTO_TYPE_CATEGORIES[photoType].some(isBrandCategory);
}

/** Age groups, 18+ only (ADR-0004). Each Consultation keeps the user's age group from when it started. */
export const AGE_GROUPS = ["18_24", "25_29", "30_34", "35_44", "45_54", "55_64", "65_plus"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  "18_24": "18–24",
  "25_29": "25–29",
  "30_34": "30–34",
  "35_44": "35–44",
  "45_54": "45–54",
  "55_64": "55–64",
  "65_plus": "65+",
};

/** The youngest age in each group. */
export const AGE_GROUP_FLOORS: Record<AgeGroup, number> = {
  "18_24": 18,
  "25_29": 25,
  "30_34": 30,
  "35_44": 35,
  "45_54": 45,
  "55_64": 55,
  "65_plus": 65,
};

/** Styling while a Styling runs; then ready with its Outfits, or No Outfits when none were ever built. */
export const CONSULTATION_STATES = ["styling", "ready", "no_outfits"] as const;
export type ConsultationState = (typeof CONSULTATION_STATES)[number];

// Photo intake.

/** The picker refuses bigger files before anything is sent. */
export const PICKER_MAX_FILE_BYTES = 20 * 1024 * 1024;

/** The camera's self-timer, so the user can step back far enough for a body photo. */
export const SELF_TIMER_SECONDS = 5;

/** The browser redraws every photo as a JPEG at most this many pixels on its long side. */
export const PHOTO_MAX_LONG_SIDE_PX = 1600;

/** The server refuses bigger photos. Only requests that skipped the browser's redraw get near it. */
export const SERVER_MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** Pages show photos and Previews through signed links that last this long, created when the page renders. */
export const SIGNED_LINK_LIFETIME_SECONDS = 60 * 60;
