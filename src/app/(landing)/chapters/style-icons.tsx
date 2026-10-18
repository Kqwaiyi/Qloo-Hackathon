import { STYLE_PREFERENCE_LABELS } from "@/config/accounts";
import { AGE_GROUP_LABELS, photoStyleText } from "@/config/consultations";
import type { LandingSampleView } from "@/server/operations/landing";

import { initials } from "../format";
import { ChapterTag, Chip, Label, SpreadHeadline } from "../ui";

// 03 · Qloo. The Style Icons Qloo ranked for the sample's profile, best first, by name and initials,
// never with a picture. The one behind the sample's Outfit is the light card. On wide screens the
// row is a pinned track the scroll moves sideways; on phones, a row to swipe.

export function StyleIcons({ sample }: { sample: LandingSampleView }) {
  return (
    <section data-ground="ink" data-chapter="03 / 07 · Qloo" data-scene="track" aria-labelledby="style-icons-title" className="relative text-paper">
      <div data-pin className="flex min-h-svh flex-col justify-center gap-8 py-24">
        <div className="px-4 md:px-6">
          <ChapterTag number={3} who="Qloo" tone="ink" />
        </div>
        <SpreadHeadline id="style-icons-title" left="Qloo finds" right="Style Icons" />
        <div data-reveal="blur" className="flex flex-wrap items-center gap-2 px-4 md:px-6">
          <Label className="mr-2 text-mute-dark">Ranked by Qloo for</Label>
          <Chip tone="ink">{STYLE_PREFERENCE_LABELS[sample.stylePreference]}</Chip>
          <Chip tone="ink">Aged {AGE_GROUP_LABELS[sample.ageGroup]}</Chip>
          <Chip tone="ink">{sample.countryName}</Chip>
          <Chip tone="ink">{photoStyleText(sample.photoStyle)}</Chip>
        </div>
        <ol data-track aria-label="Style Icons, best first" className="track flex gap-4 overflow-x-auto px-4 md:px-6">
          {sample.styleIcons.map((name, index) => {
            const inspiresTheOutfit = name === sample.outfit.styleIconName;
            return (
              <li key={name} className="w-[72vw] shrink-0 sm:w-[44vw] md:w-[30vw] lg:w-[23vw]">
                <div className="flex items-center gap-3">
                  <Label className="text-mute-dark">{String(index + 1).padStart(2, "0")}</Label>
                  <span aria-hidden="true" className="size-1 rounded-full bg-paper/50" />
                  <span aria-hidden="true" className="h-px flex-1 border-t border-dotted border-paper/30" />
                </div>
                <div
                  className={`mt-4 flex h-[min(34svh,20rem)] min-h-56 flex-col justify-between rounded-xl p-5 ${inspiresTheOutfit ? "bg-paper text-ink" : "bg-card-dark ring-1 ring-paper/8"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex aspect-square h-[42%] w-auto items-center justify-center self-start rounded-full border text-title ${inspiresTheOutfit ? "border-ink/20" : "border-paper/20"}`}
                  >
                    {initials(name)}
                  </span>
                  <div>
                    <p className="text-title">{name}</p>
                    {inspiresTheOutfit && <Label className="mt-3 block">Inspires our sample Outfit</Label>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap justify-between gap-4 px-4 md:px-6">
          <Label className="text-mute-dark">Each one inspires one Outfit.</Label>
          <Label className="text-mute-dark">Initials, never photos.</Label>
        </div>
      </div>
    </section>
  );
}
