import type { LanguageModelV4 } from "@ai-sdk/provider";
import { WorkflowAgent } from "@ai-sdk/workflow";
import { isStepCount, type ModelMessage, type Tool, tool } from "ai";
import * as z from "zod";

import type { Line } from "@/config/accounts";
import { CATEGORY_LABELS, inASentence, type ProductCategory } from "@/config/consultations";
import {
  KEPT_PREVIEWS,
  type KeptPreview,
  PRODUCT_CALLS_AT_ONCE,
  PREVIEWS_AT_ONCE,
  QLOO_CALLS_AT_ONCE,
  TOP_BRANDS_PER_CATEGORY,
} from "@/config/stylings";
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

/**
 * The images a model may read by their links, as `supportedUrls` gives them: any at a web address.
 * The conversation gives a Preview's Products' seller photos by their links (`SellerPhotoLink`).
 */
export const PHOTO_LINKS = { "image/*": [/^https?:\/\//] };

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

/** What passing over a Style Icon takes: its number, and why, which the user reads in the Stylist's Notes. */
export const passOverStyleIconInputSchema = z.object({
  styleIcon: z.number().int().describe("The number of the Style Icon to pass over, as listed."),
  reason: z
    .string()
    .describe(
      'Why, in one short sentence to the user as "you", about style: such as "Her shoe Brands only sell heels, which don\'t fit your sporty Photo Style." Never about the user, or the Style Icon as a person. Never a price.',
    ),
});

/** What writing the user a note takes: its text, which the user reads in the Stylist's Notes. */
export const writeNoteInputSchema = z.object({
  text: z
    .string()
    .describe(
      'The note: one or two short sentences, in English, to the user as "you", on what you\'re doing and why, about style. Never about their body, skin, ethnicity or age, or the Style Icon as a person. Never a price.',
    ),
});

/** What drawing a Preview takes: the saved Outfit's number. */
export const renderPreviewInputSchema = z.object({
  outfit: z.number().int().describe("The number of the saved Outfit whose Preview to draw."),
});
export type RenderPreviewInput = z.infer<typeof renderPreviewInputSchema>;

/** What redrawing a Preview takes: the Outfit's number, and the Stylist's one sentence on what to put right. */
export const redrawPreviewInputSchema = z.object({
  outfit: z.number().int().describe("The number of the Outfit whose Preview to redraw."),
  correction: z
    .string()
    .describe(
      'One sentence on what to put right, added to the Preview\'s own instruction, such as "Keep the face exactly as it is in the photo." About the Preview alone: never about the person\'s body, skin or face beyond whether the Preview changed them.',
    ),
});
export type RedrawPreviewInput = z.infer<typeof redrawPreviewInputSchema>;

/** What keeping a Preview takes: the Outfit's number, and which of its images to keep. */
export const keepPreviewInputSchema = z.object({
  outfit: z.number().int().describe("The number of the Outfit whose Preview to keep."),
  keep: z
    .enum(KEPT_PREVIEWS)
    .describe('"first" for the Preview renderPreview drew, "redraw" for the one redrawPreview drew, or "none" only when both break a hard rule.'),
});
export type KeepPreviewInput = z.infer<typeof keepPreviewInputSchema>;

/** What `findStyleIcons` gives the Stylist: the Style Icons it may use, in Qloo's order. */
export interface FoundStyleIcons {
  styleIcons: StylistStyleIcon[];
}

/**
 * What `fetchBrands` gives the Stylist: for each Category, the Style Icon's top few usable Brands
 * still in play, best first, by name, the Outfit's to choose among (`topBrandsInPlay`), the Bottom's
 * denim Brands Qloo ranks highly first, which `denimFirst` names. Like the fixed pipeline's picks,
 * they include Brands not yet looked up in the product search, which a search looks up first: one
 * it doesn't know is then out of every Category, and the next moves in. Or that the Style Icon is
 * passed over, since its Brands can't complete an Outfit. Either way, how many more Style Icons'
 * Brands the Styling may fetch.
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

/** What `passOverStyleIcon` gives the Stylist: the number of the Style Icon passed over. */
export interface StyleIconPassedOver {
  styleIcon: number;
}

/** What `writeNote` gives the Stylist: that the user was shown its note. */
export interface NoteWritten {
  shown: true;
}

/** What `saveOutfit` gives the Stylist: the saved Outfit's number, as the user sees it. */
export interface SavedOutfit {
  outfit: number;
}

/** What `startPreviews` gives the Stylist: the numbers of the Outfits whose Previews to draw. */
export interface PreviewsStarted {
  outfits: number[];
}

/**
 * A seller's own photo of one of a Preview's Products, by its link. The Stylist's model is sent the
 * link, and a model that can't read a link fetches the photo inside its own step, so no step's
 * input or output ever holds the photo (ADR-0011).
 */
export interface SellerPhotoLink {
  category: ProductCategory;
  /** The Product's title, as its seller gives it. */
  title: string;
  url: string;
}

/**
 * A Preview as the step that drew it gives it back, for the Stylist to check: the image, read from
 * Blob, and its Products' seller photos by their links. Or the image model's refusal, which is final.
 */
export type PreviewToCheck = { state: "ready"; image: Photo; sellerPhotos: SellerPhotoLink[] } | { state: "refused" };

/**
 * What `renderPreview` gives the Stylist: whether the image model drew the Preview, declined, or
 * failed, and one it drew, to check, beside its Products' seller photos.
 */
export interface PreviewRendered {
  outfit: number;
  preview: "drawn" | "declined" | "failed";
  image?: Photo;
  sellerPhotos?: SellerPhotoLink[];
}

/** A redraw as the step that drew it gives it back, for the Stylist to check: the image, read from Blob, or the image model's refusal. */
export type RedrawToCheck = { state: "ready"; image: Photo } | { state: "refused" };

/** What `redrawPreview` gives the Stylist: whether the image model drew the redraw, declined, or failed, and one it drew, to check. */
export interface PreviewRedrawn {
  outfit: number;
  redraw: "drawn" | "declined" | "failed";
  image?: Photo;
}

/** What `keepPreview` gives the Stylist: the Outfit, and which of its images it kept. */
export interface PreviewKept {
  outfit: number;
  kept: KeptPreview;
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
  /** How many turns the Stylist has on the Styling, its `StylingLimits`' turns: more on the Demo Account. */
  readTurnCap(stylingId: string): Promise<number>;
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
   * Icon's for the Piece, is out of play, or isn't among its top few still in play, and once the
   * Styling has made all the searches it may.
   * Searched already, it gives the same candidates again. First, a Brand not yet looked up in the
   * product search, to look up before asking again. Throws on errors worth retrying; on the last
   * try, it keeps that the search never answered instead, unless the product search refused the key,
   * and throws once every search the Styling sent has never answered.
   */
  searchProducts(stylingId: string, input: unknown): Promise<StylistStepResult<ProductsSearched | { lookUp: BrandToLookUp }>>;
  /**
   * Passes over a Style Icon, as `passOverStyleIconInputSchema` describes it, so it inspires no
   * Outfit, and adds a step saying so to the Stylist's Notes, then the reason, a note of the turn
   * that wrote it, unless that turn wrote the same note already, checked like one: refused before
   * the Style Icons are found or once the Previews start, for a Style Icon not on the list or that
   * has inspired an Outfit, and for a reason that's empty, states a price or is too long. Passed
   * over already, there's nothing left to do.
   */
  passOverStyleIcon(stylingId: string, turn: number, input: unknown): Promise<StylistStepResult<StyleIconPassedOver>>;
  /**
   * Saves one Outfit, as `saveOutfitInputSchema` describes it, after checking it as the Stylist
   * gave it: refused unless its Style Icon is the next one on the list that can still inspire one,
   * each Brand is one of its Category's top few still in play (`topBrandsInPlay`), each Product is
   * one its Brand's search found, every Piece the Outfit needs is there, nothing states a price, and
   * the Styling may make another Outfit.
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
   * saves its refusal, which is final, returning which, as `PreviewToCheck` describes. Throws on
   * errors worth retrying, leaving the Preview pending, as when a Product photo can't be fetched
   * before the step's last try; on that last try, its Product is drawn from its title instead.
   */
  renderPreview(stylingId: string, outfitId: string): Promise<PreviewToCheck>;
  /**
   * The ID of one of the Styling's saved Outfits, by its number, whose Preview is to redraw, as
   * `redrawPreviewInputSchema` describes it, with its correction, trimmed. It marks the Outfit's one
   * redraw used, so a second is refused. Refused before the Previews start, for an Outfit it hasn't
   * saved, or whose Preview wasn't drawn, and for a correction that's empty or longer than a sentence.
   */
  openRedraw(stylingId: string, input: unknown): Promise<StylistStepResult<{ outfitId: string; correction: string }>>;
  /**
   * One AI call: redraws an Outfit's Preview as `renderPreview` draws it, with the correction added
   * to its instruction, and saves the redraw beside the Preview, or saves its refusal, which is
   * final, returning which, as `RedrawToCheck` describes. Throws on errors worth retrying; on the
   * step's last try, it saves that the redraw failed.
   */
  redrawPreview(stylingId: string, outfitId: string, correction: string): Promise<RedrawToCheck>;
  /**
   * Keeps one of a redrawn Outfit's images, as `keepPreviewInputSchema` describes it: the first,
   * the redraw, which becomes the Outfit's Preview, or neither, which leaves the Outfit with no
   * Preview, as a refusal does. Either way the one not kept is deleted. The first of a Preview never
   * redrawn is kept already; anything else is refused before a redraw, and so is keeping a redraw the
   * image model didn't draw. Kept already, there's nothing left to do.
   */
  keepPreview(stylingId: string, input: unknown): Promise<StylistStepResult<PreviewKept>>;
  /**
   * Switches in the Outfits made all at once, marking any Preview not ready failed, or fails the
   * Styling if it made none.
   */
  finish(stylingId: string, outcome: StylingOutcome): Promise<void>;
  /**
   * Saves the text the Stylist wrote in one turn, by the turn's number, as its notes to the user,
   * after the Styling's last entry. Each line is a note, checked like a "why" line: one that's
   * empty, states a price or is too long is dropped silently. A turn's notes are saved once: with
   * any note of the turn's saved already, its text is taken as saved, so it must be saved before any
   * note the turn wrote with writeNote.
   */
  saveNotes(stylingId: string, turn: number, texts: string[]): Promise<void>;
  /**
   * Adds a note the Stylist wrote with writeNote, as `writeNoteInputSchema` describes it, after the
   * Styling's last entry, as a note of the turn that wrote it, checked like one: refused, saying why,
   * when it's empty, states a price or is too long. One its turn has saved already, as a retry finds
   * it, or as the turn's text or another writeNote gave it, is saved once.
   */
  writeNote(stylingId: string, turn: number, input: unknown): Promise<StylistStepResult<NoteWritten>>;
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
 * once the Stylist says it's finished or it reaches its turn cap, and as broken when a turn or a
 * tool's step still fails after its retries, or the Stylist stops without finishing. Either way it
 * keeps whatever Outfits were saved, as any Styling does.
 */
export async function runStylist(stylingId: string, steps: StylistSteps, model: LanguageModelV4): Promise<void> {
  let outcome: StylingOutcome = "broke";
  try {
    const [brief, photo, turnCap] = await Promise.all([steps.readBrief(stylingId), steps.readPhoto(stylingId), steps.readTurnCap(stylingId)]);
    const notes = turnNoteSaver(stylingId, steps);
    const run = stylistTools(stylingId, steps, notes);
    const agent = new WorkflowAgent({
      model,
      instructions: STYLIST_PROMPT,
      // The model chooses among its tools, never forced to call one: some models skip their thinking when they are.
      tools: run.tools,
      activeTools: toolsFor(brief),
      // It stops once finish has gone through, not on a finish refused.
      stopWhen: [isStepCount(turnCap), () => run.finished, () => run.broken !== null],
      // A turn whose tools ran has saved its notes already.
      onStepEnd: (step) => notes.save(step.stepNumber + 1, textsOf(step.content)),
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
    else if (run.finished || turns.length >= turnCap) outcome = "completed";
    else console.error("The Stylist stopped without finishing.");
  } catch (error) {
    console.error("The Stylist's Styling broke:", error instanceof Error ? error.message : "unknown error");
  }
  await steps.finish(stylingId, outcome);
}

type StylistToolName = keyof ReturnType<typeof stylistTools>["tools"];

/**
 * The tools the Stylist is offered for its brief, the same on every turn: writing notes always,
 * from the first turn, so the tools never change within a Styling; finding Style Icons only for a
 * Styling that ranks its own, which has none in its brief; and fetching Brands and searching
 * Products only for Outfits built on Brands, which a Face Photo's, a Hairstyle alone, aren't.
 */
function toolsFor(brief: StylistBrief): StylistToolName[] {
  const buildsOnBrands = brief.pieces.some((piece) => piece !== CATEGORY_LABELS.hairstyle);
  return [
    "writeNote",
    ...(brief.styleIcons ? [] : (["findStyleIcons"] as const)),
    ...(buildsOnBrands ? (["fetchBrands", "searchProducts"] as const) : []),
    "passOverStyleIcon",
    "saveOutfit",
    "startPreviews",
    "renderPreview",
    "redrawPreview",
    "keepPreview",
    "finish",
  ];
}

/** Saves the notes the Stylist writes in each of its turns, once, as `turnNoteSaver` describes. */
interface TurnNoteSaver {
  /** Saves a turn's notes, by its number, from the text it wrote, unless they're saved already. */
  save(turn: number, texts: string[]): Promise<void>;
  /**
   * Saves the notes of the turn whose own message ends the conversation a tool is handed, unless
   * they're saved already: its text, then each note it wrote with writeNote, in order.
   */
  saveFrom(messages: readonly ModelMessage[]): Promise<void>;
  /**
   * What came of a note the Stylist wrote with writeNote, by its call's ID, writing it unless it's
   * written already: the step's result, or null when the note couldn't be saved.
   */
  write(turn: number, toolCallId: string, input: unknown): Promise<StylistStepResult<NoteWritten> | null>;
}

/**
 * Saves the notes the Stylist writes in each of its turns, once, as the first of the turn's
 * entries: as its tools start, from the turn's own message, which the Workflow agent hands each of
 * its tools as the last of the conversation, so they appear before the steps those tools write; or
 * as the turn ends, for a turn whose tools never ran. The agent calls its step-end callback only
 * once a turn's tools are done, which for Previews is a while. The notes it wrote with writeNote
 * follow its text, one after another, in the order it called writeNote, wherever that is among the
 * turn's tools, which all run at once. A note that can't be saved is lost, never the Styling.
 */
function turnNoteSaver(stylingId: string, steps: Pick<StylistSteps, "saveNotes" | "writeNote">): TurnNoteSaver {
  const saving = new Map<number, Promise<void>>();
  const writing = new Map<string, Promise<StylistStepResult<NoteWritten> | null>>();

  function save(turn: number, texts: string[]): Promise<void> {
    let saved = saving.get(turn);
    if (!saved) {
      saved = texts.some((text) => text.trim())
        ? steps.saveNotes(stylingId, turn, texts).catch((error: unknown) => {
            console.error("The Stylist's notes couldn't be saved:", error instanceof Error ? error.message : "unknown error");
          })
        : Promise.resolve();
      saving.set(turn, saved);
    }
    return saved;
  }

  /** Writes one of a turn's notes written with writeNote, once `after` is done, unless it's written already. */
  function write(turn: number, toolCallId: string, input: unknown, after: Promise<unknown> = saving.get(turn) ?? Promise.resolve()) {
    let written = writing.get(toolCallId);
    if (!written) {
      written = after.then(() =>
        steps.writeNote(stylingId, turn, input).catch((error: unknown) => {
          console.error("A note of the Stylist's couldn't be saved:", error instanceof Error ? error.message : "unknown error");
          return null;
        }),
      );
      writing.set(toolCallId, written);
    }
    return written;
  }

  return {
    save,
    async saveFrom(messages) {
      const own = messages.at(-1);
      if (own?.role !== "assistant") return;
      const turn = turnOf(messages);
      if (typeof own.content === "string") return save(turn, [own.content]);
      let saved: Promise<unknown> = save(turn, textsOf(own.content));
      for (const part of own.content) {
        if (part.type === "tool-call" && part.toolName === "writeNote") saved = write(turn, part.toolCallId, part.input, saved);
      }
      await saved;
    },
    write: (turn, toolCallId, input) => write(turn, toolCallId, input),
  };
}

/** The number of the turn whose own message ends the conversation a tool is handed, from 1. */
function turnOf(messages: readonly ModelMessage[]): number {
  return messages.filter((message) => message.role === "assistant").length;
}

/** The text a turn wrote, part by part: never its thinking. */
function textsOf(content: readonly { type: string }[]): string[] {
  return content.flatMap((part) => (part.type === "text" && "text" in part && typeof part.text === "string" ? [part.text] : []));
}

/**
 * The Stylist's tools for one Styling, and what using them has come to so far: the failure that
 * broke the Styling, if one did, and whether the Stylist said it had finished.
 */
function stylistTools(stylingId: string, steps: StylistSteps, notes: TurnNoteSaver) {
  const state = { broken: null as unknown, finished: false };

  /**
   * A tool's work, given the number of the turn that called it and the call's ID, once the notes the
   * Stylist wrote that turn are saved, so they come before the steps it writes.
   */
  function afterTurnNotes<I, O>(work: (input: I, turn: number, toolCallId: string) => Promise<O>) {
    return async (input: I, { messages, toolCallId }: { messages: ModelMessage[]; toolCallId: string }): Promise<O> => {
      await notes.saveFrom(messages);
      return work(input, turnOf(messages), toolCallId);
    };
  }
  // The tools that build Outfits run one at a time, in the order the Stylist called them, so its
  // Outfits are numbered in that order and the Previews start after the saves before them.
  const inOrder = atMost(1);
  // As many of Qloo's and the product search's calls at once as a Styling ever has waiting, and Previews.
  const qlooCalls = atMost(QLOO_CALLS_AT_ONCE);
  const productCalls = atMost(PRODUCT_CALLS_AT_ONCE);
  const previewsAtOnce = atMost(PREVIEWS_AT_ONCE);
  const drawing = new Set<number>();
  // The Outfits whose Preview is being redrawn, which none of its images may be kept from meanwhile;
  // those whose Preview has been redrawn, which may be redrawn no more; and of those, the ones whose
  // images the Stylist has yet to keep one of, which the Styling may not finish before.
  const redrawing = new Set<number>();
  const redrawn = new Set<number>();
  const awaitingKeep = new Set<number>();
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
    writeNote: tool({
      description:
        "Writes the user a note, which they're shown as you work: what you're doing and why. Call it first in a turn, beside the tool calls it explains. A note that breaks a rule is refused, saying why, and isn't shown.",
      inputSchema: writeNoteInputSchema,
      // The turn's notes, this one among them, are written as its first tool starts.
      execute: afterTurnNotes(async (input, turn, toolCallId): Promise<NoteWritten> => {
        const written = await notes.write(turn, toolCallId, input);
        if (!written) throw new Error("Your note couldn't be shown to the user.");
        return unlessRefused(written);
      }),
    }),
    findStyleIcons: tool({
      description:
        "Asks Qloo for this Styling's Style Icons: well-known people popular with people like the user, in their Country, in tune with the Photo Style. Gives them in Qloo's order, best first, each by its number. Call it once, before saving any Outfit.",
      inputSchema: z.object({}),
      execute: afterTurnNotes(
        (): Promise<FoundStyleIcons> =>
          inOrder(() =>
            orBreak(async () => {
              // Found already, they're given again, with no more calls to Qloo.
              await findStyleIcons(stylingId, steps);
              return { styleIcons: await steps.readStyleIcons(stylingId) };
            }),
          ),
      ),
    }),
    fetchBrands: tool({
      description:
        `Asks Qloo for the Brands one Style Icon's fans favour, and gives, for each Category, the top ${TOP_BRANDS_PER_CATEGORY} still in play, best first, for its Outfit to choose among, or says the Style Icon is passed over when they can't complete an Outfit. Fetch a Style Icon's Brands before searching for its Outfit's Products. A Styling may fetch the Brands of only a few Style Icons; fetching them again is free, and gives them as they now stand.`,
      inputSchema: fetchBrandsInputSchema,
      execute: afterTurnNotes(async ({ styleIcon }): Promise<BrandsFetched> => {
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
      }),
    }),
    searchProducts: tool({
      description:
        `Searches for one Piece's Products: the Tops, Bottoms or Shoes of one of the Style Icon's top ${TOP_BRANDS_PER_CATEGORY} Brands for the Piece, or the Top Brand's One-Pieces, sold where the user lives, new, in stock and within the Brand's price range. Gives the Products that qualify, one line each by its id, title, description and colours. A Brand whose search finds none is out of that Category for the rest of this Styling. A Styling may make only so many searches; searching again is free, and gives the same Products.`,
      inputSchema: searchProductsInputSchema,
      execute: afterTurnNotes((input): Promise<ProductsSearched> => {
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
      }),
    }),
    passOverStyleIcon: tool({
      description:
        "Passes over a Style Icon that doesn't suit the photo, so it inspires no Outfit and the next one takes its place. Your reason is shown to the user in your notes.",
      inputSchema: passOverStyleIconInputSchema,
      execute: afterTurnNotes(
        (input, turn): Promise<StyleIconPassedOver> => inOrder(async () => unlessRefused(await orBreak(() => steps.passOverStyleIcon(stylingId, turn, input)))),
      ),
    }),
    saveOutfit: tool({
      description:
        `Saves one Outfit, inspired by one Style Icon, and gives its number. Use the Style Icons in their order: each Outfit's is the next one not yet used or passed over. Each Category's Brand is one of the Style Icon's top ${TOP_BRANDS_PER_CATEGORY} still in play. A save that breaks a rule is refused, saying why: correct it and save again.`,
      inputSchema: saveOutfitInputSchema,
      execute: afterTurnNotes(
        (input): Promise<SavedOutfit> => inOrder(async () => unlessRefused(await orBreak(() => steps.saveOutfit(stylingId, input)))),
      ),
    }),
    startPreviews: tool({
      description:
        "Says you've saved every Outfit you'll make. After it no more Outfits can be saved, and their Previews can be drawn. Gives the numbers of the Outfits to draw.",
      inputSchema: z.object({}),
      execute: afterTurnNotes((): Promise<PreviewsStarted> => inOrder(async () => unlessRefused(await orBreak(() => steps.startPreviews(stylingId))))),
    }),
    renderPreview: tool({
      description:
        "Draws the Preview of one saved Outfit, by its number: the user's photo with the Outfit's Pieces on them. Draw each Outfit's once, after startPreviews. Gives the Preview it drew, then the seller's own photo of each of the Outfit's Products, for you to check it.",
      inputSchema: renderPreviewInputSchema,
      execute: afterTurnNotes(async ({ outfit }): Promise<PreviewRendered> => {
        const { outfitId } = await inOrder(async () => {
          if (drawing.has(outfit)) throw new Refused(`Outfit ${outfit}'s Preview is already being drawn.`);
          const opened = unlessRefused(await orBreak(() => steps.openPreview(stylingId, outfit)));
          drawing.add(outfit);
          return opened;
        });
        // One still failing after its retries leaves its Outfit with a placeholder, not a broken
        // Styling: finishing marks it failed.
        const drawn = await previewsAtOnce(() => orFailed("A Preview step", () => steps.renderPreview(stylingId, outfitId)));
        if (drawn.state !== "ready") return { outfit, preview: drawnAs(drawn.state) };
        return { outfit, preview: "drawn", image: drawn.image, sellerPhotos: drawn.sellerPhotos };
      }),
      // Its own output, which the agent doesn't type through the notes it saves first.
      toModelOutput: ({ output }) => previewContent(output as PreviewRendered),
    }),
    redrawPreview: tool({
      description:
        "Draws one Outfit's Preview again, by the Outfit's number, once you've checked it and found it wrong: as renderPreview drew it, with your correction added to its instruction. Each Outfit's Preview may be redrawn once. Gives the redraw, for you to check and then keep the better of the two with keepPreview.",
      inputSchema: redrawPreviewInputSchema,
      execute: afterTurnNotes(async (input): Promise<PreviewRedrawn> => {
        const { outfitId, correction } = await inOrder(async () => {
          // The step's own check would let a retry of it through.
          if (redrawn.has(input.outfit)) throw new Refused(onlyOneRedraw(input.outfit));
          const opened = unlessRefused(await orBreak(() => steps.openRedraw(stylingId, input)));
          redrawn.add(input.outfit);
          awaitingKeep.add(input.outfit);
          redrawing.add(input.outfit);
          return opened;
        });
        try {
          // One still failing after its retries leaves the first, for the Stylist to keep or not.
          const drawn = await previewsAtOnce(() => orFailed("A Preview's redraw step", () => steps.redrawPreview(stylingId, outfitId, correction)));
          if (drawn.state !== "ready") return { outfit: input.outfit, redraw: drawnAs(drawn.state) };
          return { outfit: input.outfit, redraw: "drawn", image: drawn.image };
        } finally {
          redrawing.delete(input.outfit);
        }
      }),
      // Its own output, which the agent doesn't type through the notes it saves first.
      toModelOutput: ({ output }) => redrawContent(output as PreviewRedrawn),
    }),
    keepPreview: tool({
      description:
        'Keeps one of a redrawn Outfit\'s Previews, by the Outfit\'s number: "first", "redraw", or "none" only when both break a hard rule, which leaves the Outfit with no Preview. A Preview you never redraw is kept as it is.',
      inputSchema: keepPreviewInputSchema,
      execute: afterTurnNotes(
        (input): Promise<PreviewKept> =>
          inOrder(async () => {
            if (redrawing.has(input.outfit)) throw new Refused(`Outfit ${input.outfit}'s Preview is still being redrawn: keep one once you've seen it.`);
            const kept = unlessRefused(await orBreak(() => steps.keepPreview(stylingId, input)));
            awaitingKeep.delete(input.outfit);
            return kept;
          }),
      ),
    }),
    finish: tool({
      description:
        "Ends the Styling, once every saved Outfit's Preview is drawn and checked, and any you redrew kept. The Outfits you saved are then shown to the user.",
      inputSchema: z.object({}),
      execute: afterTurnNotes(async () => {
        // A redrawn Preview left unkept would leave its Outfit with none.
        const toKeep = [...awaitingKeep].toSorted((a, b) => a - b);
        if (toKeep.length > 0) {
          const whose = toKeep.length === 1 ? `Outfit ${toKeep[0]}'s` : `Outfits ${inASentence(toKeep.map(String))}'`;
          throw new Refused(`Keep one of ${whose} redrawn Previews first, with keepPreview.`);
        }
        state.finished = true;
        return { finished: true };
      }),
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

/** A Preview step's result, or that it failed, once it still fails after its retries. */
async function orFailed<T>(step: string, draw: () => Promise<T>): Promise<T | { state: "failed" }> {
  try {
    return await draw();
  } catch (error) {
    console.error(`${step} failed:`, error instanceof Error ? error.message : "unknown error");
    return { state: "failed" };
  }
}

/** How the Stylist is told a Preview, or its redraw, came out when there's no image: the image model declined, or it failed. */
function drawnAs(state: "refused" | "failed"): "declined" | "failed" {
  return state === "refused" ? "declined" : "failed";
}

/** Why a second redraw of an Outfit's Preview is refused. */
export function onlyOneRedraw(outfit: number): string {
  return `Outfit ${outfit}'s Preview has been redrawn once already, as often as it may be.`;
}

/**
 * A Preview's result as the Stylist's model is shown it: what came of it, then the Preview it drew,
 * then each of its Products' seller photos, by its link. A link that isn't one is left out.
 */
function previewContent({ image, sellerPhotos = [], ...result }: PreviewRendered): ToolModelOutput {
  return toolContent(result, [
    ...(image ? captioned(`Outfit ${result.outfit}'s Preview:`, imagePart(image)) : []),
    ...sellerPhotos.flatMap(({ category, title, url }) => {
      const link = linkOf(url);
      return link
        ? captioned(`The seller's own photo of its ${CATEGORY_LABELS[category]}, "${title}":`, { type: "file", mediaType: "image", data: { type: "url", url: link } })
        : [];
    }),
  ]);
}

/** A redraw's result as the Stylist's model is shown it: what came of it, then the redraw it drew. */
function redrawContent({ image, ...result }: PreviewRedrawn): ToolModelOutput {
  return toolContent(result, image ? captioned(`Outfit ${result.outfit}'s redrawn Preview:`, imagePart(image)) : []);
}

/** A tool's output as JSON, before the files it gives the Stylist's model, each after its caption. */
function toolContent(result: object, files: ToolContentPart[]): ToolModelOutput {
  return { type: "content", value: [{ type: "text", text: JSON.stringify(result) }, ...files] };
}

/** A file, after a line of text saying what it is. */
function captioned(caption: string, file: ToolContentPart): ToolContentPart[] {
  return [{ type: "text", text: caption }, file];
}

/** What a tool gives the Stylist's model in place of its output, as JSON. */
type ToolModelOutput = Awaited<ReturnType<NonNullable<Tool["toModelOutput"]>>>;

/** One part of what a tool gives the Stylist's model: a line of text, or a file. */
type ToolContentPart = Extract<ToolModelOutput, { type: "content" }>["value"][number];

/** An image, as the conversation holds it: its own bytes. */
function imagePart({ bytes, mediaType }: Photo): ToolContentPart {
  return { type: "file", mediaType, data: { type: "data", data: bytes } };
}

/** The link, or null when it isn't one. */
function linkOf(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
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
