import { ACCOUNT_DELETED_PARAM } from "@/config/routes";
import { getLandingPage } from "@/server/data/landing";

import { Brands } from "./chapters/brands";
import { GetStarted } from "./chapters/closing";
import { AccountDeletedNotice, Ground, Header, Loader } from "./chapters/frame";
import { Hero, Statement } from "./chapters/opening";
import { PhotoCare } from "./chapters/photo-care";
import { PhotoCheck } from "./chapters/photo-check";
import { PhotoTypes } from "./chapters/photo-types";
import { Pieces } from "./chapters/pieces";
import { ReadyToShop } from "./chapters/ready-to-shop";
import { StyleIcons } from "./chapters/style-icons";
import { LandingMotion } from "./motion/landing-motion";

// The public landing page, where the demo link opens: one frozen sample Consultation told chapter
// by chapter, from the photo to the Outfit; then how photos are looked after, and the way to sign
// up, which is the last screen. It's rendered for each visit, with fresh 1-hour links to the
// sample's images, and never calls Qloo or the AI. The AI chapters say only "AI": Gemini is named
// once, by the final button.
//
// Every chapter is plain, readable markup on its own. The motion layer, the one client component
// that runs the page, adds the smooth scroll, the reveals, the pins and the rendered 3D on top,
// and stays out of the way for anyone who asked for reduced motion.

export default async function LandingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, { signedIn, samples }] = await Promise.all([searchParams, getLandingPage()]);
  const walkthroughSample = samples.full_body;
  return (
    <>
      <Loader />
      <Ground />
      <Header signedIn={signedIn} />
      <main>
        <Hero notice={params[ACCOUNT_DELETED_PARAM] !== undefined ? <AccountDeletedNotice /> : undefined} />
        <Statement />
        <PhotoTypes />
        <PhotoCheck sample={walkthroughSample} />
        <StyleIcons sample={walkthroughSample} />
        <Brands sample={walkthroughSample} />
        <Pieces sample={walkthroughSample} />
        <ReadyToShop sample={walkthroughSample} />
        <PhotoCare />
        <GetStarted />
      </main>
      <LandingMotion />
    </>
  );
}
