/** Runs a Styling's "build Outfits" steps in the background: the Vercel Workflow, or inline in tests. */
export interface StylingRunner {
  /** Starts the Styling's run without waiting for it, returning the run's ID. */
  start(stylingId: string): Promise<string>;
}
