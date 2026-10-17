import { COPY } from "@/config/copy";
import type { SignUpGateRefusal } from "@/server/operations/sign-up";

/**
 * Shown instead of the sign-up steps: once someone gives an under-18 date, or, before anything is
 * filled in, to a visitor in a country Gemini doesn't serve.
 */
export function SignUpClosed({ reason }: { reason: SignUpGateRefusal["refusal"] }) {
  return (
    <p role="alert" className="mt-6 text-stone-700">
      {reason === "under-18" ? COPY.under18 : COPY.unsupportedRegion}
    </p>
  );
}
