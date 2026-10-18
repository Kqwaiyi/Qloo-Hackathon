import Link from "next/link";

import { MINIMUM_AGE } from "@/config/accounts";
import { COPY } from "@/config/copy";
import { OUTFIT_ALLOWANCE } from "@/config/limits";
import { ROUTES } from "@/config/routes";

import { Label, LoopVideo, Pill, SpreadHeadline } from "../ui";
import { GET_STARTED_ID } from "./frame";

// The close: the call to action over the dark Drape, the one place Gemini is named; then the
// footer, uncovered like a curtain going up, the only place 18+ is said.

export function GetStarted() {
  return (
    <section id={GET_STARTED_ID} data-ground="ink" aria-labelledby="get-started-title" className="grain relative overflow-hidden text-paper">
      <div aria-hidden="true" className="feather absolute inset-0 opacity-90">
        <LoopVideo name="drape/dark-loop" />
      </div>
      <div className="relative z-[2] flex min-h-svh flex-col justify-center gap-14 py-32">
        <SpreadHeadline id="get-started-title" left="Now try it" right="on your own photo" />
        <div className="flex flex-col items-center gap-5 px-4 text-center">
          <Pill href={ROUTES.signUp} variant="solid" tone="ink" glyph="+">
            Create a free account
          </Pill>
          <Label>Free · Up to {OUTFIT_ALLOWANCE} Outfits a day</Label>
          <p className="max-w-[40ch] text-body text-mute-dark">Your photos go to Google&apos;s Gemini to make your Previews.</p>
          <LegalLinks />
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="curtain text-paper">
      <div className="curtain-inner flex flex-col justify-between bg-ink px-4 pt-10 pb-6 md:px-6">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-mute-dark">
          <li>
            <Label>Built for the Qloo LLM Hackathon</Label>
          </li>
          <li>
            <Label>For adults {MINIMUM_AGE}+</Label>
          </li>
          <li>
            <Label>{COPY.notAffiliated}</Label>
          </li>
          <li>
            <LegalLinks />
          </li>
        </ul>
        <p aria-hidden="true" className="flex flex-col text-display uppercase xl:flex-row xl:justify-between">
          <span>Outfit</span>
          <span className="self-end xl:self-auto">Recommender</span>
        </p>
      </div>
    </footer>
  );
}

function LegalLinks() {
  return (
    <p className="flex gap-4">
      <Link href={ROUTES.privacy} className="underline-offset-4 hover:underline">
        <Label>Privacy</Label>
      </Link>
      <Link href={ROUTES.terms} className="underline-offset-4 hover:underline">
        <Label>Terms</Label>
      </Link>
    </p>
  );
}
