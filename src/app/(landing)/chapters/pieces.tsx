import { builtOn } from "@/components/outfit-card";
import { CATEGORY_LABELS } from "@/config/consultations";
import type { LandingSampleView } from "@/server/operations/landing";

import { ChapterTag, Label } from "../ui";

// 05 · AI. Qloo picked the Brands and the Style Icon; the AI turns each into a concrete Piece and
// says in one line why it suits the photo. It pins and dims as the Preview chapter slides over it.

export function Pieces({ sample }: { sample: LandingSampleView }) {
  const { outfit } = sample;
  return (
    <section
      data-ground="ink"
      data-chapter="05 / 07 · AI"
      data-cover
      aria-labelledby="pieces-title"
      className="relative bg-ink px-4 pt-40 pb-32 text-paper md:px-6"
    >
      <div data-cover-inner>
        <ChapterTag number={5} who="AI" tone="ink" />
        <h2 id="pieces-title" data-reveal="rise" className="mt-6 max-w-[24ch] text-title">
          The AI tailors each Piece to the photo. <span className="text-mute-dark">It never swaps a Brand or reorders Qloo&apos;s picks.</span>
        </h2>
        <ul data-reveal="stagger" aria-label="Pieces" className="mt-20 border-t border-paper/14">
          {outfit.pieces.map((piece) => (
            <li key={piece.category} className="grid grid-cols-4 gap-x-4 gap-y-3 border-b border-paper/14 py-7 md:grid-cols-12">
              <Label className="col-span-4 text-mute-dark md:col-span-2">{CATEGORY_LABELS[piece.category]}</Label>
              <p className="col-span-4 text-title md:col-span-5">{piece.item}</p>
              <p className="col-span-4 text-body md:col-span-2">{builtOn(piece, outfit.styleIconName)}</p>
              <p className="col-span-4 text-body text-mute-dark italic md:col-span-3">{piece.why}</p>
            </li>
          ))}
        </ul>
      </div>
      <div data-dim aria-hidden="true" className="pointer-events-none absolute inset-0 bg-ink opacity-0" />
    </section>
  );
}
