"use client";

import { useEffect } from "react";

import { GUEST_COOKIE_ROUTE } from "@/config/routes";

/**
 * Clears, in the background, the guest cookie of a Guest Consultation the Guest Page has just said
 * is deleted, so it's said once. A page can't set cookies, and a server action would render the
 * page again without the notice, so this asks a route instead. Nothing waits for it or shows it: a
 * failure leaves the notice for the next visit too.
 */
export function ClearDeletedGuestCookie() {
  useEffect(() => {
    fetch(GUEST_COOKIE_ROUTE, { method: "DELETE" }).catch(() => undefined);
  }, []);
  return null;
}
