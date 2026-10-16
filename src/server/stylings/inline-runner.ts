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
  private runCount = 0;

  constructor(private readonly ctx: StylingContext) {}

  async start(stylingId: string): Promise<string> {
    this.pending.push(stylingId);
    this.runCount += 1;
    return `inline-run-${this.runCount}`;
  }

  /** Runs every pending Styling to its finish, one after another. */
  async runPending(): Promise<void> {
    for (let stylingId = this.pending.shift(); stylingId !== undefined; stylingId = this.pending.shift()) {
      await buildOutfits(stylingId, stylingSteps(this.ctx));
    }
  }
}
