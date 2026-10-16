import type { Line } from "@/config/accounts";
import { PREVIEWS_AT_ONCE } from "@/config/stylings";
import type { BrandPicks } from "@/server/outfit-assembly/brands";
import type { QlooBrand, QlooPerson } from "@/server/qloo/client";

// The "build Outfits" Styling, as the order of its steps. The Vercel Workflow runs each step as a
// durable step with its own retries; tests run the same steps inline. This module only orders
// them, so the Workflow's sandbox can load it: it imports nothing but types and config.

/** Each line's people, as its person call ranked them. */
export type PeopleByLine = Partial<Record<Line, QlooPerson[]>>;

/** Each Style Icon's Brands, by its ID, as its Brand call ranked them: only those fetched so far. */
export type BrandsByStyleIcon = Record<string, QlooBrand[]>;

/**
 * One Outfit to tailor: its position in the Styling, the Style Icon inspiring it and, for a body
 * photo, the Brands its Top, Bottom and Shoes are built on, picked before tailoring.
 */
export interface OutfitTry {
  position: number;
  styleIconId: string;
  brands: BrandPicks | null;
}

/** What Building Outfits does next: fetch some Style Icons' Brands, or tailor some Outfits. Neither once it's done. */
export interface OutfitPlan {
  /** The IDs of the Style Icons whose Brands to fetch, all at once, before planning again. */
  fetchBrandsFor: string[];
  tries: OutfitTry[];
}

/** What one tailoring call came to: its Outfit saved or its Style Icon skipped, or a bad reply to ask again. */
export type TailoringOutcome = "saved" | "ask-again";

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
  /**
   * The Outfits to tailor next: one per position still open, each from the next unused Style Icon,
   * while substitutes for failed tailoring are left. For a body photo, each also gets its Brands
   * from `brandsByStyleIcon`, skipping Style Icons that can't complete an Outfit, and when the
   * Style Icons it needs haven't had their Brands fetched it asks for that instead. Nothing once
   * every position is filled or nothing more can be tried.
   */
  planOutfits(stylingId: string, brandsByStyleIcon: BrandsByStyleIcon): Promise<OutfitPlan>;
  /** One Style Icon's Brand call. */
  fetchBrands(stylingId: string, styleIconId: string): Promise<QlooBrand[]>;
  /**
   * One AI call, the `attempt`th for this Outfit: tailors its Pieces and saves it. A bad reply is
   * asked again once; when the last attempt is bad too, the Style Icon is skipped.
   */
  tailorOutfit(stylingId: string, outfitTry: OutfitTry, attempt: number): Promise<TailoringOutcome>;
  /** The IDs of the Outfits the Styling made whose Previews are still to render, in order. */
  planPreviews(stylingId: string): Promise<string[]>;
  /**
   * One AI call: renders the Outfit's Preview and saves it, or saves its refusal, which is final.
   * Throws on errors worth retrying, leaving the Preview pending.
   */
  renderPreview(stylingId: string, outfitId: string): Promise<void>;
  /**
   * Switches in the Outfits made all at once, marking any Preview not ready failed, or fails the
   * Styling if it made none.
   */
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
    // Building Outfits: each round tailors the open positions at once, and a failed one's
    // substitute waits for the next round. A body photo's Style Icons need their Brands first,
    // fetched as the plan asks. Every try and every fetch uses up a Style Icon, so the rounds end.
    const brandsByStyleIcon: BrandsByStyleIcon = {};
    for (;;) {
      const plan = await steps.planOutfits(stylingId, brandsByStyleIcon);
      if (plan.fetchBrandsFor.length > 0) {
        await waitForAll(
          plan.fetchBrandsFor.map(async (styleIconId) => {
            brandsByStyleIcon[styleIconId] = await steps.fetchBrands(stylingId, styleIconId);
          }),
        );
        continue;
      }
      if (plan.tries.length === 0) break;
      await waitForAll(
        plan.tries.map(async (outfitTry) => {
          let attempt = 1;
          while ((await steps.tailorOutfit(stylingId, outfitTry, attempt)) === "ask-again") attempt += 1;
        }),
      );
    }
    // Previews, a few at a time. One still failing after its retries leaves its Outfit with a
    // placeholder, not a broken Styling: finishing marks it failed.
    const outfitIds = await steps.planPreviews(stylingId);
    for (let next = 0; next < outfitIds.length; next += PREVIEWS_AT_ONCE) {
      await Promise.all(
        outfitIds.slice(next, next + PREVIEWS_AT_ONCE).map((outfitId) =>
          steps.renderPreview(stylingId, outfitId).catch((error: unknown) => {
            console.error("A Preview step failed:", error instanceof Error ? error.message : "unknown error");
          }),
        ),
      );
    }
  } catch (error) {
    console.error("A Styling step failed:", error instanceof Error ? error.message : "unknown error");
    outcome = "broke";
  }
  await steps.finish(stylingId, outcome);
}

/** Waits for every step, so an Outfit saved beside a failing one still counts, then rethrows the first failure. */
async function waitForAll(running: Promise<void>[]): Promise<void> {
  const failed = (await Promise.allSettled(running)).find((settled) => settled.status === "rejected");
  if (failed) throw failed.reason;
}
