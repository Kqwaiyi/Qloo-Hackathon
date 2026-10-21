import type { ReactNode } from "react";

import { textLink } from "@/components/ui";
import { CATEGORY_LABELS } from "@/config/consultations";
import { COPY } from "@/config/copy";
import type { OfferView, OutfitCardContent, PieceView } from "@/server/operations/consultations";

// The Outfit card, as the results page shows it and the landing page reuses it.

/**
 * One Outfit, with its Preview, or what stands in for it, beside its Pieces where the card is wide
 * enough and above them where it isn't. It lays out by its own width, not the screen's, so it fits
 * a narrow column too. Its Style Icon is shown by name only, never with Qloo's image of them. A card
 * with Products credits their photos, which its Preview is drawn from, to their sellers.
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
          {outfit.total && (
            <p className="text-sm text-stone-600">
              Whole Outfit about {outfit.total}
              {outfit.leftOutOfTotal > 0 && ` ${COPY.leavesOutOfTotal(outfit.leftOutOfTotal)}`}
            </p>
          )}
          {outfit.pieces.length > 0 && (
            <ul aria-label="Pieces" className="mt-3">
              {outfit.pieces.map((piece) => (
                <li key={piece.category}>
                  <PieceRow piece={piece} styleIconName={outfit.styleIconName} />
                </li>
              ))}
            </ul>
          )}
          {outfit.pieces.some((piece) => piece.product) && <p className="mt-2 text-xs text-stone-500">{COPY.productPhotoCredit}</p>}
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
 * A Piece's row. A Product Piece names its Product, by its title, and its Brand, with its dated price
 * and a "View at <shop domain>" link to its page, or "No longer available" in their place once it's
 * no longer offered. An older Piece names its Brand, with the Brand's price range and a "Visit
 * <Brand>" link when it has them. The Hairstyle names its Style Icon instead, with no price or link:
 * it isn't something to buy. Every price comes written for the viewer, in their Country's currency.
 */
function PieceRow({ piece, styleIconName }: { piece: PieceView; styleIconName: string }) {
  const { brand, product } = piece;
  return (
    <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 border-t border-stone-100 py-3 @sm:grid-cols-[80px_1fr_auto]">
      <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{CATEGORY_LABELS[piece.category]}</div>
      <div>
        <div className="font-medium">{piece.item}</div>
        <div className="text-sm text-stone-600">{builtOn(piece, styleIconName)}</div>
        <p className="mt-1 text-sm text-stone-600 italic">{piece.why}</p>
      </div>
      {product ? (
        <div className="col-start-2 text-sm @sm:col-start-auto @sm:text-right">
          {product.available ? (
            <>
              <div className="font-medium">{productPriceText(product)}</div>
              <NewTabLink href={product.url}>View at {product.shopDomain}</NewTabLink>
            </>
          ) : (
            <div className="font-medium text-stone-500">{COPY.noLongerAvailable}</div>
          )}
        </div>
      ) : (
        brand &&
        (brand.priceRange || brand.visitUrl) && (
          <div className="col-start-2 text-sm @sm:col-start-auto @sm:text-right">
            {brand.priceRange && <div className="font-medium">{brand.priceRange}</div>}
            {brand.visitUrl && <NewTabLink href={brand.visitUrl}>Visit {brand.name}</NewTabLink>}
          </div>
        )
      )}
    </div>
  );
}

/** A link that opens in a new tab, with the ↗ that says so, and nothing passed to the page it opens. */
function NewTabLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={textLink}>
      {children}
      {/* U+FE0E keeps the arrow a plain glyph, not an emoji. */}
      <span aria-hidden="true"> {"↗︎"}</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** What a Piece is built on: its Brand, or for the Hairstyle, the Outfit's Style Icon. */
export function builtOn(piece: PieceView, styleIconName: string): string {
  return piece.brand ? piece.brand.name : `Style Icon: ${styleIconName}`;
}

/** A Product's price and the day it was found, such as "≈ Rp 809,370 on 21 Oct" or "€45 on 21 Oct". */
export function productPriceText({ price, pricedOn }: OfferView): string {
  return `${price} on ${dayText(pricedOn)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A YYYY-MM-DD date as its day and month, such as "21 Oct", spelled out here so no ICU version changes it. */
function dayText(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS[month! - 1]}`;
}
