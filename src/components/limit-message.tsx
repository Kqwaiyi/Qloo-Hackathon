"use client";

import { useLocalFormatters } from "@/components/local-date";
import { COPY } from "@/config/copy";
import { GUEST_PHOTO_CHECK_LIMIT, OUTFIT_ALLOWANCE, PHOTO_CHECK_LIMIT } from "@/config/limits";
import type { GuestLimitRefusal } from "@/server/guests/daily-limit";
import type { StartConsultationRefusal } from "@/server/operations/consultations";

/**
 * A refusal because a limit has been reached for now: every one that stops a Styling starting, as
 * "Get my Outfits" returns them, the region gate included, the photo-check limit, and the Guest
 * Page's daily limit on an internet address.
 */
export type LimitRefusal =
  | Exclude<
      StartConsultationRefusal,
      { refusal: "signed-out" | "unverified" | "photo-consent-needed" | "unusable-file" | "check-errored" | "photo-rejected" }
    >
  | GuestLimitRefusal;

/**
 * What the limit says, with the time or date it lifts in the viewer's own time zone. The return type
 * makes the switch fail typecheck until every refusal has its wording.
 */
export function LimitMessage({ refusal }: { refusal: LimitRefusal }): string {
  const local = useLocalFormatters();
  switch (refusal.refusal) {
    case "unsupported-region":
      return COPY.unsupportedRegion;
    // The spec doesn't fix this one's wording.
    case "already-styling":
      return "You already have a Styling running. You can start another once it finishes.";
    case "allowance-used":
      return COPY.allowanceUsedUp(OUTFIT_ALLOWANCE, local.time(refusal.moreFrom));
    case "photo-check-limit":
      return COPY.photoCheckLimitReached(PHOTO_CHECK_LIMIT, local.time(refusal.moreFrom));
    case "app-wide-24-hour-cap":
      return COPY.appWideCapForNow;
    case "app-wide-monthly-cap":
    case "qloo-backstop":
    case "product-search-backstop":
      return COPY.appWideCapForMonth(local.date(refusal.backOn));
    case "guest-photo-check-limit":
      return COPY.guestPhotoCheckLimitReached(GUEST_PHOTO_CHECK_LIMIT, local.time(refusal.moreFrom));
    case "guest-consultation-used":
      return COPY.guestConsultationUsed(local.time(refusal.moreFrom));
    case "guest-consultation-running":
      return COPY.guestConsultationRunning;
  }
}
