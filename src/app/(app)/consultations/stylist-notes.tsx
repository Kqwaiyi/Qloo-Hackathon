import { COPY } from "@/config/copy";
import type { StylistNoteView } from "@/server/operations/stylings";

/**
 * "See what your AI Stylist is doing": under a running Styling's checklist, collapsed until the user
 * opens it, the Stylist's Notes so far, oldest first. The Stylist's own notes read as sentences to
 * the user, and the steps its tools wrote as quieter lines between them. The list fills as the polls
 * bring new entries, but it isn't a live region: the checklist above already announces progress.
 */
export function StylistNotes({ notes, className = "" }: { notes: readonly StylistNoteView[]; className?: string }) {
  return (
    <details className={`group ${className}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-sm font-medium text-ink outline-offset-2 select-none focus-visible:outline-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
        {COPY.seeWhatYourStylistIsDoing}
        <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="m3 4.5 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      {notes.length === 0 ? (
        <p className="mt-3 text-sm text-mute">{COPY.stylistGettingStarted}</p>
      ) : (
        <ol aria-label="Your AI Stylist's notes so far" className="mt-3 space-y-2 border-l border-ink/12 pl-4 text-sm">
          {/* Entries are only ever added at the end, so each one's place in the list is its own for good. */}
          {notes.map((note, index) => (
            <li key={index} className={note.kind === "note" ? "text-ink" : "text-mute"}>
              {note.text}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
