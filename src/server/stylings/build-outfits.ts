import type { Line } from "@/config/accounts";
import type { QlooPerson } from "@/server/qloo/client";

// The "build Outfits" Styling, as the order of its steps. The Vercel Workflow runs each step as a
// durable step with its own retries; tests run the same steps inline. This module only orders
// them, so the Workflow's sandbox can load it: it imports nothing but types.

/** Each line's people, as its person call ranked them. */
export type PeopleByLine = Partial<Record<Line, QlooPerson[]>>;

/** How the Styling's steps ended: all done, or one still failing after its retries. */
export type StylingOutcome = "completed" | "broke";

/** The steps, each given the Styling's ID. Each one checks the Styling is still running before it saves. */
export interface BuildOutfitsSteps {
  /** The lines whose Style Icons the Styling asks Qloo for, one person call each. */
  styleIconLines(stylingId: string): Promise<Line[]>;
  /** One line's person call. */
  fetchStyleIcons(stylingId: string, line: Line): Promise<QlooPerson[]>;
  /** Ranks the Style Icons from the person calls and saves them. */
  saveStyleIcons(stylingId: string, peopleByLine: PeopleByLine): Promise<void>;
  /** Makes one Outfit per top unused Style Icon, up to the Outfits wanted. */
  makeOutfits(stylingId: string): Promise<void>;
  /** Switches in the Outfits made all at once, or fails the Styling if it made none. */
  finish(stylingId: string, outcome: StylingOutcome): Promise<void>;
}

export async function buildOutfits(stylingId: string, steps: BuildOutfitsSteps): Promise<void> {
  let outcome: StylingOutcome = "completed";
  try {
    const lines = await steps.styleIconLines(stylingId);
    const peopleByLine: PeopleByLine = {};
    await Promise.all(
      lines.map(async (line) => {
        peopleByLine[line] = await steps.fetchStyleIcons(stylingId, line);
      }),
    );
    await steps.saveStyleIcons(stylingId, peopleByLine);
    await steps.makeOutfits(stylingId);
  } catch (error) {
    console.error("A Styling step failed:", error instanceof Error ? error.message : "unknown error");
    outcome = "broke";
  }
  await steps.finish(stylingId, outcome);
}
