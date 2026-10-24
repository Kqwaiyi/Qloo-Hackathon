"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { PhotoType } from "@/config/consultations";
import { stylingStatusRoute } from "@/config/routes";
import { STYLING_STATUS_POLL_INTERVAL_MS } from "@/config/stylings";
import type { StylingProgressView, StylingStatusView } from "@/server/operations/stylings";

import { StylingStep } from "../styling-step";

/**
 * Shown while the Consultation's Styling runs. Its checklist follows the stored stage, with the
 * Stylist's Notes under it, and the page reloads once the Styling has finished, so its Outfits
 * appear all at once.
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
  /** The progress as the page rendered, with every one of the Stylist's Notes so far. */
  initial: StylingProgressView;
}) {
  const progress = useStylingProgress(consultationId, initial);
  return (
    <StylingStep
      photoUrl={photoUrl}
      photoType={photoType}
      stage={progress.stage}
      previews={progress.previews}
      slow={progress.slow}
      notes={progress.notes}
    />
  );
}

/**
 * The running Styling's progress, from `initial`, as the page rendered it, on: polled from the
 * Styling status about once a second. Its notes are every one of the Stylist's Notes so far: each
 * poll says how many the page has, and adds the new ones it's sent. Once the Styling has finished,
 * the page refreshes to show what it made.
 */
export function useStylingProgress(consultationId: string, initial: StylingProgressView): StylingProgressView {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const notesHeld = useRef(initial.notes.length);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(stylingStatusRoute(consultationId, notesHeld.current), { cache: "no-store" });
        const status = response.ok ? ((await response.json()) as StylingStatusView) : null;
        if (stopped) return;
        if (status?.progress) {
          const { notes, ...checklist } = status.progress;
          notesHeld.current += notes.length;
          setProgress((shown) => ({ ...checklist, notes: notes.length > 0 ? [...shown.notes, ...notes] : shown.notes }));
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
