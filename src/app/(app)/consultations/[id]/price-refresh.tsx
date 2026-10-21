"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { priceRefreshRoute } from "@/config/routes";

/**
 * Asks for the price refresh in the background once the page has shown the stored prices, and
 * refreshes the page in place when it's done, so each card shows what the checks found. Nothing
 * waits for it or shows it: a failure changes nothing on screen, and the next visit asks again.
 * It asks once while the page is open: refreshing the page keeps it mounted.
 */
export function PriceRefresh({ consultationId }: { consultationId: string }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    fetch(priceRefreshRoute(consultationId), { method: "POST" })
      .then((response) => {
        if (response.ok && !stopped) router.refresh();
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, [consultationId, router]);
  return null;
}
