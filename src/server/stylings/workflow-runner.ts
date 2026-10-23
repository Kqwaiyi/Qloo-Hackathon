import "server-only";

import { getRun, start } from "workflow/api";

import { buildOutfitsWorkflow } from "@/workflows/build-outfits";

import type { StylingRunner } from "./runner";

/** Stylings as the "build Outfits" Vercel Workflow: Vercel's in deployments, the Local World in development. */
export const workflowStylingRunner: StylingRunner = {
  async start(stylingId) {
    // Each step saves its output to the database, so nothing reads a run's data afterwards. A Face
    // Photo's holds the photo and the Stylist's conversation (ADR-0011), so with no retention, rather
    // than the plan's (7 days on Pro), it's unreadable the moment the run ends, and every copy is
    // gone within 36 days, as the deletion promise says.
    const run = await start(buildOutfitsWorkflow, [stylingId], { experimental_retention: 0 });
    return run.runId;
  },

  async cancel(runId) {
    await getRun(runId).cancel();
  },
};
