"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { stylingStatusRoute } from "@/config/routes";
import { STYLING_STATUS_POLL_INTERVAL_MS } from "@/config/stylings";
import type { StylingStatusView } from "@/server/operations/stylings";

/**
 * Shown while the Consultation's Styling runs. It polls the Styling status about once a second, and
 * reloads the page once the Styling has finished, so its Outfits appear all at once.
 */
export function StylingProgress({ consultationId }: { consultationId: string }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(stylingStatusRoute(consultationId), { cache: "no-store" });
        const status = response.ok ? ((await response.json()) as StylingStatusView) : null;
        // Finished, or the Consultation is gone or the user signed out: the page itself shows which.
        if (!stopped && ((status && status.state !== "styling") || response.status === 404)) {
          router.refresh();
          return;
        }
      } catch {
        // A missed poll is fine: the next one tries again.
      }
      if (!stopped) timer = setTimeout(poll, STYLING_STATUS_POLL_INTERVAL_MS);
    };
    timer = setTimeout(poll, STYLING_STATUS_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [consultationId, router]);

  return (
    <section aria-live="polite" className="mt-8 flex items-center justify-center gap-3 rounded-xl border border-stone-200 bg-white p-8">
      <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-stone-200 border-t-stone-900" />
      <span className="font-medium">Styling…</span>
    </section>
  );
}
