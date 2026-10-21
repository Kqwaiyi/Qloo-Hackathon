import type { ReactNode } from "react";

import { Headline, Label, LoopVideo } from "../ui";

// The opening: the promise in four words over the turning Drape, then how it works in one line.

export const HOW_IT_WORKS_ID = "how-it-works";

/**
 * The hero. It pins while the next chapter slides up over it, dimming as it goes. The notice slot
 * holds the "account deleted" message when there is one.
 */
export function Hero({ notice }: { notice?: ReactNode }) {
  return (
    <section data-ground="paper" data-cover data-hero aria-labelledby="hero-title" className="relative h-svh overflow-hidden bg-paper">
      <div data-cover-inner className="absolute inset-0">
        <div className="feather absolute inset-0">
          <LoopVideo name="drape/light-loop" />
        </div>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
          <Headline as="h1" id="hero-title" caption="Picked with Qloo's taste data, shown on you">
            One photo, complete Outfits
          </Headline>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-4 pb-5 md:px-6 md:pb-6">
          <Label className="text-mute">Scroll to follow along</Label>
          <a
            href={`#${HOW_IT_WORKS_ID}`}
            data-scroll-to=""
            aria-label="Scroll to follow along"
            className="flex size-10 items-center justify-center rounded-full ring-1 ring-ink/15 transition-colors duration-300 hover:bg-ink hover:text-paper"
          >
            {/* U+FE0E keeps the arrow a plain glyph, not an emoji. */}
            <span aria-hidden="true">{"↓︎"}</span>
          </a>
        </div>
      </div>
      {notice}
      <div data-dim aria-hidden="true" className="pointer-events-none absolute inset-0 bg-ink opacity-0" />
    </section>
  );
}

/** One line, filled word by word as it's read: who decides, and who picks the real Products (ADR-0001, ADR-0008). */
export function Statement() {
  return (
    <section
      id={HOW_IT_WORKS_ID}
      data-ground="paper"
      aria-label="How it works"
      className="relative z-10 flex min-h-svh items-center justify-center bg-paper px-4 py-24 md:px-6"
    >
      <p data-fill="paper" className="max-w-[24ch] text-center text-title">
        <span data-fill-hold className="text-mute">
          How it works.
        </span>{" "}
        Qloo decides what to recommend. The AI picks real Products and shows them on you.
      </p>
    </section>
  );
}
