import type { LanguageModelV4 } from "@ai-sdk/provider";
import { WorkflowAgent } from "@ai-sdk/workflow";
import { hasToolCall, isStepCount, tool } from "ai";
import * as z from "zod";

import type { Line } from "@/config/accounts";
import { CATEGORY_LABELS } from "@/config/consultations";
import { MAX_STYLIST_TURNS, PRODUCT_CALLS_AT_ONCE, PREVIEWS_AT_ONCE, type PreviewState, QLOO_CALLS_AT_ONCE } from "@/config/stylings";
import type { Photo } from "@/server/ai/provider";
import type { BrandLists, BrandToLookUp } from "@/server/outfit-assembly/brands";
import type { QlooPerson } from "@/server/qloo/client";

import { type StylistBrief, stylistBriefText, type StylistStyleIcon } from "./stylist-brief";
import { STYLIST_PROMPT } from "./stylist-prompt";

// The Stylist (ADR-0010, ADR-0011): the AI SDK's Workflow agent, carrying out a Styling through its
// tools. The loop is the agent's: each turn is one call to the Stylist's model, a durable step of
// the agent's own, and each tool's work is a durable step of ours. Every rule is the tools' to
// check, never the model's: a tool that refuses says why, for the Stylist to correct on its next
// turn. The Vercel Workflow runs it with its steps as durable steps, and tests run the same steps
// inline. It imports nothing but the AI SDK, Zod for its tools' inputs, types and config, so the
// Workflow's sandbox can load it.

const WHY = 'One line of about 20 words, in English, to the user as "you", on why it suits them. Never a price.';

/** A Product Piece as the Stylist saves it: one of the candidates its Brand's search found, by its id. */
const productPieceSchema = z.object({
  product: z.string().describe("The Product's id, exactly as searchProducts listed it."),
  why: z.string().describe(WHY),
});

/**
 * What saving an Outfit takes: the Style Icon inspiring it, by its number, and its Pieces: the
 * Hairstyle when the photo's Outfits have one, and for a body photo, the Brand of each Category and
 * the Product of each Piece, or a One-Piece in place of the Top and Bottom.
 */
export const saveOutfitInputSchema = z.object({
  styleIcon: z.number().int().describe("The number of the Style Icon inspiring the Outfit, as listed."),
  hairstyle: z
    .object({
      cut: z.string().describe("The cut, as a label of about 6 words."),
      details: z
        .string()
        .describe("One sentence on the cut, to draw the Preview from. It describes the cut alone, and never names the Style Icon or anyone else."),
      cutKnown: z
        .boolean()
        .describe("Whether the cut is based on the Style Icon's own signature cut. False when you don't know it, and based the cut on the Photo Style instead."),
      why: z.string().describe(WHY),
    })
    .optional()
    .describe("The Hairstyle Piece, when the brief's pieces include a Hairstyle."),
  brands: z
    .object({ top: z.string(), bottom: z.string(), shoes: z.string() })
    .optional()
    .describe(
      "When the brief's pieces include a Top, Bottom and Shoes: the Outfit's Brand for each, by its name as fetchBrands listed it. With a One-Piece, still name the Bottom's Brand: it stays the Outfit's.",
    ),
  top: productPieceSchema.optional().describe("The Top: one of the Top Brand's Tops."),
  bottom: productPieceSchema.optional().describe("The Bottom: one of the Bottom Brand's Bottoms."),
  onePiece: productPieceSchema
    .optional()
    .describe("A One-Piece in place of the Top and the Bottom: one of the Top Brand's One-Pieces. Give no top or bottom with it."),
  shoes: productPieceSchema.optional().describe("The Shoes: one of the Shoes Brand's Shoes."),
});
export type SaveOutfitInput = z.infer<typeof saveOutfitInputSchema>;

/** What fetching a Style Icon's Brands takes: its number. */
export const fetchBrandsInputSchema = z.object({
  styleIcon: z.number().int().describe("The number of the Style Icon whose Brands to fetch, as listed."),
});

/** What a Piece's search can be for: one of an Outfit's Brand Categories, or the Top Brand's One-Pieces. */
export const SEARCH_CATEGORIES = ["top", "bottom", "shoes", "onePiece"] as const;
export type SearchCategory = (typeof SEARCH_CATEGORIES)[number];

/** What searching a Piece's Products takes: the Style Icon, the Piece and the Brand. */
export const searchProductsInputSchema = z.object({
  styleIcon: z.number().int().describe("The number of the Style Icon whose Outfit the Piece is for, as listed."),
  category: z.enum(SEARCH_CATEGORIES).describe("The Piece: top, bottom or shoes, or onePiece for the Top Brand's dresses, jumpsuits and overalls."),
  brand: z.string().describe("The Brand, by its name as fetchBrands listed it. For onePiece, the Outfit's Top Brand."),
});
export type SearchProductsInput = z.infer<typeof searchProductsInputSchema>;

/** What drawing a Preview takes: the saved Outfit's number. */
export const renderPreviewInputSchema = z.object({
  outfit: z.number().int().describe("The number of the saved Outfit whose Preview to draw."),
});
export type RenderPreviewInput = z.infer<typeof renderPreviewInputSchema>;

/** What `findStyleIcons` gives the Stylist: the Style Icons it may use, in Qloo's order. */
export interface FoundStyleIcons {
  styleIcons: StylistStyleIcon[];
}

/**
 * What `fetchBrands` gives the Stylist: for each Category, the Style Icon's usable Brands still in
 * play, best first, by name, and `denimFirst`, the denim Brands Qloo ranks highly, which a Bottom
 * takes before any other. Like the fixed pipeline's picks, they include Brands not yet looked up in
 * the product search, which a search looks up first: one it doesn't know is then out of every
 * Category. Or that the Style Icon is passed over, since its Brands can't complete an
 * Outfit. Either way, how many more Style Icons' Brands the Styling may fetch.
 */
export type BrandsFetched =
  | { styleIcon: number; brands: BrandLists<string>; fetchesLeft: number }
  | { styleIcon: number; passedOver: string; fetchesLeft: number };

/**
 * What `searchProducts` gives the Stylist: the Products that qualified, one compact line each, by
 * their words alone. When none did, or the search never answered, or the product search doesn't know
 * the Brand, `out` says which Categories the Brand is out of for the rest of the Styling: never for a
 * One-Piece search, which only leaves its Outfit to separates. Either way, how many more searches the
 * Styling may make.
 */
export interface ProductsSearched {
  styleIcon: number;
  category: SearchCategory;
  brand: string;
  candidates: string[];
  out?: "this Category" | "every Category";
  searchesLeft: number;
}

/** What `saveOutfit` gives the Stylist: the saved Outfit's number, as the user sees it. */
export interface SavedOutfit {
  outfit: number;
}

/** What `startPreviews` gives the Stylist: the numbers of the Outfits whose Previews to draw. */
export interface PreviewsStarted {
  outfits: number[];
}

/** What `renderPreview` gives the Stylist: whether the image model drew the Preview, declined, or failed. */
export interface PreviewRendered {
  outfit: number;
  preview: "drawn" | "declined" | "failed";
}

/** What one of the Stylist's tool steps came to: its result, or why it refused. */
export type StylistStepResult<T> = ({ ok: true } & T) | { ok: false; refusal: string };

/** Each line's people, as its person call ranked them. */
export type PeopleByLine = Partial<Record<Line, QlooPerson[]>>;

/** How the Styling's steps ended: all done, or one still failing after its retries. */
export type StylingOutcome = "completed" | "broke";

/** The Stylist's steps, each given the Styling's ID. Each one checks the Styling is still running before it saves. */
export interface StylistSteps {
  /** The Stylist's brief, as `StylistBrief` describes it. */
  readBrief(stylingId: string): Promise<StylistBrief>;
  /** The Consultation's photo, exactly as it was stored, for the conversation's first message. */
  readPhoto(stylingId: string): Promise<Photo>;
  /**
   * Whether the Styling ranks Style Icons of its own, as a first Styling does, or carries on down
   * the Consultation's current ones, as "Show 2 more Outfits" does.
   */
  ranksStyleIcons(stylingId: string): Promise<boolean>;
  /** The lines whose Style Icons the Styling asks Qloo for, one person call each. */
  styleIconLines(stylingId: string): Promise<Line[]>;
  /** One line's person call. */
  fetchStyleIcons(stylingId: string, line: Line): Promise<QlooPerson[]>;
  /** Ranks the Style Icons from the person calls and saves them. */
  saveStyleIcons(stylingId: string, peopleByLine: PeopleByLine): Promise<void>;
  /** The Style Icons on the Styling's list that it may still use, in Qloo's order. */
  readStyleIcons(stylingId: string): Promise<StylistStyleIcon[]>;
  /**
   * One Style Icon's Brand call, as `fetchBrandsInputSchema` describes it, a thin pool widened within
   * it, kept for the rest of the Styling. Refused unless the photo's Outfits are built on Brands, the
   * Style Icon may still inspire an Outfit, and its Brands are fetched already or the Styling may
   * fetch another Style Icon's. Fetched already, Qloo isn't asked again.
   */
  fetchBrands(stylingId: string, input: unknown): Promise<StylistStepResult<{ styleIcon: number }>>;
  /**
   * A fetched Style Icon's Brands still in play, as `BrandsFetched` describes them, passing the
   * Style Icon over when they can't complete an Outfit. First, the Brands its first Brands in play
   * would be that haven't been looked up in the product search, to look up before asking again.
   */
  readBrandsInPlay(stylingId: string, styleIcon: number): Promise<{ lookUp: BrandToLookUp[] } | BrandsFetched>;
  /** One Brand's lookup in the product search, kept for 30 days. None when it was looked up lately. */
  lookUpBrand(stylingId: string, brand: BrandToLookUp): Promise<void>;
  /**
   * One Piece's search in the product search, as `searchProductsInputSchema` describes it, its
   * candidates kept for the rest of the Styling: refused for a Brand that isn't one of the Style
   * Icon's for the Piece, or is out of play, and once the Styling has made all the searches it may.
   * Searched already, it gives the same candidates again. First, a Brand not yet looked up in the
   * product search, to look up before asking again. Throws on errors worth retrying; on the last
   * try, it keeps that the search never answered instead, unless the product search refused the key,
   * and throws once every search the Styling sent has never answered.
   */
  searchProducts(stylingId: string, input: unknown): Promise<StylistStepResult<ProductsSearched | { lookUp: BrandToLookUp }>>;
  /**
   * Saves one Outfit, as `saveOutfitInputSchema` describes it, after checking it as the Stylist
   * gave it: refused unless its Style Icon is the next one on the list that can still inspire one,
   * each Brand is its Category's first still in play, each Product is one its Brand's search found,
   * every Piece the Outfit needs is there, nothing states a price, and the Styling may make another
   * Outfit.
   */
  saveOutfit(stylingId: string, input: unknown): Promise<StylistStepResult<SavedOutfit>>;
  /** Closes saving and opens the Previews, moving the Styling on to Generating Previews. Refused before any Outfit is saved. */
  startPreviews(stylingId: string): Promise<StylistStepResult<PreviewsStarted>>;
  /**
   * The ID of one of the Styling's saved Outfits, by its number, whose Preview is to draw. Refused
   * before the Previews start, and for an Outfit it hasn't saved or whose Preview is done.
   */
  openPreview(stylingId: string, outfit: number): Promise<StylistStepResult<{ outfitId: string }>>;
  /**
   * One AI call: fetches the Outfit's Product photos, then renders its Preview and saves it, or
   * saves its refusal, which is final, returning which. Throws on errors worth retrying, leaving the
   * Preview pending, as when a Product photo can't be fetched before the step's last try; on that
   * last try, its Product is drawn from its title instead.
   */
  renderPreview(stylingId: string, outfitId: string): Promise<Extract<PreviewState, "ready" | "refused">>;
  /**
   * Switches in the Outfits made all at once, marking any Preview not ready failed, or fails the
   * Styling if it made none.
   */
  finish(stylingId: string, outcome: StylingOutcome): Promise<void>;
}

/** A tool's refusal, which the Stylist reads as its result, starting "Refused:", and corrects on its next turn. */
class Refused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Refused";
  }
}

/**
 * Carries out a Styling through the Stylist, running on `model`, then finishes it: as completed
 * once the Stylist says it's finished or it reaches MAX_STYLIST_TURNS, and as broken when a turn
 * or a tool's step still fails after its retries, or the Stylist stops without finishing. Either way
 * it keeps whatever Outfits were saved, as any Styling does.
 */
export async function runStylist(stylingId: string, steps: StylistSteps, model: LanguageModelV4): Promise<void> {
  let outcome: StylingOutcome = "broke";
  try {
    const [brief, photo] = await Promise.all([steps.readBrief(stylingId), steps.readPhoto(stylingId)]);
    const run = stylistTools(stylingId, steps);
    const agent = new WorkflowAgent({
      model,
      instructions: STYLIST_PROMPT,
      // The model chooses among its tools, never forced to call one: some models skip their thinking when they are.
      tools: run.tools,
      activeTools: toolsFor(brief),
      stopWhen: [isStepCount(MAX_STYLIST_TURNS), hasToolCall("finish"), () => run.broken !== null],
    });
    const { steps: turns } = await agent.generate({
      // The photo enters the conversation once, here: the agent sends the whole conversation each turn.
      messages: [
        { role: "user", content: [{ type: "text", text: stylistBriefText(brief) }, { type: "file", mediaType: photo.mediaType, data: photo.bytes }] },
      ],
    });
    if (run.broken !== null) throw run.broken;
    // A turn the model refused has no tool calls, so it's the last.
    if (turns.at(-1)?.finishReason === "content-filter") console.error("The Stylist's model refused a turn.");
    else if (run.finished || turns.length >= MAX_STYLIST_TURNS) outcome = "completed";
    else console.error("The Stylist stopped without finishing.");
  } catch (error) {
    console.error("The Stylist's Styling broke:", error instanceof Error ? error.message : "unknown error");
  }
  await steps.finish(stylingId, outcome);
}

type StylistToolName = keyof ReturnType<typeof stylistTools>["tools"];

/**
 * The tools the Stylist is offered for its brief: finding Style Icons only for a Styling that ranks
 * its own, which has none in its brief, and fetching Brands and searching Products only for Outfits
 * built on Brands, which a Face Photo's, a Hairstyle alone, aren't.
 */
function toolsFor(brief: StylistBrief): StylistToolName[] {
  const buildsOnBrands = brief.pieces.some((piece) => piece !== CATEGORY_LABELS.hairstyle);
  return [
    ...(brief.styleIcons ? [] : (["findStyleIcons"] as const)),
    ...(buildsOnBrands ? (["fetchBrands", "searchProducts"] as const) : []),
    "saveOutfit",
    "startPreviews",
    "renderPreview",
    "finish",
  ];
}

/**
 * The Stylist's tools for one Styling, and what using them has come to so far: the failure that
 * broke the Styling, if one did, and whether the Stylist said it had finished.
 */
function stylistTools(stylingId: string, steps: StylistSteps) {
  const state = { broken: null as unknown, finished: false };
  // The tools that build Outfits run one at a time, in the order the Stylist called them, so its
  // Outfits are numbered in that order and the Previews start after the saves before them.
  const inOrder = atMost(1);
  // As many of Qloo's and the product search's calls at once as a Styling ever has waiting, and Previews.
  const qlooCalls = atMost(QLOO_CALLS_AT_ONCE);
  const productCalls = atMost(PRODUCT_CALLS_AT_ONCE);
  const previewsAtOnce = atMost(PREVIEWS_AT_ONCE);
  const drawing = new Set<number>();
  // A Brand looked up, a Style Icon's Brands fetched, or a Piece searched for, for one tool call is
  // shared with any other asking for it meanwhile, so the product search and Qloo are asked once.
  const lookingUp = new Map<string, Promise<void>>();
  const fetching = new Map<number, Promise<{ styleIcon: number }>>();
  const searching = new Map<string, Promise<ProductsSearched>>();

  /**
   * A step's result, or when it still fails after its retries, a Styling broken once this turn's
   * tools are done. Once it has broken, no more steps run.
   */
  async function orBreak<T>(step: () => Promise<T>): Promise<T> {
    if (state.broken === null) {
      try {
        return await step();
      } catch (error) {
        state.broken ??= error;
      }
    }
    throw new Error("Something went wrong, so this Styling stops here.");
  }

  /** A tool step's result for the Stylist, or its refusal thrown, which the Stylist reads in its place. */
  function unlessRefused<T extends object>(result: StylistStepResult<T>): T {
    if (!result.ok) throw new Refused(result.refusal);
    const { ok: _, ...answered } = result;
    return answered as unknown as T;
  }

  /** Looks a Brand up in the product search, once however many tool calls need it at once. */
  function lookUp(brand: BrandToLookUp): Promise<void> {
    let lookup = lookingUp.get(brand.entityId);
    if (!lookup) {
      lookup = productCalls(() => orBreak(() => steps.lookUpBrand(stylingId, brand)));
      lookingUp.set(brand.entityId, lookup);
    }
    return lookup;
  }

  const tools = {
    findStyleIcons: tool({
      description:
        "Asks Qloo for this Styling's Style Icons: well-known people popular with people like the user, in their Country, in tune with the Photo Style. Gives them in Qloo's order, best first, each by its number. Call it once, before saving any Outfit.",
      inputSchema: z.object({}),
      execute: (): Promise<FoundStyleIcons> =>
        inOrder(() =>
          orBreak(async () => {
            // Found already, they're given again, with no more calls to Qloo.
            await findStyleIcons(stylingId, steps);
            return { styleIcons: await steps.readStyleIcons(stylingId) };
          }),
        ),
    }),
    fetchBrands: tool({
      description:
        "Asks Qloo for the Brands one Style Icon's fans favour, and gives, for each Category, the usable Brands still in play, best first, or says the Style Icon is passed over when they can't complete an Outfit. Fetch a Style Icon's Brands before searching for its Outfit's Products. A Styling may fetch the Brands of only a few Style Icons; fetching them again is free, and gives them as they now stand.",
      inputSchema: fetchBrandsInputSchema,
      execute: async ({ styleIcon }): Promise<BrandsFetched> => {
        let fetched = fetching.get(styleIcon);
        if (!fetched) {
          fetched = qlooCalls(async () => unlessRefused(await orBreak(() => steps.fetchBrands(stylingId, { styleIcon }))));
          fetching.set(styleIcon, fetched);
          // A refused fetch may be asked for again later, once it's allowed.
          fetched.catch(() => fetching.delete(styleIcon));
        }
        await fetched;
        // The Brands the first Brands in play would be are looked up before the Stylist is told them.
        for (;;) {
          const inPlay = await orBreak(() => steps.readBrandsInPlay(stylingId, styleIcon));
          if (!("lookUp" in inPlay)) return inPlay;
          await Promise.all(inPlay.lookUp.map(lookUp));
        }
      },
    }),
    searchProducts: tool({
      description:
        "Searches for one Piece's Products: one Brand's Tops, Bottoms or Shoes, or the Top Brand's One-Pieces, sold where the user lives, new, in stock and within the Brand's price range. Gives the Products that qualify, one line each by its id, title, description and colours. A Brand whose search finds none is out of that Category for the rest of this Styling. A Styling may make only so many searches; searching again is free, and gives the same Products.",
      inputSchema: searchProductsInputSchema,
      execute: (input): Promise<ProductsSearched> => {
        const key = JSON.stringify([input.styleIcon, input.category, input.brand]);
        let search = searching.get(key);
        if (!search) {
          search = (async () => {
            for (;;) {
              const searched = unlessRefused(await productCalls(() => orBreak(() => steps.searchProducts(stylingId, input))));
              if (!("lookUp" in searched)) return searched;
              await lookUp(searched.lookUp);
            }
          })();
          searching.set(key, search);
          // Once it's done, asking again asks the step, which gives what it found, or refuses afresh.
          void search.then(
            () => searching.delete(key),
            () => searching.delete(key),
          );
        }
        return search;
      },
    }),
    saveOutfit: tool({
      description:
        "Saves one Outfit, inspired by one Style Icon, and gives its number. Use the Style Icons in their order: each Outfit's is the next one not yet used or passed over. A save that breaks a rule is refused, saying why: correct it and save again.",
      inputSchema: saveOutfitInputSchema,
      execute: (input): Promise<SavedOutfit> => inOrder(async () => unlessRefused(await orBreak(() => steps.saveOutfit(stylingId, input)))),
    }),
    startPreviews: tool({
      description:
        "Says you've saved every Outfit you'll make. After it no more Outfits can be saved, and their Previews can be drawn. Gives the numbers of the Outfits to draw.",
      inputSchema: z.object({}),
      execute: (): Promise<PreviewsStarted> => inOrder(async () => unlessRefused(await orBreak(() => steps.startPreviews(stylingId)))),
    }),
    renderPreview: tool({
      description:
        "Draws the Preview of one saved Outfit, by its number: the user's photo with the Outfit's Pieces on them. Draw each Outfit's once, after startPreviews.",
      inputSchema: renderPreviewInputSchema,
      execute: async ({ outfit }): Promise<PreviewRendered> => {
        const { outfitId } = await inOrder(async () => {
          if (drawing.has(outfit)) throw new Refused(`Outfit ${outfit}'s Preview is already being drawn.`);
          const opened = unlessRefused(await orBreak(() => steps.openPreview(stylingId, outfit)));
          drawing.add(outfit);
          return opened;
        });
        const preview = await previewsAtOnce(() => renderPreviewOrPlaceholder(stylingId, outfitId, steps));
        return { outfit, preview: preview === "ready" ? "drawn" : preview === "refused" ? "declined" : "failed" };
      },
    }),
    finish: tool({
      description: "Ends the Styling, once every saved Outfit's Preview is drawn. The Outfits you saved are then shown to the user.",
      inputSchema: z.object({}),
      execute: async () => {
        state.finished = true;
        return { finished: true };
      },
    }),
  };

  return {
    tools,
    get broken() {
      return state.broken;
    },
    get finished() {
      return state.finished;
    },
  };
}

/**
 * Finding Style Icons: asks Qloo for the Styling's, one person call per line, all at once, and saves
 * them ranked, unless it builds on Style Icons it has already, the current ones or its own copy.
 */
async function findStyleIcons(
  stylingId: string,
  steps: Pick<StylistSteps, "ranksStyleIcons" | "styleIconLines" | "fetchStyleIcons" | "saveStyleIcons">,
): Promise<void> {
  if (!(await steps.ranksStyleIcons(stylingId))) return;
  const lines = await steps.styleIconLines(stylingId);
  const peopleByLine: PeopleByLine = {};
  await Promise.all(
    lines.map(async (line) => {
      peopleByLine[line] = await steps.fetchStyleIcons(stylingId, line);
    }),
  );
  await steps.saveStyleIcons(stylingId, peopleByLine);
}

/**
 * Renders one Outfit's Preview, returning how it came out. One still failing after its retries
 * leaves its Outfit with a placeholder, not a broken Styling: finishing marks it failed.
 */
async function renderPreviewOrPlaceholder(stylingId: string, outfitId: string, steps: Pick<StylistSteps, "renderPreview">): Promise<PreviewState> {
  try {
    return await steps.renderPreview(stylingId, outfitId);
  } catch (error) {
    console.error("A Preview step failed:", error instanceof Error ? error.message : "unknown error");
    return "failed";
  }
}

/**
 * Runs each task once fewer than `limit` are running, in the order they came. It only chains
 * promises, so a Workflow replays it the same way every time.
 */
function atMost(limit: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running < limit) running += 1;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      // The slot passes straight to the next task waiting, if there is one.
      const next = waiting.shift();
      if (next) next();
      else running -= 1;
    }
  };
}
