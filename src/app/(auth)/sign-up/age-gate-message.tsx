import { COPY } from "@/config/copy";

/** Shown instead of the date of birth step once someone gives an under-18 date. */
export function AgeGateMessage() {
  return (
    <p role="alert" className="mt-6 text-stone-700">
      {COPY.under18}
    </p>
  );
}
