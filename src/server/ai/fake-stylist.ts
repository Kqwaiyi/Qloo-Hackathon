import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultOutput,
} from "@ai-sdk/provider";
import { createHash } from "node:crypto";

import { BRAND_CATEGORIES, type BrandCategory, CATEGORY_LABELS, inASentence, type PhotoStyleWords, photoStyleText, type ProductCategory } from "@/config/consultations";
import {
  MAX_BRAND_FETCHES_PER_STYLING,
  MAX_PRODUCT_SEARCHES_PER_STYLING,
  PRODUCT_CALLS_AT_ONCE,
  QLOO_CALLS_AT_ONCE,
  TOP_BRANDS_PER_CATEGORY,
} from "@/config/stylings";
import { type BrandLists, firstBrandsInPlay } from "@/server/outfit-assembly/brands";
import type {
  BrandsFetched,
  FoundStyleIcons,
  ProductsSearched,
  RenderPreviewInput,
  SavedOutfit,
  SaveOutfitInput,
  SearchCategory,
  SearchProductsInput,
  StyleIconPassedOver,
} from "@/server/stylings/stylist";
import { readStylistBrief, type StylistBrief, type StylistStyleIcon } from "@/server/stylings/stylist-brief";

// The fake AI's Stylist: a scripted fake model the Workflow agent calls in place of Claude. It
// keeps nothing between turns: each turn it reads the conversation it's sent, as a real model
// would, and plays the turn its scenario says, unless a test scripts that turn itself.

/** An image the fake was sent, by its fingerprint: the fake never keeps one. */
export interface FakeImage {
  mediaType: string;
  sha256: string;
}

/** One tool call the Stylist made in an earlier turn, and what came back: its output, or the error it read. */
export interface FakeStylistToolResult {
  toolName: string;
  input: unknown;
  output: unknown;
  /** The error the tool gave instead of an output, such as a refusal, or null. */
  error: string | null;
}

/** One turn the fake was asked for: what it was sent. */
export interface FakeStylistRequest {
  /** The turn's number, from 1. */
  turn: number;
  /** The Stylist's prompt, as the conversation's system messages give it. */
  instructions: string;
  /** The brief in the conversation's first message, or null when there's none. */
  brief: StylistBrief | null;
  /** Every image in the conversation, in order. */
  images: FakeImage[];
  /** The tools offered this turn, by name. */
  tools: string[];
  /** Every earlier tool call and what came back, in order. */
  toolResults: FakeStylistToolResult[];
}

/** One tool call the fake makes. */
export interface FakeStylistCall {
  tool: string;
  input: unknown;
}

/**
 * What the fake does with a turn: call some tools, at once, after writing any text, its notes to the
 * user; write text and stop; or refuse the turn, as Claude can.
 */
export type FakeStylistTurn = { calls: FakeStylistCall[]; text?: string } | { text: string } | { refused: true };

/** How the fake plays the Stylist for one Style Icon's Outfit: making the fixed pipeline's choices, or one of its scenarios. */
export type FakeStylistScenario = "pass" | "one-piece" | "unknown-cut" | "tailoring-fails" | "passed-over" | "second-brand";

/** A Style Icon the fake picks a scenario for: by its name, and whether it's the first the Styling may use. */
export interface FakeScenarioStyleIcon {
  name: string;
  first: boolean;
}

/**
 * A first Styling of a body photo fetches the Brands of this many Style Icons at once before its
 * first Outfits, as the fixed pipeline did: one spare in case a Style Icon can't complete an Outfit.
 * Later fetches, and other kinds of Styling, fetch as needed.
 */
const BRAND_FETCHES_UP_FRONT = 3;

/** A fake model whose every turn is what `play` makes of what it was sent. */
export function fakeStylistModel(play: (request: FakeStylistRequest) => Promise<FakeStylistTurn>): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "fake",
    modelId: "fake-stylist",
    supportedUrls: {},
    async doGenerate(options) {
      const request = requestOf(options);
      return resultOf(request.turn, await play(request));
    },
    async doStream() {
      throw new Error("The fake Stylist only answers whole turns.");
    },
  };
}

/**
 * The turn the fake plays by default, which makes the fixed pipeline's choices: it finds Style
 * Icons when it's offered the tool, saves an Outfit for each of the Style Icons in Qloo's order until
 * it has made as many as its brief allows, starts the Previews, draws each saved Outfit's, then
 * finishes. Every Hairstyle is the fake's own (`fakeHairstyle`). A body photo's Outfits are built on
 * Brands first, as `bodyPhotoCalls` plays them. How it plays each Style Icon's Outfit is
 * `scenarioFor` the Style Icon:
 * - `one-piece`: the Top Brand's first One-Piece in place of the Top and Bottom, when it has any.
 * - `unknown-cut`: the Hairstyle's cut is marked unknown, based on the Photo Style, and its `why`
 *   doesn't name the Style Icon.
 * - `tailoring-fails`: every Outfit it saves breaks a rule, a different one each turn, so it keeps
 *   saving until the turn cap.
 * - `passed-over`: it passes over the Style Icon, saying why, in place of its Outfit: for a body
 *   photo, once it has fetched its Brands.
 * - `second-brand`: each Category's second Brand still in play, where it has one, not its first.
 *
 * Each turn, before its tool calls, it writes a note to the user on what they're for, one line for
 * each kind of tool it calls (`fakeNotes`).
 */
export function fakeStylistTurn(request: FakeStylistRequest, scenarioFor: (styleIcon: FakeScenarioStyleIcon) => FakeStylistScenario): FakeStylistTurn {
  const calls = fakeStylistCalls(request, scenarioFor);
  return { calls, text: fakeNotes(request, calls) };
}

/** How the fake plays the Stylist for a Style Icon's Outfit. */
type ScenarioOf = (styleIcon: StylistStyleIcon) => FakeStylistScenario;

function fakeStylistCalls(request: FakeStylistRequest, scenarioFor: (styleIcon: FakeScenarioStyleIcon) => FakeStylistScenario): FakeStylistCall[] {
  if (request.tools.includes("findStyleIcons") && succeeded(request, "findStyleIcons").length === 0) return [{ tool: "findStyleIcons", input: {} }];
  const saved = succeeded(request, "saveOutfit");
  if (succeeded(request, "startPreviews").length === 0) {
    const styleIcons = styleIconsOf(request);
    const scenarioOf: ScenarioOf = (icon) => scenarioFor({ name: icon.name, first: icon.number === styleIcons[0]?.number });
    const building = request.tools.includes("fetchBrands") ? bodyPhotoCalls(request, styleIcons, scenarioOf) : hairstyleSaves(request, styleIcons, scenarioOf);
    if (building.length > 0) return building;
    return [{ tool: saved.length > 0 ? "startPreviews" : "finish", input: {} }];
  }
  const drawn = new Set(succeeded(request, "renderPreview").map((result) => (result.input as RenderPreviewInput).outfit));
  const toDraw = saved.map((result) => (result.output as SavedOutfit).outfit).filter((outfit) => !drawn.has(outfit));
  if (toDraw.length > 0) return toDraw.map((outfit) => ({ tool: "renderPreview", input: { outfit } }));
  return [{ tool: "finish", input: {} }];
}

/** The Style Icons the Stylist builds from: those it found, or its brief's. */
function styleIconsOf(request: FakeStylistRequest): readonly StylistStyleIcon[] {
  const found = succeeded(request, "findStyleIcons").at(-1)?.output as FoundStyleIcons | undefined;
  return found?.styleIcons ?? request.brief?.styleIcons ?? [];
}

/** The fake's notes to the user for a turn of these calls: a line on each kind of tool it calls, in the order it first calls them. */
function fakeNotes(request: FakeStylistRequest, calls: readonly FakeStylistCall[]): string {
  const style = photoStyleText(request.brief?.photoStyle ?? ["casual"]);
  const nameOf = new Map(styleIconsOf(request).map((icon) => [icon.number, icon.name]));
  // Only the fake's own calls: a broken save may leave out its Style Icon.
  const inputsOf = <T>(tool: string) => calls.flatMap((call) => (call.tool === tool ? [call.input as Partial<T>] : []));
  const styleIconNames = (tool: "fetchBrands" | "passOverStyleIcon" | "saveOutfit") =>
    inputsOf<{ styleIcon: number }>(tool).flatMap(({ styleIcon }) => (styleIcon === undefined ? [] : (nameOf.get(styleIcon) ?? [])));
  const note = (tool: string): string | null => {
    switch (tool) {
      case "findStyleIcons":
        return `I'll ask Qloo for Style Icons in tune with your ${style} Photo Style.`;
      case "fetchBrands":
        return `I'll look at the Brands that fans of ${inASentence(styleIconNames(tool))} favour.`;
      case "passOverStyleIcon": {
        const names = styleIconNames(tool);
        return `I'll pass over ${inASentence(names)}, and go on to the next ${names.length === 1 ? "Style Icon" : "Style Icons"}.`;
      }
      case "searchProducts":
        return `I'll look for Products from ${inASentence([...new Set(inputsOf<SearchProductsInput>(tool).flatMap(({ brand }) => brand ?? []))])} that go together.`;
      case "saveOutfit": {
        const names = styleIconNames(tool);
        if (names.length === 0) return "I'm saving your next Outfit.";
        return names.length === 1
          ? `I'm saving an Outfit inspired by ${names[0]}, whose style suits your ${style} Photo Style.`
          : `I'm saving Outfits inspired by ${inASentence(names)}, whose styles suit your ${style} Photo Style.`;
      }
      case "startPreviews":
        return "That's every Outfit for this Styling, so next come the Previews.";
      case "renderPreview": {
        const outfits = inputsOf<RenderPreviewInput>(tool).flatMap(({ outfit }) => (outfit === undefined ? [] : [String(outfit)]));
        return outfits.length === 1 ? `I'm drawing the Preview of Outfit ${outfits[0]}.` : `I'm drawing the Previews of Outfits ${inASentence(outfits)}.`;
      }
      case "finish":
        return succeeded(request, "saveOutfit").length > 0 ? "Your Outfits are ready." : "I couldn't make an Outfit for you this time.";
      default:
        return null;
    }
  };
  return [...new Set(calls.map((call) => call.tool))].flatMap((tool) => note(tool) ?? []).join("\n");
}

/** Passing over a Style Icon, with the fake's reason: about its signature cut, or for a body photo, its Brands. */
function passOverCall(request: FakeStylistRequest, icon: StylistStyleIcon): FakeStylistCall {
  const style = photoStyleText(request.brief?.photoStyle ?? ["casual"]);
  const reason = request.tools.includes("fetchBrands")
    ? `The Brands ${icon.name}'s fans favour don't go with your ${style} Photo Style.`
    : `${icon.name}'s signature cut doesn't go with your ${style} Photo Style.`;
  return { tool: "passOverStyleIcon", input: { styleIcon: icon.number, reason } };
}

/** The numbers of the Style Icons the Stylist has passed over with passOverStyleIcon. */
function styleIconsPassedOver(request: FakeStylistRequest): Set<number> {
  return new Set(succeeded(request, "passOverStyleIcon").map((result) => (result.output as StyleIconPassedOver).styleIcon));
}

/** The tool calls of this name that came back with an output, in order. */
function succeeded(request: FakeStylistRequest, toolName: string): FakeStylistToolResult[] {
  return request.toolResults.filter((result) => result.toolName === toolName && result.error === null);
}

/**
 * A Face Photo's turn: saving an Outfit, a Hairstyle alone, for each next Style Icon, as many as the
 * brief allows, unless a turn of its own passes over one of them first.
 */
function hairstyleSaves(request: FakeStylistRequest, styleIcons: readonly StylistStyleIcon[], scenarioOf: ScenarioOf): FakeStylistCall[] {
  const saved = succeeded(request, "saveOutfit");
  const savedFor = new Set(saved.map((result) => (result.input as SaveOutfitInput).styleIcon));
  const passedOver = styleIconsPassedOver(request);
  const wanted = Math.max((request.brief?.outfits ?? 0) - saved.length, 0);
  const toPassOver: StylistStyleIcon[] = [];
  const toSave: StylistStyleIcon[] = [];
  for (const icon of styleIcons.filter(({ number }) => !savedFor.has(number) && !passedOver.has(number))) {
    if (toSave.length >= wanted) break;
    (scenarioOf(icon) === "passed-over" ? toPassOver : toSave).push(icon);
  }
  if (toPassOver.length > 0) return toPassOver.map((icon) => passOverCall(request, icon));
  const photoStyle = request.brief?.photoStyle ?? ["casual"];
  return toSave.map((icon) => {
    const scenario = scenarioOf(icon);
    const outfit: SaveOutfitInput = { styleIcon: icon.number, hairstyle: savedHairstyle(icon, photoStyle, scenario) };
    return { tool: "saveOutfit", input: scenario === "tailoring-fails" ? BROKEN_OUTFITS[request.turn % BROKEN_OUTFITS.length]!(outfit) : outfit };
  });
}

/**
 * A body photo's turn, as the fixed pipeline built its Outfits: Style Icons in Qloo's order, each
 * Outfit's Brands each Category's first still in play (`picksFrom`), fixed before the next Outfit's,
 * so no Brand repeats within a Category. A first Styling fetches the Brands of 3 Style Icons up
 * front, any other as many as it still needs Outfits, one turn's fetches at most as many as Qloo's
 * calls at once. Then each planned Outfit's Top, Bottom and Shoes are searched for, as many at once
 * as the product search's calls, then once they're all found, each one's One-Pieces on its Top
 * Brand. A Brand whose search finds none is out of that Category, and the plan changes around it.
 * Once every planned Outfit's Brands are found, or the Styling has made all its searches, the
 * Outfits found are saved, each Piece its search's first Product. None once it's saved all it can.
 * A Style Icon to pass over is passed over in a turn of its own, once its Brands are fetched.
 */
function bodyPhotoCalls(request: FakeStylistRequest, styleIcons: readonly StylistStyleIcon[], scenarioOf: ScenarioOf): FakeStylistCall[] {
  const brief = request.brief;
  const saved = succeeded(request, "saveOutfit").map((result) => result.input as SaveOutfitInput);
  const wanted = (brief?.outfits ?? 0) - saved.length;
  if (wanted <= 0) return [];
  const fetches = succeeded(request, "fetchBrands").map((result) => result.output as BrandsFetched);
  const fetched = new Map(fetches.map((brands) => [brands.styleIcon, brands]));
  const searches = succeeded(request, "searchProducts").map((result) => result.output as ProductsSearched);
  const unknown = new Set(searches.flatMap((search) => (search.out === "every Category" ? [search.brand] : [])));
  // Out of play for each Category: the Brands the Outfits saved use, and those whose search found none.
  const outOfPlay = (category: BrandCategory) => [
    ...saved.flatMap((outfit) => outfit.brands?.[category] ?? []),
    ...searches.flatMap((search) => (search.category === category && search.out === "this Category" ? [search.brand] : [])),
  ];
  const savedFor = new Set(saved.map((outfit) => outfit.styleIcon));
  const passedOver = styleIconsPassedOver(request);
  const left = styleIcons.filter((icon) => !savedFor.has(icon.number) && !passedOver.has(icon.number) && !isPassedOver(fetched.get(icon.number)));
  const taken = { top: new Set(outOfPlay("top")), bottom: new Set(outOfPlay("bottom")), shoes: new Set(outOfPlay("shoes")) };
  const planned: { icon: StylistStyleIcon; brands: Record<BrandCategory, string> }[] = [];
  // Style Icons are planned in order, so one whose Brands haven't come back holds up the rest, as
  // does one whose top Brands, as fetchBrands last listed them, no longer settle its picks. Those
  // are fetched again, free, once Brands have gone out of play since, or the Outfits planned before
  // it are what took them, and they're saved.
  let holdUp: { at: number; fetchAgain: boolean } | null = null;
  const toPassOver: StylistStyleIcon[] = [];
  for (const [at, icon] of left.entries()) {
    if (planned.length >= wanted) break;
    const brands = fetched.get(icon.number);
    if (!brands) {
      holdUp = { at, fetchAgain: false };
      break;
    }
    const scenario = scenarioOf(icon);
    if (scenario === "passed-over") {
      toPassOver.push(icon);
      continue;
    }
    const picks = picksFrom(brands, unknown, (category, brand) => !taken[category].has(brand), scenario === "second-brand" ? secondBrandsInPlay : firstBrandsInPlay);
    if (picks === "unsure") {
      holdUp = { at, fetchAgain: planned.length === 0 || outOfPlaySince(request, icon.number) };
      break;
    }
    if (!picks) continue;
    planned.push({ icon, brands: picks });
    for (const category of BRAND_CATEGORIES) taken[category].add(picks[category]);
  }
  if (toPassOver.length > 0) return toPassOver.map((icon) => passOverCall(request, icon));
  const searchOf = (icon: StylistStyleIcon, category: SearchCategory, brand: string) =>
    searches.find((search) => search.styleIcon === icon.number && search.category === category && search.brand === brand);
  type Search = [StylistStyleIcon, SearchCategory, string];
  const notSearched = ([icon, category, brand]: Search) => !searchOf(icon, category, brand);
  const separates = planned.flatMap(({ icon, brands }) => BRAND_CATEGORIES.map((category): Search => [icon, category, brands[category]])).filter(notSearched);
  // A One-Piece's search moves no Brand, so it waits until no search can move one: none of the
  // planned Outfits' separates, nor those of a Style Icon to plan again once it's fetched again.
  const toSearch =
    separates.length > 0 || holdUp?.fetchAgain ? separates : planned.map(({ icon, brands }): Search => [icon, "onePiece", brands.top]).filter(notSearched);
  const searchesLeft = Math.min(MAX_PRODUCT_SEARCHES_PER_STYLING, ...searches.map((search) => search.searchesLeft));
  if (searchesLeft > 0) {
    const stillWanted = wanted - planned.length;
    const fetchesLeft = Math.min(MAX_BRAND_FETCHES_PER_STYLING, ...fetches.map((brands) => brands.fetchesLeft));
    const upFront = fetched.size === 0 && brief?.styling === "First Styling";
    const fetchCount = stillWanted <= 0 ? 0 : Math.min(upFront ? BRAND_FETCHES_UP_FRONT : stillWanted, fetchesLeft, QLOO_CALLS_AT_ONCE);
    let toFetch: readonly StylistStyleIcon[] = [];
    if (holdUp && stillWanted > 0) {
      const heldUp = left[holdUp.at]!;
      if (!fetched.has(heldUp.number)) toFetch = left.slice(holdUp.at, holdUp.at + Math.max(fetchCount, 0));
      else if (holdUp.fetchAgain) toFetch = [heldUp];
    }
    const calls = [
      ...toFetch.map((icon) => ({ tool: "fetchBrands", input: { styleIcon: icon.number } })),
      ...toSearch
        .slice(0, Math.min(PRODUCT_CALLS_AT_ONCE, searchesLeft))
        .map(([icon, category, brand]) => ({ tool: "searchProducts", input: { styleIcon: icon.number, category, brand } })),
    ];
    if (calls.length > 0) return calls;
  }
  const photoStyle = brief?.photoStyle ?? ["casual"];
  const withHairstyle = brief?.pieces.includes(CATEGORY_LABELS.hairstyle) ?? false;
  return planned
    .filter(({ icon, brands }) => BRAND_CATEGORIES.every((category) => searchOf(icon, category, brands[category])?.candidates.length))
    .map(({ icon, brands }) => {
      const scenario = scenarioOf(icon);
      const piece = (category: SearchCategory, pieceCategory: ProductCategory, brand: string) => ({
        product: candidateId(searchOf(icon, category, brand)!.candidates[0]!),
        why: fakeWhy(pieceCategory, icon.name, photoStyle),
      });
      const onePieces = searchOf(icon, "onePiece", brands.top)?.candidates ?? [];
      const outfit: SaveOutfitInput = {
        styleIcon: icon.number,
        ...(withHairstyle && { hairstyle: savedHairstyle(icon, photoStyle, scenario) }),
        brands,
        ...(scenario === "one-piece" && onePieces.length > 0
          ? { onePiece: piece("onePiece", "one_piece", brands.top) }
          : { top: piece("top", "top", brands.top), bottom: piece("bottom", "bottom", brands.bottom) }),
        shoes: piece("shoes", "shoes", brands.shoes),
      };
      return { tool: "saveOutfit", input: scenario === "tailoring-fails" ? BROKEN_BODY_OUTFITS[request.turn % BROKEN_BODY_OUTFITS.length]!(outfit) : outfit };
    });
}

function isPassedOver(fetched: BrandsFetched | undefined): boolean {
  return fetched !== undefined && "passedOver" in fetched;
}

/** Stands for a Brand the fake hasn't been shown, beyond the top few a cut-short list gives. */
const BEYOND_THE_TOP = "\u0000 a Brand beyond the top";

/** How the fake picks an Outfit's Brands from a Style Icon's lists, by `firstBrandsInPlay`'s rules. */
type BrandPicker = (lists: BrandLists<string>, inPlay: (category: BrandCategory, brand: string) => boolean) => Record<BrandCategory, string> | null;

/**
 * A Style Icon's Outfit's Brands as `pick` picks them from its top Brands, as fetchBrands last
 * listed them, less those `inPlay` says are out of play since; or null when they can't complete an
 * Outfit. A list fetchBrands cut short at the top few may have more beyond it: when one beyond would
 * change the picks, they're "unsure", and the Style Icon's Brands are to be fetched again as they
 * now stand.
 */
function picksFrom(
  fetched: BrandsFetched,
  unknown: ReadonlySet<string>,
  inPlay: (category: BrandCategory, brand: string) => boolean,
  pick: BrandPicker,
): Record<BrandCategory, string> | null | "unsure" {
  const lists = fetchedLists(fetched, unknown);
  const picks = pick(lists, inPlay);
  const shown = "passedOver" in fetched ? null : fetched.brands;
  const withMore = (category: BrandCategory) =>
    shown && shown[category].length >= TOP_BRANDS_PER_CATEGORY ? [...lists[category], `${BEYOND_THE_TOP} ${category}`] : lists[category];
  const ifMore = pick({ ...lists, shoes: withMore("shoes"), top: withMore("top"), bottom: withMore("bottom") }, inPlay);
  return BRAND_CATEGORIES.every((category) => picks?.[category] === ifMore?.[category]) ? picks : "unsure";
}

/**
 * An Outfit's Brands as `firstBrandsInPlay` picks them, but from each Category's second Brand in play
 * on, its first coming last: so its second where it has one, ignoring the Bottom's preference for denim.
 */
function secondBrandsInPlay(lists: BrandLists<string>, inPlay: (category: BrandCategory, brand: string) => boolean): Record<BrandCategory, string> | null {
  const firstLast = (category: BrandCategory) => {
    const first = lists[category].find((brand) => inPlay(category, brand));
    return first === undefined ? lists[category] : [...lists[category].filter((brand) => brand !== first), first];
  };
  return firstBrandsInPlay({ shoes: firstLast("shoes"), top: firstLast("top"), bottom: firstLast("bottom"), denimFirst: [] }, inPlay);
}

/** Whether a Brand has gone out of play since fetchBrands last listed this Style Icon's: used by a saved Outfit, or out of a Category. */
function outOfPlaySince(request: FakeStylistRequest, styleIcon: number): boolean {
  const results = request.toolResults;
  const fetchedAt = results.findLastIndex(
    (result) => result.toolName === "fetchBrands" && result.error === null && (result.output as BrandsFetched).styleIcon === styleIcon,
  );
  return results
    .slice(fetchedAt + 1)
    .some((result) => result.error === null && (result.toolName === "saveOutfit" || (result.toolName === "searchProducts" && (result.output as ProductsSearched).out)));
}

/** A fetched Style Icon's lists of Brands, by name, less those the product search turned out not to know. */
function fetchedLists(fetched: BrandsFetched, unknown: ReadonlySet<string>): BrandLists<string> {
  if ("passedOver" in fetched) return { shoes: [], top: [], bottom: [], denimFirst: [] };
  const known = (names: readonly string[]) => names.filter((name) => !unknown.has(name));
  const { shoes, top, bottom, denimFirst } = fetched.brands;
  return { shoes: known(shoes), top: known(top), bottom: known(bottom), denimFirst: known(denimFirst) };
}

/** A candidate's Product id, from its line as searchProducts gave it. */
function candidateId(line: string): string {
  return /^id: (.*?)(?: \| |$)/.exec(line)?.[1] ?? line;
}

/** The Hairstyle as the fake saves it for a Style Icon, as `fakeHairstyle` makes it. */
function savedHairstyle(icon: StylistStyleIcon, photoStyle: PhotoStyleWords, scenario: FakeStylistScenario): NonNullable<SaveOutfitInput["hairstyle"]> {
  const { item, details, why, unknownCut } = fakeHairstyle(icon.name, photoStyle, scenario !== "unknown-cut");
  return { cut: item, details, cutKnown: !unknownCut, why };
}

/** Ways a broken model's Face Photo Outfit breaks our rules, each made from a good one. */
const BROKEN_OUTFITS: ((outfit: SaveOutfitInput) => unknown)[] = [
  ({ hairstyle, ...outfit }) => ({ ...outfit, hairstyle: { ...hairstyle, why: `${hairstyle?.why} Yours for about $40.` } }),
  ({ hairstyle, ...outfit }) => ({ ...outfit, hairstyle: { ...hairstyle, why: " " } }),
  ({ hairstyle, ...outfit }) => ({ ...outfit, hairstyle: { ...hairstyle, cut: "" } }),
  ({ hairstyle, ...outfit }) => ({ ...outfit, hairstyle: { ...hairstyle, details: `${hairstyle?.details} About £25 at most salons.` } }),
  ({ styleIcon, hairstyle }) => ({ styleIcon, hairstyle: { ...hairstyle, details: undefined } }),
  ({ hairstyle }) => ({ hairstyle }),
];

/** Ways a broken model's body photo Outfit breaks our rules, each made from a good one. */
const BROKEN_BODY_OUTFITS: ((outfit: SaveOutfitInput) => unknown)[] = [
  ({ shoes, ...outfit }) => ({ ...outfit, shoes: { ...shoes, why: `${shoes?.why} Yours for about $40.` } }),
  ({ shoes, ...outfit }) => ({ ...outfit, shoes: { ...shoes, why: " " } }),
  ({ shoes, ...outfit }) => ({ ...outfit, shoes: { ...shoes, product: "not-a-candidate" } }),
  ({ shoes: _, ...outfit }) => outfit,
  (outfit) => ({ ...outfit, onePiece: outfit.top ?? outfit.onePiece }),
  ({ brands: _, ...outfit }) => outfit,
];

/** A Hairstyle as the fake makes it: the Style Icon's signature cut, or when the cut isn't known, one based on the Photo Style. */
export function fakeHairstyle(
  styleIconName: string,
  photoStyle: PhotoStyleWords,
  cutKnown: boolean,
): { item: string; details: string; why: string; unknownCut: boolean } {
  const style = photoStyle[0];
  const styleWords = photoStyle.join(" and ");
  return cutKnown
    ? {
        item: `${capitalised(style)} textured cut with soft layers`,
        details: `A ${style} textured cut with soft layers, a little shorter at the sides, in your own hair colour.`,
        why: `${styleIconName}'s signature cut, reworked so your current hair carries it with your ${styleWords} Photo Style.`,
        unknownCut: false,
      }
    : {
        item: `${capitalised(style)} soft layered cut`,
        details: `A ${style} soft layered cut, trimmed to shape from your current length, in your own hair colour.`,
        why: `A ${styleWords} cut picked to go with this Outfit, and easy to reach from the hair you have now.`,
        unknownCut: true,
      };
}

/** The fake's "why" for a Product Piece, naming the Style Icon. */
function fakeWhy(category: ProductCategory, styleIconName: string, photoStyle: PhotoStyleWords): string {
  return `${FAKE_WHY_OPENINGS[category]} in the spirit of ${styleIconName}, at home with your ${photoStyle.join(" and ")} Photo Style.`;
}

/** How the fake's "why" for each Product Piece begins. */
const FAKE_WHY_OPENINGS: Record<ProductCategory, string> = {
  top: "An easy top layer",
  bottom: "A grounding Bottom",
  one_piece: "A one-and-done One-Piece",
  shoes: "Shoes that finish the Outfit",
};

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** What a turn's call sends the model, as a test reads it. */
function requestOf({ prompt, tools = [] }: LanguageModelV4CallOptions): FakeStylistRequest {
  const firstText = prompt.flatMap((message) => (message.role === "user" ? message.content : [])).find((part) => part.type === "text");
  return {
    turn: prompt.filter((message) => message.role === "assistant").length + 1,
    instructions: prompt.flatMap((message) => (message.role === "system" ? [message.content] : [])).join("\n"),
    brief: firstText?.type === "text" ? readStylistBrief(firstText.text) : null,
    images: imagesIn(prompt),
    tools: tools.map((offered) => offered.name),
    toolResults: toolResultsIn(prompt),
  };
}

function imagesIn(prompt: LanguageModelV4Prompt): FakeImage[] {
  return prompt.flatMap((message) =>
    message.role === "user"
      ? message.content.flatMap((part) => {
          if (part.type !== "file" || part.data.type !== "data") return [];
          const bytes = typeof part.data.data === "string" ? Buffer.from(part.data.data, "base64") : part.data.data;
          return [{ mediaType: part.mediaType, sha256: createHash("sha256").update(bytes).digest("hex") }];
        })
      : [],
  );
}

function toolResultsIn(prompt: LanguageModelV4Prompt): FakeStylistToolResult[] {
  const calls = new Map<string, { toolName: string; input: unknown }>();
  const results: FakeStylistToolResult[] = [];
  for (const message of prompt) {
    if (message.role === "assistant") {
      for (const part of message.content) if (part.type === "tool-call") calls.set(part.toolCallId, { toolName: part.toolName, input: part.input });
    }
    if (message.role === "tool") {
      for (const part of message.content) {
        if (part.type !== "tool-result") continue;
        const call = calls.get(part.toolCallId);
        results.push({ toolName: part.toolName, input: call?.input, ...outputOf(part.output) });
      }
    }
  }
  return results;
}

function outputOf(output: LanguageModelV4ToolResultOutput): { output: unknown; error: string | null } {
  switch (output.type) {
    case "json":
      return { output: output.value, error: null };
    case "text":
      return { output: output.value, error: null };
    case "error-text":
      return { output: null, error: output.value };
    case "error-json":
      return { output: null, error: JSON.stringify(output.value) };
    case "execution-denied":
      return { output: null, error: output.reason ?? "denied" };
    case "content":
      return { output: output.value, error: null };
  }
}

/** The fake's turn as the model's result: its tool calls, its text, or its refusal, which comes back as Claude's does. */
function resultOf(turn: number, played: FakeStylistTurn): LanguageModelV4GenerateResult {
  const usage = { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } };
  if ("refused" in played) return { content: [], finishReason: { unified: "content-filter", raw: "refusal" }, usage, warnings: [] };
  if (!("calls" in played)) return { content: [{ type: "text", text: played.text }], finishReason: { unified: "stop", raw: "end_turn" }, usage, warnings: [] };
  return {
    content: [
      // Its notes come first, as Claude writes them before its tool calls.
      ...(played.text ? [{ type: "text" as const, text: played.text }] : []),
      ...played.calls.map(({ tool, input }, index) => ({
        type: "tool-call" as const,
        toolCallId: `turn-${turn}-call-${index + 1}`,
        toolName: tool,
        input: JSON.stringify(input),
      })),
    ],
    finishReason: { unified: "tool-calls", raw: "tool_use" },
    usage,
    warnings: [],
  };
}
