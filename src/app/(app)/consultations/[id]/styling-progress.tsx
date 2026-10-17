"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { PhotoType } from "@/config/consultations";
import { stylingStatusRoute } from "@/config/routes";
import { STYLING_STATUS_POLL_INTERVAL_MS } from "@/config/stylings";
import type { StylingProgressView, StylingStatusView } from "@/server/operations/stylings";

import { StylingStep } from "../styling-step";

/**
 * Shown while the Consultation's Styling runs. Its checklist follows the stored stage, and the page
 * reloads once the Styling has finished, so its Outfits appear all at once.
 */
export function StylingProgress({
  consultationId,
  photoUrl,
  photoType,
  initial,
}: {
  consultationId: string;
  photoUrl: string;
  photoType: PhotoType;
  /** The progress as the page rendered. */
  initial: StylingProgressView;
}) {
  const progress = useStylingProgress(consultationId, initial);
  return (
    <StylingStep photoUrl={photoUrl} photoType={photoType} stage={progress.stage} previews={progress.previews} slow={progress.slow} />
  );
}

/**
 * The running Styling's progress, from `initial`, as the page rendered it, on: polled from the
 * Styling status about once a second. Once the Styling has finished, the page refreshes to show
 * what it made.
 */
export function useStylingProgress(consultationId: string, initial: StylingProgressView): StylingProgressView {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(stylingStatusRoute(consultationId), { cache: "no-store" });
        const status = response.ok ? ((await response.json()) as StylingStatusView) : null;
        if (stopped) return;
        if (status?.progress) {
          setProgress(status.progress);
        } else if (status || response.status === 404) {
          // Finished, or the Consultation is gone or the user signed out: the page itself shows which.
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

  return progress;
}
