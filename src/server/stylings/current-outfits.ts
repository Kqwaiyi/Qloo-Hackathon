import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { Line } from "@/config/accounts";
import type { BrandCategory } from "@/config/consultations";
import { addsToCurrentOutfits, type StyleIconStatus, type StylingKind } from "@/config/stylings";
import type { Database, Transaction } from "@/server/db/database";
import { consultation, outfit, piece, styleIcon, styling } from "@/server/db/schema";

import type { BrandsByCategory } from "./stylist-brief";

/**
 * What a Styling builds beside. "Show 2 more Outfits" adds to the Consultation's current Outfits:
 * it carries on down their Style Icons, the Consultation's current ones, numbers its Outfits after
 * theirs and repeats none of their Brands in a Category. Every other Styling builds on Style Icons
 * of its own, ranked or copied, beside nothing.
 */
export interface BuildingBeside {
  /**
   * The Style Icon list it builds from, by the Styling it belongs to, which ranked or copied it, or
   * null when there's none to build from.
   */
  styleIconList: string | null;
  /** The Brand picks of the Outfits it builds beside: none for a Face Photo's. */
  outfits: Record<BrandCategory, string | null>[];
  /** The number its first Outfit is shown with: "Outfit N". */
  firstPosition: number;
}

/** What the running Styling builds beside, as `BuildingBeside` describes. */
export async function readBuildingBeside(
  db: Database | Transaction,
  { stylingId, kind, consultationId }: { stylingId: string; kind: StylingKind; consultationId: string },
): Promise<BuildingBeside> {
  if (!addsToCurrentOutfits(kind)) return { styleIconList: stylingId, outfits: [], firstPosition: 1 };
  const current = await readCurrentOutfits(db, consultationId);
  return {
    // Every current Outfit's Style Icon comes from the same ranked list.
    styleIconList: current[0]?.styleIconList ?? null,
    outfits: current,
    firstPosition: 1 + Math.max(0, ...current.map((shown) => shown.position)),
  };
}

/**
 * The Consultation's current Style Icon list, by the Styling it belongs to: the one its current
 * Outfits came from or, with No Outfits, the latest found for its Photo Style. Null when there's
 * none, such as when its first Styling broke before Qloo answered.
 */
export async function readCurrentStyleIconList(db: Database | Transaction, consultationId: string): Promise<string | null> {
  const [shown] = await readCurrentOutfits(db, consultationId);
  if (shown) return shown.styleIconList;
  // A failed Photo Style change's are for words the Consultation never took on.
  const [latest] = await db
    .select({ stylingId: styleIcon.stylingId })
    .from(styleIcon)
    .innerJoin(styling, eq(styling.id, styleIcon.stylingId))
    .innerJoin(consultation, eq(consultation.id, styleIcon.consultationId))
    .where(and(eq(styleIcon.consultationId, consultationId), eq(styling.photoStyle, consultation.photoStyle)))
    .orderBy(desc(styling.startedAt))
    .limit(1);
  return latest?.stylingId ?? null;
}

/** A Style Icon on a Styling's list: its ID and Qloo's, its number on the list, its name and line, and whether it was used. */
export interface ListedStyleIcon {
  id: string;
  entityId: string;
  number: number;
  name: string;
  line: Line;
  status: StyleIconStatus;
}

/**
 * A Style Icon list, by the Styling it belongs to, as a Styling builds beside it
 * (`readBuildingBeside`): in Qloo's order, each Style Icon numbered by its place on it. None when
 * there's no list.
 */
export async function readStyleIconList(db: Database | Transaction, styleIconList: string | null): Promise<ListedStyleIcon[]> {
  if (!styleIconList) return [];
  return db
    .select({ id: styleIcon.id, entityId: styleIcon.qlooEntityId, number: styleIcon.position, name: styleIcon.name, line: styleIcon.line, status: styleIcon.status })
    .from(styleIcon)
    .where(eq(styleIcon.stylingId, styleIconList))
    .orderBy(asc(styleIcon.position));
}

/**
 * The Brands the Consultation's current Outfits use, by name, for each Category: each Outfit's
 * Brand picks, a One-Piece's left-out Bottom Brand included, or for an Outfit saved before the
 * Stylist named them, its Pieces' Brands.
 */
export async function readCurrentBrandNames(db: Database | Transaction, consultationId: string): Promise<BrandsByCategory> {
  const current = await db
    .select({ id: outfit.id, top: outfit.topBrandName, bottom: outfit.bottomBrandName, shoes: outfit.shoesBrandName })
    .from(outfit)
    .where(and(eq(outfit.consultationId, consultationId), eq(outfit.current, true)))
    .orderBy(asc(outfit.position));
  const pieces =
    current.length === 0
      ? []
      : await db
          .select({ outfitId: piece.outfitId, category: piece.category, brandName: piece.brandName })
          .from(piece)
          .where(inArray(piece.outfitId, current.map(({ id }) => id)));
  const named = (category: BrandCategory) =>
    current.flatMap((shown) => {
      const name =
        shown[category] ??
        pieces.find((saved) => saved.outfitId === shown.id && (saved.category === category || (category === "top" && saved.category === "one_piece")))?.brandName;
      return name ? [name] : [];
    });
  return { top: [...new Set(named("top"))], bottom: [...new Set(named("bottom"))], shoes: [...new Set(named("shoes"))] };
}

/**
 * Whether "Show 2 more Outfits" has anything left to build from: one of the Consultation's current
 * Style Icons that hasn't inspired an Outfit or been passed over. Once none is left, that's every
 * Outfit it can build for the photo. A Consultation with no current Outfits has none to add to.
 */
export async function hasCurrentStyleIconLeft(db: Database | Transaction, consultationId: string): Promise<boolean> {
  const [shown] = await readCurrentOutfits(db, consultationId);
  if (!shown) return false;
  const [left] = await db
    .select({ id: styleIcon.id })
    .from(styleIcon)
    .where(and(eq(styleIcon.stylingId, shown.styleIconList), eq(styleIcon.status, "unused")))
    .limit(1);
  return left !== undefined;
}

/** The Consultation's current Outfits: each one's number, Brand picks, and the Style Icon list its Style Icon is on. */
function readCurrentOutfits(db: Database | Transaction, consultationId: string) {
  return db
    .select({
      position: outfit.position,
      top: outfit.topBrandEntityId,
      bottom: outfit.bottomBrandEntityId,
      shoes: outfit.shoesBrandEntityId,
      styleIconList: styleIcon.stylingId,
    })
    .from(outfit)
    .innerJoin(styleIcon, eq(styleIcon.id, outfit.styleIconId))
    .where(and(eq(outfit.consultationId, consultationId), eq(outfit.current, true)));
}
