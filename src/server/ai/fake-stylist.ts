import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultOutput,
} from "@ai-sdk/provider";
import { createHash } from "node:crypto";

import { BRAND_CATEGORIES, type BrandCategory, CATEGORY_LABELS, type PhotoStyleWords, type ProductCategory } from "@/config/consultations";
import { MAX_BRAND_FETCHES_PER_STYLING, MAX_PRODUCT_SEARCHES_PER_STYLING, PRODUCT_CALLS_AT_ONCE, QLOO_CALLS_AT_ONCE } from "@/config/stylings";
import { type BrandLists, firstBrandsInPlay } from "@/server/outfit-assembly/brands";
import type {
  BrandsFetched,
  FoundStyleIcons,
  ProductsSearched,
  RenderPreviewInput,
  SavedOutfit,
  SaveOutfitInput,
  SearchCategory,
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

/** What the fake does with a turn: call some tools, at once, write text and stop, or refuse the turn, as Claude can. */
export type FakeStylistTurn = { calls: FakeStylistCall[] } | { text: string } | { refused: true };

/** How the fake plays the Stylist for one Style Icon's Outfit: making the fixed pipeline's choices, or one of its scenarios. */
export type FakeStylistScenario = "pass" | "one-piece" | "unknown-cut" | "tailoring-fails";

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
 * `scenarioFor` its name:
 * - `one-piece`: the Top Brand's first One-Piece in place of the Top and Bottom, when it has any.
 * - `unknown-cut`: the Hairstyle's cut is marked unknown, based on the Photo Style, and its `why`
 *   doesn't name the Style Icon.
 * - `tailoring-fails`: every Outfit it saves breaks a rule, a different one each turn, so it keeps
 *   saving until the turn cap.
 */
export function fakeStylistTurn(request: FakeStylistRequest, scenarioFor: (styleIconName: string) => FakeStylistScenario): FakeStylistTurn {
  if (request.tools.includes("findStyleIcons") && succeeded(request, "findStyleIcons").length === 0) return { calls: [{ tool: "findStyleIcons", input: {} }] };
  const saved = succeeded(request, "saveOutfit");
  if (succeeded(request, "startPreviews").length === 0) {
    const found = succeeded(request, "findStyleIcons").at(-1)?.output as FoundStyleIcons | undefined;
    const styleIcons = found?.styleIcons ?? request.brief?.styleIcons ?? [];
    const building = request.tools.includes("fetchBrands") ? bodyPhotoCalls(request, styleIcons, scenarioFor) : hairstyleSaves(request, styleIcons, scenarioFor);
    if (building.length > 0) return { calls: building };
    return { calls: [{ tool: saved.length > 0 ? "startPreviews" : "finish", input: {} }] };
  }
  const drawn = new Set(succeeded(request, "renderPreview").map((result) => (result.input as RenderPreviewInput).outfit));
  const toDraw = saved.map((result) => (result.output as SavedOutfit).outfit).filter((outfit) => !drawn.has(outfit));
  if (toDraw.length > 0) return { calls: toDraw.map((outfit) => ({ tool: "renderPreview", input: { outfit } })) };
  return { calls: [{ tool: "finish", input: {} }] };
}

/** The tool calls of this name that came back with an output, in order. */
function succeeded(request: FakeStylistRequest, toolName: string): FakeStylistToolResult[] {
  return request.toolResults.filter((result) => result.toolName === toolName && result.error === null);
}

/** A Face Photo's turn: saving an Outfit, a Hairstyle alone, for each next Style Icon, as many as the brief allows. */
function hairstyleSaves(request: FakeStylistRequest, styleIcons: readonly StylistStyleIcon[], scenarioFor: (styleIconName: string) => FakeStylistScenario): FakeStylistCall[] {
  const saved = succeeded(request, "saveOutfit");
  const savedFor = new Set(saved.map((result) => (result.input as SaveOutfitInput).styleIcon));
  const toSave = styleIcons.filter((icon) => !savedFor.has(icon.number)).slice(0, Math.max((request.brief?.outfits ?? 0) - saved.length, 0));
  const photoStyle = request.brief?.photoStyle ?? ["casual"];
  return toSave.map((icon) => {
    const scenario = scenarioFor(icon.name);
    const outfit: SaveOutfitInput = { styleIcon: icon.number, hairstyle: savedHairstyle(icon, photoStyle, scenario) };
    return { tool: "saveOutfit", input: scenario === "tailoring-fails" ? BROKEN_OUTFITS[request.turn % BROKEN_OUTFITS.length]!(outfit) : outfit };
  });
}

/**
 * A body photo's turn, as the fixed pipeline built its Outfits: Style Icons in Qloo's order, each
 * Outfit's Brands each Category's first still in play, fixed before the next Outfit's, so no Brand
 * repeats within a Category. A first Styling fetches the Brands of 3 Style Icons up front, any other
 * as many as it still needs Outfits, one turn's fetches at most as many as Qloo's calls at once.
 * Then each planned Outfit's Top, Bottom and Shoes are searched for, as many at once as the product
 * search's calls, then once they're all found, each one's One-Pieces on its Top Brand. A Brand whose
 * search finds none is out of that Category, and the plan changes around it. Once every planned
 * Outfit's Brands are found, or the Styling has made all its searches, the Outfits found are saved,
 * each Piece its search's first Product. None once it's saved all it can.
 */
function bodyPhotoCalls(request: FakeStylistRequest, styleIcons: readonly StylistStyleIcon[], scenarioFor: (styleIconName: string) => FakeStylistScenario): FakeStylistCall[] {
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
  const left = styleIcons.filter((icon) => !savedFor.has(icon.number) && !isPassedOver(fetched.get(icon.number)));
  // Style Icons are planned in order, so one whose Brands haven't come back holds up the rest.
  const firstUnfetched = left.findIndex((icon) => !fetched.has(icon.number));
  const ready = firstUnfetched === -1 ? left : left.slice(0, firstUnfetched);
  const taken = { top: new Set(outOfPlay("top")), bottom: new Set(outOfPlay("bottom")), shoes: new Set(outOfPlay("shoes")) };
  const planned: { icon: StylistStyleIcon; brands: Record<BrandCategory, string> }[] = [];
  for (const icon of ready) {
    if (planned.length >= wanted) break;
    const brands = firstBrandsInPlay(fetchedLists(fetched.get(icon.number)!, unknown), (category, brand) => !taken[category].has(brand));
    if (!brands) continue;
    planned.push({ icon, brands });
    for (const category of BRAND_CATEGORIES) taken[category].add(brands[category]);
  }
  const searchOf = (icon: StylistStyleIcon, category: SearchCategory, brand: string) =>
    searches.find((search) => search.styleIcon === icon.number && search.category === category && search.brand === brand);
  type Search = [StylistStyleIcon, SearchCategory, string];
  const notSearched = ([icon, category, brand]: Search) => !searchOf(icon, category, brand);
  const separates = planned.flatMap(({ icon, brands }) => BRAND_CATEGORIES.map((category): Search => [icon, category, brands[category]])).filter(notSearched);
  // A One-Piece's search moves no Brand, so it waits until no search can move one.
  const toSearch = separates.length > 0 ? separates : planned.map(({ icon, brands }): Search => [icon, "onePiece", brands.top]).filter(notSearched);
  const searchesLeft = Math.min(MAX_PRODUCT_SEARCHES_PER_STYLING, ...searches.map((search) => search.searchesLeft));
  if (searchesLeft > 0) {
    const stillWanted = wanted - planned.length;
    const fetchesLeft = Math.min(MAX_BRAND_FETCHES_PER_STYLING, ...fetches.map((brands) => brands.fetchesLeft));
    const upFront = fetched.size === 0 && brief?.styling === "First Styling";
    const fetchCount = stillWanted <= 0 ? 0 : Math.min(upFront ? BRAND_FETCHES_UP_FRONT : stillWanted, fetchesLeft, QLOO_CALLS_AT_ONCE);
    const calls = [
      ...left.slice(ready.length, ready.length + Math.max(fetchCount, 0)).map((icon) => ({ tool: "fetchBrands", input: { styleIcon: icon.number } })),
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
      const scenario = scenarioFor(icon.name);
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
  if ("text" in played) return { content: [{ type: "text", text: played.text }], finishReason: { unified: "stop", raw: "end_turn" }, usage, warnings: [] };
  return {
    content: played.calls.map(({ tool, input }, index) => ({ type: "tool-call", toolCallId: `turn-${turn}-call-${index + 1}`, toolName: tool, input: JSON.stringify(input) })),
    finishReason: { unified: "tool-calls", raw: "tool_use" },
    usage,
    warnings: [],
  };
}
