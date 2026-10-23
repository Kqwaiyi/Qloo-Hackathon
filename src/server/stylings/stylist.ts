import type { LanguageModelV4 } from "@ai-sdk/provider";
import { WorkflowAgent } from "@ai-sdk/workflow";
import { hasToolCall, isStepCount, tool } from "ai";
import * as z from "zod";

import { MAX_STYLIST_TURNS, PREVIEWS_AT_ONCE } from "@/config/stylings";
import type { Photo } from "@/server/ai/provider";

import { type BuildOutfitsSteps, findStyleIcons, renderPreviewOrPlaceholder, type StylingOutcome } from "./build-outfits";
import { type StylistBrief, stylistBriefText, type StylistStyleIcon } from "./stylist-brief";

// The Stylist (ADR-0010, ADR-0011): the AI SDK's Workflow agent, carrying out a Face Photo's
// Styling through its tools. The loop is the agent's: each turn is one call to the Stylist's
// model, a durable step of the agent's own, and each tool's work is a durable step of ours. Every
// rule is the tools' to check, never the model's: a tool that refuses says why, for the Stylist to
// correct on its next turn. The Vercel Workflow runs it with its steps as durable steps, and tests
// run the same steps inline. It imports nothing but the AI SDK, Zod for its tools' inputs, types
// and config, so the Workflow's sandbox can load it.

/** What saving an Outfit takes: the Style Icon inspiring it, by its number, and its Pieces. */
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
      why: z.string().describe('One line of about 20 words, in English, to the user as "you", on why it suits them. Never a price.'),
    })
    .describe("The Hairstyle Piece."),
});
export type SaveOutfitInput = z.infer<typeof saveOutfitInputSchema>;

/** What drawing a Preview takes: the saved Outfit's number. */
export const renderPreviewInputSchema = z.object({
  outfit: z.number().int().describe("The number of the saved Outfit whose Preview to draw."),
});
export type RenderPreviewInput = z.infer<typeof renderPreviewInputSchema>;

/** What `findStyleIcons` gives the Stylist: the Style Icons it may use, in Qloo's order. */
export interface FoundStyleIcons {
  styleIcons: StylistStyleIcon[];
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

/**
 * The Stylist's steps, each given the Styling's ID: the "build Outfits" steps it shares, and its
 * own. Each one checks the Styling is still running before it saves.
 */
export interface StylistSteps
  extends Pick<BuildOutfitsSteps, "ranksStyleIcons" | "styleIconLines" | "fetchStyleIcons" | "saveStyleIcons" | "renderPreview" | "finish"> {
  /** Whether the Styling is carried out by the Stylist: a Face Photo's is. */
  usesStylist(stylingId: string): Promise<boolean>;
  /** The Stylist's brief, as `StylistBrief` describes it. */
  readBrief(stylingId: string): Promise<StylistBrief>;
  /** The Consultation's photo, exactly as it was stored, for the conversation's first message. */
  readPhoto(stylingId: string): Promise<Photo>;
  /** The Style Icons on the Styling's list that it may still use, in Qloo's order. */
  readStyleIcons(stylingId: string): Promise<StylistStyleIcon[]>;
  /**
   * Saves one Outfit, as `saveOutfitInputSchema` describes it, after checking it as the Stylist
   * gave it: refused unless its Style Icon is the next unused one on the list, every Piece the
   * Outfit needs is there, nothing states a price, and the Styling may make another Outfit.
   */
  saveOutfit(stylingId: string, input: unknown): Promise<StylistStepResult<SavedOutfit>>;
  /** Closes saving and opens the Previews, moving the Styling on to Generating Previews. Refused before any Outfit is saved. */
  startPreviews(stylingId: string): Promise<StylistStepResult<PreviewsStarted>>;
  /**
   * The ID of one of the Styling's saved Outfits, by its number, whose Preview is to draw. Refused
   * before the Previews start, and for an Outfit it hasn't saved or whose Preview is done.
   */
  openPreview(stylingId: string, outfit: number): Promise<StylistStepResult<{ outfitId: string }>>;
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
      tools: run.tools,
      // Only a Styling that ranks its own Style Icons finds them: any other has its list in its brief.
      activeTools: brief.styleIcons ? ["saveOutfit", "startPreviews", "renderPreview", "finish"] : undefined,
      stopWhen: [isStepCount(MAX_STYLIST_TURNS), hasToolCall("finish"), () => run.broken !== null],
    });
    const { steps: turns } = await agent.generate({
      // The photo enters the conversation once, here: the agent sends the whole conversation each turn.
      messages: [
        { role: "user", content: [{ type: "text", text: stylistBriefText(brief) }, { type: "file", mediaType: photo.mediaType, data: photo.bytes }] },
      ],
    });
    if (run.broken !== null) throw run.broken;
    if (run.finished || turns.length >= MAX_STYLIST_TURNS) outcome = "completed";
    else console.error("The Stylist stopped without finishing.");
  } catch (error) {
    console.error("The Stylist's Styling broke:", error instanceof Error ? error.message : "unknown error");
  }
  await steps.finish(stylingId, outcome);
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
  const previewsAtOnce = atMost(PREVIEWS_AT_ONCE);
  const drawing = new Set<number>();

  /** A step's result, or when it still fails after its retries, a Styling broken once this turn's tools are done. */
  async function orBreak<T>(step: () => Promise<T>): Promise<T> {
    try {
      return await step();
    } catch (error) {
      state.broken ??= error;
      throw new Error("Something went wrong, so this Styling stops here.");
    }
  }

  /** A tool step's result for the Stylist, or its refusal thrown, which the Stylist reads in its place. */
  function unlessRefused<T extends object>(result: StylistStepResult<T>): T {
    if (!result.ok) throw new Refused(result.refusal);
    const { ok: _, ...answered } = result;
    return answered as unknown as T;
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
    saveOutfit: tool({
      description:
        "Saves one Outfit, inspired by one Style Icon, and gives its number. Use the Style Icons in their order: each Outfit's is the next one not yet used. A save that breaks a rule is refused, saying why: correct it and save again.",
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
