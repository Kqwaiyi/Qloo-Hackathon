import { secondaryButton } from "@/components/ui";
import { COPY } from "@/config/copy";

// What the Demo Account's Settings show in place of each thing the team manages: its value or its
// button, disabled, with a lock and "Managed by the team".

/** A lock and "Managed by the team", describing the disabled item above it. */
export function ManagedByTheTeam({ id, className = "" }: { id: string; className?: string }) {
  return (
    <p id={id} className={`${className} flex items-center gap-1.5 text-sm text-stone-600`}>
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0 fill-current">
        <path d="M8 1.5a3.5 3.5 0 0 0-3.5 3.5v2H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 15h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 7h-.5V5A3.5 3.5 0 0 0 8 1.5Zm2 5.5H6V5a2 2 0 1 1 4 0v2Z" />
      </svg>
      {COPY.managedByTheTeam}
    </p>
  );
}

/** An action's button, disabled, with "Managed by the team" beneath it. */
export function ManagedAction({ id, label }: { id: string; label: string }) {
  const describedBy = `${id}-managed`;
  return (
    <div>
      <button type="button" disabled aria-describedby={describedBy} className={`${secondaryButton} disabled:cursor-not-allowed disabled:opacity-40`}>
        {label}
      </button>
      <ManagedByTheTeam id={describedBy} className="mt-2" />
    </div>
  );
}
