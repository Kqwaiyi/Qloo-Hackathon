// Class names for My Consultations and the New Consultation flow, in Qurator's own palette: ink,
// paper, the mark's grey (ash) and mute for quiet text. Pills for actions, as on the landing page.

const pill =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors duration-200 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40";

/** The one action a screen leads to. */
export const inkPill = `${pill} h-11 bg-ink px-6 text-paper hover:bg-ink/80`;

/** A second action beside it, or one that changes what's on screen. */
export const linePill = `${pill} h-11 bg-white px-5 text-ink ring-1 ring-ink/15 ring-inset hover:ring-ink/40`;

/** A small action inside a frame or a row: Retake, Change. */
export const smallPill = `${pill} h-9 bg-white px-4 text-sm text-ink ring-1 ring-ink/15 ring-inset hover:ring-ink/40`;

/** A step's question, the biggest words on the screen, smaller where the screen is short. */
export const stepHeading =
  "text-[1.5rem] leading-[1.1] font-medium tracking-[-0.02em] text-balance sm:text-[2.25rem] sm:short:text-[1.875rem]";

/** The line under a step's question. */
export const stepLead = "mt-1.5 max-w-[60ch] text-sm text-mute sm:mt-2 sm:text-base";

/** A quiet line that names a group: "Photo Type", "Budget Tier". */
export const groupLabel = "text-sm font-medium text-ink";
