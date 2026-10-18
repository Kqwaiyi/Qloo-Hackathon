"use client";

import { type ReactNode, useState } from "react";

import { AiGeneratedBadge } from "@/components/outfit-card";

import { sampleFrame } from "./sample-images";

/**
 * Drag to compare a photo with its Preview: the photo on the left of the line, the Preview on the
 * right, badged as AI-generated in its own corner. Each side's image fills the frame.
 */
export function BeforeAfter({ before, after, label }: { before: ReactNode; after: ReactNode; label: string }) {
  const [position, setPosition] = useState(50);
  return (
    <div className={`${sampleFrame} rounded-2xl shadow-lg select-none has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-stone-900`}>
      {after}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        {before}
      </div>
      <AiGeneratedBadge className="top-2 right-2" />
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${position}%` }}>
        {/* U+FE0E keeps the arrow a plain glyph, not an emoji. */}
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white text-center text-sm leading-9 text-stone-700 shadow-md"
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
