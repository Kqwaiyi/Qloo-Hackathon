import type { Line } from "@/config/accounts";
import { PRODUCT_SEARCH_STEP_MAX_RETRIES } from "@/config/product-search";
import { QLOO_STEP_MAX_RETRIES } from "@/config/qloo";
import { PREVIEW_STEP_MAX_RETRIES, type PreviewState } from "@/config/stylings";
import type { Photo } from "@/server/ai/provider";
import type { BrandToLookUp, PieceSearch } from "@/server/outfit-assembly/brands";
import type { QlooBrand, QlooPerson } from "@/server/qloo/client";
import type { BrandsByStyleIcon, OutfitPlan, OutfitTry, PeopleByLine, StylingOutcome, TailoringOutcome } from "@/server/stylings/build-outfits";
import { runStyling } from "@/server/stylings/run-styling";
import type { PreviewsStarted, SavedOutfit, StylistStepResult } from "@/server/stylings/stylist";
import type { StylistBrief, StylistStyleIcon } from "@/server/stylings/stylist-brief";

import { workflowStylistModel } from "./stylist-model";

// The "build Outfits" Vercel Workflow: a thin shell that runs each of a Styling's steps as a durable
// step, with its own retries: `buildOutfits`'s for a body photo, and the Stylist's for a Face Photo,
// whose agent makes each call to its model a durable step of its own. The Workflow function runs in
// a sandbox, so each step loads the app only once it runs, outside the sandbox. Tests run the same
// steps inline instead. Runs start with zero retention (`workflowStylingRunner`), so a Stylist's run
// data, which holds the photo and its conversation, is unreadable the moment the Styling ends.

export async function buildOutfitsWorkflow(stylingId: string): Promise<void> {
  "use workflow";
  await runStyling(
    stylingId,
    {
      usesStylist,
      readBrief,
      readPhoto,
      readStyleIcons,
      saveOutfit,
      startPreviews,
      openPreview,
      ranksStyleIcons,
      styleIconLines,
      fetchStyleIcons,
      saveStyleIcons,
      planOutfits,
      fetchBrands,
      lookUpBrand,
      searchProducts,
      tailorOutfit,
      planPreviews,
      renderPreview,
      finish,
    },
    workflowStylistModel(),
  );
}

async function usesStylist(stylingId: string): Promise<boolean> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.usesStylist(stylingId));
}

async function readBrief(stylingId: string): Promise<StylistBrief> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.readBrief(stylingId));
}

/** Read from Blob into the Stylist's conversation, which keeps it in the run's data while the Styling runs. */
async function readPhoto(stylingId: string): Promise<Photo> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.readPhoto(stylingId));
}

async function readStyleIcons(stylingId: string): Promise<StylistStyleIcon[]> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.readStyleIcons(stylingId));
}

async function saveOutfit(stylingId: string, input: unknown): Promise<StylistStepResult<SavedOutfit>> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.saveOutfit(stylingId, input));
}

async function startPreviews(stylingId: string): Promise<StylistStepResult<PreviewsStarted>> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.startPreviews(stylingId));
}

async function openPreview(stylingId: string, outfit: number): Promise<StylistStepResult<{ outfitId: string }>> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.openPreview(stylingId, outfit));
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

async function planOutfits(stylingId: string, brandsByStyleIcon: BrandsByStyleIcon): Promise<OutfitPlan> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.planOutfits(stylingId, brandsByStyleIcon));
}

/** One Qloo call. */
async function fetchBrands(stylingId: string, styleIconId: string): Promise<QlooBrand[]> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.fetchBrands(stylingId, styleIconId));
}
fetchBrands.maxRetries = QLOO_STEP_MAX_RETRIES;

/** One product-search call, or none when the Brand was looked up lately. */
async function lookUpBrand(stylingId: string, brand: BrandToLookUp): Promise<void> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.lookUpBrand(stylingId, brand));
}
lookUpBrand.maxRetries = PRODUCT_SEARCH_STEP_MAX_RETRIES;

/**
 * One product-search call. Errors get the retries; one still failing on the last try passes the
 * Piece's Brand over, unless the product search refused the key.
 */
async function searchProducts(stylingId: string, search: PieceSearch): Promise<void> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.searchProducts(stylingId, search), { maxRetries: PRODUCT_SEARCH_STEP_MAX_RETRIES });
}
searchProducts.maxRetries = PRODUCT_SEARCH_STEP_MAX_RETRIES;

/** One AI call. */
async function tailorOutfit(stylingId: string, outfitTry: OutfitTry, attempt: number): Promise<TailoringOutcome> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.tailorOutfit(stylingId, outfitTry, attempt));
}

async function planPreviews(stylingId: string): Promise<string[]> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.planPreviews(stylingId));
}

/**
 * One AI call, after fetching the Outfit's Product photos. A refusal is final; errors get the
 * retries, then the Preview is left to fail. A Product photo that still fails on the last try is
 * drawn from its title.
 */
async function renderPreview(stylingId: string, outfitId: string): Promise<Extract<PreviewState, "ready" | "refused">> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.renderPreview(stylingId, outfitId), { maxRetries: PREVIEW_STEP_MAX_RETRIES });
}
renderPreview.maxRetries = PREVIEW_STEP_MAX_RETRIES;

async function finish(stylingId: string, outcome: StylingOutcome): Promise<void> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.finish(stylingId, outcome));
}
