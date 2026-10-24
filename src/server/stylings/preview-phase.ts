import { type KeptPreview, PREVIEWS_AT_ONCE } from "@/config/stylings";
import type { FirstDrawVerdict, RedrawVerdict, VerdictResult, WrongPreview } from "@/server/ai/provider";

import { atMost } from "./at-most";

// The Preview phase (ADR-0012): once the Stylist's loop ends, with finish or at its turn cap, our
// code draws each saved Outfit's Preview and asks for its verdict, redraws a wrong one once with the
// verdict's correction, asks for the redraw's verdict, and keeps an image by the hard rules: our
// code, never a model, decides which. Each call is a durable step of the Styling's, and the run's
// data holds only IDs and verdicts, never an image: each step loads its own, the photo and the
// Previews from Blob and the seller photos from their links (ADR-0008). Like the Stylist, it imports
// nothing but types and config, so the Workflow's sandbox can load it.

/** How a Preview, or its redraw, came out of the step that drew it: drawn, or declined by the image model, which is final. */
export type PreviewDrawn = "ready" | "refused";

/**
 * Which of a redrawn Preview's images to keep, and a note to the user of the verdict that decided
 * it, when it's one to show.
 */
export interface PreviewToKeep {
  kept: KeptPreview;
  note?: string;
}

/** The Preview phase's steps, each given the Styling's ID. Each one checks the Styling is still running before it saves. */
export interface PreviewSteps {
  /**
   * Moves the Styling on to Generating Previews, unless it saved no Outfit, and gives the IDs of the
   * Outfits it saved, in order.
   */
  startPreviews(stylingId: string): Promise<string[]>;
  /**
   * One AI call: fetches the Outfit's Product photos, then renders its Preview and saves it, or
   * saves its refusal, which is final, returning which. Throws on errors worth retrying, leaving the
   * Preview pending, as when a Product photo can't be fetched before the step's last try; on that
   * last try, its Product is drawn from its title instead.
   */
  renderPreview(stylingId: string, outfitId: string): Promise<PreviewDrawn>;
  /**
   * One AI call: the verdict on an Outfit's Preview as first drawn, judged against the photo and the
   * Outfit's Pieces, each Product's seller photo fetched as `renderPreview` fetches it. Saves nothing.
   */
  judgeFirstDraw(stylingId: string, outfitId: string): Promise<VerdictResult<FirstDrawVerdict>>;
  /**
   * One AI call: opens the Outfit's one redraw of its Preview, adding the note of the verdict that
   * found it wrong to the Stylist's Notes, checked like any note, then redraws it as `renderPreview`
   * draws it, with the verdict's correction added to its instruction, and saves the redraw beside the
   * Preview, or saves its refusal, which is final, returning which. Throws on errors worth retrying;
   * on the step's last try, it saves that the redraw failed. Once the redraw is open, it's never
   * opened again, so no Preview is redrawn twice.
   */
  redrawPreview(stylingId: string, outfitId: string, firstVerdict: WrongPreview): Promise<PreviewDrawn>;
  /**
   * One AI call: the verdict on an Outfit's redraw, beside its first image and that image's verdict,
   * each read and fetched as `judgeFirstDraw` reads them. Saves nothing.
   */
  judgeRedraw(stylingId: string, outfitId: string, firstVerdict: WrongPreview): Promise<VerdictResult<RedrawVerdict>>;
  /**
   * Keeps one of a redrawn Outfit's images: the first, the redraw, which becomes the Outfit's
   * Preview, or neither, which leaves the Outfit with no Preview, as a refusal does, adding the note
   * given, checked like any note, then a step saying which. Either way the images not kept are
   * deleted. Kept already, there's nothing left to do but delete them.
   */
  keepPreview(stylingId: string, outfitId: string, keep: PreviewToKeep): Promise<void>;
}

/**
 * The Preview phase of a Styling the Stylist carried out to its end: each Outfit it saved, at most
 * PREVIEWS_AT_ONCE at once, has its Preview drawn and judged, and one judged wrong redrawn once and
 * judged again. A Preview the image model declined, or that still couldn't be drawn after its
 * retries, is left without one, as finishing marks it.
 */
export async function runPreviews(stylingId: string, steps: PreviewSteps): Promise<void> {
  try {
    const outfitsAtOnce = atMost(PREVIEWS_AT_ONCE);
    const outfitIds = await steps.startPreviews(stylingId);
    const previews = await Promise.allSettled(outfitIds.map((outfitId) => outfitsAtOnce(() => previewOf(stylingId, outfitId, steps))));
    for (const preview of previews) if (preview.status === "rejected") logFailure("A Preview", preview.reason);
  } catch (error) {
    logFailure("The Previews", error);
  }
}

/**
 * One Outfit's Preview: drawn, then judged. One judged right is kept as it was drawn. One judged
 * wrong is redrawn, and the redraw judged, and an image kept as `kept` says, with the redraw's
 * verdict's note when it leaves the Outfit with no Preview. A redraw the image model declined, or
 * that still couldn't be drawn after its retries, keeps the first, unless it breaks a hard rule.
 */
async function previewOf(stylingId: string, outfitId: string, steps: PreviewSteps): Promise<void> {
  if ((await orFailed("A Preview step", () => steps.renderPreview(stylingId, outfitId))) !== "ready") return;
  const first = verdictOf(await steps.judgeFirstDraw(stylingId, outfitId));
  if (first.right) return;
  if ((await orFailed("A Preview's redraw step", () => steps.redrawPreview(stylingId, outfitId, first))) !== "ready") {
    return steps.keepPreview(stylingId, outfitId, { kept: first.breaksHardRule ? "none" : "first" });
  }
  const redraw = verdictOf(await steps.judgeRedraw(stylingId, outfitId, first));
  const keep = kept(first, redraw);
  await steps.keepPreview(stylingId, outfitId, keep === "none" ? { kept: keep, note: redraw.note } : { kept: keep });
}

/**
 * Which of a redrawn Preview's images to keep, by the hard rules: neither when both break one, the
 * one that doesn't when only one does, and otherwise the one the redraw's verdict calls better. So
 * no Preview that breaks a hard rule is ever kept, whatever a verdict calls better.
 */
function kept(first: WrongPreview, redraw: RedrawVerdict): KeptPreview {
  if (first.breaksHardRule && redraw.breaksHardRule) return "none";
  if (first.breaksHardRule) return "redraw";
  if (redraw.breaksHardRule) return "first";
  return redraw.better;
}

/** A verdict the model gave, or an error once it refused to judge the Preview. */
function verdictOf<Verdict>(result: VerdictResult<Verdict>): Verdict {
  if (result.refused) throw new Error("The model refused to judge the Preview.");
  return result.verdict;
}

/** A Preview step's result, or that it failed, once it still fails after its retries. */
async function orFailed<T>(step: string, draw: () => Promise<T>): Promise<T | "failed"> {
  try {
    return await draw();
  } catch (error) {
    logFailure(step, error);
    return "failed";
  }
}

/** Logs that `what` failed, by its error's message alone, which never holds a request. */
function logFailure(what: string, error: unknown): void {
  console.error(`${what} failed:`, error instanceof Error ? error.message : "unknown error");
}
