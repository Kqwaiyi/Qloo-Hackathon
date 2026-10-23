import type { Line } from "@/config/accounts";
import type { BrandCategory, PhotoStyleWords } from "@/config/consultations";

// The Stylist's brief, as the conversation's first message gives it beside the photo. Like the
// Stylist, it imports nothing but types and config, so the Workflow's sandbox can load it.

/** A Style Icon as the Stylist is told it: its number on the Styling's list, its name and its Outfit's line. */
export interface StylistStyleIcon {
  number: number;
  name: string;
  line: Line;
}

/** The Brands Outfits use, by name, for each Brand Category. */
export type BrandsByCategory = Record<BrandCategory, string[]>;

/**
 * What the Stylist is told about its Styling. Never the Country, which Qloo's picks already
 * reflect, nor the Budget Tier, but for a Budget Tier change, whose Budget Tier is what changes.
 */
export interface StylistBrief {
  /** What kind of Styling it is, such as "Show 2 more Outfits". */
  styling: string;
  /** The Photo Type, such as "Face Photo". */
  photo: string;
  /** The Pieces each Outfit has, in card order, such as ["Hairstyle"]. */
  pieces: string[];
  photoStyle: PhotoStyleWords;
  /** From sign-up: the Stylist never guesses it. */
  ageGroup: string;
  /** How many Outfits it may make, at most. */
  outfits: number;
  /** A Budget Tier change only: the Budget Tier its Outfits are built at, such as "Low". */
  budgetTier?: string;
  /**
   * "Show 2 more Outfits" for a body photo only: the Brands the current Outfits use for each
   * Category, a One-Piece's left-out Bottom Brand included, which no new Outfit repeats in it.
   */
  brandsInUse?: BrandsByCategory;
  /**
   * The Style Icons it builds from, in Qloo's order, best first: those it may still use. Absent
   * when it finds its own, with `findStyleIcons`.
   */
  styleIcons?: StylistStyleIcon[];
  /** Style Icons on its list that have already inspired an Outfit, when there are any. */
  styleIconsUsed?: StylistStyleIcon[];
  /** Style Icons on its list that were passed over, when there are any. */
  styleIconsPassedOver?: StylistStyleIcon[];
}

const BRIEF_HEADING = "This Styling's brief, as JSON:";

/** The brief as the conversation's first message gives it: a heading, then the brief as JSON. */
export function stylistBriefText(brief: StylistBrief): string {
  return `${BRIEF_HEADING}\n${JSON.stringify(brief)}`;
}

/** The brief in a message `stylistBriefText` wrote, or null for any other text. */
export function readStylistBrief(text: string): StylistBrief | null {
  if (!text.startsWith(`${BRIEF_HEADING}\n`)) return null;
  try {
    return JSON.parse(text.slice(BRIEF_HEADING.length + 1)) as StylistBrief;
  } catch {
    return null;
  }
}
