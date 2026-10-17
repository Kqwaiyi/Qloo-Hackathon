"use client";

import type { ReactNode } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";

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
  return (
    <ConfirmDialog
      trigger={<>Delete{children}</>}
      triggerClassName="rounded-lg px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
      title="Delete this Consultation?"
      confirmLabel="Delete"
      confirmingLabel="Deleting…"
      failure="We couldn't delete this Consultation. Try again."
      onConfirm={() => deleteConsultationAction(consultationId)}
    >
      {/* The spec asks that it says the photo, Outfits and Previews are gone for good. */}
      Its photo, Outfits and Previews are deleted for good. This can&apos;t be undone.
    </ConfirmDialog>
  );
}
