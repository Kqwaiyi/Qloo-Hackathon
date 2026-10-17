"use client";

import { type KeyboardEvent, useRef, useState } from "react";

import { primaryButton, secondaryButton } from "@/components/ui";
import { isSamePhotoStyle, PHOTO_STYLES, type PhotoStyle, type PhotoStyleWords } from "@/config/consultations";

import { changePhotoStyleAction } from "./actions";
import { useStylingRequest } from "./use-styling-request";

/**
 * The results header's Photo Style, with "Change" to pick 1 or 2 other words from the list. Sent,
 * the Styling step takes the page's place while Qloo picks new Style Icons for them. "Change" is
 * disabled, with the reason on the allowance line, while no Styling can start, and while one runs.
 */
export function PhotoStyleEditor({
  consultationId,
  photoStyle,
  canStart,
  allowanceLineId,
}: {
  consultationId: string;
  /** The current Photo Style. */
  photoStyle: PhotoStyleWords;
  /** A Styling can start: no limit holds, and none runs on the Consultation. */
  canStart: boolean;
  allowanceLineId: string;
}) {
  const [editing, setEditing] = useState(false);
  // In the order picked: the first is the strongest.
  const [picked, setPicked] = useState<PhotoStyle[]>([...photoStyle]);
  const { sending, failed, send, clearFailed } = useStylingRequest();
  const changeButton = useRef<HTMLButtonElement>(null);
  const firstWord = useRef<HTMLInputElement>(null);

  function open() {
    setPicked([...photoStyle]);
    clearFailed();
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

  if (!editing) {
    return (
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
          aria-describedby={allowanceLineId}
          className="ml-1 rounded px-1.5 py-0.5 font-medium underline underline-offset-2 hover:text-stone-600 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
        >
          Change<span className="sr-only"> Photo Style</span>
        </button>
      </div>
    );
  }

  const full = picked.length === 2;
  return (
    <fieldset onKeyDown={closeOnEscape} aria-describedby="photo-style-hint">
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
          onClick={() => send(() => changePhotoStyleAction(consultationId, picked))}
          disabled={!canStart || sending || picked.length === 0 || isSamePhotoStyle(picked, photoStyle)}
          aria-describedby={`${allowanceLineId} photo-style-failed`}
          className={`${primaryButton} px-4 py-2`}
        >
          {sending ? "Starting…" : "Get new Outfits"}
        </button>
        <button type="button" onClick={close} disabled={sending} className={`${secondaryButton} px-4 py-2 disabled:opacity-40`}>
          Cancel
        </button>
      </div>
      {failed && (
        <p id="photo-style-failed" role="alert" className="mt-1 text-red-700">
          We couldn&apos;t change the Photo Style just now. Try again in a moment.
        </p>
      )}
    </fieldset>
  );
}
