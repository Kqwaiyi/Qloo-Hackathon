import { UnretryableAiError } from "@/server/ai/provider";
import { NoExchangeRateError } from "@/server/outfit-assembly/products";
import { UnretryableProductSearchError } from "@/server/product-search/provider";

import type { StylingRunner } from "./runner";
import { ProductSearchDownError, type StylingContext, StylingNotRunningError } from "./steps";
import { runStylist, type StylistSteps } from "./stylist";
import { allStylingSteps } from "./stylist-steps";

/**
 * Stylings in tests, and in the team's landing sample script: the Styling Workflow's own steps, run
 * through the Stylist in this process, with no retries unless a test (or the script) asks for the
 * Preview steps' or the product search step's. Outside the Workflow compiler its directives do
 * nothing, so the Workflow agent's own steps, each call to the Stylist's model, run here too, on the
 * context's AI, as the Workflow's model steps call it. A started Styling waits until
 * `runPending()`, so a test can look at it running.
 */
export class InlineStylingRunner implements StylingRunner {
  /** The Stylings started and not yet run, oldest first. */
  readonly pending: string[] = [];
  /**
   * How many times a Preview step, a redraw's or a verdict's, that throws is tried again, as the
   * Workflow retries it, each try knowing whether it's the last: some of the steps whose last try
   * behaves differently. None unless a test (or the script) says.
   */
  previewRetries = 0;
  /**
   * How many times a product search step that throws is tried again, as the Workflow retries it,
   * each try knowing whether it's the last: the other step whose last try behaves differently. None
   * unless a test (or the script) says.
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
      await runStylist(stylingId, this.steps(), this.ctx.ai.stylistModel());
    }
  }

  /** The steps, the Preview and product search steps tried again as many times as the test says. */
  private steps(): StylistSteps {
    return {
      ...allStylingSteps(this.ctx),
      searchProducts: (stylingId, input) => this.retried(this.searchRetries, (steps) => steps.searchProducts(stylingId, input)),
      renderPreview: (stylingId, outfitId) => this.retried(this.previewRetries, (steps) => steps.renderPreview(stylingId, outfitId)),
      judgeFirstDraw: (stylingId, outfitId) => this.retried(this.previewRetries, (steps) => steps.judgeFirstDraw(stylingId, outfitId)),
      redrawPreview: (stylingId, outfitId, firstVerdict) =>
        this.retried(this.previewRetries, (steps) => steps.redrawPreview(stylingId, outfitId, firstVerdict)),
      judgeRedraw: (stylingId, outfitId, firstVerdict) =>
        this.retried(this.previewRetries, (steps) => steps.judgeRedraw(stylingId, outfitId, firstVerdict)),
    };
  }

  /**
   * A step tried again up to `retries` times, except after the failures the Workflow never retries
   * a step for: its Styling stopped, an AI call failed for good, the product search refused the key
   * or is down, or no rate is stored for the market's currency.
   */
  private async retried<T>(retries: number, step: (steps: StylistSteps) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      const lastTry = attempt > retries;
      try {
        return await step(allStylingSteps(this.ctx, { lastTry }));
      } catch (error) {
        if (
          lastTry ||
          error instanceof StylingNotRunningError ||
          error instanceof UnretryableAiError ||
          error instanceof UnretryableProductSearchError ||
          error instanceof ProductSearchDownError ||
          error instanceof NoExchangeRateError
        ) {
          throw error;
        }
      }
    }
  }
}
