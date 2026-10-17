"use client";

import { type ReactNode, useId, useRef, useState, useTransition } from "react";

import { dangerButton, secondaryButton } from "@/components/ui";

/**
 * A button that asks, in a modal, before doing something that can't be undone. While `onConfirm`
 * runs, neither Cancel nor Escape closes the modal. If it throws, the modal says `failure` and stays
 * open to try again; once it's done, the modal closes.
 */
export function ConfirmDialog({
  trigger,
  triggerClassName,
  title,
  children,
  confirmLabel,
  confirmingLabel,
  failure,
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
  onConfirm: () => Promise<void>;
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

  function confirm() {
    setFailed(false);
    startConfirming(async () => {
      try {
        await onConfirm();
        dialog.current?.close();
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
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <p id={bodyId} className="mt-2 text-sm text-stone-600">
          {children}
        </p>
        {failed && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {failure}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => dialog.current?.close()} disabled={confirming} className={secondaryButton}>
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={confirming} className={dangerButton}>
            {confirming ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
