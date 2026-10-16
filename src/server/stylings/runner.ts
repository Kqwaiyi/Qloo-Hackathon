/** Runs a Styling's "build Outfits" steps in the background: the Vercel Workflow, or inline in tests. */
export interface StylingRunner {
  /** Starts the Styling's run without waiting for it, returning the run's ID. */
  start(stylingId: string): Promise<string>;
  /**
   * Cancels the run, so it starts no more steps. A step already under way still finishes, so its
   * own check that the Styling still runs is what keeps it from saving.
   */
  cancel(runId: string): Promise<void>;
}
