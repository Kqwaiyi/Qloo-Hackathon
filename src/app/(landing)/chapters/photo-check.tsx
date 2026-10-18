import type { ReactNode } from "react";

import { PHOTO_TYPE_LABELS } from "@/config/consultations";
import type { LandingSampleView } from "@/server/operations/landing";

import { AiGeneratedPersonCaption, SamplePhotoImage, sampleFrame } from "../sample-images";
import { ChapterTag, Label } from "../ui";

// 02 · AI. The photo check, told as plain ticks over the sample photo, never a "scan": photos are
// edited, never analysed (ADR-0005). Then the Photo Style words it read, which the user can change.

export function PhotoCheck({ sample }: { sample: LandingSampleView }) {
  const photoTypeLabel = PHOTO_TYPE_LABELS[sample.photoType];
  return (
    <section data-ground="paper" data-chapter="02 / 07 · AI" aria-labelledby="photo-check-title" className="relative px-4 pt-40 pb-[40svh] md:px-6">
      <div className="grid grid-cols-4 gap-x-4 gap-y-12 md:grid-cols-12">
        <figure className="col-span-4 md:col-span-6 lg:col-span-4 lg:col-start-2">
          <div data-reveal="blur" className={`${sampleFrame} rounded-xl bg-card`}>
            <SamplePhotoImage sample={sample} />
            <ul data-reveal="stagger" aria-label="What the AI checked" className="absolute inset-x-3 top-3 flex flex-col items-start gap-2">
              <CheckChip>✓ One person</CheckChip>
              <CheckChip>✓ {photoTypeLabel}</CheckChip>
              <CheckChip>
                Photo Style: {sample.photoStyle.join(" + ")}
              </CheckChip>
            </ul>
          </div>
          <AiGeneratedPersonCaption />
        </figure>
        <div className="col-span-4 flex flex-col justify-center md:col-span-5 md:col-start-8 lg:col-span-4 lg:col-start-8">
          <ChapterTag number={2} who="AI" tone="paper" />
          <h2 id="photo-check-title" data-reveal="rise" className="mt-6 text-title">
            The AI checks the photo and reads its style.
          </h2>
          <p data-reveal="blur" className="mt-5 max-w-[36ch] text-body text-mute">
            Is there one person, and is it really a {photoTypeLabel}? Then one or two words for its Photo Style. You can change them.
          </p>
        </div>
      </div>
    </section>
  );
}

function CheckChip({ children }: { children: ReactNode }) {
  return (
    <li className="inline-flex h-8 items-center rounded-full bg-paper/90 px-3 text-ink backdrop-blur-sm">
      <Label>{children}</Label>
    </li>
  );
}
