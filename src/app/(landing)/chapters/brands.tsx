import { CATEGORY_LABELS } from "@/config/consultations";
import type { LandingSampleView } from "@/server/operations/landing";

import { budgetTierChip, budgetTierPhrase } from "../format";
import { Chip, Label } from "../ui";

// The Brands that the Style Icon's fans favour, within the sample's Budget Tier: one
// card per Brand Piece. Live, the section pins and opens one card at a time while a hairline fills.

export function Brands({ sample }: { sample: LandingSampleView }) {
  const { outfit } = sample;
  const brandPieces = outfit.pieces.flatMap(({ category, brand }) => (brand ? [{ category, brand }] : []));
  return (
    <section data-ground="ink" data-scene="accordion" aria-labelledby="brands-title" className="relative text-paper">
      <div data-pin className="relative grid min-h-svh grid-cols-4 content-center gap-x-4 gap-y-12 px-4 py-28 md:grid-cols-12 md:px-6">
        <div aria-hidden="true" className="absolute inset-x-4 top-24 h-px bg-paper/14 md:inset-x-6 md:top-28">
          <div data-progress className="h-full origin-left bg-paper" />
        </div>
        <div className="col-span-4 flex flex-col gap-5 md:col-span-5">
          <h2 id="brands-title" data-reveal="rise" className="text-title">
            …and the Brands their fans favour
          </h2>
          <p data-reveal="blur" className="max-w-[36ch] text-body text-mute-dark">
            For {outfit.styleIconName}, Qloo picks the Brands that people who love them also love, {budgetTierPhrase(sample.budgetTier)}.
          </p>
          <div data-reveal="blur">
            <Chip tone="ink">{budgetTierChip(sample.budgetTier)}</Chip>
          </div>
        </div>
        <ul aria-label="Brands" className="col-span-4 flex flex-col gap-2 self-center md:col-span-6 md:col-start-7">
          {brandPieces.map(({ category, brand }, index) => (
            <li
              key={category}
              data-accordion-item
              className={`accordion-item rounded-xl bg-card-dark ${index === 0 ? "is-open" : ""}`}
            >
              <div className="flex h-16 items-center justify-between gap-4 px-5">
                <Label>{CATEGORY_LABELS[category]}</Label>
                <span className="text-body">{brand.name}</span>
              </div>
              <div className="accordion-body">
                <div>
                  <div className="flex flex-wrap items-end justify-between gap-4 px-5 pt-10 pb-5">
                    <p className="text-title">{brand.name}</p>
                    {brand.priceRange && <p className="text-title">{brand.priceRange}</p>}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
