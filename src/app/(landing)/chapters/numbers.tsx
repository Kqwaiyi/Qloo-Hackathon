import Link from "next/link";

import { CATEGORIES, CATEGORY_LABELS } from "@/config/consultations";
import { OUTFIT_ALLOWANCE } from "@/config/limits";
import { ROUTES } from "@/config/routes";
import { OUTFITS_PER_STYLING } from "@/config/stylings";

import { Label, LoopVideo } from "../ui";

// By the numbers: four true counts, each from the config so they stay true, over the dark Figure
// turning slowly behind. Then what never happens to a photo, in the Privacy Policy's own words.

const NUMBERS = [
  { value: String(CATEGORIES.length), label: "Categories", detail: CATEGORIES.map((category) => CATEGORY_LABELS[category]).join(" · ") },
  { value: String(OUTFITS_PER_STYLING), label: "Outfits each time you ask", detail: "Each inspired by a different Style Icon" },
  { value: String(OUTFIT_ALLOWANCE), label: "Outfits a day, free", detail: "It takes no payments" },
  { value: "0", label: "Ads, analytics or tracking", detail: "We don't sell your data" },
] as const;

export function Numbers() {
  return (
    <section data-ground="ink" aria-labelledby="numbers-title" className="grain relative overflow-hidden py-40 text-paper">
      <div aria-hidden="true" className="feather absolute inset-y-0 right-0 w-full opacity-90 md:w-3/4">
        <LoopVideo name="figure/dark-loop" />
      </div>
      <div className="relative z-[2] px-4 md:px-6">
        <h2 id="numbers-title" data-reveal="rise" className="max-w-[20ch] text-title">
          Free to use, and careful with your photos.
        </h2>
        <ul data-cards className="mt-20 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {NUMBERS.map(({ value, label, detail }) => (
            <li key={label} data-card className="flex aspect-[2/1] flex-col justify-between rounded-xl bg-card-dark/80 p-5 ring-1 ring-paper/8 backdrop-blur-md sm:aspect-[3/4]">
              <p className="text-display">{value}</p>
              <div>
                <Label className="block">{label}</Label>
                <p className="mt-2 text-body text-mute-dark">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <div data-reveal="blur" className="mt-14 grid grid-cols-4 gap-4 md:grid-cols-12">
          <p className="col-span-4 text-body text-mute-dark md:col-span-5">
            We build no face templates, and nothing guesses your age from your photo. Delete a Consultation and its photos and Previews are
            deleted immediately.
          </p>
          <p className="col-span-4 md:col-span-3 md:col-start-10">
            <Link href={`${ROUTES.privacy}#photos`} className="underline underline-offset-4 hover:text-mute-dark">
              How we handle photos
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
