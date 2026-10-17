"use client";

import { useLocalTime } from "@/components/local-date";
import { COPY } from "@/config/copy";
import { OUTFIT_ALLOWANCE, PHOTO_CHECK_LIMIT } from "@/config/limits";
import type { StartConsultationRefusal } from "@/server/operations/consultations";

/**
 * A refusal because a limit has been reached for now: every one that stops a Styling starting, as
 * "Get my Outfits" returns them, and the photo-check limit.
 */
export type LimitRefusal = Exclude<
  StartConsultationRefusal,
  { refusal: "signed-out" | "unverified" | "unusable-file" | "check-errored" | "photo-rejected" }
>;

/** What the limit says, with the time it lifts in the viewer's own time zone. */
export function LimitMessage({ refusal }: { refusal: LimitRefusal }) {
  const time = useLocalTime(refusal.moreFrom);
  switch (refusal.refusal) {
    case "allowance-used":
      return COPY.allowanceUsedUp(OUTFIT_ALLOWANCE, time);
    case "photo-check-limit":
      return COPY.photoCheckLimitReached(PHOTO_CHECK_LIMIT, time);
  }
}
