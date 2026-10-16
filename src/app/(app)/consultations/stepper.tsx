const STEPS = ["Photo Type", "Photo & budget", "Styling", "Outfits"] as const;

/** The New Consultation stepper. `current` counts from 1. */
export function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol aria-label="Steps" className="mb-8 flex items-center gap-2 text-xs font-medium">
      {STEPS.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const isCurrent = step === current;
        return (
          <li key={label} aria-current={isCurrent ? "step" : undefined} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                done ? "bg-emerald-600 text-white" : isCurrent ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-500"
              }`}
            >
              {done ? "✓" : step}
            </span>
            <span className={`sr-only sm:not-sr-only ${isCurrent ? "text-stone-900" : "text-stone-400"}`}>
              {label}
              {done && <span className="sr-only"> (done)</span>}
            </span>
            {step < STEPS.length && <span aria-hidden="true" className="h-px flex-1 bg-stone-200" />}
          </li>
        );
      })}
    </ol>
  );
}
