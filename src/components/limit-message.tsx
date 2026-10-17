"use client";

import { useLocalFormatters } from "@/components/local-date";
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

/** What the limit says, with the time or date it lifts in the viewer's own time zone. */
export function LimitMessage({ refusal }: { refusal: LimitRefusal }) {
  const local = useLocalFormatters();
  switch (refusal.refusal) {
    case "allowance-used":
      return COPY.allowanceUsedUp(OUTFIT_ALLOWANCE, local.time(refusal.moreFrom));
    case "photo-check-limit":
      return COPY.photoCheckLimitReached(PHOTO_CHECK_LIMIT, local.time(refusal.moreFrom));
    case "app-wide-24-hour-cap":
      return COPY.appWideCapForNow;
    case "app-wide-monthly-cap":
    case "qloo-backstop":
      return COPY.appWideCapForMonth(local.date(refusal.backOn));
  }
}
