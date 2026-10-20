const STEPS = ["Photo Type", "Photo & budget", "Styling", "Outfits"] as const;

/**
 * The New Consultation stepper: four segments that fill in ink as the steps are done. Phones show
 * only the current step's name, beside the segments; wider screens name every step under its own.
 * `current` counts from 1.
 */
export function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div className="mb-5 flex items-center gap-3 sm:mb-8 sm:block sm:short:mb-6">
      <ol aria-label="Steps" className="grid flex-1 grid-cols-4 gap-1.5 text-sm">
        {STEPS.map((label, index) => {
          const step = index + 1;
          const done = step < current;
          const isCurrent = step === current;
          return (
            <li key={label} aria-current={isCurrent ? "step" : undefined}>
              <span
                aria-hidden="true"
                className={`block h-[3px] rounded-full ${done || isCurrent ? "bg-ink" : "bg-ink/10"}`}
              />
              <span className={`sr-only sm:not-sr-only sm:mt-2.5 sm:flex sm:items-baseline sm:gap-1.5 ${isCurrent ? "font-medium text-ink" : done ? "text-ink" : "text-mute"}`}>
                <span aria-hidden="true" className="tabular-nums text-ash">
                  {step}
                </span>
                {label}
                {done && <span className="sr-only"> (done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p aria-hidden="true" className="shrink-0 text-[13px] text-mute sm:hidden">
        {current} of {STEPS.length}: <span className="font-medium text-ink">{STEPS[current - 1]}</span>
      </p>
    </div>
  );
}
