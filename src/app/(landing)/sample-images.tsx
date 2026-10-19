import type { PhotoType } from "@/config/consultations";
import { COPY } from "@/config/copy";
import type { LandingSampleView } from "@/server/operations/landing";

import { Label, type Tone } from "./ui";

// The frozen samples' images. Every sample person is AI-generated and captioned so; every Preview
// carries the "AI-generated" badge. A sample whose images aren't captured yet shows the page's own
// rendered Figure, framed the way its Photo Type would be, and says what's to come.

/** A 3:4 frame for a sample's image, which fills it. Its size and corners are up to whoever uses it. */
export const sampleFrame = "relative aspect-[3/4] overflow-hidden";

/** A sample person's photo, as their Consultation took it, filling its frame. */
export function SamplePhotoImage({ sample, tone = "paper" }: { sample: LandingSampleView; tone?: Tone }) {
  return (
    <SampleImage
      url={sample.photoUrl}
      alt={COPY.aiGeneratedPersonAlt}
      photoType={sample.photoType}
      toCome="Sample photo to come"
      placeholder={tone === "paper" ? "/landing/figure/light/000.webp" : "/landing/figure/dark-loop-m.poster.webp"}
    />
  );
}

/** A sample's Preview, filling its frame. It goes with an "AI-generated" badge. */
export function SamplePreviewImage({ sample, tone = "paper" }: { sample: LandingSampleView; tone?: Tone }) {
  return (
    <SampleImage
      url={sample.previewUrl}
      alt={`AI-generated Preview of a fictional person in the Outfit inspired by ${sample.outfit.styleIconName}`}
      photoType={sample.photoType}
      toCome="Sample Preview to come"
      placeholder={tone === "paper" ? "/landing/figure/light/006.webp" : "/landing/figure/dark-loop.poster.webp"}
    />
  );
}

/** The badge every Preview carries, in its frame's corner. */
export function AiGeneratedBadge({ className = "top-3 left-3" }: { className?: string }) {
  return <Label className={`absolute z-10 rounded-full bg-ink/70 px-2.5 py-1 text-paper backdrop-blur-sm ${className}`}>{COPY.aiGenerated}</Label>;
}

/** A frame's caption saying the person in it is AI-generated. */
export function AiGeneratedPersonCaption({ tone = "paper", className = "" }: { tone?: Tone; className?: string }) {
  return (
    <figcaption className={`mt-3 text-label font-medium uppercase ${tone === "paper" ? "text-mute" : "text-mute-dark"} ${className}`}>
      {COPY.aiGeneratedPerson}
    </figcaption>
  );
}

/** How the Figure is framed when it stands in for a Photo Type's photo: shoulders up, head to toe, shoulders down. */
const PLACEHOLDER_FRAMING: Record<PhotoType, string> = {
  face: "origin-[50%_4%] scale-[2.3]",
  full_body: "",
  body_only: "origin-[50%_92%] scale-[1.35]",
};

/**
 * An image filling its frame: a signed link, valid for 1 hour from when the page rendered, or
 * while there's none, the rendered Figure and a line saying what's to come.
 */
function SampleImage({
  url,
  alt,
  photoType,
  toCome,
  placeholder,
}: {
  url: string | null;
  alt: string;
  photoType: PhotoType;
  toCome: string;
  placeholder: string;
}) {
  if (!url) {
    return (
      <div role="img" aria-label={toCome} className="absolute inset-0 overflow-hidden">
        <img src={placeholder} alt="" className={`absolute inset-0 h-full w-full object-cover ${PLACEHOLDER_FRAMING[photoType]}`} />
        <Label className="absolute right-3 bottom-3 rounded-full bg-paper/85 px-2.5 py-1 text-ink backdrop-blur-sm">{toCome}</Label>
      </div>
    );
  }
  return <img src={url} alt={alt} className="absolute inset-0 h-full w-full object-cover" />;
}
