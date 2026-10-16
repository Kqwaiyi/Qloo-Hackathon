import type { Line } from "@/config/accounts";
import { QLOO_STEP_MAX_RETRIES } from "@/config/qloo";
import type { QlooPerson } from "@/server/qloo/client";
import { buildOutfits, type PeopleByLine, type StylingOutcome } from "@/server/stylings/build-outfits";

// The "build Outfits" Vercel Workflow: a thin shell that runs each of `buildOutfits`'s steps as a
// durable step, with its own retries. The Workflow function runs in a sandbox, so each step loads
// the app only once it runs, outside the sandbox. Tests run the same steps inline instead.

export async function buildOutfitsWorkflow(stylingId: string): Promise<void> {
  "use workflow";
  await buildOutfits(stylingId, { styleIconLines, fetchStyleIcons, saveStyleIcons, makeOutfits, finish });
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

async function makeOutfits(stylingId: string): Promise<void> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.makeOutfits(stylingId));
}

async function finish(stylingId: string, outcome: StylingOutcome): Promise<void> {
  "use step";
  const { runWorkflowStep } = await import("@/server/stylings/workflow-steps");
  return runWorkflowStep((steps) => steps.finish(stylingId, outcome));
}
