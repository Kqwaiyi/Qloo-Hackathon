"use client";

import { useEffect, useRef } from "react";

import { PHOTO_TYPE_LABELS, type PhotoType } from "@/config/consultations";
import { COPY } from "@/config/copy";
import type { StylingStage } from "@/config/stylings";
import type { PreviewsProgress } from "@/server/operations/stylings";

import { Stepper } from "./stepper";

/** Where things stand: the photo check, before there's a Styling, or the Styling's stage. */
type ChecklistStage = "photo_check" | StylingStage;

/** The checklist's items, in order, each with the stages it covers. */
const ITEMS: readonly { label: string; stages: readonly ChecklistStage[] }[] = [
  { label: "Checking your photo", stages: ["photo_check"] },
  { label: "Finding Style Icons", stages: ["style_icons"] },
  // Fetching Brands is part of building the Outfits, so a Budget Tier change ticks the Style Icons.
  { label: "Building Outfits", stages: ["brands", "building_outfits"] },
  { label: "Generating Previews", stages: ["previews"] },
];

/**
 * The Styling step: the photo and a checklist ticking through the Styling. Every item before
 * `stage`'s is ticked, so a re-styling starts with the photo check, and maybe the Style Icons,
 * already done.
 */
export function StylingStep({
  photoUrl,
  photoType,
  stage,
  previews,
  slow,
}: {
  photoUrl: string;
  photoType: PhotoType;
  stage: ChecklistStage;
  /** Shown once the Styling knows how many Outfits it will make. */
  previews?: PreviewsProgress;
  /** The stage has run longer than usual. */
  slow: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const label = PHOTO_TYPE_LABELS[photoType];

  // The button that started the Styling is gone: say where things are now.
  useEffect(() => heading.current?.focus(), []);

  return (
    <>
      <Stepper current={3} />
      <section aria-labelledby="styling-heading" className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center">
        <img src={photoUrl} alt={`Your ${label}`} className="mx-auto h-32 w-24 rounded-lg bg-stone-100 object-cover" />
        <h2 id="styling-heading" ref={heading} tabIndex={-1} className="mt-5 text-xl font-semibold outline-none">
          Styling your Consultation
        </h2>
        <p className="text-sm text-stone-600">{label}</p>
        <StylingChecklist stage={stage} previews={previews} slow={slow} className="mt-6" />
      </section>
    </>
  );
}

/**
 * The checklist itself, from the item covering `from` on: a Styling that starts further in, such
 * as "Show 2 more Outfits", leaves out the items it never goes through.
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
      <ol aria-label="Styling progress" className="space-y-3 text-left">
        {items.map((item, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={item.label} aria-current={active ? "step" : undefined} className="flex items-center gap-3">
              {done ? (
                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
                  ✓
                </span>
              ) : active ? (
                <span
                  aria-hidden="true"
                  className="h-6 w-6 shrink-0 rounded-full border-2 border-stone-200 border-t-stone-900 motion-safe:animate-spin"
                />
              ) : (
                <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full border-2 border-stone-200" />
              )}
              <span className={done || active ? "font-medium" : "text-stone-400"}>
                {item.label}
                {item.stages.includes("previews") && previews && ` (${previews.done} of ${previews.of})`}
                {done && <span className="sr-only"> (done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {slow && <p className="mt-5 text-sm text-stone-600">{COPY.takingLonger}</p>}
    </div>
  );
}
