"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { SharedDemoAccountNote } from "@/components/shared-demo-account-note";
import { primaryButton, secondaryButton, textLink } from "@/components/ui";
import { COPY } from "@/config/copy";
import { ROUTES } from "@/config/routes";

/** What `dialog.close()` is given when the user agrees, telling that apart from closing it. */
const AGREED = "agreed";

/**
 * The consent sheet: what happens to the user's photos, in plain English, then the two separate
 * agreements "Get my Outfits" needs, both unticked each time it opens. Its wording is the photo
 * notice, the Demo Account's lines included: raise PHOTO_NOTICE_VERSION whenever it changes, so
 * every user sees it again.
 *
 * `isDemoAccount` says it's the Demo Account's, which every judge sees before each Consultation: it
 * says plainly that anyone with the login can see the Consultations made there.
 *
 * `onClose` says whether the user agreed to both, or closed it (with "Not now" or Escape) without.
 */
export function ConsentSheet({
  open,
  isDemoAccount,
  onClose,
}: {
  open: boolean;
  isDemoAccount: boolean;
  onClose: (agreed: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const [storeAndProcess, setStoreAndProcess] = useState(false);
  const [sendToGemini, setSendToGemini] = useState(false);

  useEffect(() => {
    const sheet = dialog.current;
    if (!open || !sheet || sheet.open) return;
    setStoreAndProcess(false);
    setSendToGemini(false);
    sheet.returnValue = "";
    sheet.showModal();
    // From the top, so the notice is read before the boxes.
    heading.current?.focus();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={(event) => onClose(event.currentTarget.returnValue === AGREED)}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-0 text-stone-900 shadow-xl backdrop:bg-black/40"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="overflow-y-auto p-6">
          <h2 ref={heading} id={titleId} tabIndex={-1} className="text-lg font-semibold outline-none">
            Before we use your photos
          </h2>
          {isDemoAccount && <SharedDemoAccountNote className="mt-3" />}
          <p className="mt-2 text-sm text-stone-600">Here&apos;s what happens to each photo you send.</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-stone-700">
            <li>
              We keep it privately, with the Outfits and Previews made from it, until{" "}
              {isDemoAccount
                ? "that Consultation or this account is deleted. Anyone signed in to this account can open them"
                : "you delete that Consultation, withdraw this consent or your account is deleted. Only you can open them"}
              , through private links that stop working after an hour.
            </li>
            <li>
              AI looks at your face and body to check the photo, read its style, tailor each Outfit to you and draw Previews of
              you wearing them. That AI is Google&apos;s Gemini, so your photo is sent to Google.
            </li>
            <li>
              From the check, we keep only which parts of you the photo shows, whether your hair is covered, and its
              style.
            </li>
            <li>
              Your photo is never used to identify you, and nothing guesses your age, ethnicity, skin tone, body measurements or
              health from it.
            </li>
            <li>Qloo, which picks the Style Icons and Brands, never sees your photo.</li>
          </ul>

          <h3 className="mt-5 text-sm font-semibold">What to send</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-stone-700">
            <li>{COPY.contentRules}</li>
            <li>
              A Body-Only Photo can still show your face. If it does, your face is processed with the rest of the photo, and
              left as it is in your Previews.
            </li>
          </ul>

          <h3 className="mt-5 text-sm font-semibold">When you delete them</h3>
          <p className="mt-2 text-sm text-stone-700">{COPY.deletionPromise}</p>

          <p className="mt-5 text-sm text-stone-700">
            There&apos;s more in our{" "}
            {/* A new tab, so the photo waiting on this step is kept. */}
            <Link href={ROUTES.privacy} target="_blank" className={textLink}>
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href={ROUTES.terms} target="_blank" className={textLink}>
              Terms
            </Link>
            .
          </p>

          <div className="mt-5 space-y-3 border-t border-stone-200 pt-5">
            <ConsentBox checked={storeAndProcess} onChange={setStoreAndProcess}>
              I agree to Qurator storing my photos and having AI process my face and body, as described above.
            </ConsentBox>
            <ConsentBox checked={sendToGemini} onChange={setSendToGemini}>
              I agree to my photos being sent to Google&apos;s Gemini.
            </ConsentBox>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-stone-200 p-4">
          <button type="button" onClick={() => dialog.current?.close()} className={secondaryButton}>
            Not now
          </button>
          <button
            type="button"
            onClick={() => dialog.current?.close(AGREED)}
            disabled={!storeAndProcess || !sendToGemini}
            className={primaryButton}
          >
            Continue
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** One of the sheet's two agreements: a box, unticked until the user ticks it, and what it agrees to. */
function ConsentBox({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-stone-900"
      />
      <label htmlFor={id} className="text-sm">
        {children}
      </label>
    </div>
  );
}
