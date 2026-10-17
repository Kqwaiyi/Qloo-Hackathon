import { LimitMessage } from "@/components/limit-message";
import { COPY } from "@/config/copy";
import type { UsageSummary } from "@/server/operations/usage";

/**
 * The allowance line beside the results actions that start a Styling, or, while none can start,
 * why not. An unverified user has the banner above saying why, and only a verified user can have a
 * Consultation, so that's never shown here.
 */
export function AllowanceLine({
  id,
  stylingStart,
  outfitsLeft,
  className,
}: {
  /** What the actions it's beside are described by. */
  id: string;
  stylingStart: UsageSummary["stylingStart"];
  outfitsLeft: number;
  className?: string;
}) {
  return (
    <p id={id} className={className}>
      {stylingStart.ok
        ? COPY.outfitsItUses(stylingStart.outfitsWanted, outfitsLeft)
        : stylingStart.refusal !== "unverified" && <LimitMessage refusal={stylingStart} />}
    </p>
  );
}
