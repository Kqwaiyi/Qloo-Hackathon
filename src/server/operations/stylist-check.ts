import type { LanguageModelV4, LanguageModelV4FinishReason, LanguageModelV4Prompt, LanguageModelV4Usage } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { STYLIST_CHECK_BIRTH_DATE, STYLIST_CHECK_COUNTRY_CODE, type StylePreference } from "@/config/accounts";
import { CLAUDE_PRICES, type ClaudeModel } from "@/config/ai";
import { byCategoryOrder, type PhotoType, type PieceCategory } from "@/config/consultations";
import { KEPT_PREVIEWS, stylingLimitsFor } from "@/config/stylings";
import type { AiProvider, PhotoCheckInput, PhotoCheckResult, PreviewInput, PreviewPiece, PreviewResult } from "@/server/ai/provider";
import type { BlobStore, StoredBlob } from "@/server/blob/store";
import { previewPathnameFor, previewRedrawPathnameFor } from "@/server/consultations/blob-pathnames";
import type { PhotoRejection } from "@/server/consultations/photo-check";
import { outfit, piece, styleIcon, styling } from "@/server/db/schema";
import { type OutfitView, type PreviewView, readConsultation, startConsultation } from "@/server/operations/consultations";
import type { OperationContext } from "@/server/operations/context";
import { signUp } from "@/server/operations/sign-up";
import { browserRequests } from "@/server/operations/team";
import type { StylingRunner } from "@/server/stylings/runner";
import { type StylistNoteEntry, STEPS } from "@/server/stylings/stylist-notes";

// The Stylist check (spec: "Fakes and the check"), the Haiku check: the team's script runs the real
// Stylist on fixed, AI-generated photos, each styled once as a new user would be, and reports whether
// it made valid Outfits, its turns, time, cost and largest prompt, and what it did with each Preview,
// some of them deliberately wrong. It runs on a fresh app of its own, which lives only while the
// script runs, on an AI and a Blob store the check watches.

/** The Outfit a Preview is drawn for: its number, as the user sees it, and its Style Icon. */
export interface OutfitDrawn {
  position: number;
  styleIconName: string;
}

/**
 * Draws one Preview in place of the image model, as a check may, first tries and redraws alike,
 * told the Outfit it's for, or null when that can't be told, as when two Outfits' Pieces are alike.
 */
export type PreviewDrawer = (input: PreviewInput, outfit: OutfitDrawn | null) => Promise<PreviewResult>;

/** One tool call the Stylist made: its tool, by name, and what it asked for. */
export interface StylistCall {
  id: string;
  tool: string;
  input: unknown;
}

/** One of the Stylist's turns, as the check sees it: never its text or its thinking. */
export interface StylistTurn {
  /** The model that ran it, by its ID, such as "claude-haiku-5-5". */
  modelId: string;
  /** Its tokens, as the model reports them: its prompt's, cached or not, and what it wrote. */
  usage: LanguageModelV4Usage;
  /** Its tool calls, in order. */
  calls: StylistCall[];
  finishReason: LanguageModelV4FinishReason["unified"];
  /** The IDs of the turn before's tool calls that it was told were refused, or failed. */
  refusedBefore: string[];
}

/** A redraw of a Preview, as the check sees it asked for: the Pieces it's drawn with, and the verdict's correction. */
export interface RedrawAskedFor {
  pieces: readonly PreviewPiece[];
  correction: string;
}

/**
 * The AI a Stylist check runs on: the app's own, watched. It keeps each of the Stylist's turns, and
 * each redraw asked for, and draws each Preview as the check says: on the image model unless the
 * check draws them itself.
 */
export class StylistCheckAi implements AiProvider {
  /** Every turn of the Stylist's, oldest first, across every Styling the check runs on it. */
  readonly turns: StylistTurn[] = [];
  /** Every redraw asked for, oldest first, across every Styling the check runs on it. */
  readonly redraws: RedrawAskedFor[] = [];
  /** Judges each Preview on the app's own AI, as it is. */
  readonly judgePreview: AiProvider["judgePreview"];
  private drawer: (input: PreviewInput) => Promise<PreviewResult>;

  constructor(private readonly ai: AiProvider) {
    this.drawer = (input) => ai.renderPreview(input);
    this.judgePreview = ai.judgePreview.bind(ai);
  }

  /** Does `work`, drawing every Preview meanwhile with `drawer`, then goes back to the one before. */
  async drawingWith<T>(drawer: ((input: PreviewInput) => Promise<PreviewResult>) | undefined, work: () => Promise<T>): Promise<T> {
    const before = this.drawer;
    this.drawer = drawer ?? before;
    try {
      return await work();
    } finally {
      this.drawer = before;
    }
  }

  checkPhoto(input: PhotoCheckInput): Promise<PhotoCheckResult> {
    return this.ai.checkPhoto(input);
  }

  stylistModel(): LanguageModelV4 {
    const model = this.ai.stylistModel();
    return wrapLanguageModel({
      model,
      middleware: {
        wrapGenerate: async ({ doGenerate, params }) => {
          const turn = await doGenerate();
          this.turns.push({
            modelId: model.modelId,
            usage: turn.usage,
            calls: turn.content.flatMap((part) => (part.type === "tool-call" ? [{ id: part.toolCallId, tool: part.toolName, input: parsed(part.input) }] : [])),
            finishReason: turn.finishReason.unified,
            refusedBefore: callsRefusedLastTurn(params.prompt),
          });
          return turn;
        },
      },
    });
  }

  renderPreview(input: PreviewInput): Promise<PreviewResult> {
    if (input.correction) this.redraws.push({ pieces: input.pieces, correction: input.correction });
    return this.drawer(input);
  }
}

/**
 * The private Blob store a Stylist check runs on: the app's own, keeping a copy of every object put
 * in it, even once it's deleted, so the check can give each Outfit both images of a redrawn Preview,
 * the one the Stylist didn't keep included.
 */
export class StylistCheckBlob implements BlobStore {
  private readonly everPut = new Map<string, Uint8Array>();

  constructor(private readonly blob: BlobStore) {}

  async put(pathname: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.blob.put(pathname, bytes, contentType);
    this.everPut.set(pathname, bytes);
  }

  get(pathname: string): Promise<StoredBlob> {
    return this.blob.get(pathname);
  }

  signedUrl(pathname: string, validUntil: Date): Promise<string> {
    return this.blob.signedUrl(pathname, validUntil);
  }

  delete(pathname: string): Promise<void> {
    return this.blob.delete(pathname);
  }

  deleteFolder(folder: string): Promise<void> {
    return this.blob.deleteFolder(folder);
  }

  /** What was last put at `pathname`, whether or not it's there now, or undefined when nothing ever was. */
  lastPut(pathname: string): Uint8Array | undefined {
    return this.everPut.get(pathname);
  }
}

/**
 * What a Stylist check runs on: a fresh app, with no account in it but those the check makes, on a
 * watched AI, with Stylings run in this process when it says.
 */
export type StylistCheckApp = Omit<OperationContext, "requestHeaders" | "responseCookies" | "stylings" | "ai" | "blob"> & {
  ai: StylistCheckAi;
  blob: StylistCheckBlob;
  /** Runs Stylings in this process: each one started runs to its end when `runPending()` is called. */
  stylings: StylingRunner & { runPending(): Promise<void> };
};

/** One photo to style, as a new user with this Style Preference in the United States, at No Budget for a body photo. */
export interface StylistCheckPhoto {
  photoType: PhotoType;
  photo: Blob;
  stylePreference: StylePreference;
  /** Draws its Previews in place of the image model, first tries and redraws alike: the image model's own unless given. */
  drawPreview?: PreviewDrawer;
}

/** How the Stylist ended its Styling: it finished, ran out of turns, had a turn refused, or stopped without finishing. */
export type StylistEnding = "finished" | "turn-cap" | "refused" | "stopped";

/**
 * What came of an Outfit's Preview: it was kept as it was first drawn, or redrawn and one of its
 * images kept, or neither; or the image model declined to draw it, or it couldn't be drawn.
 */
export type PreviewHandling = "kept" | "redrawn-kept-first" | "redrawn-kept-redraw" | "redrawn-kept-none" | "declined" | "failed";

/** One of the Outfits the Styling made, as the check reports it. */
export interface CheckedOutfit {
  position: number;
  styleIconName: string;
  /** Its Pieces, in Category order: a Product by its title, the Hairstyle by its cut, and the Brand each is built on. */
  pieces: { category: PieceCategory; item: string; brand: string | null }[];
  preview: PreviewHandling;
  /** The correction its Preview was redrawn with, its first draw's verdict's, or null when it wasn't. */
  correction: string | null;
  /** Each image drawn for its Preview, as it was stored, in order: the first, then any redraw. */
  images: Uint8Array[];
}

/** What checking one photo came to: the photo refused, or what its Styling made, and how. */
export type StylistCheckResult =
  | { styled: false; refusal: "unusable-file" | "check-errored" }
  | { styled: false; refusal: "photo-rejected"; rejection: PhotoRejection }
  | {
      styled: true;
      /** How many Outfits the Styling could make. */
      outfitsWanted: number;
      outfits: CheckedOutfit[];
      ending: StylistEnding;
      /** Its turns, oldest first. */
      turns: StylistTurn[];
      /** The turns the Stylist had, as everyone but the Demo Account has. */
      turnCap: number;
      /** What its turns cost, in US dollars, at the prices of the model that ran them, or null when none are known for it. */
      costUsd: number | null;
      /** What its turns would have cost with nothing read from the prompt cache or written to it, or null as for `costUsd`. */
      uncachedCostUsd: number | null;
      /** The fewest prompt tokens a turn after the first read from the cache, which holds at least the photo; 0 for a single turn. */
      leastCacheReadAfterFirstTurn: number;
      /** The most tokens any one of its turns' prompts held, cached or not. */
      largestPromptTokens: number;
      /** How many of the Stylist's tool calls its tools refused, or that failed, before its last turn. */
      toolCallsRefused: number;
      /** From the Styling's start to its finish. */
      durationMs: number;
      /** The product searches it set going, each once however many tries it took. */
      productSearches: number;
      /** The Stylist's Notes, as the user reads them. */
      notes: StylistNoteEntry[];
      /** What keeps its Outfits from being valid: none when it made every Outfit it could, and finished. */
      problems: string[];
    };

/**
 * Styles one photo, once, as a new user would be, and reports what came of it. On the check's own
 * fresh app it does what such a user would do: it signs up, with this Style Preference and the
 * United States, presses "Get my Outfits" with the photo, agreeing on the consent sheet, and runs that
 * first Styling to its end, at everyone's limits. Every call goes to the Qloo, product search and AI
 * the app was given, as the app's own would.
 */
export async function checkStylist(
  app: StylistCheckApp,
  { photoType, photo, stylePreference, drawPreview }: StylistCheckPhoto,
): Promise<StylistCheckResult> {
  const request = await browserRequests(app);
  const email = await signUpCheckAccount(app, request, stylePreference);
  const started = await startConsultation(request(), { photo, photoType, consent: { storeAndProcess: true, sendToAiProviders: true } });
  if (!started.ok) {
    switch (started.refusal) {
      case "unusable-file":
      case "check-errored":
        return { styled: false, refusal: started.refusal };
      case "photo-rejected":
        return { styled: false, refusal: started.refusal, rejection: started.rejection };
      default:
        throw new Error(`The check's app refused to start ${email}'s Consultation (${started.refusal}).`);
    }
  }
  const turnsBefore = app.ai.turns.length;
  const redrawsBefore = app.ai.redraws.length;
  const consultationId = started.consultationId;
  await app.ai.drawingWith(drawPreview && (async (input) => drawPreview(input, await outfitDrawn(app, consultationId, input))), () => app.stylings.runPending());
  const turns = app.ai.turns.slice(turnsBefore);

  const view = await readConsultation(request(), started.consultationId);
  if (!view) throw new Error(`The check couldn't read ${email}'s Consultation.`);
  const [made] = await app.db
    .select({ outfitsWanted: styling.outfitsWanted, productSearches: styling.productSearches, startedAt: styling.startedAt, finishedAt: styling.finishedAt })
    .from(styling)
    .where(eq(styling.consultationId, view.id));
  const { outfitsWanted, productSearches, startedAt, finishedAt } = made!;
  const turnCap = stylingLimitsFor(false).turns;
  const ending = endingOf(turns, turnCap);
  const notes = view.stylistNotes[0]?.notes ?? view.failedStyling?.notes ?? [];
  const corrections = await correctionsOf(app, consultationId, app.ai.redraws.slice(redrawsBefore));
  const outfits = view.outfits.map((shown) => {
    const images = [previewPathnameFor(view.id, shown.id), previewRedrawPathnameFor(view.id, shown.id)].flatMap((pathname) => app.blob.lastPut(pathname) ?? []);
    return checkedOutfit(shown, notes, corrections.get(shown.position) ?? null, images);
  });
  return {
    styled: true,
    outfitsWanted,
    outfits,
    ending,
    turns,
    turnCap,
    costUsd: costOf(turns),
    uncachedCostUsd: costOf(turns.map((turn) => ({ ...turn, usage: uncached(turn.usage) }))),
    leastCacheReadAfterFirstTurn: leastOf(turns.slice(1).map(({ usage }) => usage.inputTokens.cacheRead ?? 0)),
    largestPromptTokens: Math.max(0, ...turns.map(({ usage }) => usage.inputTokens.total ?? 0)),
    toolCallsRefused: turns.reduce((refused, { refusedBefore }) => refused + refusedBefore.length, 0),
    durationMs: (finishedAt ?? startedAt).getTime() - startedAt.getTime(),
    productSearches,
    notes,
    problems: [...outfitProblems(view.outfits.length, outfitsWanted), ...(ending === "finished" ? [] : [ENDING_PROBLEMS[ending]])],
  };
}

/** Signs up a new account of the check's, verified, so it can start Consultations, returning its email. */
async function signUpCheckAccount(app: StylistCheckApp, request: () => OperationContext, stylePreference: StylePreference): Promise<string> {
  const name = `stylist_check_${randomBytes(4).toString("hex")}`;
  const email = `${name.replaceAll("_", ".")}@example.com`;
  const signedUp = await signUp(request(), {
    birthDate: STYLIST_CHECK_BIRTH_DATE,
    username: name,
    email,
    // Nobody else ever signs in to the check's app, so its password is thrown away with it.
    password: randomBytes(24).toString("base64url"),
    stylePreference,
    countryCode: STYLIST_CHECK_COUNTRY_CODE,
    acceptedTerms: true,
  });
  if (!signedUp.ok) throw new Error(`The check couldn't sign up ${email} (${signedUp.refusal}).`);
  // Its address is made up, so it's marked verified at once, as the team's own Demo Account is.
  const { internalAdapter } = await app.auth.$context;
  const found = await internalAdapter.findUserByEmail(email);
  await internalAdapter.updateUser(found!.user.id, { emailVerified: true });
  return email;
}

/** One of the Outfits made, with what came of its Preview, as its steps in the notes say, and the images drawn for it. */
function checkedOutfit(shown: OutfitView, notes: readonly StylistNoteEntry[], correction: string | null, images: Uint8Array[]): CheckedOutfit {
  const steps = new Set(notes.flatMap(({ kind, text }) => (kind === "step" ? [text] : [])));
  const kept = KEPT_PREVIEWS.find((which) => steps.has(STEPS.previewKept(shown.position, which)));
  return {
    position: shown.position,
    styleIconName: shown.styleIconName,
    pieces: shown.pieces.map(({ category, item, brand }) => ({ category, item, brand: brand?.name ?? null })),
    preview: kept ? `redrawn-kept-${kept}` : previewShown(shown.preview),
    correction,
    images,
  };
}

/**
 * The Outfit of the Consultation's a Preview is being drawn for. A Preview is drawn from its Outfit's
 * Pieces alone, each Product by its title and the Hairstyle by its details, so the Pieces it's drawn
 * with say whose it is, unless two Outfits' are alike.
 */
async function outfitDrawn(app: StylistCheckApp, consultationId: string, { pieces }: Pick<PreviewInput, "pieces">): Promise<OutfitDrawn | null> {
  const rows = await app.db
    .select({ outfitId: outfit.id, position: outfit.position, styleIconName: styleIcon.name, category: piece.category, item: piece.item, details: piece.details })
    .from(outfit)
    .innerJoin(styleIcon, eq(styleIcon.id, outfit.styleIconId))
    .innerJoin(piece, eq(piece.outfitId, outfit.id))
    .where(eq(outfit.consultationId, consultationId));
  const drawnFrom = piecesKey(pieces.map((drawnPiece) => [drawnPiece.category, drawnPiece.category === "hairstyle" ? drawnPiece.details : drawnPiece.title]));
  const matching = [...new Set(rows.map(({ outfitId }) => outfitId))].filter((id) =>
    piecesKey(rows.filter(({ outfitId }) => outfitId === id).map(({ category, item, details }) => [category, category === "hairstyle" ? (details ?? item) : item])) === drawnFrom,
  );
  const [only] = matching;
  if (matching.length !== 1) return null;
  const { position, styleIconName } = rows.find(({ outfitId }) => outfitId === only)!;
  return { position, styleIconName };
}

/** Pieces as a Preview draws them, each by its Category and what it's drawn from, as one key, whatever their order. */
function piecesKey(pieces: readonly [PieceCategory, string][]): string {
  return JSON.stringify(pieces.map(([category, drawnFrom]) => ({ category, drawnFrom })).toSorted(byCategoryOrder));
}

/**
 * The correction each Outfit's Preview was redrawn with, by the Outfit's number, from the redraws
 * asked for: none for an Outfit whose Pieces are like another's, as `outfitDrawn` says.
 */
async function correctionsOf(app: StylistCheckApp, consultationId: string, redraws: readonly RedrawAskedFor[]): Promise<Map<number, string>> {
  const corrections = new Map<number, string>();
  for (const { pieces, correction } of redraws) {
    const drawnFor = await outfitDrawn(app, consultationId, { pieces });
    if (drawnFor && !corrections.has(drawnFor.position)) corrections.set(drawnFor.position, correction.trim());
  }
  return corrections;
}

/** What came of a Preview never redrawn, as the user is shown it. */
function previewShown(preview: PreviewView): PreviewHandling {
  if (preview.state === "ready") return "kept";
  if (preview.state === "refused") return preview.by === "image-model" ? "declined" : "redrawn-kept-none";
  return "failed";
}

/** What keeps a Styling's Outfits from being valid when it made fewer than it could. */
function outfitProblems(made: number, wanted: number): string[] {
  if (made === 0) return ["made no Outfit"];
  return made < wanted ? [`made ${made} of ${wanted} Outfits`] : [];
}

/** What keeps a Styling's Outfits from being valid when the Stylist didn't finish. */
const ENDING_PROBLEMS: Record<Exclude<StylistEnding, "finished">, string> = {
  "turn-cap": "ran out of turns",
  refused: "had a turn refused",
  stopped: "stopped without finishing",
};

/** The IDs of the tool calls of the turn before this prompt's that were refused or failed, as the prompt's tool results after them say. */
function callsRefusedLastTurn(prompt: LanguageModelV4Prompt): string[] {
  const lastTurn = prompt.findLastIndex(({ role }) => role === "assistant");
  return prompt
    .slice(lastTurn + 1)
    .flatMap((message) => (message.role === "tool" ? message.content : []))
    .flatMap((part) => (part.type === "tool-result" && (part.output.type === "error-text" || part.output.type === "error-json") ? [part.toolCallId] : []));
}

/** A tool call's input, as the model wrote it: JSON, or the text itself when it isn't. */
function parsed(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

/** What the turns cost, in US dollars, or null when no price is known for a model that ran one. */
function costOf(turns: readonly StylistTurn[]): number | null {
  let cost = 0;
  for (const { modelId, usage } of turns) {
    const turnCost = claudeCostUsd(modelId, usage);
    if (turnCost === null) return null;
    cost += turnCost;
  }
  return cost;
}

/** The least of the numbers, or 0 when there are none. */
function leastOf(numbers: readonly number[]): number {
  return numbers.length > 0 ? Math.min(...numbers) : 0;
}

/** The usage with every prompt token as input, as if nothing were read from the prompt cache or written to it. */
function uncached(usage: LanguageModelV4Usage): LanguageModelV4Usage {
  return { ...usage, inputTokens: { total: usage.inputTokens.total, noCache: usage.inputTokens.total, cacheRead: 0, cacheWrite: 0 } };
}

/**
 * What one call to a Claude model costs, in US dollars, for its token usage, on the rate card its
 * prompt's length picks, or null when no price is known for the model.
 */
export function claudeCostUsd(modelId: string, usage: LanguageModelV4Usage): number | null {
  const rateCards = Object.hasOwn(CLAUDE_PRICES, modelId) ? CLAUDE_PRICES[modelId as ClaudeModel] : undefined;
  const prompt = usage.inputTokens.total ?? 0;
  const rates = rateCards?.find(({ upToPromptTokens }) => upToPromptTokens === undefined || prompt <= upToPromptTokens);
  if (!rates) return null;
  const { noCache = 0, cacheWrite = 0, cacheRead = 0 } = usage.inputTokens;
  return (noCache * rates.input + cacheWrite * rates.cacheWrite + cacheRead * rates.cacheRead + (usage.outputTokens.total ?? 0) * rates.output) / 1_000_000;
}

/** How the Stylist ended its Styling, from its turns. */
function endingOf(turns: readonly StylistTurn[], turnCap: number): StylistEnding {
  const last = turns.at(-1);
  if (last?.finishReason === "content-filter") return "refused";
  if (last?.calls.some(({ tool }) => tool === "finish")) return "finished";
  return turns.length >= turnCap ? "turn-cap" : "stopped";
}
