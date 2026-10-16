"use client";

import { type ReactNode, useId, useRef, useState, useTransition } from "react";

import { dangerButton, secondaryButton } from "@/components/ui";

import { deleteConsultationAction } from "./actions";

/**
 * A Consultation's Delete button, which confirms in a modal first. Once deleted, the page refreshes
 * without it, even mid-Styling: the server stops the Styling first.
 */
export function DeleteConsultation({
  consultationId,
  children,
}: {
  consultationId: string;
  /** Screen-reader text naming the Consultation, read out after "Delete". */
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const [deleting, startDeleting] = useTransition();
  const [failed, setFailed] = useState(false);

  function open() {
    setFailed(false);
    dialog.current?.showModal();
  }

  function confirm() {
    setFailed(false);
    startDeleting(async () => {
      try {
        await deleteConsultationAction(consultationId);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <>
      <button type="button" onClick={open} className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
        Delete{children}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        // Escape can't close it mid-delete.
        onCancel={(event) => {
          if (deleting) event.preventDefault();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-white p-6 text-stone-900 shadow-xl backdrop:bg-black/40"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Delete this Consultation?
        </h2>
        <p id={bodyId} className="mt-2 text-sm text-stone-600">
          {/* The spec asks that it says the photo, Outfits and Previews are gone for good. */}
          Its photo, Outfits and Previews are deleted for good. This can&apos;t be undone.
        </p>
        {failed && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            We couldn&apos;t delete this Consultation. Try again.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => dialog.current?.close()} disabled={deleting} className={secondaryButton}>
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={deleting} className={dangerButton}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </dialog>
    </>
  );
}
