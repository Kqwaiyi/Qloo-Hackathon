import { builtOn, NewTabLink, productPriceText } from "@/components/outfit-card";
import { BUDGET_TIER_LABELS, BUDGET_TIERS, CATEGORY_LABELS } from "@/config/consultations";
import { COPY } from "@/config/copy";
import { OUTFITS_PER_STYLING } from "@/config/stylings";
import type { PieceView } from "@/server/operations/consultations";
import type { LandingSampleView } from "@/server/operations/landing";

import { BeforeAfter } from "../before-after";
import { AiGeneratedPersonCaption, SamplePhotoImage, SamplePreviewImage } from "../sample-images";
import { Headline, Label } from "../ui";

// The sample's Outfit, ready to shop: its Pieces as the app's Outfit card shows them, each Product
// by its seller's name with its Brand, its dated price and a link to its shop, and the credit for
// the Product photos its Preview was drawn from; the photo and Preview to compare by hand; how many
// Outfits come at a time; and the Budget Tier control that has Qloo find new candidates for the
// Stylist. The app's own Outfit card is left as it is: this is the landing page's monochrome
// telling of it, in its words.

export function ReadyToShop({ sample }: { sample: LandingSampleView }) {
  const { outfit } = sample;
  return (
    <section data-ground="paper" aria-labelledby="ready-to-shop-title" className="relative pt-28 pb-[30svh]">
      <Headline id="ready-to-shop-title">Your Outfit, ready to shop</Headline>
      <div className="mt-12 grid grid-cols-4 gap-x-4 gap-y-16 px-4 md:grid-cols-12 md:px-6">
        <figure data-reveal="blur" className="col-span-4 md:col-span-5 lg:col-span-4 lg:col-start-2">
          <BeforeAfter
            label="Compare the photo with its Preview"
            before={<SamplePhotoImage sample={sample} />}
            after={<SamplePreviewImage sample={sample} />}
          />
          <div className="flex flex-wrap justify-between gap-3">
            <AiGeneratedPersonCaption />
            <Label className="mt-3 text-mute">Drag to compare</Label>
          </div>
        </figure>
        <div className="col-span-4 md:col-span-7 md:col-start-6 lg:col-span-5 lg:col-start-7">
          <h3 data-reveal="rise" className="text-title">
            Outfit {outfit.position} · Inspired by {outfit.styleIconName}
          </h3>
          {outfit.total && (
            <p className="mt-3 text-body text-mute">
              Whole Outfit about {outfit.total}
              {outfit.leftOutOfTotal > 0 && ` ${COPY.leavesOutOfTotal(outfit.leftOutOfTotal)}`}
            </p>
          )}
          <ul data-reveal="stagger" aria-label="Pieces" className="mt-8 border-t border-ink/12">
            {outfit.pieces.map((piece) => (
              <li key={piece.category} className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-1 border-b border-ink/12 py-4 sm:grid-cols-[6rem_1fr_auto]">
                <Label className="pt-1 text-mute">{CATEGORY_LABELS[piece.category]}</Label>
                <div>
                  <p className="text-body font-medium">{piece.item}</p>
                  <p className="text-body text-mute">{builtOn(piece, outfit.styleIconName)}</p>
                </div>
                <PieceOffer piece={piece} />
              </li>
            ))}
          </ul>
          {outfit.pieces.some(({ product }) => product) && (
            <p data-reveal="blur" className="mt-3 text-label font-medium text-mute uppercase">
              {COPY.productPhotoCredit}
            </p>
          )}
          <div className="mt-10 grid grid-cols-2 gap-4">
            <div data-reveal="blur">
              <p className="text-display">{OUTFITS_PER_STYLING}</p>
              <Label className="mt-3 block text-mute">Outfits to start</Label>
            </div>
            <div data-reveal="blur">
              <p className="text-display">+{OUTFITS_PER_STYLING}</p>
              <Label className="mt-3 block text-mute">Whenever you ask</Label>
            </div>
          </div>
          {sample.budgetTier && (
            <div data-reveal="blur" className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Label className="text-mute">Budget Tier</Label>
              <p className="sr-only">Our sample used the {BUDGET_TIER_LABELS[sample.budgetTier]} Budget Tier.</p>
              <div aria-hidden="true" className="inline-flex flex-wrap gap-1 rounded-[1.25rem] bg-card p-1">
                {BUDGET_TIERS.map((budgetTier) => (
                  <Label
                    key={budgetTier}
                    className={`inline-flex h-8 items-center rounded-full px-3.5 ${budgetTier === sample.budgetTier ? "bg-ink text-paper" : "text-mute"}`}
                  >
                    {BUDGET_TIER_LABELS[budgetTier]}
                  </Label>
                ))}
              </div>
            </div>
          )}
          <p data-reveal="blur" className="mt-6 max-w-[44ch] text-body text-mute">
            Each Piece names its Product, its shop and its price. Change the Budget Tier or Photo Style, and Qloo finds new candidates for your
            AI Stylist to choose from.
          </p>
        </div>
      </div>
    </section>
  );
}

/** The chapter's links, underlined in its monochrome. */
const link = "underline underline-offset-4 hover:text-mute";

/**
 * What a Piece's row offers, as the app's card words it: a Product's dated price and a link to its
 * shop, or "No longer available" in their place; an older Piece's Brand price range and a link to
 * the Brand's site, when it has them. Nothing for the Hairstyle, which isn't something to buy.
 */
function PieceOffer({ piece: { brand, product } }: { piece: PieceView }) {
  if (product) {
    return (
      <div className="col-start-2 text-body sm:col-start-auto sm:text-right">
        {product.available ? (
          <>
            <p>{productPriceText(product)}</p>
            <NewTabLink href={product.url} className={link}>
              View at {product.shopDomain}
            </NewTabLink>
          </>
        ) : (
          <p className="text-mute">{COPY.noLongerAvailable}</p>
        )}
      </div>
    );
  }
  if (!brand || (!brand.priceRange && !brand.visitUrl)) return null;
  return (
    <div className="col-start-2 text-body sm:col-start-auto sm:text-right">
      {brand.priceRange && <p>{brand.priceRange}</p>}
      {brand.visitUrl && (
        <NewTabLink href={brand.visitUrl} className={link}>
          Visit {brand.name}
        </NewTabLink>
      )}
    </div>
  );
}
