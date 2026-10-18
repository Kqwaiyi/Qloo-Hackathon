"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { type Notice, NoticeLine } from "@/components/notice";
import { secondaryButton } from "@/components/ui";
import { COPY } from "@/config/copy";

import { withdrawPhotoConsentAction } from "./actions";

/**
 * "Withdraw photo consent", which confirms in a modal first, with no password. Confirmed, every
 * Consultation goes, any Styling stopped first, and the consent sheet comes back before the next.
 */
export function WithdrawPhotoConsent() {
  const [notice, setNotice] = useState<Notice | null>(null);

  async function withdraw() {
    setNotice(null);
    const result = await withdrawPhotoConsentAction();
    if (result.ok) setNotice({ text: "Photo consent withdrawn. Every Consultation, photo and Preview is deleted.", problem: false });
    else if (result.refusal === "managed-by-the-team") setNotice({ text: COPY.managedByTheTeam, problem: true });
  }

  return (
    <div>
      <ConfirmDialog
        trigger={COPY.withdrawPhotoConsent}
        triggerClassName={`${secondaryButton} text-red-700`}
        title="Withdraw photo consent?"
        confirmLabel="Withdraw consent"
        confirmingLabel="Withdrawing…"
        failure="We couldn't withdraw your consent. Try again."
        onConfirm={withdraw}
      >
        {/* The spec asks that it says every Consultation, photo and Preview goes for good, and the sheet comes back. */}
        Every Consultation, with its photo, Outfits and Previews, is deleted for good. This can&apos;t be undone. Your account
        stays, and we&apos;ll ask for your consent again before your next Consultation.
      </ConfirmDialog>
      <p className="mt-2 text-sm text-stone-600">Deletes every Consultation, with its photos and Previews. Your account stays.</p>
      <NoticeLine notice={notice} className="mt-2 text-sm" />
    </div>
  );
}
