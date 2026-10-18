import { COPY } from "@/config/copy";

/** On the Demo Account, which the judges share: anyone signed in to it can see its Consultations. */
export function SharedDemoAccountNote({ className = "" }: { className?: string }) {
  return <p className={`rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ${className}`}>{COPY.sharedDemoAccount}</p>;
}
