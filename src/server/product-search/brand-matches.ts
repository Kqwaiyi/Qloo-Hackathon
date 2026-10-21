import { and, gt, inArray } from "drizzle-orm";

import { BRAND_MATCH_LIFETIME_DAYS } from "@/config/product-search";
import type { Clock } from "@/server/clock";
import type { Database, Transaction } from "@/server/db/database";
import { brandMatch } from "@/server/db/schema";
import type { BrandMatches, BrandToLookUp } from "@/server/outfit-assembly/brands";

import type { ProductSearch } from "./provider";

// Whether the product search knows each Qloo Brand (spec: "Brand matching"), kept in the database by
// the Brand's Qloo entity ID for BRAND_MATCH_LIFETIME_DAYS, found or not.

const LIFETIME_MS = BRAND_MATCH_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

/** The matches of those of these Brands looked up within BRAND_MATCH_LIFETIME_DAYS before `now`. */
export async function readBrandMatches(db: Database | Transaction, now: Date, entityIds: readonly string[]): Promise<BrandMatches> {
  if (entityIds.length === 0) return new Map();
  const rows = await db
    .select({ entityId: brandMatch.qlooEntityId, brandId: brandMatch.productSearchBrandId })
    .from(brandMatch)
    .where(and(inArray(brandMatch.qlooEntityId, [...new Set(entityIds)]), gt(brandMatch.lookedUpAt, new Date(now.getTime() - LIFETIME_MS))));
  return new Map(rows.map(({ entityId, brandId }) => [entityId, brandId]));
}

/**
 * Looks a Brand up in the product search, which gets only its name and official site, and keeps
 * what it found. A Brand looked up within BRAND_MATCH_LIFETIME_DAYS isn't looked up again.
 */
export async function lookUpBrandMatch(
  { db, clock, productSearch }: { db: Database; clock: Clock; productSearch: ProductSearch },
  { entityId, name, officialSite }: BrandToLookUp,
): Promise<void> {
  const now = clock.now();
  if ((await readBrandMatches(db, now, [entityId])).has(entityId)) return;
  const lookup = await productSearch.findBrand({ name, officialSite });
  const productSearchBrandId = lookup.found ? lookup.brandId : null;
  await db
    .insert(brandMatch)
    .values({ qlooEntityId: entityId, productSearchBrandId, lookedUpAt: now })
    .onConflictDoUpdate({ target: brandMatch.qlooEntityId, set: { productSearchBrandId, lookedUpAt: now } });
}
