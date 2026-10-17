"use client";

import { type KeyboardEvent, useRef, useState, useTransition } from "react";

import { LimitMessage } from "@/components/limit-message";
import { primaryButton, secondaryButton } from "@/components/ui";
import { isSamePhotoStyle, PHOTO_STYLES, type PhotoStyle, type PhotoStyleWords } from "@/config/consultations";
import { COPY } from "@/config/copy";
import type { UsageSummary } from "@/server/operations/usage";

import { changePhotoStyleAction } from "./actions";

/**
 * The results header's Photo Style, with "Change" to pick 1 or 2 other words from the list and the
 * allowance line beside it. Sent, the Styling step takes the page's place while Qloo picks new
 * Style Icons for them. "Change" is disabled, with the reason in place of the allowance line, while
 * no Styling can start, and while one runs.
 */
export function PhotoStyleEditor({
  consultationId,
  photoStyle,
  stylingRunning,
  stylingStart,
  outfitsLeft,
}: {
  consultationId: string;
  /** The current Photo Style. */
  photoStyle: PhotoStyleWords;
  /** A Styling is running on the Consultation, such as "Show 2 more Outfits". */
  stylingRunning: boolean;
  stylingStart: UsageSummary["stylingStart"];
  outfitsLeft: number;
}) {
  const [editing, setEditing] = useState(false);
  // In the order picked: the first is the strongest.
  const [picked, setPicked] = useState<PhotoStyle[]>([...photoStyle]);
  const [sending, startSending] = useTransition();
  const [failed, setFailed] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null);
  const firstWord = useRef<HTMLInputElement>(null);

  function open() {
    setPicked([...photoStyle]);
    setFailed(false);
    setEditing(true);
    // Once the words are shown.
    setTimeout(() => firstWord.current?.focus());
  }

  function close() {
    setEditing(false);
    setTimeout(() => changeButton.current?.focus());
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key === "Escape" && !sending) close();
  }

  function toggle(word: PhotoStyle) {
    setPicked((words) => (words.includes(word) ? words.filter((other) => other !== word) : [...words, word]));
  }

  function send() {
    setFailed(false);
    startSending(async () => {
      try {
        await changePhotoStyleAction(consultationId, picked);
      } catch {
        // The request itself failed: the network, or our side.
        setFailed(true);
      }
    });
  }

  const canStart = stylingStart.ok && !stylingRunning;
  // Beside the editor, as beside every action that uses Outfits: the allowance line, or why no
  // Styling can start. An unverified user has the banner above saying why, and only a verified
  // user can have a Consultation, so that's never seen here.
  const allowanceLine = (
    <p id="photo-style-line" className="mt-1.5 text-stone-600">
      {stylingStart.ok
        ? COPY.outfitsItUses(stylingStart.outfitsWanted, outfitsLeft)
        : stylingStart.refusal !== "unverified" && <LimitMessage refusal={stylingStart} />}
    </p>
  );

  if (!editing) {
    return (
      <div className="mt-2 text-sm">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-stone-600">Photo Style</span>
          {photoStyle.map((word) => (
            <span key={word} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
              {word}
            </span>
          ))}
          <button
            ref={changeButton}
            type="button"
            onClick={open}
            disabled={!canStart}
            aria-describedby="photo-style-line"
            className="ml-1 rounded px-1.5 py-0.5 font-medium underline underline-offset-2 hover:text-stone-600 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
          >
            Change<span className="sr-only"> Photo Style</span>
          </button>
        </div>
        {allowanceLine}
      </div>
    );
  }

  const full = picked.length === 2;
  return (
    <fieldset onKeyDown={closeOnEscape} aria-describedby="photo-style-hint" className="mt-3 text-sm">
      <legend className="font-medium">Photo Style</legend>
      <p id="photo-style-hint" className="text-stone-600">
        Pick 1 or 2 words. Qloo finds new Style Icons in that style for your new Outfits.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PHOTO_STYLES.map((word) => {
          const checked = picked.includes(word);
          return (
            <label
              key={word}
              className="cursor-pointer rounded-full border border-stone-200 bg-white px-3 py-1 font-medium text-stone-700 hover:border-stone-300 has-[:checked]:border-stone-900 has-[:checked]:bg-stone-900 has-[:checked]:text-white has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-stone-900 has-[:focus-visible]:ring-offset-2"
            >
              <input
                ref={word === (picked[0] ?? PHOTO_STYLES[0]) ? firstWord : undefined}
                type="checkbox"
                checked={checked}
                onChange={() => toggle(word)}
                // Two is the most: another word goes once one of them is taken off.
                disabled={sending || (full && !checked)}
                className="sr-only"
              />
              {word}
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={send}
          disabled={!canStart || sending || picked.length === 0 || isSamePhotoStyle(picked, photoStyle)}
          aria-describedby="photo-style-line photo-style-failed"
          className={`${primaryButton} px-4 py-2`}
        >
          {sending ? "Starting…" : "Get new Outfits"}
        </button>
        <button type="button" onClick={close} disabled={sending} className={`${secondaryButton} px-4 py-2 disabled:opacity-40`}>
          Cancel
        </button>
      </div>
      {allowanceLine}
      {failed && (
        <p id="photo-style-failed" role="alert" className="mt-1 text-red-700">
          We couldn&apos;t change the Photo Style just now. Try again in a moment.
        </p>
      )}
    </fieldset>
  );
}
