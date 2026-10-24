"use client";

import { useEffect, useRef } from "react";

import { PHOTO_TYPE_LABELS, type PhotoType } from "@/config/consultations";
import { COPY } from "@/config/copy";
import { BUILDING_OUTFITS_STAGES, type StylingStage } from "@/config/stylings";
import type { PreviewsProgress, StylistNoteView } from "@/server/operations/stylings";

import { Stepper } from "./stepper";
import { StylistNotes } from "./stylist-notes";
import { stepHeading } from "./ui";

/** Where things stand: the photo check, before there's a Styling, or the Styling's stage. */
type ChecklistStage = "photo_check" | StylingStage;

/** The checklist's items, in order, each with the stages it covers. */
const ITEMS: readonly { label: string; stages: readonly ChecklistStage[] }[] = [
  { label: "Checking your photo", stages: ["photo_check"] },
  { label: "Finding Style Icons", stages: ["style_icons"] },
  // Fetching Brands is part of building the Outfits, so a Budget Tier change ticks the Style Icons.
  { label: "Building Outfits", stages: BUILDING_OUTFITS_STAGES },
  { label: "Generating Previews", stages: ["previews"] },
];

/**
 * The Styling step: the photo and a checklist ticking through the Styling, with the Stylist's Notes
 * under it once a Styling runs. Every item before `stage`'s is ticked, so a re-styling starts with
 * the photo check, and maybe the Style Icons, already done.
 */
export function StylingStep({
  photoUrl,
  photoType,
  stage,
  previews,
  slow,
  notes,
}: {
  photoUrl: string;
  photoType: PhotoType;
  stage: ChecklistStage;
  /** Shown once the Styling knows how many Outfits it will make. */
  previews?: PreviewsProgress;
  /** The stage has run longer than usual. */
  slow: boolean;
  /** The Stylist's Notes so far, under the checklist, once a Styling runs. */
  notes?: readonly StylistNoteView[];
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const label = PHOTO_TYPE_LABELS[photoType];

  // The button that started the Styling is gone: say where things are now.
  useEffect(() => heading.current?.focus(), []);

  return (
    <>
      <Stepper current={3} />
      {/* On phones a small photo beside the heading, with the checklist under both, so it fits the
          screen; wider, the photo has a column to itself. */}
      <section
        aria-labelledby="styling-heading"
        className="grid grid-cols-[5.5rem_minmax(0,1fr)] content-start items-center gap-x-5 gap-y-7 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:grid-rows-[auto_1fr] sm:items-start sm:gap-x-10 sm:gap-y-8 sm:short:gap-y-6"
      >
        <figure className="sm:row-span-2">
          <img src={photoUrl} alt={`Your ${label}`} className="aspect-[4/5] w-full rounded-md bg-card object-cover" />
          <figcaption className="mt-2 text-sm text-mute max-sm:sr-only">{label}</figcaption>
        </figure>
        <div>
          <h2 id="styling-heading" ref={heading} tabIndex={-1} className={`${stepHeading} outline-none`}>
            Styling your Consultation
          </h2>
          <p className="mt-1 text-sm text-mute sm:hidden">{label}</p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <StylingChecklist stage={stage} previews={previews} slow={slow} />
          {notes && <StylistNotes notes={notes} className="mt-8 sm:short:mt-6" />}
        </div>
      </section>
    </>
  );
}

/**
 * The checklist itself, from the item covering `from` on: a Styling that starts further in, such
 * as "Show 2 more Outfits", leaves out the items it never goes through. A hairline joins the items,
 * since each waits for the one before it.
 */
export function StylingChecklist({
  stage,
  previews,
  slow,
  from = "photo_check",
  className = "",
}: {
  stage: ChecklistStage;
  previews?: PreviewsProgress;
  slow: boolean;
  from?: ChecklistStage;
  className?: string;
}) {
  const items = ITEMS.slice(ITEMS.findIndex((item) => item.stages.includes(from)));
  const current = items.findIndex((item) => item.stages.includes(stage));
  return (
    <div aria-live="polite" className={className}>
      <ol aria-label="Styling progress">
        {items.map((item, index) => {
          const done = index < current;
          const active = index === current;
          const last = index === items.length - 1;
          return (
            <li key={item.label} aria-current={active ? "step" : undefined} className="relative flex gap-4 pb-6 last:pb-0">
              {!last && (
                <span
                  aria-hidden="true"
                  className={`absolute top-7 bottom-1 left-[11px] w-px ${done ? "bg-ink" : "bg-ink/12"}`}
                />
              )}
              {done ? (
                <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-paper">
                  <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M2.5 6.25 5 8.5l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              ) : active ? (
                <span
                  aria-hidden="true"
                  className="size-6 shrink-0 rounded-full border-2 border-ink/12 border-t-ink motion-safe:animate-spin"
                />
              ) : (
                <span aria-hidden="true" className="size-6 shrink-0 rounded-full border-2 border-ink/12" />
              )}
              <span className={`min-w-0 flex-1 pt-0.5 ${done || active ? "font-medium text-ink" : "text-mute"}`}>
                {item.label}
                {item.stages.includes("previews") && previews && (
                  <span className="tabular-nums">{` (${previews.done} of ${previews.of})`}</span>
                )}
                {done && <span className="sr-only"> (done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {slow && <p className="mt-6 text-sm text-mute">{COPY.takingLonger}</p>}
    </div>
  );
}
