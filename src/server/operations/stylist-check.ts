import type { LanguageModelV4, LanguageModelV4FinishReason, LanguageModelV4Prompt, LanguageModelV4Usage } from "@ai-sdk/provider";
import { type LanguageModelMiddleware, wrapLanguageModel } from "ai";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { STYLIST_CHECK_BIRTH_DATE, STYLIST_CHECK_COUNTRY_CODE, type StylePreference } from "@/config/accounts";
import { CLAUDE_PRICES, type ClaudeModel } from "@/config/ai";
import { byCategoryOrder, type PhotoType, type PieceCategory } from "@/config/consultations";
import { type KeptPreview, stylingLimitsFor } from "@/config/stylings";
import type {
  AiProvider,
  FirstDrawVerdict,
  PhotoCheckInput,
  PhotoCheckResult,
  PreviewInput,
  PreviewResult,
  RedrawVerdict,
  VerdictResult,
} from "@/server/ai/provider";
import type { BlobStore, StoredBlob } from "@/server/blob/store";
import { previewPathnameFor, previewRedrawPathnameFor } from "@/server/consultations/blob-pathnames";
import type { PhotoRejection } from "@/server/consultations/photo-check";
import { outfit, piece, styleIcon, styling } from "@/server/db/schema";
import { readConsultation, startConsultation } from "@/server/operations/consultations";
import type { OperationContext } from "@/server/operations/context";
import { signUp } from "@/server/operations/sign-up";
import { browserRequests } from "@/server/operations/team";
import type { PreviewDrawn } from "@/server/stylings/preview-phase";
import type { StylingRunner } from "@/server/stylings/runner";
import { passOverStyleIconInputSchema, type StyleIconPassedOver, type StylistStepResult, type StylistSteps } from "@/server/stylings/stylist";
import { asOneNote, type StylistNoteEntry } from "@/server/stylings/stylist-notes";

// The Stylist check (spec: "Fakes and the check"), the Haiku check: the team's script runs the real
// Stylist on fixed, AI-generated photos, each styled once as a new user would be, and reports whether
// it made valid Outfits, its turns, time and largest prompt, what Claude cost across the Stylist's
// model and the verdict's, the Style Icons it passed over for hair length, and what the Preview phase
// did with each Preview, some of them deliberately wrong. It runs on a fresh app of its own, which
// lives only while the script runs, on an AI, a Blob store and Styling steps the check watches.

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

/** One call Claude answered for a Preview's verdict, as the check sees it: never what it was sent or said. */
export interface VerdictCall {
  /** The model that answered it, by its ID, such as "claude-sonnet-5-5". */
  modelId: string;
  /** Its tokens, as the model reports them: its prompt's, cached or not, and what it wrote. */
  usage: LanguageModelV4Usage;
}

/**
 * The AI a Stylist check runs on: the app's own, watched. It keeps each of the Stylist's turns and
 * each call Claude answered for a Preview's verdict, and draws each Preview as the check says: on the
 * image model unless the check draws them itself.
 */
export class StylistCheckAi implements AiProvider {
  /** Every turn of the Stylist's, oldest first, across every Styling the check runs on it. */
  readonly turns: StylistTurn[] = [];
  /** Every call Claude answered for a Preview's verdict, oldest first, across every Styling the check runs on it. */
  readonly verdictCalls: VerdictCall[] = [];
  /** Judges each Preview on the app's own AI, as it is. */
  readonly judgePreview: AiProvider["judgePreview"];
  private readonly ai: AiProvider;
  private drawer: (input: PreviewInput) => Promise<PreviewResult>;

  /**
   * On the app's own AI, as `buildAi` builds it: it wraps the model each Preview's verdict is asked
   * of in the middleware it's given, so the check sees each call's tokens. An AI whose verdicts ask
   * no model, as the fake's, has no verdict calls.
   */
  constructor(buildAi: (verdictMiddleware: LanguageModelMiddleware) => AiProvider) {
    const ai = buildAi({
      wrapGenerate: async ({ doGenerate, model }) => {
        const call = await doGenerate();
        this.verdictCalls.push({ modelId: model.modelId, usage: call.usage });
        return call;
      },
    });
    this.ai = ai;
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
  /**
   * Runs Stylings in this process: each one started runs to its end when `runPending()` is called,
   * through its steps as `watched` gives them, so the check can watch them.
   */
  stylings: StylingRunner & { runPending(watched?: (steps: StylistSteps) => StylistSteps): Promise<void> };
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
 * What the Preview phase did with an Outfit's Preview: judged it right as first drawn, and kept it;
 * drew it, but had no verdict on it, so never showed it; or found it wrong, redrew it and kept one
 * of its images, or neither. Or the image model declined to draw it, or it couldn't be drawn.
 */
export type PreviewHandling = "kept" | "unchecked" | "redrawn-kept-first" | "redrawn-kept-redraw" | "redrawn-kept-none" | "declined" | "failed";

/** A Preview the Preview phase redrew, as its first draw's verdict found it wrong, and how its redraw came out. */
export interface PreviewRedrawn {
  /** Whether its first image broke a hard rule, as its first draw's verdict found. */
  firstBreaksHardRule: boolean;
  /** The correction it was redrawn with, its first draw's verdict's. */
  correction: string;
  /**
   * How its redraw came out: declined by the image model; never drawn, as it still failed after its
   * retries; or drawn and judged: whether it broke a hard rule and which of the two images the
   * verdict called better, or no verdict, as the model refused to judge it or it still failed.
   */
  redraw: "declined" | "failed" | { verdict: Pick<RedrawVerdict, "breaksHardRule" | "better"> | null };
}

/** One of the Outfits the Styling made, as the check reports it. */
export interface CheckedOutfit {
  position: number;
  styleIconName: string;
  /** Its Pieces, in Category order: a Product by its title, the Hairstyle by its cut, and the Brand each is built on. */
  pieces: { category: PieceCategory; item: string; brand: string | null }[];
  /** What the Preview phase did with its Preview. */
  preview: PreviewHandling;
  /** What the Preview phase found and did, for a Preview it redrew; null for any other. */
  redrawn: PreviewRedrawn | null;
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
      /** The calls Claude answered for its Previews' verdicts, oldest first. */
      verdictCalls: VerdictCall[];
      /** What its turns cost, in US dollars, at the prices of the model that ran them, or null when none are known for it. */
      stylistCostUsd: number | null;
      /** What its turns would have cost with nothing read from the prompt cache or written to it, or null as for `stylistCostUsd`. */
      uncachedStylistCostUsd: number | null;
      /** What its verdict calls cost, in US dollars, at the prices of the model that answered them, or null when none are known for it. */
      verdictCostUsd: number | null;
      /** What Claude cost in all, the Stylist's turns and the verdict calls together, or null when either is unknown. */
      costUsd: number | null;
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
      /** The Style Icons the Stylist passed over for hair length, in the order it did, each by name, with the reason the user read. */
      hairLengthPassOvers: { styleIconName: string; reason: string }[];
      /** How many times the Stylist tried to pass over a Style Icon for hair length and its tool refused. */
      hairLengthPassOversRefused: number;
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
  const verdictCallsBefore = app.ai.verdictCalls.length;
  const consultationId = started.consultationId;
  const watched: StepsWatched = { previews: new Map(), passOvers: [] };
  await app.ai.drawingWith(drawPreview && (async (input) => drawPreview(input, await outfitDrawn(app, consultationId, input))), () =>
    app.stylings.runPending((steps) => watchingSteps(steps, watched)),
  );
  const turns = app.ai.turns.slice(turnsBefore);
  const verdictCalls = app.ai.verdictCalls.slice(verdictCallsBefore);

  const view = await readConsultation(request(), started.consultationId);
  if (!view) throw new Error(`The check couldn't read ${email}'s Consultation.`);
  const [made] = await app.db
    .select({
      id: styling.id,
      outfitsWanted: styling.outfitsWanted,
      productSearches: styling.productSearches,
      hairLengthPassOvers: styling.hairLengthPassOvers,
      startedAt: styling.startedAt,
      finishedAt: styling.finishedAt,
    })
    .from(styling)
    .where(eq(styling.consultationId, view.id));
  const { id: stylingId, outfitsWanted, productSearches, hairLengthPassOvers, startedAt, finishedAt } = made!;
  const turnCap = stylingLimitsFor(false).turns;
  const ending = endingOf(turns, turnCap);
  const notes = view.stylistNotes[0]?.notes ?? view.failedStyling?.notes ?? [];
  const outfits = view.outfits.map((shown) => ({
    position: shown.position,
    styleIconName: shown.styleIconName,
    pieces: shown.pieces.map(({ category, item, brand }) => ({ category, item, brand: brand?.name ?? null })),
    ...previewReported(watched.previews.get(shown.id)),
    images: [previewPathnameFor(view.id, shown.id), previewRedrawPathnameFor(view.id, shown.id)].flatMap((pathname) => app.blob.lastPut(pathname) ?? []),
  }));
  const stylistCostUsd = costOf(turns);
  const verdictCostUsd = costOf(verdictCalls);
  return {
    styled: true,
    outfitsWanted,
    outfits,
    ending,
    turns,
    turnCap,
    verdictCalls,
    stylistCostUsd,
    uncachedStylistCostUsd: costOf(turns.map((turn) => ({ ...turn, usage: uncached(turn.usage) }))),
    verdictCostUsd,
    costUsd: stylistCostUsd === null || verdictCostUsd === null ? null : stylistCostUsd + verdictCostUsd,
    leastCacheReadAfterFirstTurn: leastOf(turns.slice(1).map(({ usage }) => usage.inputTokens.cacheRead ?? 0)),
    largestPromptTokens: Math.max(0, ...turns.map(({ usage }) => usage.inputTokens.total ?? 0)),
    toolCallsRefused: turns.reduce((refused, { refusedBefore }) => refused + refusedBefore.length, 0),
    durationMs: (finishedAt ?? startedAt).getTime() - startedAt.getTime(),
    productSearches,
    ...(await hairLengthPassOversOf(app, { stylingId, counted: hairLengthPassOvers }, watched.passOvers)),
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

/**
 * What the Preview phase did with one Outfit's Preview, as the check watched its steps: how each step
 * that drew or judged it ended, once its retries were done, and which image it kept. Each is unset
 * until its step ends.
 */
interface PreviewWatched {
  /** How its first draw came out: drawn, declined by the image model, or still failing after its retries. */
  drawn?: PreviewDrawn | "failed";
  /** Its first draw's verdict, or null when it had none, as the model refused it or it still failed. */
  firstVerdict?: FirstDrawVerdict | null;
  /** How its redraw came out, as `drawn` says. */
  redrawn?: PreviewDrawn | "failed";
  /** Its redraw's verdict, or null when it had none, as for `firstVerdict`. */
  redrawVerdict?: RedrawVerdict | null;
  /** Which of its images it kept, once it had redrawn it. */
  kept?: KeptPreview;
}

/** One of the Stylist's calls to pass over a Style Icon, as the check watched its step. */
interface PassOverWatched {
  /** What it asked for, as the Stylist gave it. */
  input: unknown;
  /** What came of it: passed over, or refused, saying why; or "threw", when the step failed. */
  result: StylistStepResult<StyleIconPassedOver> | "threw";
}

/** What the check watched of a Styling's steps. */
interface StepsWatched {
  /** What its Preview phase did with each Outfit's Preview, by the Outfit's ID. */
  previews: Map<string, PreviewWatched>;
  /** Its calls to pass over a Style Icon, in the order they ended. */
  passOvers: PassOverWatched[];
}

/**
 * The Styling's steps, watched: each of its Preview phase's that draws, judges or keeps an Outfit's
 * Preview, so `watched` holds how each ended, by the Outfit's ID, and each pass-over, with what it
 * asked. Each still does just what it did, throwing as it threw.
 */
function watchingSteps(steps: StylistSteps, { previews, passOvers }: StepsWatched): StylistSteps {
  const watch = (outfitId: string, outcome: PreviewWatched) => previews.set(outfitId, { ...previews.get(outfitId), ...outcome });
  const verdictOf = <Verdict>(result: VerdictResult<Verdict> | "threw") => (result === "threw" || result.refused ? null : result.verdict);
  return {
    ...steps,
    renderPreview: (stylingId, outfitId) => recording(steps.renderPreview(stylingId, outfitId), (drawn) => watch(outfitId, { drawn: drawn === "threw" ? "failed" : drawn })),
    judgeFirstDraw: (stylingId, outfitId) => recording(steps.judgeFirstDraw(stylingId, outfitId), (result) => watch(outfitId, { firstVerdict: verdictOf(result) })),
    redrawPreview: (stylingId, outfitId, firstVerdict) =>
      recording(steps.redrawPreview(stylingId, outfitId, firstVerdict), (redrawn) => watch(outfitId, { redrawn: redrawn === "threw" ? "failed" : redrawn })),
    judgeRedraw: (stylingId, outfitId, firstVerdict) =>
      recording(steps.judgeRedraw(stylingId, outfitId, firstVerdict), (result) => watch(outfitId, { redrawVerdict: verdictOf(result) })),
    // Keeping that throws keeps nothing: the Styling's finish leaves the Outfit with no Preview.
    keepPreview: (stylingId, outfitId, keep) => recording(steps.keepPreview(stylingId, outfitId, keep), (result) => result !== "threw" && watch(outfitId, { kept: keep.kept })),
    passOverStyleIcon: (stylingId, turn, input) => recording(steps.passOverStyleIcon(stylingId, turn, input), (result) => passOvers.push({ input, result })),
  };
}

/**
 * The Style Icons the Stylist passed over for hair length, by name, with the reason the user read,
 * and how many of its tries its tool refused, from its pass-overs as watched. A pass-over of a Style
 * Icon passed over already, by the Stylist or as its Brands can't complete an Outfit, goes through
 * with nothing done: so only the first to go through for each Style Icon passed it over, and there
 * are no more for hair length than the Styling counted, which on a body photo is none.
 */
async function hairLengthPassOversOf(
  app: StylistCheckApp,
  { stylingId, counted }: { stylingId: string; counted: number },
  passOvers: readonly PassOverWatched[],
): Promise<Pick<Extract<StylistCheckResult, { styled: true }>, "hairLengthPassOvers" | "hairLengthPassOversRefused">> {
  const tries = passOvers.flatMap(({ input, result }) => {
    const asked = passOverStyleIconInputSchema.safeParse(input);
    return asked.success && result !== "threw" ? [{ asked: asked.data, result }] : [];
  });
  const passedOverAlready = new Set<number>();
  const forHairLength: { styleIcon: number; reason: string }[] = [];
  for (const { asked, result } of tries) {
    if (!result.ok || passedOverAlready.has(result.styleIcon)) continue;
    passedOverAlready.add(result.styleIcon);
    if (asked.reasonKind === "hairLength") forHairLength.push({ styleIcon: result.styleIcon, reason: asOneNote(asked.reason) });
  }
  // A first Styling passes over Style Icons on its own list, each by its number there.
  const listed = await app.db.select({ number: styleIcon.position, name: styleIcon.name }).from(styleIcon).where(eq(styleIcon.stylingId, stylingId));
  const nameOf = (number: number) => listed.find((icon) => icon.number === number)?.name ?? `Style Icon ${number}`;
  return {
    hairLengthPassOvers: forHairLength.slice(0, counted).map(({ styleIcon: number, reason }) => ({ styleIconName: nameOf(number), reason })),
    hairLengthPassOversRefused: tries.filter(({ asked, result }) => asked.reasonKind === "hairLength" && !result.ok).length,
  };
}

/** What `step` gives, once `record` is told it, or "threw" when it throws, which it then throws on. */
async function recording<T>(step: Promise<T>, record: (result: T | "threw") => void): Promise<T> {
  try {
    const result = await step;
    record(result);
    return result;
  } catch (error) {
    record("threw");
    throw error;
  }
}

/**
 * What the Preview phase did with an Outfit's Preview, as the check watched it. One never drawn, as
 * when the Styling broke before its Preview phase, couldn't be drawn; and a redrawn one whose
 * keeping never went through is left with none, as the Styling's finish leaves it.
 */
function previewReported(seen: PreviewWatched | undefined): Pick<CheckedOutfit, "preview" | "redrawn"> {
  if (seen?.drawn === "refused") return { preview: "declined", redrawn: null };
  if (seen?.drawn !== "ready") return { preview: "failed", redrawn: null };
  const first = seen.firstVerdict;
  if (!first) return { preview: "unchecked", redrawn: null };
  if (first.right) return { preview: "kept", redrawn: null };
  const verdict = seen.redrawVerdict ? { breaksHardRule: seen.redrawVerdict.breaksHardRule, better: seen.redrawVerdict.better } : null;
  return {
    preview: `redrawn-kept-${seen.kept ?? "none"}`,
    redrawn: {
      firstBreaksHardRule: first.breaksHardRule,
      correction: first.correction,
      redraw: seen.redrawn === "ready" ? { verdict } : seen.redrawn === "refused" ? "declined" : "failed",
    },
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

/** What the calls to Claude cost, in US dollars, each at its own model's prices, or null when no price is known for a model that answered one. */
function costOf(calls: readonly { modelId: string; usage: LanguageModelV4Usage }[]): number | null {
  let cost = 0;
  for (const { modelId, usage } of calls) {
    const callCost = claudeCostUsd(modelId, usage);
    if (callCost === null) return null;
    cost += callCost;
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
