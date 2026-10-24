import type { Line } from "@/config/accounts";
import { PRODUCT_SEARCH_STEP_MAX_RETRIES } from "@/config/product-search";
import { QLOO_STEP_MAX_RETRIES } from "@/config/qloo";
import { PREVIEW_STEP_MAX_RETRIES } from "@/config/stylings";
import type { FirstDrawVerdict, Photo, RedrawVerdict, VerdictResult, WrongPreview } from "@/server/ai/provider";
import type { BrandToLookUp } from "@/server/outfit-assembly/brands";
import type { QlooPerson } from "@/server/qloo/client";
import type { PreviewDrawn, PreviewToKeep } from "@/server/stylings/preview-phase";
import {
  type BrandsFetched,
  type NoteWritten,
  type PeopleByLine,
  type ProductsSearched,
  runStylist,
  type SavedOutfit,
  type StyleIconPassedOver,
  type StylingOutcome,
  type StylistStepResult,
} from "@/server/stylings/stylist";
import type { StylistBrief, StylistStyleIcon } from "@/server/stylings/stylist-brief";

import { workflowStylistModel } from "./stylist-model";

// The Styling Vercel Workflow: a thin shell that runs the Stylist, then its Preview phase, with each
// of their steps as a durable step, with its own retries. The Stylist's agent makes each call to its
// model a durable step of its own. The Workflow function runs in a sandbox, so each step loads the
// app only once it runs, outside the sandbox. Tests run the same steps inline instead. Runs start with zero retention
// (`workflowStylingRunner`), so a Stylist's run data, which holds the photo and its conversation, is
// unreadable the moment the Styling ends.

export async function stylingWorkflow(stylingId: string): Promise<void> {
  "use workflow";
  await runStylist(
    stylingId,
    {
      readBrief,
      readTurnCap,
      readPhoto,
      ranksStyleIcons,
      styleIconLines,
      fetchStyleIcons,
      saveStyleIcons,
      readStyleIcons,
      fetchBrands,
      readBrandsInPlay,
      lookUpBrand,
      searchProducts,
      passOverStyleIcon,
      saveOutfit,
      startPreviews,
      renderPreview,
      judgeFirstDraw,
      dropUncheckedPreview,
      redrawPreview,
      judgeRedraw,
      keepPreview,
      finish,
      saveNotes,
      writeNote,
    },
    workflowStylistModel(),
  );
}

async function readBrief(stylingId: string): Promise<StylistBrief> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.readBrief(stylingId));
}

async function readTurnCap(stylingId: string): Promise<number> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.readTurnCap(stylingId));
}

/** Read from Blob into the Stylist's conversation, which keeps it in the run's data while the Styling runs. */
async function readPhoto(stylingId: string): Promise<Photo> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.readPhoto(stylingId));
}

async function ranksStyleIcons(stylingId: string): Promise<boolean> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.ranksStyleIcons(stylingId));
}

async function styleIconLines(stylingId: string): Promise<Line[]> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.styleIconLines(stylingId));
}

/** One Qloo call. */
async function fetchStyleIcons(stylingId: string, line: Line): Promise<QlooPerson[]> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.fetchStyleIcons(stylingId, line));
}
fetchStyleIcons.maxRetries = QLOO_STEP_MAX_RETRIES;

async function saveStyleIcons(stylingId: string, peopleByLine: PeopleByLine): Promise<void> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.saveStyleIcons(stylingId, peopleByLine));
}

async function readStyleIcons(stylingId: string): Promise<StylistStyleIcon[]> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.readStyleIcons(stylingId));
}

/** One Qloo call, or more while a thin pool widens, or none when the Brands were fetched already. */
async function fetchBrands(stylingId: string, input: unknown): Promise<StylistStepResult<{ styleIcon: number }>> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.fetchBrands(stylingId, input));
}
fetchBrands.maxRetries = QLOO_STEP_MAX_RETRIES;

async function readBrandsInPlay(stylingId: string, styleIcon: number): Promise<{ lookUp: BrandToLookUp[] } | BrandsFetched> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.readBrandsInPlay(stylingId, styleIcon));
}

/** One product-search call, or none when the Brand was looked up lately. */
async function lookUpBrand(stylingId: string, brand: BrandToLookUp): Promise<void> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.lookUpBrand(stylingId, brand));
}
lookUpBrand.maxRetries = PRODUCT_SEARCH_STEP_MAX_RETRIES;

/**
 * One product-search call, or none when it was made already. Errors get the retries; one still
 * failing on the last try puts the Brand out of play for the Category, unless the product search
 * refused the key.
 */
async function searchProducts(stylingId: string, input: unknown): Promise<StylistStepResult<ProductsSearched | { lookUp: BrandToLookUp }>> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.searchProducts(stylingId, input), { maxRetries: PRODUCT_SEARCH_STEP_MAX_RETRIES });
}
searchProducts.maxRetries = PRODUCT_SEARCH_STEP_MAX_RETRIES;

async function passOverStyleIcon(stylingId: string, turn: number, input: unknown): Promise<StylistStepResult<StyleIconPassedOver>> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.passOverStyleIcon(stylingId, turn, input));
}

async function saveOutfit(stylingId: string, input: unknown): Promise<StylistStepResult<SavedOutfit>> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.saveOutfit(stylingId, input));
}

async function startPreviews(stylingId: string): Promise<string[]> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.startPreviews(stylingId));
}

/**
 * One AI call, after fetching the Outfit's Product photos. A refusal is final; errors get the
 * retries, then the Preview is left to fail. A Product photo that still fails on the last try is
 * drawn from its title. Only whether it was drawn comes back: the run's data never holds the Preview.
 */
async function renderPreview(stylingId: string, outfitId: string): Promise<PreviewDrawn> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.renderPreview(stylingId, outfitId), { maxRetries: PREVIEW_STEP_MAX_RETRIES });
}
renderPreview.maxRetries = PREVIEW_STEP_MAX_RETRIES;

/**
 * One AI call, the verdict on a Preview as first drawn, after reading the photo and the Preview from
 * Blob and fetching the Outfit's Product photos, as for drawing it, so the run's data holds only the
 * verdict. One judged right is saved as checked.
 */
async function judgeFirstDraw(stylingId: string, outfitId: string): Promise<VerdictResult<FirstDrawVerdict>> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.judgeFirstDraw(stylingId, outfitId), { maxRetries: PREVIEW_STEP_MAX_RETRIES });
}
judgeFirstDraw.maxRetries = PREVIEW_STEP_MAX_RETRIES;

/** Leaves the Outfit without a Preview once its first draw has no verdict, deleting the image. */
async function dropUncheckedPreview(stylingId: string, outfitId: string): Promise<void> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.dropUncheckedPreview(stylingId, outfitId));
}

/**
 * One AI call, as for a Preview, with the first draw's verdict's correction, after adding its note.
 * A refusal is final; errors get the retries, then the redraw is left failed. Only whether it was
 * drawn comes back.
 */
async function redrawPreview(stylingId: string, outfitId: string, firstVerdict: WrongPreview): Promise<PreviewDrawn> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.redrawPreview(stylingId, outfitId, firstVerdict), { maxRetries: PREVIEW_STEP_MAX_RETRIES });
}
redrawPreview.maxRetries = PREVIEW_STEP_MAX_RETRIES;

/** One AI call, the verdict on a redraw beside its first image, each read and fetched as for the first draw's verdict. */
async function judgeRedraw(stylingId: string, outfitId: string, firstVerdict: WrongPreview): Promise<VerdictResult<RedrawVerdict>> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.judgeRedraw(stylingId, outfitId, firstVerdict), { maxRetries: PREVIEW_STEP_MAX_RETRIES });
}
judgeRedraw.maxRetries = PREVIEW_STEP_MAX_RETRIES;

async function keepPreview(stylingId: string, outfitId: string, keep: PreviewToKeep): Promise<void> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.keepPreview(stylingId, outfitId, keep));
}

async function finish(stylingId: string, outcome: StylingOutcome): Promise<void> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.finish(stylingId, outcome));
}

/** Saves a turn's notes to our database, so the Stylist's Notes never wait on the run's data. */
async function saveNotes(stylingId: string, turn: number, texts: string[]): Promise<void> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.saveNotes(stylingId, turn, texts));
}

/** Saves a note the Stylist wrote with writeNote to our database, as `saveNotes` saves its text. */
async function writeNote(stylingId: string, turn: number, input: unknown): Promise<StylistStepResult<NoteWritten>> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.writeNote(stylingId, turn, input));
}
