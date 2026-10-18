import type { LandingSampleView } from "@/server/operations/landing";

import { AiGeneratedBadge, AiGeneratedPersonCaption, SamplePhotoImage, SamplePreviewImage, sampleFrame } from "../sample-images";
import { ChapterTag, Label } from "../ui";

// 06 · AI. The Preview: only the hair and clothes change. Without motion, the photo and its
// Preview side by side. Live, the section pins: the photo grows from a small frame to nearly the
// full height, then the Preview wipes in over it from the right (photo left of the line, Preview
// right of it, as the comparison slider has them), and a soft white bloom carries into the light
// chapter after.

export function Preview({ sample }: { sample: LandingSampleView }) {
  return (
    <section
      data-ground="ink"
      data-chapter="06 / 07 · AI"
      data-scene="preview"
      aria-labelledby="preview-title"
      className="relative z-10 bg-ink text-paper"
    >
      <div data-pin className="relative flex min-h-svh flex-col overflow-hidden px-4 pt-28 pb-16 md:px-6">
        <ChapterTag number={6} who="AI" tone="ink" />
        <h2 id="preview-title" className="preview-headline relative z-20 mt-8 flex flex-col text-display uppercase">
          <span data-reveal="rise" className="block">
            Only the hair
          </span>
          <span className="sr-only"> </span>
          <span data-reveal="rise" className="block self-end text-right">
            and clothes change
          </span>
        </h2>
        <div data-preview-stage className="preview-stage mx-auto mt-10 grid w-full max-w-3xl grid-cols-2 gap-4">
          <figure className="preview-layer" data-preview-photo>
            <div className={`${sampleFrame} rounded-xl bg-card-dark`}>
              <SamplePhotoImage sample={sample} tone="ink" />
            </div>
            <Label className="preview-static-caption mt-3 block text-mute-dark">Photo</Label>
          </figure>
          <figure className="preview-layer" data-preview-after>
            <div className={`${sampleFrame} rounded-xl bg-card-dark`}>
              <SamplePreviewImage sample={sample} tone="ink" />
              <AiGeneratedBadge className="top-3 right-3" />
            </div>
            <Label className="preview-static-caption mt-3 block text-mute-dark">Preview</Label>
          </figure>
          <span data-preview-divider aria-hidden="true" className="preview-divider pointer-events-none absolute inset-y-0 z-10 w-px bg-paper" />
        </div>
        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <AiGeneratedPersonCaption tone="ink" className="mt-0" />
          <Label className="text-mute-dark">Face, body, pose and background stay as they were.</Label>
        </div>
        <div
          data-bloom
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[90svh] bg-[radial-gradient(ellipse_80%_70%_at_50%_100%,var(--color-paper)_0%,transparent_70%)] opacity-0"
        />
      </div>
    </section>
  );
}
