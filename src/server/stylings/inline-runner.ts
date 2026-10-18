import { buildOutfits } from "./build-outfits";
import type { StylingRunner } from "./runner";
import { type StylingContext, stylingSteps } from "./steps";

/**
 * Stylings in tests: the "build Outfits" Workflow's own steps, in its order, run in this process
 * with no retries. A started Styling waits until `runPending()`, so a test can look at it running.
 */
export class InlineStylingRunner implements StylingRunner {
  /** The Stylings started and not yet run, oldest first. */
  readonly pending: string[] = [];
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
      await buildOutfits(stylingId, stylingSteps(this.ctx));
    }
  }
}
