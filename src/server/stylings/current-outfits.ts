import { and, eq } from "drizzle-orm";

import type { BrandCategory } from "@/config/consultations";
import { addsToCurrentOutfits, type StylingKind } from "@/config/stylings";
import type { Database, Transaction } from "@/server/db/database";
import { outfit, styleIcon } from "@/server/db/schema";

/**
 * What a Styling builds beside. "Show 2 more Outfits" adds to the Consultation's current Outfits:
 * it carries on down their Style Icons, the Consultation's current ones, numbers its Outfits after
 * theirs and repeats none of their Brands in a Category. Every other Styling builds on the Style
 * Icons it ranked itself, beside nothing.
 */
export interface BuildingBeside {
  /** The Styling that ranked the Style Icons it builds from, or null when there are none to build from. */
  styleIconsRankedBy: string | null;
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
  if (!addsToCurrentOutfits(kind)) return { styleIconsRankedBy: stylingId, outfits: [], firstPosition: 1 };
  const current = await readCurrentOutfits(db, consultationId);
  return {
    // Every current Outfit's Style Icon comes from the same ranked list.
    styleIconsRankedBy: current[0]?.styleIconsRankedBy ?? null,
    outfits: current,
    firstPosition: 1 + Math.max(0, ...current.map((shown) => shown.position)),
  };
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
    .where(and(eq(styleIcon.stylingId, shown.styleIconsRankedBy), eq(styleIcon.status, "unused")))
    .limit(1);
  return left !== undefined;
}

/** The Consultation's current Outfits: each one's number, Brand picks, and the Styling that ranked its Style Icon. */
function readCurrentOutfits(db: Database | Transaction, consultationId: string) {
  return db
    .select({
      position: outfit.position,
      top: outfit.topBrandEntityId,
      bottom: outfit.bottomBrandEntityId,
      shoes: outfit.shoesBrandEntityId,
      styleIconsRankedBy: styleIcon.stylingId,
    })
    .from(outfit)
    .innerJoin(styleIcon, eq(styleIcon.id, outfit.styleIconId))
    .where(and(eq(outfit.consultationId, consultationId), eq(outfit.current, true)));
}
