import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalDate } from "@/components/local-date";
import { CATEGORY_LABELS, PHOTO_TYPE_LABELS } from "@/config/consultations";
import { COPY } from "@/config/copy";
import { getConsultation } from "@/server/data/consultations";
import type { OutfitView, PieceView, PreviewView } from "@/server/operations/consultations";

import { StylingProgress } from "./styling-progress";

export const metadata: Metadata = { title: "Your Outfits" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const consultation = await getConsultation(id);
  if (!consultation) notFound();

  return (
    <>
      <header className="flex flex-wrap items-center gap-4">
        {/* A signed link, valid for 1 hour from when this page rendered. */}
        <img
          src={consultation.photoUrl}
          alt={`Your ${PHOTO_TYPE_LABELS[consultation.photoType]}`}
          className="h-28 w-21 rounded-lg bg-stone-100 object-cover"
        />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your Outfits</h1>
          <p className="text-sm text-stone-600">
            {PHOTO_TYPE_LABELS[consultation.photoType]} · <LocalDate date={consultation.createdAt} />
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-1 text-sm">
            <span className="text-stone-600">Photo Style</span>
            {consultation.photoStyle.map((word) => (
              <span key={word} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
                {word}
              </span>
            ))}
          </p>
        </div>
      </header>
      {consultation.state === "styling" ? (
        <StylingProgress consultationId={consultation.id} />
      ) : consultation.outfits.length > 0 ? (
        <>
          {consultation.everyPreviewRefused && (
            <p role="status" className="mt-8 rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-700">
              {COPY.everyPreviewRefused}
            </p>
          )}
          <ol aria-label="Outfits" className="mt-8 space-y-5">
            {consultation.outfits.map((outfit) => (
              <li key={outfit.id}>
                <OutfitCard outfit={outfit} />
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="mt-8 rounded-xl border-2 border-dashed border-stone-200 p-8 text-center text-stone-600">No Outfits</p>
      )}
    </>
  );
}

/** One Outfit, its Preview beside it. Its Style Icon is shown by name only, never with Qloo's image of them. */
function OutfitCard({ outfit }: { outfit: OutfitView }) {
  return (
    <article className="overflow-hidden rounded-xl border border-stone-200 bg-white md:flex">
      <OutfitPreview preview={outfit.preview} styleIconName={outfit.styleIconName} />
      <div className="flex-1 p-5">
        <h2 className="text-lg font-semibold">
          Outfit {outfit.position} · Inspired by {outfit.styleIconName}
        </h2>
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
  );
}

/** The Preview, always badged as AI-generated, or a placeholder saying why there's none. */
function OutfitPreview({ preview, styleIconName }: { preview: PreviewView; styleIconName: string }) {
  if (preview.state !== "ready") {
    return (
      <p className="flex min-h-32 items-center justify-center bg-stone-100 p-6 text-center text-sm text-stone-600 md:aspect-[3/4] md:w-64 md:shrink-0 md:self-start">
        {preview.state === "refused" ? COPY.previewRefused : COPY.previewFailed}
      </p>
    );
  }
  return (
    <div className="relative aspect-[3/4] bg-stone-100 md:w-64 md:shrink-0 md:self-start">
      {/* A signed link, valid for 1 hour from when this page rendered. */}
      <img
        src={preview.url}
        alt={`Preview of you in the Outfit inspired by ${styleIconName}`}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span className="absolute top-2 left-2 rounded bg-black/55 px-1.5 py-0.5 text-xs font-semibold text-white">{COPY.aiGenerated}</span>
    </div>
  );
}

/** A Piece's row. The Hairstyle names its Style Icon and has no price or link: it isn't something to buy. */
function PieceRow({ piece, styleIconName }: { piece: PieceView; styleIconName: string }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-3 border-t border-stone-100 py-3">
      <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{CATEGORY_LABELS[piece.category]}</div>
      <div>
        <div className="font-medium">{piece.item}</div>
        {piece.category === "hairstyle" && <div className="text-sm text-stone-600">Style Icon: {styleIconName}</div>}
        <p className="mt-1 text-sm text-stone-600 italic">{piece.why}</p>
      </div>
    </div>
  );
}
