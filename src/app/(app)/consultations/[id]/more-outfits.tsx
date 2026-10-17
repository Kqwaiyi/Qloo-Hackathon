"use client";

import { useRef, useState, useTransition } from "react";

import { LimitMessage } from "@/components/limit-message";
import { secondaryButton } from "@/components/ui";
import { COPY } from "@/config/copy";
import type { StylingStage } from "@/config/stylings";
import type { PreviewsProgress, StylingProgressView } from "@/server/operations/stylings";
import type { UsageSummary } from "@/server/operations/usage";

import { StylingChecklist } from "../styling-step";
import { showMoreOutfitsAction } from "./actions";
import { useStylingProgress } from "./styling-progress";

/**
 * Below the Outfits: "Show 2 more Outfits", with the allowance line beside it, or disabled with the
 * reason while no Styling can start. Pressed, it becomes a compact checklist, and the current
 * Outfits stay in view until the new ones arrive below them, together. Once there's nothing left to
 * build, the run-out line takes its place.
 */
export function MoreOutfits({
  consultationId,
  running,
  everyOutfitBuilt,
  suggestBudgetTier,
  stylingStart,
  outfitsLeft,
}: {
  consultationId: string;
  /** The "Show 2 more Outfits" Styling running as the page rendered, if one is. */
  running: StylingProgressView | null;
  everyOutfitBuilt: boolean;
  /** The run-out line suggests another Budget Tier as well as a Photo Style: a Face Photo has none. */
  suggestBudgetTier: boolean;
  stylingStart: UsageSummary["stylingStart"];
  outfitsLeft: number;
}) {
  const [sending, startSending] = useTransition();
  const [failed, setFailed] = useState(false);
  const area = useRef<HTMLElement>(null);

  function showMore() {
    // The button is about to give way to the checklist: focus stays where it was.
    area.current?.focus();
    setFailed(false);
    startSending(async () => {
      try {
        await showMoreOutfitsAction(consultationId);
      } catch {
        // The request itself failed: the network, or our side.
        setFailed(true);
      }
    });
  }

  return (
    <section ref={area} tabIndex={-1} aria-label="More Outfits" className="mt-8 outline-none">
      {running ? (
        <MoreOutfitsProgress consultationId={consultationId} initial={running} />
      ) : sending ? (
        // Until the page shows the Styling's own progress.
        <CompactChecklist
          stage="building_outfits"
          previews={stylingStart.ok ? { done: 0, of: stylingStart.outfitsWanted } : undefined}
          slow={false}
        />
      ) : everyOutfitBuilt ? (
        <p className="text-center text-sm text-stone-600">{COPY.everyOutfitBuilt(suggestBudgetTier)}</p>
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-center">
          <button
            type="button"
            onClick={showMore}
            disabled={!stylingStart.ok}
            aria-describedby="more-outfits-line more-outfits-failed"
            className={`${secondaryButton} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Show 2 more Outfits
          </button>
          <p id="more-outfits-line" className="text-sm text-stone-600">
            {stylingStart.ok ? (
              COPY.outfitsItUses(stylingStart.outfitsWanted, outfitsLeft)
            ) : (
              // An unverified user has the banner above saying why. Only a verified user can have
              // Outfits, so it's never seen here.
              stylingStart.refusal !== "unverified" && <LimitMessage refusal={stylingStart} />
            )}
          </p>
          {failed && (
            <p id="more-outfits-failed" role="alert" className="text-sm text-red-700">
              We couldn&apos;t start more Outfits just now. Try again in a moment.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** The running "Show 2 more Outfits" Styling's checklist, polled until it finishes. */
function MoreOutfitsProgress({ consultationId, initial }: { consultationId: string; initial: StylingProgressView }) {
  const progress = useStylingProgress(consultationId, initial);
  return <CompactChecklist stage={progress.stage} previews={progress.previews} slow={progress.slow} />;
}

/** Only the items "Show 2 more Outfits" goes through: it carries on from Brands, past the photo check and the Style Icons. */
function CompactChecklist({ stage, previews, slow }: { stage: StylingStage; previews?: PreviewsProgress; slow: boolean }) {
  return (
    <div className="mx-auto max-w-xs rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="mb-4 text-center font-semibold">Styling more Outfits</h2>
      <StylingChecklist from="brands" stage={stage} previews={previews} slow={slow} />
    </div>
  );
}
