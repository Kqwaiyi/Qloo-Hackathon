import type { Line } from "@/config/accounts";
import { PRODUCT_SEARCH_STEP_MAX_RETRIES } from "@/config/product-search";
import { QLOO_STEP_MAX_RETRIES } from "@/config/qloo";
import type { BrandToLookUp } from "@/server/outfit-assembly/brands";
import type { QlooBrand, QlooPerson } from "@/server/qloo/client";
import {
  type BrandsByStyleIcon,
  buildOutfits,
  type OutfitPlan,
  type OutfitTry,
  type PeopleByLine,
  type StylingOutcome,
  type TailoringOutcome,
} from "@/server/stylings/build-outfits";

// The "build Outfits" Vercel Workflow: a thin shell that runs each of `buildOutfits`'s steps as a
// durable step, with its own retries. The Workflow function runs in a sandbox, so each step loads
// the app only once it runs, outside the sandbox. Tests run the same steps inline instead.

export async function buildOutfitsWorkflow(stylingId: string): Promise<void> {
  "use workflow";
  await buildOutfits(stylingId, {
    ranksStyleIcons,
    styleIconLines,
    fetchStyleIcons,
    saveStyleIcons,
    planOutfits,
    fetchBrands,
    lookUpBrand,
    tailorOutfit,
    planPreviews,
    renderPreview,
    finish,
  });
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

/** One AI call. A refusal is final; errors get the default retries, then the Preview is left to fail. */
async function renderPreview(stylingId: string, outfitId: string): Promise<void> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.renderPreview(stylingId, outfitId));
}

async function finish(stylingId: string, outcome: StylingOutcome): Promise<void> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.finish(stylingId, outcome));
}
