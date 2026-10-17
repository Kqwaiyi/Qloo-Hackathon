"use client";

import { type FormEvent, type ReactNode, useId, useRef, useState, useTransition } from "react";

import { dangerButton, secondaryButton } from "@/components/ui";

/**
 * A button that asks, in a modal, before doing something that can't be undone. While `onConfirm`
 * runs, neither Cancel nor Escape closes the modal. If it throws, the modal says `failure` and stays
 * open to try again; once it's done, the modal closes, unless it answers false.
 */
export function ConfirmDialog({
  trigger,
  triggerClassName,
  title,
  children,
  confirmLabel,
  confirmingLabel,
  failure,
  fields,
  onConfirm,
}: {
  /** What the button that opens it says. */
  trigger: ReactNode;
  triggerClassName: string;
  title: string;
  /** What confirming does, said plainly. */
  children: ReactNode;
  confirmLabel: string;
  /** What the confirm button says while `onConfirm` runs. */
  confirmingLabel: string;
  /** What the modal says when `onConfirm` throws. */
  failure: string;
  /** What the modal asks for before confirming, such as a password. Enter in a field confirms. */
  fields?: ReactNode;
  /** Does it. Answering false keeps the modal open, as when a field's answer was wrong, which the fields then say. */
  onConfirm: () => Promise<boolean | void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const [confirming, startConfirming] = useTransition();
  const [failed, setFailed] = useState(false);

  function open() {
    setFailed(false);
    dialog.current?.showModal();
  }

  function confirm(event: FormEvent) {
    event.preventDefault();
    setFailed(false);
    startConfirming(async () => {
      try {
        if ((await onConfirm()) !== false) dialog.current?.close();
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <>
      <button type="button" onClick={open} className={triggerClassName}>
        {trigger}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        // Escape can't close it while confirming.
        onCancel={(event) => {
          if (confirming) event.preventDefault();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-white p-6 text-stone-900 shadow-xl backdrop:bg-black/40"
      >
        <form onSubmit={confirm}>
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <p id={bodyId} className="mt-2 text-sm text-stone-600">
            {children}
          </p>
          {fields && <div className="mt-4">{fields}</div>}
          {failed && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {failure}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} disabled={confirming} className={secondaryButton}>
              Cancel
            </button>
            <button type="submit" disabled={confirming} className={dangerButton}>
              {confirming ? confirmingLabel : confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
