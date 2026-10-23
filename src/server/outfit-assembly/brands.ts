import type { Line } from "@/config/accounts";
import { type AgeGroup, type BrandCategory, type BudgetTier, type Category, isBrandCategory, type PriceRangeUsd, type ProductCategory } from "@/config/consultations";
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
// the Brands usable for each Category from what Qloo sends back, and the Top, Bottom and Shoes
// they make. Pure: the caller fetches and saves.

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

/** A Brand a Piece is built on, as its Piece keeps it. */
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
 * An Outfit's Brand picks: one per Brand Category, fixed as the Outfit is saved. A One-Piece's
 * Outfit keeps its Bottom Brand here too, left out of the Outfit but reserved (ADR-0003).
 */
export type BrandPicks = Record<BrandCategory, PickedBrand>;

/** The Category whose Brand a Product Piece is built on: its own, or for a One-Piece, the Top's (ADR-0003). */
export function brandCategoryOf(category: ProductCategory): BrandCategory {
  return category === "one_piece" ? "top" : category;
}

/**
 * What the product search said of each Brand looked up in it lately, by Qloo entity ID: its own ID
 * for the Brand, or null when it doesn't know the Brand. A Brand missing here hasn't been looked up.
 */
export type BrandMatches = ReadonlyMap<string, string | null>;

/** A Brand to look up in the product search: what the lookup sends, and the Qloo entity ID its match is kept by. */
export type BrandToLookUp = Pick<PickedBrand, "entityId" | "name" | "officialSite">;

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
 * Top or Bottom. A Brand the product search doesn't know is passed over, like one on the
 * denylists; one not looked up yet is picked as if it knew it, so the caller looks it up before
 * using the picks.
 */
export function pickBrands(
  brands: readonly QlooBrand[],
  line: Line,
  budgetTier: BudgetTier,
  used: UsedBrands,
  matches: BrandMatches,
): BrandPicks | null {
  const picks = firstBrandsInPlay(brandLists(brands, line, budgetTier, matches), (category, candidate) => !used[category].has(candidate.entityId));
  return picks && { shoes: pickedBrand(picks.shoes), top: pickedBrand(picks.top), bottom: pickedBrand(picks.bottom) };
}

/**
 * A Style Icon's usable Brands for each Brand Category, highest affinity first, as the Stylist is
 * told them: the footwear Brands for the Shoes, and the apparel Brands for the Top and the Bottom.
 * `denimFirst` holds the apparel Brands that make denim and that Qloo ranks in its top 10, which a
 * Bottom takes before any other. Each holds the Brands themselves, or their names.
 */
export interface BrandLists<B> {
  shoes: readonly B[];
  top: readonly B[];
  bottom: readonly B[];
  denimFirst: readonly B[];
}

/**
 * The lists of the Brands from a Style Icon's Brand call that the Outfit's line can use at the
 * Budget Tier, leaving out each Brand a lookup found the product search doesn't know. One not looked
 * up yet stays, as if the product search knew it, so the caller looks it up before using it.
 */
export function brandLists(brands: readonly QlooBrand[], line: Line, budgetTier: BudgetTier, matches: BrandMatches): BrandLists<QlooBrand> {
  const usable = byAffinity(usableBrands(brands, line, budgetTier)).filter((candidate) => !unknownToProductSearch(candidate, matches));
  const clothes = usable.filter(makesApparel);
  // "Raw" is Qloo's own ranking, before the filters drop anything.
  const qlooHighestRanked = new Set(brands.slice(0, BOTTOM_DENIM_RANK).map((candidate) => candidate.entityId));
  return {
    shoes: usable.filter(makesFootwear),
    top: clothes,
    bottom: clothes,
    denimFirst: clothes.filter((candidate) => makesDenim(candidate) && qlooHighestRanked.has(candidate.entityId)),
  };
}

/**
 * An Outfit's Brands from a Style Icon's lists, each Category's first Brand still in play, or null
 * when it can't complete an Outfit. `inPlay` says whether a Brand is still in play for a Category,
 * such as one not yet used in it. In this order: the Shoes are the first footwear Brand in play, the
 * Top the first apparel Brand in play that isn't the Shoes', and the Bottom the first of `denimFirst`
 * in play that isn't the Shoes' (it may be the Top's), or else the first apparel Brand in play that's
 * neither the Shoes' nor the Top's, or else the Top's. Brands are the same by `sameBrand`.
 */
export function firstBrandsInPlay<B>(
  lists: BrandLists<B>,
  inPlay: (category: BrandCategory, brand: B) => boolean,
  sameBrand: (a: B, b: B) => boolean = (a, b) => a === b,
): Record<BrandCategory, B> | null {
  const shoes = lists.shoes.find((candidate) => inPlay("shoes", candidate));
  if (shoes === undefined) return null;
  const top = lists.top.find((candidate) => inPlay("top", candidate) && !sameBrand(candidate, shoes));
  if (top === undefined) return null;
  const bottoms = lists.bottom.filter((candidate) => inPlay("bottom", candidate) && !sameBrand(candidate, shoes));
  const bottom =
    lists.denimFirst.find((denim) => bottoms.some((candidate) => sameBrand(candidate, denim))) ??
    bottoms.find((candidate) => !sameBrand(candidate, top)) ??
    bottoms[0];
  if (bottom === undefined) return null;
  return { top, bottom, shoes };
}

/** A Brand Piece's price range: its Brand's `price_range_usd_min`–`max`, or null without both. */
export function brandPriceRange(min: number | null, max: number | null): PriceRangeUsd | null {
  return min === null || max === null ? null : { min, max };
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

/** Whether a lookup found the product search doesn't know the Brand. One not looked up yet may still be known. */
function unknownToProductSearch({ entityId }: QlooBrand, matches: BrandMatches): boolean {
  return matches.has(entityId) && matches.get(entityId) === null;
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
