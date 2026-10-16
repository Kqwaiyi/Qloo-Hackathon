import type { Line } from "@/config/accounts";
import {
  type AgeGroup,
  BRAND_CATEGORIES,
  type BrandCategory,
  type BudgetTier,
  type Category,
  isBrandCategory,
  type PieceCategory,
  type PriceRangeUsd,
} from "@/config/consultations";
import { OFF_CATEGORY_DENYLIST, RETAILER_DENYLIST } from "@/config/denylists";
import {
  BOTTOM_DENIM_RANK,
  BRAND_APPAREL_TAGS,
  BRAND_DENIM_TAGS,
  BRAND_FASHION_TAG,
  BRAND_FOOTWEAR_TAGS,
  BRAND_POPULARITY_FLOOR,
  type BrandPriceGuard,
  BRAND_PRODUCT_CATEGORY_TAG,
  BRAND_TARGET_AGE_GROUPS,
  BRAND_WIDENED_POPULARITY_FLOOR,
  BRAND_WIDENING_STEPS,
  type BrandWideningStep,
  BRANDS_PER_CALL,
  BUDGET_TIER_BRAND_FILTERS,
  THIN_POOL_USABLE_BRANDS,
} from "@/config/qloo";
import type { QlooBrand, QlooBrandQuery, QlooTagId } from "@/server/qloo/client";

import { consultationCountry, lineGender, qlooAge } from "./signals";

// Building Outfits on Brands (spec: "Outfit assembly", Brands): the Brand query for each Style Icon,
// and the Top, Bottom and Shoes picked from what Qloo sends back. Pure: the caller fetches and saves.

/** What a Styling's Brand queries are built from. Never the Photo Style (ADR-0002). */
export interface BrandSearch {
  ageGroup: AgeGroup;
  countryCode: string;
  budgetTier: BudgetTier;
}

/** The Style Icon whose fans' Brands an Outfit is built on, in the Outfit's line. */
export interface BrandStyleIcon {
  entityId: string;
  line: Line;
}

/** Whether Outfits with these Categories are built on Brands, with one Brand call per Style Icon: body photos only. */
export function needsBrands(categories: readonly Category[]): boolean {
  return categories.some(isBrandCategory);
}

/**
 * One Style Icon's Brand queries, in the order to try them: the query itself, then each wider one a
 * thin pool widens to, one step at a time (`BRAND_WIDENING_STEPS`). Every one keeps the Budget
 * Tier's income levels, the age and gender signals and the Country's location. Qloo's client adds
 * `filter.type=urn:entity:brand`.
 */
export function brandQueries({ ageGroup, countryCode, budgetTier }: BrandSearch, styleIcon: BrandStyleIcon): [QlooBrandQuery, ...QlooBrandQuery[]] {
  const country = consultationCountry(countryCode);
  const { required, excluded } = BUDGET_TIER_BRAND_FILTERS[budgetTier];
  const ageGroupTags = BRAND_TARGET_AGE_GROUPS[ageGroup];
  const query = ({ ageTag, keyMarket, popularityFloor }: WidenableFilters): QlooBrandQuery => ({
    "signal.interests.entities": [styleIcon.entityId],
    "signal.demographics.age": qlooAge(ageGroup),
    "signal.demographics.gender": lineGender(styleIcon.line),
    "signal.location.query": country.qlooLocation,
    "operator.filter.tags": "intersection",
    "filter.tags": [BRAND_FASHION_TAG, ...(ageTag ? [ageTag] : []), ...(keyMarket ? [keyMarket] : []), ...required],
    ...(excluded.length > 0 && { "filter.exclude.tags": excluded }),
    "filter.popularity.min": popularityFloor,
    take: BRANDS_PER_CALL,
  });
  let widest: WidenableFilters = { ageTag: ageGroupTags.tag, keyMarket: country.qlooKeyMarket, popularityFloor: BRAND_POPULARITY_FLOOR };
  const queries: [QlooBrandQuery, ...QlooBrandQuery[]] = [query(widest)];
  for (const step of BRAND_WIDENING_STEPS) {
    const wider = widen(widest, step, ageGroupTags.widenTo);
    if (wider === widest) continue;
    queries.push(query(wider));
    widest = wider;
  }
  return queries;
}

/** The filters a thin pool's widening steps loosen. */
interface WidenableFilters {
  ageTag: QlooTagId | null;
  keyMarket: QlooTagId | null;
  popularityFloor: number;
}

/** The filters one widening step looser, or the same filters when the step changes nothing for them. */
function widen(filters: WidenableFilters, step: BrandWideningStep, nextAgeTag: QlooTagId | null): WidenableFilters {
  switch (step) {
    case "next_age_group":
      return filters.ageTag && nextAgeTag ? { ...filters, ageTag: nextAgeTag } : filters;
    case "drop_key_market":
      return filters.keyMarket ? { ...filters, keyMarket: null } : filters;
    case "lower_popularity_floor":
      return filters.popularityFloor > BRAND_WIDENED_POPULARITY_FLOOR
        ? { ...filters, popularityFloor: BRAND_WIDENED_POPULARITY_FLOOR }
        : filters;
    case "drop_age_tag":
      return filters.ageTag ? { ...filters, ageTag: null } : filters;
  }
}

/**
 * Whether a Brand call's Brands are a thin pool: fewer usable for the Outfit's line at the Budget
 * Tier than `THIN_POOL_USABLE_BRANDS`. The caller then tries the next of `brandQueries`.
 */
export function isThinPool(brands: readonly QlooBrand[], line: Line, budgetTier: BudgetTier): boolean {
  return usableBrands(brands, line, budgetTier).length < THIN_POOL_USABLE_BRANDS;
}

/**
 * The Brands an Outfit is built on, from each of `brandQueries`' calls tried so far, in order: the
 * ones with the most usable Brands for the line at the Budget Tier. That's the last, once it isn't
 * a thin pool. On a tie it's the narrower query's, closer to the age group and Country, since a
 * wider query still returns one page, which unusable Brands can crowd.
 */
export function fullestPool<Pool extends readonly QlooBrand[]>(tried: readonly Pool[], line: Line, budgetTier: BudgetTier): Pool {
  const usableCount = (brands: readonly QlooBrand[]) => usableBrands(brands, line, budgetTier).length;
  return tried.reduce((fullest, brands) => (usableCount(brands) > usableCount(fullest) ? brands : fullest));
}

/**
 * The Brands from a Style Icon's Brand call that the Outfit's line can use at the Budget Tier, in
 * Qloo's order: those making clothes or Shoes, which drops watches, jewellery, eyewear and
 * lingerie, off the denylists, and with prices that pass the tier's price guard.
 */
export function usableBrands(brands: readonly QlooBrand[], line: Line, budgetTier: BudgetTier): QlooBrand[] {
  const { priceGuard } = BUDGET_TIER_BRAND_FILTERS[budgetTier];
  return brands.filter(
    (candidate) =>
      suitsLine(candidate, line) &&
      (makesApparel(candidate) || makesFootwear(candidate)) &&
      !DENYLISTED.has(candidate.entityId) &&
      (!priceGuard || passes(candidate, priceGuard)),
  );
}

const DENYLISTED = new Set([...RETAILER_DENYLIST, ...OFF_CATEGORY_DENYLIST].map((entry) => entry.entityId));

/** A Brand a Piece is built on: what its Piece keeps, and what tailoring is told about it. */
export interface PickedBrand {
  entityId: string;
  name: string;
  /** Qloo's product categories for it, such as apparel, footwear or denim. */
  categoryTags: string[];
  priceRangeUsdMin: number | null;
  priceRangeUsdMax: number | null;
  officialSite: string | null;
}

/**
 * An Outfit's Brand picks: one per Brand Category, fixed before tailoring. A One-Piece's Outfit
 * keeps its Bottom Brand here too, left out of the Outfit but reserved (ADR-0003).
 */
export type BrandPicks = Record<BrandCategory, PickedBrand>;

/** The Brand a Piece is built on: its Category's pick, the Top's for a One-Piece, or none for the Hairstyle. */
export function pieceBrand(category: PieceCategory, picks: BrandPicks): PickedBrand | null {
  if (category === "one_piece") return picks.top;
  return isBrandCategory(category) ? picks[category] : null;
}

/** The entity IDs of the Brands each Category already uses, across the Outfits that will be current together. */
export type UsedBrands = Record<BrandCategory, ReadonlySet<string>>;

/**
 * The Brands the Outfits' picks use, by Category, including a One-Piece's left-out Bottom Brand.
 * Outfits without Brands, such as Hairstyle-only ones, use none.
 */
export function brandsUsedBy(outfits: readonly Record<BrandCategory, string | null>[]): UsedBrands {
  const used = (category: BrandCategory) => new Set(outfits.flatMap((picks) => picks[category] ?? []));
  return { top: used("top"), bottom: used("bottom"), shoes: used("shoes") };
}

/**
 * One Style Icon's Outfit Brands from its Brand call, or null when it can't complete an Outfit.
 * In this order: the Shoes are the highest-affinity footwear Brand not yet used for Shoes, the Top
 * the highest-affinity apparel Brand not yet used for a Top, and the Bottom the next apparel Brand
 * not yet used for a Bottom. The Bottom prefers a denim Brand in Qloo's top 10, which may be the
 * Top's, and takes the Top's Brand when there's no other. The Shoes never share a Brand with the
 * Top or Bottom.
 */
export function pickBrands(brands: readonly QlooBrand[], line: Line, budgetTier: BudgetTier, used: UsedBrands): BrandPicks | null {
  const usable = byAffinity(usableBrands(brands, line, budgetTier));
  const shoes = usable.find((candidate) => makesFootwear(candidate) && !used.shoes.has(candidate.entityId));
  if (!shoes) return null;
  const clothes = usable.filter((candidate) => makesApparel(candidate) && candidate.entityId !== shoes.entityId);
  const top = clothes.find((candidate) => !used.top.has(candidate.entityId));
  if (!top) return null;
  const bottoms = clothes.filter((candidate) => !used.bottom.has(candidate.entityId));
  // "Raw" is Qloo's own ranking, before the filters drop anything.
  const qlooHighestRanked = new Set(brands.slice(0, BOTTOM_DENIM_RANK).map((candidate) => candidate.entityId));
  const bottom =
    bottoms.find((candidate) => makesDenim(candidate) && qlooHighestRanked.has(candidate.entityId)) ??
    bottoms.find((candidate) => candidate.entityId !== top.entityId) ??
    bottoms[0];
  if (!bottom) return null;
  return { shoes: pickedBrand(shoes), top: pickedBrand(top), bottom: pickedBrand(bottom) };
}

/** A Style Icon whose Brand call has come back, in its Outfit's line. */
export interface StyleIconBrands {
  styleIconId: string;
  line: Line;
  brands: readonly QlooBrand[];
}

/** Which Style Icons' Outfits get which Brands, and which Style Icons can't complete one. */
export interface OutfitBrandPlan {
  picked: { styleIconId: string; brands: BrandPicks }[];
  skipped: string[];
}

/**
 * The Brands of up to `wanted` Outfits, one per Style Icon, best Style Icon first. Each Outfit's
 * picks are fixed before the next, and no Brand repeats within a Category across them or the
 * Outfits already built, which use `used`. A Style Icon that can't complete an Outfit beside the
 * Outfits already built is skipped. One held back only by this plan's own picks is neither: those
 * picks are freed if their tailoring fails, so it waits for a later plan.
 */
export function planOutfitBrands(
  styleIcons: readonly StyleIconBrands[],
  budgetTier: BudgetTier,
  wanted: number,
  used: UsedBrands,
): OutfitBrandPlan {
  const plan: OutfitBrandPlan = { picked: [], skipped: [] };
  const usedSoFar = { top: new Set(used.top), bottom: new Set(used.bottom), shoes: new Set(used.shoes) };
  for (const { styleIconId, line, brands } of styleIcons) {
    if (plan.picked.length >= wanted) break;
    const picks = pickBrands(brands, line, budgetTier, usedSoFar);
    if (!picks) {
      if (!pickBrands(brands, line, budgetTier, used)) plan.skipped.push(styleIconId);
      continue;
    }
    plan.picked.push({ styleIconId, brands: picks });
    for (const category of BRAND_CATEGORIES) usedSoFar[category].add(picks[category].entityId);
  }
  return plan;
}

/** A Brand Piece's price range: its Brand's `price_range_usd_min`–`max`, or null without both. */
export function brandPriceRange(min: number | null, max: number | null): PriceRangeUsd | null {
  return min === null || max === null ? null : { min, max };
}

/**
 * The whole Outfit's price range: the sums of its Brand Pieces' minimums and maximums, leaving out
 * any Piece with no price data. Null when none has any, as for a Hairstyle-only Outfit.
 */
export function outfitPriceRange(pieceRanges: readonly (PriceRangeUsd | null)[]): PriceRangeUsd | null {
  const priced = pieceRanges.filter((range) => range !== null);
  if (priced.length === 0) return null;
  return { min: sum(priced.map((range) => range.min)), max: sum(priced.map((range) => range.max)) };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Where "Visit <Brand>" goes: the Brand's official site when it's an https URL. Otherwise the row has no link. */
export function visitUrl(officialSite: string | null): string | null {
  if (!officialSite || !URL.canParse(officialSite)) return null;
  const url = new URL(officialSite);
  return url.protocol === "https:" ? url.href : null;
}

function pickedBrand({ entityId, name, tags, priceRangeUsdMin, priceRangeUsdMax, officialSite }: QlooBrand): PickedBrand {
  const categoryTags = tags
    .filter((tag) => tag.startsWith(BRAND_PRODUCT_CATEGORY_TAG))
    .map((tag) => tag.slice(BRAND_PRODUCT_CATEGORY_TAG.length));
  return { entityId, name, categoryTags, priceRangeUsdMin, priceRangeUsdMax, officialSite };
}

/** Highest affinity first. Any without one go last, keeping Qloo's order. */
function byAffinity(brands: readonly QlooBrand[]): QlooBrand[] {
  const affinity = (candidate: QlooBrand) => candidate.affinity ?? Number.NEGATIVE_INFINITY;
  return brands.toSorted((a, b) => (affinity(a) === affinity(b) ? 0 : affinity(a) > affinity(b) ? -1 : 1));
}

/** It can be a Top or a Bottom. */
function makesApparel(candidate: QlooBrand): boolean {
  return hasAnyTag(candidate, BRAND_APPAREL_TAGS);
}

/** It can be the Shoes. */
function makesFootwear(candidate: QlooBrand): boolean {
  return hasAnyTag(candidate, BRAND_FOOTWEAR_TAGS);
}

function makesDenim(candidate: QlooBrand): boolean {
  return hasAnyTag(candidate, BRAND_DENIM_TAGS);
}

function hasAnyTag({ tags }: QlooBrand, wanted: readonly string[]): boolean {
  return tags.some((tag) => wanted.includes(tag));
}

/** Whether the Brand's prices pass a Budget Tier's price guard. Without the price the guard reads, they can't. */
function passes({ priceRangeUsdMin, priceRangeUsdMax }: QlooBrand, { end, bound, usd }: BrandPriceGuard): boolean {
  const price = end === "min" ? priceRangeUsdMin : priceRangeUsdMax;
  if (price === null) return false;
  return bound === "at_most" ? price <= usd : price >= usd;
}

/**
 * The Style Preference rule, on Qloo's `target_gender`: menswear keeps a Brand that includes Male
 * or doesn't include Female, and womenswear the other way round. A filter on Qloo's own gender
 * tags would drop gender-neutral Brands such as Supreme and Converse.
 */
function suitsLine({ targetGender }: QlooBrand, line: Line): boolean {
  const own = lineGender(line);
  const other = own === "male" ? "female" : "male";
  const genders = targetGender.map((gender) => gender.toLowerCase());
  return genders.includes(own) || !genders.includes(other);
}
