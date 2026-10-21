// A live check, opt-in and never run in CI: how many of the Brands Qloo returns can the product
// search use? Its answer is the go/no-go for building Pieces from real Products: if fewer than
// about 60% of the Brands that would be picked are usable, stop, and `main` stays the submission.
//
// It takes the Brand responses in the Qloo cache (production's with DATABASE_URL set, otherwise
// local development's), or with --fresh makes fresh Qloo calls for a few sample users, which go
// into the same cache. It looks up every usable Brand through Channel3's free Brand lookup, and
// reports how many it finds and whether the websites lookup could break the ties it met. Then, for
// the Brands a Styling would pick first, it runs one search for each line and Category each was
// picked for, in the market of the users it was picked for, and reports how many of those Brands
// are usable. Each search costs one Channel3 credit, a few per Brand; --max-brands caps how many
// Brands it checks, the most often picked first, and --lookups-only makes no search at all.
//
//   npm run check:product-search-coverage
//   npm run check:product-search-coverage -- --lookups-only
//   npm run check:product-search-coverage -- --max-brands 20
//   npm run check:product-search-coverage -- --fresh --countries US,GB,DE,ID --style-icons 5
//
// It needs CHANNEL3_API_KEY, whatever PRODUCT_SEARCH says.

import { parseArgs } from "node:util";

import { type Line, LINES } from "@/config/accounts";
import { BRAND_CATEGORIES, type BrandCategory, CATEGORY_LABELS, type PhotoStyleWords } from "@/config/consultations";
import { COUNTRIES, findCountry } from "@/config/countries";
import { PRODUCT_SEARCH_MARKET_CURRENCIES, type ProductSearchMarket } from "@/config/product-search";
import { systemClock } from "@/server/clock";
import { closeDatabase, connectDatabase } from "@/server/db/connect";
import type { Database } from "@/server/db/database";
import { qlooCache } from "@/server/db/schema";
import { brandPriceRange, brandQueries, pickBrands, type PickedBrand, usableBrands, type UsedBrands } from "@/server/outfit-assembly/brands";
import { productSearchMarket } from "@/server/outfit-assembly/markets";
import { lineGender } from "@/server/outfit-assembly/signals";
import { rankStyleIcons, styleIconQuery } from "@/server/outfit-assembly/style-icons";
import { type Channel3BrandMatch, Channel3ProductSearch } from "@/server/product-search/channel3";
import { type CandidateProduct, ProductSearchRateLimitedError, UnretryableProductSearchError } from "@/server/product-search/provider";
import { type QlooBrand, qlooClientFromEnvironment } from "@/server/qloo/client";

import { exitWithUsage } from "./team-script";

const USAGE =
  "npm run check:product-search-coverage -- [--lookups-only] [--max-brands <n>] [--fresh] [--countries <codes>] [--style-icons <n>]";

/** Channel3 allows 10 requests a second, shared across its endpoints; the check keeps well under it. */
const PAUSE_BETWEEN_CALLS_MS = 200;
/** How many times a call is tried again after "too many requests". */
const RATE_LIMIT_RETRIES = 3;
/** The go/no-go line. */
const USABLE_SHARE_NEEDED = 0.6;

/** The sample users of a --fresh run, beside their Country: an age group and Photo Style Qloo has plenty for. */
const FRESH_AGE_GROUP = "25_29";
const FRESH_PHOTO_STYLE: PhotoStyleWords = ["casual"];

const NOTHING_USED: UsedBrands = { top: new Set(), bottom: new Set(), shoes: new Set() };

/** One Brand call's Brands, with the line and market of the users it was made for. */
interface BrandResponse {
  line: Line;
  market: ProductSearchMarket;
  brands: readonly QlooBrand[];
}

/** A Brand a Styling would pick first for a Category, in a line and market. */
interface BrandPick {
  brand: PickedBrand;
  line: Line;
  category: BrandCategory;
  market: ProductSearchMarket;
}

/** How a Brand's free lookup went. */
type LookupOutcome = Channel3BrandMatch | { outcome: "error"; message: string };

interface SearchResult {
  pick: BrandPick;
  /** Whether the search was sent without the Brand's price range, because the market doesn't price in US dollars. */
  unpriced: boolean;
  products: number;
  qualifying: number;
  /** Products Channel3 gave no gender: unisex, or not said. */
  ungendered: number;
  error: string | null;
}

const options = readOptions();
const apiKey = process.env.CHANNEL3_API_KEY;
if (!apiKey) {
  console.error("CHANNEL3_API_KEY must be set, as in .env.local.");
  process.exit(1);
}
const channel3 = new Channel3ProductSearch({ transport: (request) => fetch(request), apiKey });

console.log(process.env.DATABASE_URL ? "Using the database in DATABASE_URL." : "Using local development's PGlite database.");
const db = await connectDatabase();
try {
  const responses = options.fresh ? await freshBrandResponses(db) : await cachedBrandResponses(db);
  if (responses.length === 0) {
    console.error("The Qloo cache holds no Brand responses. Run it again with --fresh to make some.");
    process.exitCode = 1;
  } else {
    await checkCoverage(responses);
  }
} finally {
  await closeDatabase(db);
}

function readOptions() {
  try {
    const { values } = parseArgs({
      options: {
        "lookups-only": { type: "boolean", default: false },
        "max-brands": { type: "string", default: "40" },
        fresh: { type: "boolean", default: false },
        countries: { type: "string", default: "US,GB,DE,ID" },
        "style-icons": { type: "string", default: "5" },
      },
    });
    const maxBrands = Number(values["max-brands"]);
    const styleIcons = Number(values["style-icons"]);
    const countries = values.countries.split(",").map((code) => code.trim().toUpperCase());
    if (!Number.isInteger(maxBrands) || maxBrands < 1 || !Number.isInteger(styleIcons) || styleIcons < 1) exitWithUsage(USAGE);
    const unknown = countries.filter((code) => !findCountry(code));
    if (unknown.length > 0) exitWithUsage(`${USAGE}\nNot Countries: ${unknown.join(", ")}.`);
    return { lookupsOnly: values["lookups-only"], maxBrands, fresh: values.fresh, countries, styleIcons };
  } catch {
    exitWithUsage(USAGE);
  }
}

/** Every Brand response in the Qloo cache, with its line and the market of its Country. */
async function cachedBrandResponses(database: Database): Promise<BrandResponse[]> {
  const rows = await database.select({ requestKey: qlooCache.requestKey, body: qlooCache.body }).from(qlooCache);
  const responses = rows.flatMap(({ requestKey, body }): BrandResponse[] => {
    const params = new URLSearchParams(requestKey.slice(requestKey.indexOf("?") + 1));
    const line = LINES.find((candidate) => lineGender(candidate) === params.get("signal.demographics.gender"));
    if (params.get("filter.type") !== "urn:entity:brand" || !line) return [];
    const country = COUNTRIES.find(({ qlooLocation }) => qlooLocation === params.get("signal.location.query"));
    return [{ line, market: productSearchMarket(country?.code ?? "US"), brands: body as QlooBrand[] }];
  });
  console.log(`Brands from the Qloo cache: ${responses.length} Brand responses.`);
  return responses;
}

/**
 * Brand responses from fresh Qloo calls, cached as the app caches them: for a sample user in each
 * Country, both lines' Style Icons, then each line's first Style Icons' Brands, at No Budget.
 */
async function freshBrandResponses(database: Database): Promise<BrandResponse[]> {
  const qloo = qlooClientFromEnvironment({ db: database, clock: systemClock });
  const responses: BrandResponse[] = [];
  for (const countryCode of options.countries) {
    const search = { ageGroup: FRESH_AGE_GROUP, countryCode, photoStyle: FRESH_PHOTO_STYLE } as const;
    const peopleByLine = Object.fromEntries(await Promise.all(LINES.map(async (line) => [line, await qloo.people(styleIconQuery(search, line))])));
    const styleIcons = rankStyleIcons(peopleByLine);
    for (const line of LINES) {
      for (const styleIcon of styleIcons.filter((icon) => icon.line === line).slice(0, options.styleIcons)) {
        const [query] = brandQueries({ ageGroup: FRESH_AGE_GROUP, countryCode, budgetTier: "no_budget" }, { entityId: styleIcon.entityId, line });
        responses.push({ line, market: productSearchMarket(countryCode), brands: await qloo.brands(query) });
      }
    }
  }
  console.log(`Brands from fresh Qloo calls: ${responses.length} Brand responses for ${options.countries.join(", ")}.`);
  return responses;
}

async function checkCoverage(responses: readonly BrandResponse[]): Promise<void> {
  const usable = new Map<string, QlooBrand>();
  for (const { line, brands } of responses) for (const brand of usableBrands(brands, line, "no_budget")) usable.set(brand.entityId, brand);
  const picks = firstPicks(responses);
  const timesPicked = (id: string) => picks.filter((pick) => pick.brand.entityId === id).length;
  const pickedIds = [...new Set(picks.map((pick) => pick.brand.entityId))].toSorted((a, b) => timesPicked(b) - timesPicked(a));
  console.log(`${usable.size} usable Brands, ${pickedIds.length} of them picked first for a Top, Bottom or Shoes (${picks.length} picks).`);

  console.log(`\nLooking up ${usable.size} Brands through Channel3's free Brand lookup…`);
  const lookups = new Map<string, LookupOutcome>();
  for (const brand of usable.values()) lookups.set(brand.entityId, await lookUp(brand));
  reportLookups([...usable.values()], lookups);

  const brandIdOf = (entityId: string) => {
    const lookup = lookups.get(entityId);
    return lookup && "brandId" in lookup ? lookup.brandId : null;
  };
  const pickedFound = pickedIds.filter((id) => brandIdOf(id) !== null);
  console.log(`\nPicked Brands Channel3 knows: ${pickedFound.length} of ${pickedIds.length} (${percent(pickedFound.length, pickedIds.length)}).`);

  // The Brands picked most often, up to --max-brands, found or not, so the cap doesn't skew the share.
  const checked = pickedIds.slice(0, options.maxBrands);
  const toSearch = picks.filter((pick) => checked.includes(pick.brand.entityId) && brandIdOf(pick.brand.entityId) !== null);
  if (options.lookupsOnly) {
    console.log(`\nChecking ${checked.length} picked Brands would take ${toSearch.length} searches, one credit each. Run it without --lookups-only to make them.`);
    return;
  }

  console.log(`\nChecking the ${checked.length} Brands picked most often: ${toSearch.length} searches, one credit each…`);
  const results: SearchResult[] = [];
  for (const pick of toSearch) {
    const result = await searchFor(pick, brandIdOf(pick.brand.entityId)!);
    results.push(result);
    console.log(`  ${searchLine(result)}`);
  }
  reportSearches(checked, results);
}

/** Each Brand response's first Outfit's Top, Bottom and Shoes, as a Styling would pick them at No Budget. */
function firstPicks(responses: readonly BrandResponse[]): BrandPick[] {
  const picks = new Map<string, BrandPick>();
  for (const { line, market, brands } of responses) {
    const picked = pickBrands(brands, line, "no_budget", NOTHING_USED);
    if (!picked) continue;
    for (const category of BRAND_CATEGORIES) {
      const brand = picked[category];
      picks.set([brand.entityId, line, category, market].join("|"), { brand, line, category, market });
    }
  }
  return [...picks.values()];
}

async function lookUp(brand: QlooBrand): Promise<LookupOutcome> {
  try {
    return await politely(() => channel3.matchBrand({ name: brand.name, officialSite: brand.officialSite }));
  } catch (error) {
    if (error instanceof UnretryableProductSearchError) throw error;
    return { outcome: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * One search for a pick, in its market, within its Brand's price range when the market prices in
 * US dollars, as Pieces will be searched until prices are converted.
 */
async function searchFor(pick: BrandPick, brandId: string): Promise<SearchResult> {
  const { brand, line, category, market } = pick;
  const range = brandPriceRange(brand.priceRangeUsdMin, brand.priceRangeUsdMax);
  const priceRange = PRODUCT_SEARCH_MARKET_CURRENCIES[market] === "USD" ? range : null;
  const unpriced = range !== null && priceRange === null;
  try {
    const products = await politely(() => channel3.searchProducts({ brandId, category, line, market, priceRange }));
    return {
      pick,
      unpriced,
      products: products.length,
      qualifying: products.filter((product) => qualifies(product, brandId, line)).length,
      ungendered: products.filter((product) => product.line === null).length,
      error: null,
    };
  } catch (error) {
    if (error instanceof UnretryableProductSearchError) throw error;
    return { pick, unpriced, products: 0, qualifying: 0, ungendered: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Whether a Product would qualify for a Piece, near enough: the Brand's, in the line or unisex, with
 * a garment-only photo (hero or flat-lay) and an in-stock offer that isn't second-hand. Channel3
 * has already applied the price range.
 */
function qualifies(product: CandidateProduct, brandId: string, line: Line): boolean {
  return (
    product.brandIds.includes(brandId) &&
    (product.line === null || product.line === line) &&
    product.images.some(({ shotType }) => shotType === "hero" || shotType === "flat_lay") &&
    product.offers.some(({ availability, condition }) => availability === "in_stock" && condition !== "used")
  );
}

/** A call, paced under Channel3's rate limit and tried again after "too many requests". */
async function politely<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    await sleep(PAUSE_BETWEEN_CALLS_MS);
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof ProductSearchRateLimitedError) || attempt >= RATE_LIMIT_RETRIES) throw error;
      await sleep((error.retryAfterSeconds ?? 5) * 1000);
    }
  }
}

function reportLookups(brands: readonly QlooBrand[], lookups: ReadonlyMap<string, LookupOutcome>): void {
  const withOutcome = (outcome: LookupOutcome["outcome"]) => brands.filter((brand) => lookups.get(brand.entityId)?.outcome === outcome);
  const broken = withOutcome("tie_broken");
  const unbroken = withOutcome("tie_unbroken");
  const notFound = withOutcome("not_found");
  const errored = withOutcome("error");
  const rows: [string, readonly QlooBrand[]][] = [
    ["Found, one Brand under its name", withOutcome("found")],
    ["Found, a tie the websites lookup broke", broken],
    ["Not found, a tie it couldn't break", unbroken],
    ["Not found, no Brand under its name", notFound],
    ["Lookup errored", errored],
  ];
  for (const [label, matching] of rows) {
    if (matching.length > 0) console.log(`  ${`${label}:`.padEnd(42)}${matching.length} (${percent(matching.length, brands.length)})`);
  }
  const ties = [...broken, ...unbroken];
  if (ties.length > 0) {
    console.log(`\n  The websites lookup broke ${broken.length} of the ${ties.length} ties it met:`);
    for (const brand of ties) console.log(`    ${brand.name} (${brand.officialSite ?? "no official site"}): ${tieText(lookups.get(brand.entityId)!)}`);
  }
  if (notFound.length > 0) console.log(`\n  Not found: ${notFound.map((brand) => brand.name).join(", ")}.`);
  for (const brand of errored) console.log(`  ${brand.name}: ${(lookups.get(brand.entityId) as { message: string }).message}`);
}

function tieText(lookup: LookupOutcome): string {
  if (lookup.outcome === "tie_broken") return `${lookup.tied} Brands under its name, broken by the website's logo`;
  if (lookup.outcome !== "tie_unbroken") return lookup.outcome;
  const why = {
    no_official_site: "Qloo has no official site for it",
    website_unknown: "Channel3 has no website at its official site",
    no_one_brand_tied: "not one Brand alone shares the website's logo",
  }[lookup.reason];
  return `${lookup.tied} Brands under its name, not broken: ${why}`;
}

function searchLine({ pick, unpriced, products, qualifying, ungendered, error }: SearchResult): string {
  const what = `${pick.brand.name}, ${pick.line} ${CATEGORY_LABELS[pick.category]}, ${pick.market} market${unpriced ? ", no price filter" : ""}`;
  if (error) return `${what}: errored (${error})`;
  return `${what}: ${products} Products, ${qualifying} qualifying, ${ungendered} ungendered`;
}

/** The share of checked Brands that are usable: every line and Category it was picked for found a qualifying Product. */
function reportSearches(checked: readonly string[], results: readonly SearchResult[]): void {
  console.log("\nPicks whose search found a qualifying Product, by Category:");
  for (const category of BRAND_CATEGORIES) {
    const inCategory = results.filter(({ pick }) => pick.category === category);
    const usable = inCategory.filter(({ qualifying }) => qualifying > 0);
    console.log(`  ${CATEGORY_LABELS[category]}: ${usable.length} of ${inCategory.length} (${percent(usable.length, inCategory.length)})`);
  }
  const searchedIds = new Set(results.map(({ pick }) => pick.brand.entityId));
  const usableIds = [...searchedIds].filter((id) => results.every((result) => result.pick.brand.entityId !== id || result.qualifying > 0));
  const share = usableIds.length / checked.length;
  console.log(
    `\nUsable picked Brands: ${usableIds.length} of ${checked.length} (${percent(usableIds.length, checked.length)}), ` +
      `counting the ${checked.length - searchedIds.size} Channel3 doesn't know as unusable.`,
  );
  const unpriced = results.filter((result) => result.unpriced).length;
  if (unpriced > 0) {
    console.log(`${unpriced} searches in markets that don't price in US dollars went without the Brand's price range, so may overstate it.`);
  }
  console.log(
    share >= USABLE_SHARE_NEEDED
      ? `Go: at least about ${percent(USABLE_SHARE_NEEDED, 1)} of the Brands that would be picked are usable.`
      : `No-go: fewer than about ${percent(USABLE_SHARE_NEEDED, 1)} of the Brands that would be picked are usable, so main stays the submission.`,
  );
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "–" : `${Math.round((part / whole) * 100)}%`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
