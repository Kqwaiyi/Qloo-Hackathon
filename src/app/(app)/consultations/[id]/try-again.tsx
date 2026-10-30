"use client";

import { primaryButton } from "@/components/ui";
import type { UsageSummary } from "@/server/operations/usage";

import { tryAgainAction } from "./actions";
import { AllowanceLine } from "./allowance-line";
import { useStylingRequest } from "./use-styling-request";

/**
 * "Try again", once the Consultation's latest Styling broke, with the allowance line beside it, or
 * disabled with the reason while no Styling can start. Sent, the Styling step takes the page's
 * place, its checklist picking up where the broken Styling stopped.
 */
export function TryAgain({
  consultationId,
  stylingStart,
  outfitsLeft,
  onGuestPage,
}: {
  consultationId: string;
  stylingStart: UsageSummary["stylingStart"];
  outfitsLeft: UsageSummary["outfitsLeft"];
  /** It's on the Guest Page, which never sends anyone to sign-in. */
  onGuestPage: boolean;
}) {
  const { sending, failed, send } = useStylingRequest();

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={() => send(() => tryAgainAction(consultationId, onGuestPage))}
        disabled={!stylingStart.ok || sending}
        aria-describedby="try-again-line try-again-failed"
        className={`${primaryButton} px-4 py-2`}
      >
        {sending ? "Starting…" : "Try again"}
      </button>
      <AllowanceLine id="try-again-line" stylingStart={stylingStart} outfitsLeft={outfitsLeft} />
      {failed && (
        <p id="try-again-failed" role="alert" className="w-full text-red-700">
          We couldn&apos;t start styling again just now. Try again in a moment.
        </p>
      )}
    </div>
  );
}
