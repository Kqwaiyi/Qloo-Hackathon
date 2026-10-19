import Link from "next/link";

import { OUTFIT_ALLOWANCE } from "@/config/limits";
import { ROUTES } from "@/config/routes";

import { Headline, Label, LoopVideo, Pill } from "../ui";
import { GET_STARTED_ID } from "./frame";

// The close, and the page's last screen: the call to action over the dark Drape, the one place
// Gemini is named. Nothing comes after it.

export function GetStarted() {
  return (
    <section id={GET_STARTED_ID} data-ground="ink" aria-labelledby="get-started-title" className="grain relative overflow-hidden text-paper">
      <div aria-hidden="true" className="feather absolute inset-0 opacity-90">
        <LoopVideo name="drape/dark-loop" />
      </div>
      <div className="relative z-[2] flex min-h-svh flex-col justify-center gap-10 py-28">
        <Headline id="get-started-title">Now try it on your own photo</Headline>
        <div className="flex flex-col items-center gap-4 px-4 text-center">
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
