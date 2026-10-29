"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { SharedDemoAccountNote } from "@/components/shared-demo-account-note";
import { textLink } from "@/components/ui";
import { COPY } from "@/config/copy";
import { ROUTES } from "@/config/routes";

import { inkPill, linePill } from "../ui";

/** What `dialog.close()` is given when the user agrees, telling that apart from closing it. */
const AGREED = "agreed";

/**
 * Whose photo notice the consent sheet shows: an account's; the Demo Account's, which every judge
 * sees before each Consultation, saying plainly that anyone with the login can see the
 * Consultations made there; or a Guest's, saying how soon a Guest Consultation is deleted, with a
 * third agreement, to the Terms and Privacy Policy, which a Guest hasn't given at sign-up.
 */
export type PhotoNotice = "account" | "demo-account" | "guest";

/**
 * The consent sheet: what happens to the user's photos, in plain English, then the separate
 * agreements "Get my Outfits" needs, all unticked each time it opens. Its wording is the photo
 * notice, the Demo Account's and a Guest's lines included: raise PHOTO_NOTICE_VERSION whenever it
 * changes, so every user sees it again.
 *
 * `onClose` says whether the user agreed to every box, or closed it (with "Not now" or Escape) without.
 *
 * On phones it rises from the bottom edge, where the boxes and Continue are in reach of a thumb.
 */
export function ConsentSheet({
  open,
  notice,
  onClose,
}: {
  open: boolean;
  notice: PhotoNotice;
  onClose: (agreed: boolean) => void;
}) {
  const isGuest = notice === "guest";
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const [storeAndProcess, setStoreAndProcess] = useState(false);
  const [sendToAiProviders, setSendToAiProviders] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    const sheet = dialog.current;
    if (!open || !sheet || sheet.open) return;
    setStoreAndProcess(false);
    setSendToAiProviders(false);
    setAcceptedTerms(false);
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
      className="mx-0 mt-auto mb-0 w-full max-w-none rounded-t-2xl bg-white p-0 text-ink backdrop:bg-ink/50 motion-safe:open:animate-step-in sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-lg sm:rounded-2xl"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="min-h-0 overflow-y-auto px-6 pt-7 pb-6">
          <h2 ref={heading} id={titleId} tabIndex={-1} className="text-[1.375rem] leading-tight font-medium tracking-[-0.01em] outline-none">
            Before we use your photos
          </h2>
          {notice === "demo-account" && <SharedDemoAccountNote className="mt-4" />}
          <p className="mt-2 text-sm text-mute">Here&apos;s what happens to each photo you send.</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-ink/80 marker:text-ash">
            {isGuest ? (
              <li>{COPY.guestPhotosKept}</li>
            ) : (
              <li>
                We keep it privately, with the Outfits and Previews made from it, until{" "}
                {notice === "demo-account"
                  ? "that Consultation or this account is deleted. Anyone signed in to this account can open them"
                  : "you delete that Consultation, withdraw this consent or your account is deleted. Only you can open them"}
                , through private links that stop working after an hour.
              </li>
            )}
            <li>
              AI looks at your face and body to check the photo, read its style, tailor each Outfit to you and draw Previews of
              you wearing them. That AI is Anthropic&apos;s Claude and Google&apos;s Gemini, so your photo is sent to Anthropic
              and to Google.
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

          <h3 className="mt-6 text-sm font-medium">What to send</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink/80 marker:text-ash">
            <li>{COPY.contentRules}</li>
            <li>
              A Body-Only Photo can still show your face. If it does, your face is processed with the rest of the photo, and
              left as it is in your Previews.
            </li>
            <li>
              If anyone else is in your photo, it&apos;s stored and sent to Anthropic and Google with it, but only the main person
              is styled. Please make sure you have the consent of everyone else in it.
            </li>
          </ul>

          <h3 className="mt-6 text-sm font-medium">{isGuest ? COPY.whenTheyAreDeleted : "When you delete them"}</h3>
          <p className="mt-2 text-sm text-ink/80">{COPY.deletionPromise}</p>

          <p className="mt-6 text-sm text-ink/80">
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
        </div>
        {/* Always in view, under the notice however far it's scrolled. */}
        <div className="space-y-2 border-t border-ink/10 px-6 pt-4">
          <ConsentBox checked={storeAndProcess} onChange={setStoreAndProcess}>
            I agree to Qurator storing my photos and having AI process my face and body, as described above.
          </ConsentBox>
          <ConsentBox checked={sendToAiProviders} onChange={setSendToAiProviders}>
            I agree to my photos being sent to Anthropic&apos;s Claude and Google&apos;s Gemini.
          </ConsentBox>
          {isGuest && (
            <ConsentBox checked={acceptedTerms} onChange={setAcceptedTerms}>
              {COPY.agreeToTermsAndPrivacy}
            </ConsentBox>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 pt-3 pb-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => dialog.current?.close()} className={`${linePill} max-sm:flex-1`}>
            Not now
          </button>
          <button
            type="button"
            onClick={() => dialog.current?.close(AGREED)}
            disabled={!storeAndProcess || !sendToAiProviders || (isGuest && !acceptedTerms)}
            className={`${inkPill} max-sm:flex-1`}
          >
            Continue
          </button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * One of the sheet's agreements: a box, unticked until the user ticks it, and what it agrees
 * to, on a row that ticks it wherever it's tapped.
 */
function ConsentBox({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="relative flex items-start gap-3 rounded-xl px-3.5 py-3 ring-1 ring-ink/12 transition-shadow duration-200 ring-inset has-checked:ring-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="relative z-10 mt-0.5 size-[18px] shrink-0 accent-ink outline-none"
      />
      <label htmlFor={id} className="text-sm after:absolute after:inset-0 after:cursor-pointer">
        {children}
      </label>
    </div>
  );
}
