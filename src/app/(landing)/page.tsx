import { ACCOUNT_DELETED_PARAM } from "@/config/routes";
import { getLandingPage } from "@/server/data/landing";

import { Brands } from "./chapters/brands";
import { Footer, GetStarted } from "./chapters/closing";
import { AccountDeletedNotice, ChapterIndicator, Ground, Header, Loader } from "./chapters/frame";
import { Numbers } from "./chapters/numbers";
import { Hero, Statement } from "./chapters/opening";
import { OtherPhotoTypes } from "./chapters/other-photo-types";
import { PhotoCheck } from "./chapters/photo-check";
import { PhotoTypes } from "./chapters/photo-types";
import { Pieces } from "./chapters/pieces";
import { Preview } from "./chapters/preview";
import { ReadyToShop } from "./chapters/ready-to-shop";
import { StyleIcons } from "./chapters/style-icons";
import { LandingMotion } from "./motion/landing-motion";

// The public landing page, where the demo link opens: one frozen sample Consultation told in seven
// numbered chapters, each tagged You, AI or Qloo, from the photo to the Outfit; then the other
// Photo Types, the numbers, and the way to sign up. It's rendered for each visit, with fresh 1-hour
// links to the samples' images, and never calls Qloo or the AI. The AI chapters say only "AI":
// Gemini is named once, by the final button, and the 18+ rule only in the footer.
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
      <ChapterIndicator />
      <main>
        <Hero notice={params[ACCOUNT_DELETED_PARAM] !== undefined ? <AccountDeletedNotice /> : undefined} />
        <Statement />
        <PhotoTypes />
        <PhotoCheck sample={walkthroughSample} />
        <StyleIcons sample={walkthroughSample} />
        <Brands sample={walkthroughSample} />
        <Pieces sample={walkthroughSample} />
        <Preview sample={walkthroughSample} />
        <ReadyToShop sample={walkthroughSample} />
        <OtherPhotoTypes samples={[samples.face, samples.full_body, samples.body_only]} />
        <Numbers />
        <GetStarted />
      </main>
      <Footer />
      <LandingMotion />
    </>
  );
}
