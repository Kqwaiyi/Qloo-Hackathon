import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalDate } from "@/components/local-date";
import { PHOTO_TYPE_LABELS } from "@/config/consultations";
import { getConsultation } from "@/server/data/consultations";

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
      <p className="mt-8 rounded-xl border-2 border-dashed border-stone-200 p-8 text-center text-stone-600">
        Your Outfits will appear here soon.
      </p>
    </>
  );
}
