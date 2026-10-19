"use client";

import { useEffect } from "react";

import { SIGN_IN_RENEWAL_ROUTE } from "@/config/routes";

/**
 * Renews the sign-in in the background, so the 30-day sign-in keeps rolling while the app is in
 * use. The app pages' layout stays mounted as the user moves between them, so this asks once per
 * full load of an app page, not on every click. Nothing waits for it, shows it or retries it: a
 * failure changes nothing on screen, and the next full load asks again.
 *
 * This isn't a proxy in front of every page, as it once was: Vercel runs a proxy in the region
 * nearest the visitor, far from the database in Washington DC, so every signed-in page change
 * waited on a read across the Pacific. The renewal endpoint runs next to the database (ADR-0007).
 */
export function RenewSignIn() {
  useEffect(() => {
    fetch(SIGN_IN_RENEWAL_ROUTE, { method: "POST" }).catch(() => undefined);
  }, []);
  return null;
}
