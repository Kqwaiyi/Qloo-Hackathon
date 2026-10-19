"use client";

import { type ReactNode, useState } from "react";

import { AiGeneratedBadge, sampleFrame } from "./sample-images";

/**
 * Drag to compare a photo with its Preview: the photo on the left of the line, the Preview on the
 * right, badged as AI-generated in its own corner. Each side's image fills the frame. An invisible
 * range input does the work, so it answers to the keyboard too.
 */
export function BeforeAfter({ before, after, label }: { before: ReactNode; after: ReactNode; label: string }) {
  const [position, setPosition] = useState(50);
  return (
    <div className={`${sampleFrame} rounded-xl select-none has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-4`}>
      {after}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        {before}
      </div>
      <AiGeneratedBadge className="top-3 right-3" />
      <div className="pointer-events-none absolute inset-y-0 w-px bg-paper" style={{ left: `${position}%` }}>
        {/* U+FE0E keeps the arrow a plain glyph, not an emoji. */}
        <span
          aria-hidden="true"
          className="absolute top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-paper text-sm text-ink"
        >
          {"↔︎"}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
