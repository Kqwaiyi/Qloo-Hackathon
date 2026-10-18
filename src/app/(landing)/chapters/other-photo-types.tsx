import { STYLE_PREFERENCE_LABELS } from "@/config/accounts";
import { PHOTO_TYPE_LABELS, type PhotoType } from "@/config/consultations";
import type { LandingSampleView } from "@/server/operations/landing";

import { AiGeneratedBadge, AiGeneratedPersonCaption, SamplePhotoImage, SamplePreviewImage, sampleFrame } from "../sample-images";
import { Label, LoopVideo } from "../ui";

// Not after a whole Outfit? The three samples, one per Photo Type, each as its photo with the
// Preview over it on hover or focus. Live on wide screens, they sit on the inside of a cylinder the
// scroll turns, over the drifting Drape; otherwise a plain row.

/** What each Photo Type gets, in a line. */
const PHOTO_TYPE_LINES: Record<PhotoType, string> = {
  face: "Just your face and hair, for a new Hairstyle.",
  full_body: "Head to toe, face included, for a Hairstyle, a Top, a Bottom and Shoes.",
  body_only: "Shoulders to toe with your face left out, for a Top, a Bottom and Shoes.",
};

export function OtherPhotoTypes({ samples }: { samples: LandingSampleView[] }) {
  return (
    <section data-ground="paper" data-scene="cylinder" aria-labelledby="other-photo-types-title" className="relative overflow-hidden">
      <div data-pin className="relative flex min-h-svh flex-col justify-center gap-10 py-24">
        <div aria-hidden="true" className="feather absolute inset-0 -z-10 opacity-70">
          <LoopVideo name="drape/light-loop" />
        </div>
        <h2 id="other-photo-types-title" data-reveal="rise" className="px-4 text-center text-title md:px-6">
          Not after a whole Outfit?
        </h2>
        <div data-cylinder className="cylinder md:h-[min(62svh,36rem)]">
          <ul data-cylinder-ring className="cylinder-ring track flex gap-4 overflow-x-auto px-4 md:grid md:grid-cols-3 md:overflow-visible md:px-6">
            {samples.map((sample) => (
              <li key={sample.photoType} data-cylinder-panel className="cylinder-panel w-[70vw] shrink-0 sm:w-[44vw] md:w-[min(18vw,15rem)]">
                <figure tabIndex={0} className="group block rounded-xl">
                  <div className={`${sampleFrame} rounded-xl bg-card`}>
                    <SamplePhotoImage sample={sample} />
                    <div className="absolute inset-0 opacity-0 transition-opacity duration-700 ease-glide group-hover:opacity-100 group-focus-visible:opacity-100">
                      <SamplePreviewImage sample={sample} />
                      <AiGeneratedBadge className="top-3 right-3" />
                    </div>
                  </div>
                  <AiGeneratedPersonCaption />
                </figure>
                <h3 className="mt-4 text-body font-medium">{PHOTO_TYPE_LABELS[sample.photoType]}</h3>
                <p className="mt-1 text-body text-mute">{PHOTO_TYPE_LINES[sample.photoType]}</p>
                <Label className="mt-3 block text-mute">
                  {STYLE_PREFERENCE_LABELS[sample.stylePreference]} · Inspired by {sample.outfit.styleIconName}
                </Label>
              </li>
            ))}
          </ul>
        </div>
        <Label className="px-4 text-center text-mute md:px-6">Hover or focus a photo to see its Preview</Label>
      </div>
    </section>
  );
}
