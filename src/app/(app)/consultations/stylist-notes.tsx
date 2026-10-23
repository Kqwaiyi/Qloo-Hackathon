import type { ReactNode } from "react";

import { BUDGET_TIER_LABELS, photoStyleText } from "@/config/consultations";
import { COPY } from "@/config/copy";
import type { StylingKindView, StylingNotesView } from "@/server/operations/consultations";
import type { StylistNoteView } from "@/server/operations/stylings";

/**
 * "See what your AI Stylist is doing": under a running Styling's checklist, collapsed until the user
 * opens it, the Stylist's Notes so far, oldest first. The list fills as the polls bring new entries,
 * but it isn't a live region: the checklist above already announces progress.
 */
export function StylistNotes({ notes, className = "" }: { notes: readonly StylistNoteView[]; className?: string }) {
  return (
    <Collapsed summary={COPY.seeWhatYourStylistIsDoing} className={className}>
      {notes.length === 0 ? (
        <p className="mt-3 text-sm text-mute">{COPY.stylistGettingStarted}</p>
      ) : (
        <NotesList notes={notes} aria-label="Your AI Stylist's notes so far" className="mt-3" />
      )}
    </Collapsed>
  );
}

/**
 * "Your AI Stylist's notes", below the Outfits: collapsed until the user opens it, an entry for each
 * Styling behind them, oldest first, each labelled by the kind of Styling it was.
 */
export function StylistNotesByStyling({ entries, className = "" }: { entries: readonly StylingNotesView[]; className?: string }) {
  return (
    <Collapsed summary={COPY.yourStylistsNotes} className={className}>
      <ol aria-label={COPY.yourStylistsNotes} className="mt-4 space-y-5">
        {entries.map(({ styling, notes }, index) => {
          // There's one such section on a page, so its entries' places name them.
          const labelId = `stylist-notes-${index + 1}`;
          return (
            <li key={labelId}>
              <p id={labelId} className="text-sm font-medium text-ink">
                {stylingLabel(styling)}
              </p>
              <NotesList notes={notes} aria-labelledby={labelId} className="mt-2" />
            </li>
          );
        })}
      </ol>
    </Collapsed>
  );
}

/** A failed Styling's Stylist's Notes, collapsed under its line, so the user can see what went wrong. */
export function FailedStylingNotes({ notes, className = "" }: { notes: readonly StylistNoteView[]; className?: string }) {
  return (
    <Collapsed summary={COPY.yourStylistsNotes} className={className}>
      <NotesList notes={notes} aria-label="Your AI Stylist's notes on the Styling that failed" className="mt-3" />
    </Collapsed>
  );
}

/** What an entry of "Your AI Stylist's notes" is labelled, by the kind of Styling it was. */
function stylingLabel(styling: StylingKindView): string {
  switch (styling.kind) {
    case "first":
      return COPY.firstStyling;
    case "more":
      return COPY.showMoreOutfits;
    case "budget_tier_change":
      return COPY.budgetTierChangedTo(BUDGET_TIER_LABELS[styling.budgetTier]);
    case "photo_style_change":
      return COPY.photoStyleChangedTo(photoStyleText(styling.photoStyle));
  }
}

/** Collapsed until the user opens it, with a chevron that turns as it opens. */
function Collapsed({ summary, className, children }: { summary: string; className: string; children: ReactNode }) {
  return (
    <details className={`group ${className}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-sm font-medium text-ink outline-offset-2 select-none focus-visible:outline-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
        {summary}
        <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="m3 4.5 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      {children}
    </details>
  );
}

/**
 * The Stylist's Notes, oldest first: the Stylist's own notes read as sentences to the user, and the
 * steps its tools wrote as quieter lines between them.
 */
function NotesList({
  notes,
  className,
  ...accessibleName
}: { notes: readonly StylistNoteView[]; className: string } & ({ "aria-label": string } | { "aria-labelledby": string })) {
  return (
    <ol {...accessibleName} className={`space-y-2 border-l border-ink/12 pl-4 text-sm ${className}`}>
      {/* Entries are only ever added at the end, so each one's place in the list is its own for good. */}
      {notes.map((note, index) => (
        <li key={index} className={note.kind === "note" ? "text-ink" : "text-mute"}>
          {note.text}
        </li>
      ))}
    </ol>
  );
}
