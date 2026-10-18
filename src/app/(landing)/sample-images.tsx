import type { ReactNode } from "react";

import { PhotoTypeSilhouette } from "@/components/photo-type-silhouette";
import type { PhotoType } from "@/config/consultations";
import { COPY } from "@/config/copy";
import type { LandingSampleView } from "@/server/operations/landing";

// The frozen samples' images. Every sample person is AI-generated and captioned so; every Preview
// carries the "AI-generated" badge. A sample whose images aren't captured yet shows a plain figure.

/** A 3:4 frame for a sample's image, which fills it. Its size and corners are up to whoever uses it. */
export const sampleFrame = "relative aspect-[3/4] overflow-hidden bg-stone-100";

/** A sample person's photo, as their Consultation took it, filling its frame. */
export function SamplePhotoImage({ sample }: { sample: LandingSampleView }) {
  return <SampleImage url={sample.photoUrl} alt={COPY.aiGeneratedPersonAlt} photoType={sample.photoType} toCome="Sample photo to come" />;
}

/** A sample's Preview, filling its frame. It goes with an "AI-generated" badge. */
export function SamplePreviewImage({ sample }: { sample: LandingSampleView }) {
  return (
    <SampleImage
      url={sample.previewUrl}
      alt={`AI-generated Preview of a fictional person in the Outfit inspired by ${sample.outfit.styleIconName}`}
      photoType={sample.photoType}
      toCome="Sample Preview to come"
    />
  );
}

/** A frame's caption saying the person in it is AI-generated. */
export function AiGeneratedPersonCaption({ className = "" }: { className?: string }) {
  return <figcaption className={`mt-2 text-center text-xs text-stone-500 ${className}`}>{COPY.aiGeneratedPerson}</figcaption>;
}

/** A sample person's photo in its frame, captioned as AI-generated, with anything laid over it. */
export function SamplePhoto({ sample, children }: { sample: LandingSampleView; children?: ReactNode }) {
  return (
    <figure className="mx-auto w-full max-w-xs">
      <div className={`${sampleFrame} rounded-2xl shadow-lg`}>
        <SamplePhotoImage sample={sample} />
        {children}
      </div>
      <AiGeneratedPersonCaption />
    </figure>
  );
}

/**
 * An image filling its frame: a signed link, valid for 1 hour from when the page rendered, or
 * while there's none, the plain figure for the Photo Type and a line saying what's to come.
 */
function SampleImage({ url, alt, photoType, toCome }: { url: string | null; alt: string; photoType: PhotoType; toCome: string }) {
  if (!url) {
    return (
      <div role="img" aria-label={toCome} className="absolute inset-0 flex items-center justify-center bg-stone-100 text-stone-300">
        <PhotoTypeSilhouette photoType={photoType} className="absolute inset-0 h-full w-full" />
        <span className="relative mx-2 rounded bg-white/85 px-2 py-0.5 text-center text-xs font-medium text-stone-600">{toCome}</span>
      </div>
    );
  }
  return <img src={url} alt={alt} className="absolute inset-0 h-full w-full object-cover" />;
}
