import { and, asc, eq, sql } from "drizzle-orm";

import { type BrandCategory, type BudgetTier, CATEGORY_LABELS, type ProductCategory } from "@/config/consultations";
import { PRODUCT_SEARCH_MARKET_CURRENCIES } from "@/config/product-search";
import { MAX_BRAND_FETCHES_PER_STYLING, MAX_PRODUCT_SEARCHES_PER_STYLING, type PieceSearchState, type StylingKind } from "@/config/stylings";
import type { Clock } from "@/server/clock";
import type { Database, Transaction } from "@/server/db/database";
import { consultation, outfit, pieceCandidates, styleIcon, styleIconBrands, styling } from "@/server/db/schema";
import { readExchangeRates } from "@/server/exchange-rates/rates";
import {
  type BrandLists,
  brandLists,
  type BrandMatches,
  brandQueries,
  brandsUsedBy,
  type BrandToLookUp,
  brandCategoryOf,
  firstBrandsInPlay,
  fullestPool,
  isThinPool,
  needsBrands,
  type UsedBrands,
} from "@/server/outfit-assembly/brands";
import { outfitCategories } from "@/server/outfit-assembly/categories";
import { type Candidate, qualifyingCandidates, searchPriceFilter } from "@/server/outfit-assembly/products";
import { lookUpBrandMatch, readBrandMatches } from "@/server/product-search/brand-matches";
import { UnretryableProductSearchError } from "@/server/product-search/provider";
import type { QlooBrand } from "@/server/qloo/client";
import { recordProductSearches } from "@/server/usage/records";

import { type ListedStyleIcon, readBuildingBeside, readStyleIconList } from "./current-outfits";
import {
  brandsBudgetTier,
  ProductSearchDownError,
  readRunningStyling,
  refused,
  type StepTry,
  type StylingContext,
  StylingNotRunningError,
  stylingMarket,
  whileRunning,
} from "./steps";
import {
  type BrandsFetched,
  fetchBrandsInputSchema,
  type ProductsSearched,
  type SearchCategory,
  searchProductsInputSchema,
  type StylistStepResult,
  type StylistSteps,
} from "./stylist";

// The Stylist's tools for a body photo's Outfits, which are built on Brands (ADR-0008, ADR-0010):
// fetching a Style Icon's Brands, and searching for a Piece's Products. They keep the fixed
// pipeline's rules: Qloo's Brand call and its widening, the Brands the product search knows, looked
// up as they're about to be used, and the product search's filters, never loosened. Each returns
// what the Stylist needs and nothing more, so its conversation stays small. For now the Stylist
// takes each Category's first Brand still in play, as the pipeline did; choosing among a Style
// Icon's top few, as ADR-0010 has it, comes next.

/** The Stylist's steps for a body photo's Brands and Products, running on `ctx`, as this try of them. */
export function brandSteps(
  ctx: StylingContext,
  { lastTry = true }: StepTry = {},
): Pick<StylistSteps, "fetchBrands" | "readBrandsInPlay" | "lookUpBrand" | "searchProducts"> {
  return {
    // The Brand call uses the profile stored on the Consultation, the Budget Tier the Styling builds
    // for, and the line of the Style Icon's Outfit, never the Photo Style (ADR-0002). A thin pool
    // widens within this one fetch: each wider query is tried in turn until one gives enough usable
    // Brands, or none is left.
    async fetchBrands(stylingId, input) {
      const parsed = fetchBrandsInputSchema.safeParse(input);
      if (!parsed.success) return refused("Give the number of the Style Icon whose Brands to fetch.");
      const opened = await whileRunning(ctx.db, stylingId, async (tx): Promise<StylistStepResult<{ icon: ListedStyleIcon; fetched: boolean }>> => {
        const building = await readBuilding(tx, stylingId);
        const notYet = buildingRefusal(building);
        if (notYet) return refused(notYet);
        const icon = (await readStyleIconList(tx, building.styleIconList)).find((listed) => listed.number === parsed.data.styleIcon);
        const unusable = styleIconRefusal(icon, parsed.data.styleIcon);
        if (unusable) return refused(unusable);
        const [kept] = await tx
          .select({ brands: styleIconBrands.brands })
          .from(styleIconBrands)
          .where(and(eq(styleIconBrands.stylingId, stylingId), eq(styleIconBrands.styleIconId, icon!.id)));
        // Fetched already, or set going by a try of this step before this one.
        if (kept) return { ok: true, icon: icon!, fetched: kept.brands !== null };
        const fetchedSoFar = await tx.$count(styleIconBrands, eq(styleIconBrands.stylingId, stylingId));
        if (fetchedSoFar >= MAX_BRAND_FETCHES_PER_STYLING) {
          return refused(`This Styling has fetched the Brands of ${MAX_BRAND_FETCHES_PER_STYLING} Style Icons, as many as it may.`);
        }
        await tx.insert(styleIconBrands).values({ stylingId, styleIconId: icon!.id, brands: null });
        return { ok: true, icon: icon!, fetched: false };
      });
      if (!opened.ok) return opened;
      const { icon, fetched } = opened;
      if (!fetched) {
        const running = await readRunningStyling(ctx.db, stylingId);
        const budgetTier = brandsBudgetTier(stylingId, running.budgetTier);
        const tried: QlooBrand[][] = [];
        for (const query of brandQueries({ ageGroup: running.ageGroup, countryCode: running.countryCode, budgetTier }, icon)) {
          // A Styling that stopped meanwhile spends no more of Qloo's calls.
          if (tried.length > 0) await readRunningStyling(ctx.db, stylingId);
          const brands = await ctx.qloo.brands(query);
          tried.push(brands);
          if (!isThinPool(brands, icon.line, budgetTier)) break;
        }
        const brands = fullestPool(tried, icon.line, budgetTier);
        await whileRunning(ctx.db, stylingId, async (tx) => {
          await tx
            .update(styleIconBrands)
            .set({ brands })
            .where(and(eq(styleIconBrands.stylingId, stylingId), eq(styleIconBrands.styleIconId, icon.id)));
        });
      }
      return { ok: true, styleIcon: icon.number };
    },

    // Only the Brands its first Brands in play would be are looked up, as they're about to be used,
    // and looked up again until they're all known: a Brand the product search doesn't know is out of
    // play, and the next one in its list takes its place.
    async readBrandsInPlay(stylingId, styleIconNumber) {
      const running = await readRunningStyling(ctx.db, stylingId);
      const state = await readBrandState(ctx.db, ctx.clock, { stylingId, ...running });
      const icon = state.list.find((listed) => listed.number === styleIconNumber);
      const pool = icon && state.pools.get(icon.id);
      if (!icon || !pool) throw new Error(`Style Icon ${styleIconNumber}'s Brands haven't been fetched.`);
      const fetchesLeft = Math.max(MAX_BRAND_FETCHES_PER_STYLING - state.pools.size, 0);
      const picks = firstInPlay(state, icon);
      if (picks) {
        const lookUp = [...new Map([picks.shoes, picks.top, picks.bottom].map((brand) => [brand.entityId, brand])).values()]
          .filter((brand) => !state.matches.has(brand.entityId))
          .map(({ entityId, name, officialSite }): BrandToLookUp => ({ entityId, name, officialSite }));
        if (lookUp.length > 0) return { lookUp };
        const lists = listsOf(state, icon);
        const inPlay = inPlayIn(state);
        const names = (category: BrandCategory, brands: readonly QlooBrand[]) => brands.filter((brand) => inPlay(category, brand)).map(({ name }) => name);
        return {
          styleIcon: icon.number,
          brands: {
            shoes: names("shoes", lists.shoes),
            top: names("top", lists.top),
            bottom: names("bottom", lists.bottom),
            denimFirst: names("bottom", lists.denimFirst),
          },
          fetchesLeft,
        } satisfies BrandsFetched;
      }
      // Passed over, and the next Style Icon takes its place.
      await whileRunning(ctx.db, stylingId, async (tx) => {
        await tx.update(styleIcon).set({ status: "skipped" }).where(and(eq(styleIcon.id, icon.id), eq(styleIcon.status, "unused")));
      });
      return {
        styleIcon: icon.number,
        passedOver: `${icon.name} is passed over: the Brands their fans favour can't complete an Outfit still in play.`,
        fetchesLeft,
      } satisfies BrandsFetched;
    },

    async lookUpBrand(stylingId, brand) {
      // A Styling that stopped meanwhile makes no more product-search calls.
      await readRunningStyling(ctx.db, stylingId);
      await lookUpBrandMatch(ctx, brand);
    },

    // The search is in the Styling's market, the Outfit's line and the Piece's Category, for the
    // Brand alone, new and in stock, within the Brand's price range in the market's currency at the
    // stored rates. It's never loosened: one that finds nothing, or still errors on the step's last
    // try, puts the Brand out of play for the Category instead, or for a One-Piece, leaves its Outfit
    // to separates. With no rate stored for the market's currency, none is sent: the Styling breaks.
    async searchProducts(stylingId, input) {
      const parsed = searchProductsInputSchema.safeParse(input);
      if (!parsed.success) return refused("Give the Style Icon's number, the category (top, bottom, shoes or onePiece) and the Brand's name.");
      const asked = parsed.data;
      const category: ProductCategory = asked.category === "onePiece" ? "one_piece" : asked.category;
      const opened = await whileRunning(ctx.db, stylingId, async (tx): Promise<OpenedSearch> => {
        const building = await readBuilding(tx, stylingId);
        const notYet = buildingRefusal(building);
        if (notYet) return refused(notYet);
        const state = await readBrandState(tx, ctx.clock, { stylingId, ...building });
        const icon = state.list.find((listed) => listed.number === asked.styleIcon);
        const unusable = styleIconRefusal(icon, asked.styleIcon);
        if (unusable) return refused(unusable);
        const pool = state.pools.get(icon!.id);
        if (!pool) return refused(`Fetch ${icon!.name}'s Brands first, with fetchBrands.`);
        // Every Brand the Style Icon's fans favour for the Piece, known to the product search or not.
        const lists = brandLists(pool, icon!.line, state.budgetTier, new Map());
        // A One-Piece is searched for on a Brand that can be the Outfit's Top (ADR-0003).
        const brandCategory = brandCategoryOf(category);
        const brand = lists[brandCategory].find(({ name }) => name === asked.brand);
        if (!brand) return refused(`${asked.brand} isn't one of ${icon!.name}'s ${CATEGORY_LABELS[brandCategory]} Brands.`);
        const made = searchFor(state, icon!, category, brand);
        if (made && made.state !== "searching") return { ok: true, done: searchedFor(asked, brand, made, state) };
        // A try of this step before this one set it going, so it carries on without counting again.
        if (made) return { ok: true, search: { icon: icon!, brand } };
        const match = state.matches.get(brand.entityId);
        if (match === null) {
          return { ok: true, done: { ...askedFor(asked, brand), candidates: [], out: "every Category", searchesLeft: searchesLeft(state.searches.length) } };
        }
        if (match === undefined) return { ok: true, lookUp: { entityId: brand.entityId, name: brand.name, officialSite: brand.officialSite } };
        const outOfPlay = outOfPlayRefusal(state, brandCategory, brand);
        if (outOfPlay) return refused(outOfPlay);
        if (building.productSearches >= MAX_PRODUCT_SEARCHES_PER_STYLING) {
          return refused(`This Styling has made all ${MAX_PRODUCT_SEARCHES_PER_STYLING} of its product searches.`);
        }
        // Throws before anything is sent or counted when no rate is stored for the market's currency.
        await searchFilters(tx, building, brand);
        // Each search counts once as it's set going, however many tries it takes: towards the
        // Styling's own, and the product-search backstop's.
        const now = ctx.clock.now();
        await tx
          .insert(pieceCandidates)
          .values({ stylingId, styleIconId: icon!.id, category, brandEntityId: brand.entityId, state: "searching", searchedAt: now });
        await tx
          .update(styling)
          .set({ productSearches: sql`${styling.productSearches} + 1` })
          .where(eq(styling.id, stylingId));
        await recordProductSearches(tx, now, 1);
        return { ok: true, search: { icon: icon!, brand } };
      });
      if (!opened.ok) return opened;
      if ("done" in opened) return { ok: true, ...opened.done };
      if ("lookUp" in opened) return { ok: true, lookUp: opened.lookUp };

      const { icon, brand } = opened.search;
      const running = await readRunningStyling(ctx.db, stylingId);
      const brandId = (await readBrandMatches(ctx.db, ctx.clock.now(), [brand.entityId])).get(brand.entityId);
      if (!brandId) throw new Error(`The product search doesn't know Brand ${brand.entityId}, or it hasn't been looked up.`);
      const { market, priceFilter } = await searchFilters(ctx.db, running, brand);
      let candidates: Candidate[] | null;
      try {
        const products = await ctx.productSearch.searchProducts({ brandId, category, line: icon.line, market, priceRange: priceFilter });
        candidates = qualifyingCandidates(products, { brandId, line: icon.line, priceFilter, officialSite: brand.officialSite });
      } catch (error) {
        // A refused key fails the Styling at once; any other error is the step's to retry first.
        if (!lastTry || error instanceof UnretryableProductSearchError) throw error;
        const outcome = category === "one_piece" ? "its Outfit is separates only" : "its Brand is out of play for the Category";
        console.warn(
          `A ${CATEGORY_LABELS[category]} search still failed after its retries, so ${outcome}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
        candidates = null;
      }
      const searched = await whileRunning(ctx.db, stylingId, async (tx) => {
        await tx
          .update(pieceCandidates)
          .set({ state: candidates ? "answered" : "unanswered", candidates, searchedAt: ctx.clock.now() })
          .where(
            and(
              eq(pieceCandidates.stylingId, stylingId),
              eq(pieceCandidates.styleIconId, icon.id),
              eq(pieceCandidates.category, category),
              eq(pieceCandidates.brandEntityId, brand.entityId),
              eq(pieceCandidates.state, "searching"),
            ),
          );
        return readBrandState(tx, ctx.clock, { stylingId, ...(await readBuilding(tx, stylingId)) });
      });
      // Brands are never put out of play for a product search that's down, every search the
      // Styling has set going having failed, none answering or still under way: it breaks instead,
      // for Try again.
      if (searched.searches.every((search) => search.state === "unanswered")) throw new ProductSearchDownError(stylingId);
      return { ok: true, ...searchedFor(asked, brand, searchFor(searched, icon, category, brand)!, searched) };
    },
  };
}

/** What opening a Piece's search came to: a search to send, one made already, a Brand to look up first, or a refusal. */
type OpenedSearch =
  | StylistStepResult<{ search: { icon: ListedStyleIcon; brand: QlooBrand } }>
  | { ok: true; done: ProductsSearched }
  | { ok: true; lookUp: BrandToLookUp };

/** The searches a Styling has made, each by its Style Icon, Category and Brand, with what it found. */
export interface PieceSearchMade {
  styleIconId: string;
  category: ProductCategory;
  brandEntityId: string;
  state: PieceSearchState;
  /** The Products that qualified, once it has answered. */
  candidates: Candidate[] | null;
  /** When it was set going, then when it answered. */
  searchedAt: Date;
}

/**
 * What a body photo's Styling has fetched, looked up, searched and built so far, which decides the
 * Brands still in play: each Style Icon's fetched Brands, which of them the product search knows,
 * its searches, and the Brands its Outfits use, with those it builds beside.
 */
export interface BrandState {
  budgetTier: BudgetTier;
  /** The Style Icon list it builds from, in Qloo's order. */
  list: ListedStyleIcon[];
  /** The Brands fetched for each Style Icon, by its ID: null while its Brand call is under way. */
  pools: Map<string, QlooBrand[] | null>;
  /** What the product search said lately of each fetched Brand. */
  matches: BrandMatches;
  searches: PieceSearchMade[];
  /** The Brands each Category's Outfits use: those it builds beside, as "Show 2 more Outfits" does, and its own. */
  built: UsedBrands;
}

/** A running Styling's Brand state, as `BrandState` describes it. */
export async function readBrandState(
  db: Database | Transaction,
  clock: Clock,
  { stylingId, kind, consultationId, budgetTier }: { stylingId: string; kind: StylingKind; consultationId: string; budgetTier: BudgetTier | null },
): Promise<BrandState> {
  const beside = await readBuildingBeside(db, { stylingId, kind, consultationId });
  const [list, fetched, made, searches] = await Promise.all([
    readStyleIconList(db, beside.styleIconList),
    db.select({ styleIconId: styleIconBrands.styleIconId, brands: styleIconBrands.brands }).from(styleIconBrands).where(eq(styleIconBrands.stylingId, stylingId)),
    db
      .select({ top: outfit.topBrandEntityId, bottom: outfit.bottomBrandEntityId, shoes: outfit.shoesBrandEntityId })
      .from(outfit)
      .where(eq(outfit.stylingId, stylingId)),
    db
      .select({
        styleIconId: pieceCandidates.styleIconId,
        category: pieceCandidates.category,
        brandEntityId: pieceCandidates.brandEntityId,
        state: pieceCandidates.state,
        candidates: pieceCandidates.candidates,
        searchedAt: pieceCandidates.searchedAt,
      })
      .from(pieceCandidates)
      .where(eq(pieceCandidates.stylingId, stylingId))
      .orderBy(asc(pieceCandidates.searchedAt)),
  ]);
  const pools = new Map(fetched.map(({ styleIconId, brands }) => [styleIconId, brands]));
  const fetchedBrands = [...pools.values()].flatMap((brands) => brands ?? []);
  return {
    budgetTier: brandsBudgetTier(stylingId, budgetTier),
    list,
    pools,
    matches: await readBrandMatches(db, clock.now(), fetchedBrands.map(({ entityId }) => entityId)),
    searches: searches.flatMap(({ category, ...search }) => (category === "hairstyle" ? [] : [{ ...search, category }])),
    built: brandsUsedBy([...beside.outfits, ...made]),
  };
}

/** A Style Icon's lists of the Brands from its Brand call, less those the product search doesn't know. */
export function listsOf(state: BrandState, icon: ListedStyleIcon): BrandLists<QlooBrand> {
  return brandLists(state.pools.get(icon.id) ?? [], icon.line, state.budgetTier, state.matches);
}

/** The search the Styling made for a Style Icon's Piece in one Category on one Brand, if it has. */
export function searchFor(state: BrandState, icon: ListedStyleIcon, category: ProductCategory, brand: QlooBrand): PieceSearchMade | undefined {
  return state.searches.find((search) => search.styleIconId === icon.id && search.category === category && search.brandEntityId === brand.entityId);
}

/** Why a Brand can't be a Category's, as it's out of play there, or null when it's still in play. */
export function outOfPlayRefusal(state: BrandState, category: BrandCategory, brand: QlooBrand): string | null {
  const label = CATEGORY_LABELS[category];
  if (state.built[category].has(brand.entityId)) return `${brand.name} is already another Outfit's ${label}: no Brand repeats within a Category.`;
  if (droppedFrom(state, category).has(brand.entityId)) return `${brand.name} is out of ${label}s for the rest of this Styling: its search found none.`;
  return null;
}

/**
 * Whether a Brand is still in play for a Category: not used in it by an Outfit already built, and
 * not out of it because its search there found nothing or never answered (ADR-0008).
 */
function inPlayIn(state: BrandState): (category: BrandCategory, brand: QlooBrand) => boolean {
  const dropped = { top: droppedFrom(state, "top"), bottom: droppedFrom(state, "bottom"), shoes: droppedFrom(state, "shoes") };
  return (category, brand) => !state.built[category].has(brand.entityId) && !dropped[category].has(brand.entityId);
}

/** A Style Icon's Outfit's Brands: each Category's first Brand still in play, or null when it can't complete one. */
export function firstInPlay(state: BrandState, icon: ListedStyleIcon): Record<BrandCategory, QlooBrand> | null {
  return firstBrandsInPlay(listsOf(state, icon), inPlayIn(state), (a, b) => a.entityId === b.entityId);
}

/** The Brands out of a Category for the rest of the Styling: those whose search in it found none or never answered. */
function droppedFrom(state: BrandState, category: BrandCategory): Set<string> {
  return new Set(
    state.searches.flatMap((search) =>
      search.category === category && (search.state === "unanswered" || (search.state === "answered" && search.candidates?.length === 0))
        ? [search.brandEntityId]
        : [],
    ),
  );
}

/** A candidate Product as the Stylist reads it: one line of its id, title, description and colours, never its photo or offer. */
function candidateLine({ id, title, description, colours }: Candidate): string {
  const about = [`id: ${id}`, `title: ${oneLine(title)}`];
  if (description) about.push(`description: ${oneLine(description)}`);
  if (colours.length > 0) about.push(`colours: ${colours.join(", ")}`);
  return about.join(" | ");
}

/** Text from a seller, its line breaks and runs of spaces made single spaces. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** What a search was for, as the Stylist asked for it. */
function askedFor(asked: { styleIcon: number; category: SearchCategory }, brand: QlooBrand): Pick<ProductsSearched, "styleIcon" | "category" | "brand"> {
  return { styleIcon: asked.styleIcon, category: asked.category, brand: brand.name };
}

/** What a search that has answered, or never will, gives the Stylist. */
function searchedFor(asked: { styleIcon: number; category: SearchCategory }, brand: QlooBrand, made: PieceSearchMade, state: BrandState): ProductsSearched {
  const candidates = (made.candidates ?? []).map(candidateLine);
  const left = searchesLeft(state.searches.length);
  // A One-Piece search puts no Brand out of play: an Outfit whose Top Brand has none is separates only.
  if (candidates.length > 0 || made.category === "one_piece") return { ...askedFor(asked, brand), candidates, searchesLeft: left };
  return { ...askedFor(asked, brand), candidates, out: "this Category", searchesLeft: left };
}

/** How many more searches a Styling that has made `searchesMade` may make. */
function searchesLeft(searchesMade: number): number {
  return Math.max(MAX_PRODUCT_SEARCHES_PER_STYLING - searchesMade, 0);
}

/** A search's market and price filter: the Styling's market, and the Brand's price range in its currency. Throws when no rate is stored. */
async function searchFilters(db: Database | Transaction, running: Parameters<typeof stylingMarket>[0], brand: QlooBrand) {
  const market = stylingMarket(running);
  const priceFilter = searchPriceFilter(brand, market, await readExchangeRates(db, [PRODUCT_SEARCH_MARKET_CURRENCIES[market]]));
  return { market, priceFilter };
}

/** What a body photo's tools check the Styling against: where it is, its kind, its Budget Tier, its market and the photo's Categories. */
export async function readBuilding(tx: Transaction, stylingId: string) {
  const [row] = await tx
    .select({
      stage: styling.stage,
      kind: styling.kind,
      budgetTier: styling.budgetTier,
      market: styling.market,
      productSearches: styling.productSearches,
      countryCode: consultation.countryCode,
      consultationId: styling.consultationId,
      photoType: consultation.photoType,
      hairCovered: consultation.hairCovered,
    })
    .from(styling)
    .innerJoin(consultation, eq(consultation.id, styling.consultationId))
    .where(eq(styling.id, stylingId));
  if (!row) throw new StylingNotRunningError(stylingId);
  const beside = await readBuildingBeside(tx, { stylingId, kind: row.kind, consultationId: row.consultationId });
  return { ...row, styleIconList: beside.styleIconList };
}

/** Why a body photo's Brands and Products can't be fetched or searched for now, or null when they can. */
function buildingRefusal({ stage, photoType, hairCovered }: Awaited<ReturnType<typeof readBuilding>>): string | null {
  if (!needsBrands(outfitCategories({ photoType, hairCovered }))) return "A Face Photo's Outfits are a Hairstyle alone, with no Brands or Products.";
  if (stage === "style_icons") return "Find this Styling's Style Icons first, with findStyleIcons.";
  if (stage === "previews") return "You've started the Previews, so no more Outfits can be built.";
  return null;
}

/** Why the Style Icon with this number can't inspire an Outfit, or null when it can. */
function styleIconRefusal(icon: ListedStyleIcon | undefined, number: number): string | null {
  if (!icon) return `There's no Style Icon ${number} on your list.`;
  if (icon.status === "used") return `${icon.name} has already inspired an Outfit.`;
  if (icon.status === "skipped") return `${icon.name} has been passed over.`;
  return null;
}

