import type { ReactNode } from "react";

import { textLink } from "@/components/ui";
import { CATEGORY_LABELS, type PriceRangeUsd } from "@/config/consultations";
import { COPY } from "@/config/copy";
import type { OutfitCardContent, PieceView } from "@/server/operations/consultations";

// The Outfit card, as the results page shows it and the landing page reuses it.

/**
 * One Outfit, with its Preview, or what stands in for it, beside its Pieces where the card is wide
 * enough and above them where it isn't. It lays out by its own width, not the screen's, so it fits
 * a narrow column too. Its Style Icon is shown by name only, never with Qloo's image of them.
 */
export function OutfitCard({ outfit, preview }: { outfit: OutfitCardContent; preview: ReactNode }) {
  return (
    <div className="@container">
      <article className="overflow-hidden rounded-xl border border-stone-200 bg-white @2xl:flex">
        {preview}
        <div className="@container flex-1 p-5">
          <h2 className="text-lg font-semibold">
            Outfit {outfit.position} · Inspired by {outfit.styleIconName}
          </h2>
          {outfit.priceRange && <p className="text-sm text-stone-600">Whole Outfit about {usdRange(outfit.priceRange)}</p>}
          {outfit.pieces.length > 0 && (
            <ul aria-label="Pieces" className="mt-3">
              {outfit.pieces.map((piece) => (
                <li key={piece.category}>
                  <PieceRow piece={piece} styleIconName={outfit.styleIconName} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>
    </div>
  );
}

/** Where a card's Preview goes: 3:4, beside the Pieces on a wide card. */
export const previewFrame = "relative aspect-[3/4] bg-stone-100 @2xl:w-64 @2xl:shrink-0 @2xl:self-start";

/** The badge every Preview carries, in its frame's corner. */
export function AiGeneratedBadge({ className = "top-2 left-2" }: { className?: string }) {
  return <span className={`absolute ${className} rounded bg-black/55 px-1.5 py-0.5 text-xs font-semibold text-white`}>{COPY.aiGenerated}</span>;
}

/**
 * A Piece's row. A Brand Piece names its Brand, with the Brand's price range and a "Visit <Brand>"
 * link when it has them. The Hairstyle names its Style Icon instead, with no price or link: it
 * isn't something to buy.
 */
function PieceRow({ piece, styleIconName }: { piece: PieceView; styleIconName: string }) {
  const { brand } = piece;
  return (
    <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 border-t border-stone-100 py-3 @sm:grid-cols-[80px_1fr_auto]">
      <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{CATEGORY_LABELS[piece.category]}</div>
      <div>
        <div className="font-medium">{piece.item}</div>
        <div className="text-sm text-stone-600">{builtOn(piece, styleIconName)}</div>
        <p className="mt-1 text-sm text-stone-600 italic">{piece.why}</p>
      </div>
      {brand && (brand.priceRange || brand.visitUrl) && (
        <div className="col-start-2 text-sm @sm:col-start-auto @sm:text-right">
          {brand.priceRange && <div className="font-medium">{usdRange(brand.priceRange)}</div>}
          {brand.visitUrl && (
            <a href={brand.visitUrl} target="_blank" rel="noopener noreferrer" className={textLink}>
              Visit {brand.name}
              {/* U+FE0E keeps the arrow a plain glyph, not an emoji. */}
              <span aria-hidden="true"> {"↗︎"}</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** What a Piece is built on: its Brand, or for the Hairstyle, the Outfit's Style Icon. */
export function builtOn(piece: PieceView, styleIconName: string): string {
  return piece.brand ? piece.brand.name : `Style Icon: ${styleIconName}`;
}

/** A price range in whole US dollars, such as "$20–$120". */
export function usdRange({ min, max }: PriceRangeUsd): string {
  const usd = (amount: number) => `$${Math.round(amount).toLocaleString("en-US")}`;
  return min === max ? usd(min) : `${usd(min)}–${usd(max)}`;
}
