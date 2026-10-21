import { UnretryableAiError } from "@/server/ai/provider";
import { UnretryableProductSearchError } from "@/server/product-search/provider";

import { type BuildOutfitsSteps, buildOutfits } from "./build-outfits";
import type { StylingRunner } from "./runner";
import { type StylingContext, StylingNotRunningError, stylingSteps } from "./steps";

/**
 * Stylings in tests: the "build Outfits" Workflow's own steps, in its order, run in this process
 * with no retries unless a test asks for the Preview step's or the product search step's. A started
 * Styling waits until `runPending()`, so a test can look at it running.
 */
export class InlineStylingRunner implements StylingRunner {
  /** The Stylings started and not yet run, oldest first. */
  readonly pending: string[] = [];
  /**
   * How many times a Preview step that throws is tried again, as the Workflow retries it, each try
   * knowing whether it's the last: one of the steps whose last try behaves differently. None unless
   * a test says.
   */
  previewRetries = 0;
  /**
   * How many times a product search step that throws is tried again, as the Workflow retries it,
   * each try knowing whether it's the last: the other step whose last try behaves differently. None
   * unless a test says.
   */
  searchRetries = 0;
  /** The IDs of the runs cancelled, oldest first. */
  readonly cancelled: string[] = [];
  /** Makes `cancel` throw, as it does when the Workflow can't be reached. */
  cancelFails = false;
  /** When set, runs while each run is being cancelled, as something else happening meanwhile would. */
  duringCancel?: (runId: string) => Promise<void>;
  private readonly stylingOfRun = new Map<string, string>();
  private runCount = 0;

  constructor(private readonly ctx: StylingContext) {}

  async start(stylingId: string): Promise<string> {
    this.pending.push(stylingId);
    this.runCount += 1;
    const runId = `inline-run-${this.runCount}`;
    this.stylingOfRun.set(runId, stylingId);
    return runId;
  }

  /**
   * A pending run never runs. One under way can't be stopped in this process, so it carries on as
   * if the cancel came too late, and its steps' own checks are what stop it.
   */
  async cancel(runId: string): Promise<void> {
    if (this.cancelFails) throw new Error("The Workflow couldn't be reached.");
    await this.duringCancel?.(runId);
    this.cancelled.push(runId);
    const index = this.pending.indexOf(this.stylingOfRun.get(runId) ?? "");
    if (index !== -1) this.pending.splice(index, 1);
  }

  /** Runs every pending Styling to its finish, one after another. */
  async runPending(): Promise<void> {
    for (let stylingId = this.pending.shift(); stylingId !== undefined; stylingId = this.pending.shift()) {
      await buildOutfits(stylingId, this.steps());
    }
  }

  /** The steps, the Preview and product search steps tried again as many times as the test says. */
  private steps(): BuildOutfitsSteps {
    return {
      ...stylingSteps(this.ctx),
      searchProducts: (stylingId, search) => this.retried(this.searchRetries, (steps) => steps.searchProducts(stylingId, search)),
      renderPreview: (stylingId, outfitId) => this.retried(this.previewRetries, (steps) => steps.renderPreview(stylingId, outfitId)),
    };
  }

  /**
   * A step tried again up to `retries` times, except after the failures the Workflow never retries
   * a step for: its Styling stopped, an AI call failed for good, or the product search refused the key.
   */
  private async retried(retries: number, step: (steps: BuildOutfitsSteps) => Promise<void>): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      const lastTry = attempt > retries;
      try {
        return await step(stylingSteps(this.ctx, { lastTry }));
      } catch (error) {
        if (lastTry || error instanceof StylingNotRunningError || error instanceof UnretryableAiError || error instanceof UnretryableProductSearchError) {
          throw error;
        }
      }
    }
  }
}
