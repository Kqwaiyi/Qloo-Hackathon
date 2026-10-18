import { CATEGORIES, CATEGORY_LABELS, PHOTO_TYPE_CATEGORIES, PHOTO_TYPE_LABELS, PHOTO_TYPES, type PhotoType } from "@/config/consultations";

import { ChapterTag, GridFrame, Label, SpreadHeadline } from "../ui";

// 01 · You. Which photo unlocks which Categories, shown on the page's turning Figure: one Photo
// Type at a time, with a hotspot lit for each Category it unlocks. Without motion, the three Photo
// Types are a plain list beside the Figure.

/** What each Photo Type shows and gets, in a line. */
const PHOTO_TYPE_LINES: Record<PhotoType, string> = {
  face: "Your face and hair, for a new Hairstyle.",
  full_body: "Head to toe, face included: all four Categories.",
  body_only: "Shoulders to toe, face left out: Top, Bottom and Shoes.",
};

/** Where the turning Figure's frames live: 48 desktop frames, and every second one for phones. */
export const FIGURE_SEQUENCE = { base: "/landing/figure/light", frames: 48, mobileBase: "/landing/figure/light-m", mobileFrames: 24 } as const;

export function PhotoTypes() {
  return (
    <section data-ground="paper" data-chapter="01 / 07 · You" data-scene="photo-types" aria-labelledby="photo-types-title" className="relative">
      <div data-pin className="photo-types-stage relative flex min-h-svh flex-col pt-24 pb-8 md:pt-28">
        <SpreadHeadline id="photo-types-title" left="What will" right="your photo show?" />
        <div className="mt-6 grid flex-1 grid-cols-4 gap-x-4 gap-y-6 px-4 md:mt-8 md:grid-cols-12 md:gap-y-10 md:px-6">
          <div className="order-2 col-span-4 flex flex-col justify-end md:order-none md:col-span-4 lg:col-span-3">
            <ChapterTag number={1} who="You" tone="paper" />
            <ol className="photo-types-states mt-6 flex flex-col gap-10">
              {PHOTO_TYPES.map((photoType) => (
                <li key={photoType} data-state={photoType} data-unlocks={PHOTO_TYPE_CATEGORIES[photoType].join(" ")}>
                  <h3 className="text-title">{PHOTO_TYPE_LABELS[photoType]}</h3>
                  <p className="mt-2 max-w-[30ch] text-body text-mute">{PHOTO_TYPE_LINES[photoType]}</p>
                  <ul aria-label="Categories it unlocks" className="mt-4 flex flex-wrap gap-2">
                    {CATEGORIES.map((category) => {
                      const unlocked = PHOTO_TYPE_CATEGORIES[photoType].includes(category);
                      return (
                        <li
                          key={category}
                          className={`inline-flex h-7 items-center rounded-full px-3 ${unlocked ? "bg-ink text-paper" : "text-ink/40 ring-1 ring-ink/15"}`}
                        >
                          <Label>
                            {CATEGORY_LABELS[category]}
                            <span className="sr-only">{unlocked ? ": unlocked" : ": not with this photo"}</span>
                          </Label>
                        </li>
                      );
                    })}
                  </ul>
                  {photoType === "full_body" && <Label className="mt-4 block text-mute">Hair covered? Then Top, Bottom and Shoes.</Label>}
                </li>
              ))}
            </ol>
          </div>
          <div className="order-1 col-span-4 flex items-center justify-center md:order-none md:col-span-8 lg:col-span-6">
            <GridFrame tone="paper" className="aspect-[4/5] h-[min(36svh,30rem)] md:h-[min(62svh,40rem)]">
              <img
                data-sequence-poster
                src={`${FIGURE_SEQUENCE.base}/000.webp`}
                alt="The page's faceless mannequin, standing in for a person"
                className="feather absolute inset-0 h-full w-full object-contain"
              />
              <canvas
                data-sequence={FIGURE_SEQUENCE.base}
                data-sequence-frames={FIGURE_SEQUENCE.frames}
                data-sequence-mobile={FIGURE_SEQUENCE.mobileBase}
                data-sequence-mobile-frames={FIGURE_SEQUENCE.mobileFrames}
                aria-hidden="true"
                className="feather absolute inset-0 h-full w-full"
              />
              <span data-crop aria-hidden="true" className="photo-types-crop absolute rounded-sm border border-dashed border-ink/60" />
              {CATEGORIES.map((category) => (
                <span
                  key={category}
                  data-hotspot={category}
                  aria-hidden="true"
                  className="hotspot absolute top-0 left-0 -translate-x-[5px] -translate-y-1/2 items-center gap-2 transition-opacity duration-500 ease-glide"
                >
                  <span data-hotspot-dot className="size-2.5 shrink-0 rounded-full ring-2 ring-paper transition-colors duration-500 ease-glide" />
                  <span
                    data-hotspot-pill
                    className="inline-flex h-8 items-center gap-2 rounded-full pr-1.5 pl-3 whitespace-nowrap transition-[background-color,color,box-shadow] duration-500 ease-glide"
                  >
                    <Label>{CATEGORY_LABELS[category]}</Label>
                    <span className="flex size-5 items-center justify-center rounded-full text-xs leading-none ring-1 ring-current">+</span>
                  </span>
                </span>
              ))}
            </GridFrame>
          </div>
          <div className="hidden lg:col-span-3 lg:flex lg:flex-col lg:items-end lg:justify-end">
            <Label className="text-mute">
              <span data-photo-type-counter>1</span> / {PHOTO_TYPES.length}
            </Label>
          </div>
        </div>
      </div>
    </section>
  );
}
