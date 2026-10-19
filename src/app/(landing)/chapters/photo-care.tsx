import Link from "next/link";

import { ROUTES } from "@/config/routes";

import { LoopVideo } from "../ui";

// Careful with your photos: how a photo is looked after, from the browser to its deletion, in four
// cards over the dark Figure turning slowly behind. Every claim is the Privacy Policy's.

const CARE = [
  { title: "Cleaned first", detail: "Your browser redraws each photo before sending it, which drops hidden details such as where it was taken." },
  { title: "Private to you", detail: "Only your account can open your photos and Previews, through private links that soon expire." },
  { title: "Hidden from Qloo", detail: "Qloo gets only your age group, Style Preference, Country and Photo Style: never your photo, username or email." },
  { title: "Deleted on request", detail: "Delete a Consultation and its photos and Previews go immediately. We don't sell your data, show ads or track you." },
] as const;

export function PhotoCare() {
  return (
    <section data-ground="ink" aria-labelledby="photo-care-title" className="grain relative overflow-hidden py-28 text-paper">
      <div aria-hidden="true" className="feather absolute inset-y-0 right-0 w-full opacity-90 md:w-3/4">
        <LoopVideo name="figure/dark-loop" />
      </div>
      <div className="relative z-[2] px-4 md:px-6">
        <h2 id="photo-care-title" data-reveal="rise" className="max-w-[20ch] text-title">
          Careful with your photos
        </h2>
        <ul data-cards className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CARE.map(({ title, detail }) => (
            <li key={title} data-card className="flex min-h-52 flex-col justify-between gap-8 rounded-xl bg-card-dark/80 p-5 ring-1 ring-paper/8 backdrop-blur-md">
              <p className="text-title">{title}</p>
              <p className="text-body text-mute-dark">{detail}</p>
            </li>
          ))}
        </ul>
        <p data-reveal="blur" className="mt-10 text-body">
          <Link href={`${ROUTES.privacy}#photos`} className="underline underline-offset-4 hover:text-mute-dark">
            How we handle photos
          </Link>
        </p>
      </div>
    </section>
  );
}
