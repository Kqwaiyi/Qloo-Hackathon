import Link from "next/link";
import type { ReactNode } from "react";

import { AiGeneratedBadge, builtOn, OutfitCard, previewFrame, usdRange } from "@/components/outfit-card";
import { successNotice } from "@/components/ui";
import { MINIMUM_AGE, STYLE_PREFERENCE_LABELS } from "@/config/accounts";
import { AGE_GROUP_LABELS, BUDGET_TIER_LABELS, type BudgetTier, CATEGORY_LABELS, PHOTO_TYPE_LABELS, photoStyleText } from "@/config/consultations";
import { COPY } from "@/config/copy";
import { OUTFIT_ALLOWANCE } from "@/config/limits";
import { ACCOUNT_DELETED_PARAM, APP_HOME, ROUTES } from "@/config/routes";
import { OUTFITS_PER_STYLING } from "@/config/stylings";
import { getLandingPage } from "@/server/data/landing";
import type { LandingSampleView } from "@/server/operations/landing";

import { BeforeAfter } from "./before-after";
import { AiGeneratedPersonCaption, SamplePhoto, SamplePhotoImage, SamplePreviewImage, sampleFrame } from "./sample-images";
import { Walkthrough, type WalkthroughStep } from "./walkthrough";
import { WhoTag } from "./who-tag";

// The public landing page, where the demo link opens: one frozen sample Consultation, told step by
// step and tagged Qloo, AI or You, then a Face Photo and a Body-Only Photo, and the way to sign up.
// It's rendered for each visit, with fresh 1-hour links to the samples' images, and never calls
// Qloo or the AI. The AI steps say only "AI": Gemini is named once, by the final button, and the
// 18+ rule only in the footer.

/** Where "skip ahead" goes: the call to action, which says where photos go before anyone signs up. */
const GET_STARTED_ID = "get-started";
const WALKTHROUGH_ID = "walkthrough";

export default async function LandingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, { signedIn, samples }] = await Promise.all([searchParams, getLandingPage()]);
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <Link href={ROUTES.home} className="font-semibold tracking-tight">
          Outfit Recommender
        </Link>
        <Link href={signedIn ? APP_HOME : ROUTES.signIn} className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-200/60">
          {signedIn ? "Open the app" : "Sign in"}
        </Link>
      </header>
      <main>
        {params[ACCOUNT_DELETED_PARAM] !== undefined && (
          <div className="mx-auto max-w-3xl px-4 pt-4">
            <p role="status" className={successNotice}>
              {COPY.accountDeleted}
            </p>
          </div>
        )}
        <Opener />
        <section id={WALKTHROUGH_ID} aria-label="A sample Consultation, step by step" className="mx-auto max-w-6xl px-4">
          <Walkthrough steps={walkthroughSteps(samples.full_body)} />
        </section>
        <OtherPhotoTypes samples={[samples.face, samples.body_only]} />
        <GetStarted />
      </main>
      <Footer />
    </div>
  );
}

function Opener() {
  return (
    <section className="mx-auto max-w-3xl px-4 pt-14 pb-10 text-center">
      <p className="text-sm font-medium tracking-widest text-stone-500 uppercase">One photo, start to finish</p>
      <h1 className="mt-4 text-4xl leading-tight font-semibold tracking-tight sm:text-6xl">Watch taste data and AI style one photo.</h1>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-stone-600">
        <p className="flex items-center gap-2">
          <WhoTag who="Qloo" /> decides what to recommend
        </p>
        <p className="flex items-center gap-2">
          <WhoTag who="AI" /> makes it concrete and shows it on you
        </p>
      </div>
      <div className="mt-10 flex flex-col items-center gap-3 text-sm">
        <a href={`#${WALKTHROUGH_ID}`} className="text-stone-500 hover:text-stone-900">
          Scroll to follow along <span aria-hidden="true">↓</span>
        </a>
        <a href={`#${GET_STARTED_ID}`} className="font-medium text-stone-900 underline underline-offset-4 hover:text-stone-600">
          or skip ahead and create an account
        </a>
      </div>
    </section>
  );
}

/** The seven steps of the walkthrough's Full-Body Photo Consultation, from the photo to its Outfit. */
function walkthroughSteps(sample: LandingSampleView): WalkthroughStep[] {
  const { outfit } = sample;
  const brandPieces = outfit.pieces.flatMap(({ category, brand }) => (brand ? [{ category, brand }] : []));
  const photoTypeLabel = PHOTO_TYPE_LABELS[sample.photoType];
  return [
    {
      who: "You",
      title: `It starts with a ${photoTypeLabel}`,
      body: "Head to toe, face included, so the Consultation can get a Hairstyle, a Top, a Bottom and Shoes. Our example is an AI-generated person, not a real one.",
      visual: <SamplePhoto sample={sample} />,
    },
    {
      who: "AI",
      title: "The AI checks the photo and reads its style",
      body: `Is there just one person, and is it really a ${photoTypeLabel}? Then it picks one or two words for the photo's Photo Style. You can change them if it got you wrong.`,
      visual: (
        <SamplePhoto sample={sample}>
          <div className="absolute inset-x-3 bottom-3 space-y-2 rounded-xl bg-white/95 p-3 text-sm shadow-lg">
            <p className="flex gap-3 text-xs font-medium text-emerald-700">
              <span>✓ One person</span>
              <span>✓ {photoTypeLabel}</span>
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-stone-500">Photo Style</span>
              {sample.photoStyle.map((word) => (
                <Chip key={word}>{word}</Chip>
              ))}
              <span className="text-xs text-stone-500">· You can change it</span>
            </div>
          </div>
        </SamplePhoto>
      ),
    },
    {
      who: "Qloo",
      title: "Qloo finds Style Icons",
      body: "Well-known people who are popular right now with people of the same Style Preference, age group and Country, in tune with the photo's Photo Style. Each one inspires one Outfit.",
      visual: (
        <Panel title="Ranked by Qloo for">
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip>{STYLE_PREFERENCE_LABELS[sample.stylePreference]}</Chip>
            <Chip>Aged {AGE_GROUP_LABELS[sample.ageGroup]}</Chip>
            <Chip>{sample.countryName}</Chip>
            <Chip>{photoStyleText(sample.photoStyle)}</Chip>
          </div>
          <ol aria-label="Style Icons" className="mt-4 space-y-2">
            {sample.styleIcons.map((name, index) => (
              <li
                key={name}
                className={`flex items-center gap-3 rounded-xl p-2 ${name === outfit.styleIconName ? "bg-violet-50 ring-1 ring-violet-200" : ""}`}
              >
                <span className="w-4 text-right text-sm text-stone-400 tabular-nums">{index + 1}</span>
                <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-200 text-xs font-semibold text-violet-900">
                  {initials(name)}
                </span>
                <span className="font-medium">{name}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-stone-500">Initials, not photos: we never show pictures of Style Icons.</p>
        </Panel>
      ),
    },
    {
      who: "Qloo",
      title: "…and the Brands their fans favour",
      body: `For ${outfit.styleIconName}, Qloo picks the Brands that people who love them also love, ${budgetTierPhrase(sample.budgetTier)}: clothing Brands for the Top and Bottom, and a shoe Brand for the Shoes.`,
      visual: (
        <Panel title={`Brands for ${outfit.styleIconName}`}>
          {sample.budgetTier && <p className="text-sm text-stone-500">{budgetTierLine(sample.budgetTier)}</p>}
          <ul aria-label="Brands" className="mt-3 divide-y divide-stone-100">
            {brandPieces.map(({ category, brand }) => (
              <li key={category} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <div className="font-medium">{brand.name}</div>
                  <div className="text-xs text-stone-500">{CATEGORY_LABELS[category]}</div>
                </div>
                {brand.priceRange && <div className="text-sm font-medium text-violet-800">{usdRange(brand.priceRange)}</div>}
              </li>
            ))}
          </ul>
        </Panel>
      ),
    },
    {
      who: "AI",
      title: "The AI tailors each Piece to the photo",
      body: "Qloo picked the Brands and the Style Icon. The AI picks the garment, its colour, fit and cut, and the haircut, and says in one line why each suits you. It never swaps a Brand or reorders Qloo's picks.",
      visual: (
        <ul aria-label="Pieces" className="mx-auto w-full max-w-sm space-y-2">
          {outfit.pieces.map((piece) => (
            <li key={piece.category} className="rounded-2xl bg-white p-3 shadow-md ring-1 ring-amber-100">
              <div className="flex items-center justify-between gap-3 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">
                <span>{CATEGORY_LABELS[piece.category]}</span>
                <span className="text-amber-800">{builtOn(piece, outfit.styleIconName)}</span>
              </div>
              <div className="mt-1 text-sm font-medium">{piece.item}</div>
              <p className="mt-0.5 text-xs text-stone-600 italic">{piece.why}</p>
            </li>
          ))}
        </ul>
      ),
    },
    {
      who: "AI",
      title: "…and shows it on the photo",
      body: "The Preview changes only the hair and clothes: face, body, pose and background stay as they were. Every Preview is marked AI-generated. Drag to compare.",
      visual: (
        <figure className="mx-auto w-full max-w-xs">
          <BeforeAfter
            label="Compare the photo with its Preview"
            before={<SamplePhotoImage sample={sample} />}
            after={<SamplePreviewImage sample={sample} />}
          />
          <AiGeneratedPersonCaption />
        </figure>
      ),
    },
    {
      who: "You",
      title: "Your Outfit, ready to shop",
      body: `You get ${OUTFITS_PER_STYLING} Outfits to start, and ${OUTFITS_PER_STYLING} more whenever you ask. Each Piece names its Brand, with its price range and a link to the Brand's site where there is one. Change the Budget Tier or the Photo Style, and Qloo picks again.`,
      visual: (
        <div className="mx-auto w-full max-w-sm">
          <OutfitCard
            outfit={outfit}
            preview={
              <div className={`${previewFrame} mx-auto w-3/5`}>
                <SamplePreviewImage sample={sample} />
                <AiGeneratedBadge />
              </div>
            }
          />
        </div>
      ),
    },
  ];
}

/** What each of the other Photo Types gets. */
const OTHER_PHOTO_TYPE_LINES = {
  face: "Just your face and hair, for a new Hairstyle.",
  body_only: "Shoulders to toe with your face left out, for a Top, a Bottom and Shoes.",
} as const;

/** A Face Photo and a Body-Only Photo, each as its photo and Preview. */
function OtherPhotoTypes({ samples }: { samples: LandingSampleView[] }) {
  return (
    <section aria-labelledby="other-photo-types" className="mt-16 border-t border-stone-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-14">
        <h2 id="other-photo-types" className="text-xl font-semibold">
          Not after a whole Outfit?
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {samples.map((sample) => (
            <li key={sample.photoType} className="rounded-2xl border border-stone-200 p-4">
              <figure>
                <div className="flex items-center gap-3">
                  <div className={`${sampleFrame} w-28 rounded-lg`}>
                    <SamplePhotoImage sample={sample} />
                  </div>
                  <span aria-hidden="true" className="text-stone-400">
                    →
                  </span>
                  <div className={`${sampleFrame} w-28 rounded-lg`}>
                    <SamplePreviewImage sample={sample} />
                    <AiGeneratedBadge className="top-1 left-1" />
                  </div>
                </div>
                <AiGeneratedPersonCaption className="text-left" />
              </figure>
              <h3 className="mt-3 font-semibold">{PHOTO_TYPE_LABELS[sample.photoType]}</h3>
              {sample.photoType !== "full_body" && <p className="text-sm text-stone-600">{OTHER_PHOTO_TYPE_LINES[sample.photoType]}</p>}
              <p className="mt-1 text-sm text-stone-500">
                {STYLE_PREFERENCE_LABELS[sample.stylePreference]} · Inspired by {sample.outfit.styleIconName}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function GetStarted() {
  return (
    <section id={GET_STARTED_ID} aria-labelledby="get-started-title" className="bg-stone-900 text-white">
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h2 id="get-started-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Now try it on your own photo
        </h2>
        <Link href={ROUTES.signUp} className="mt-8 inline-block rounded-lg bg-white px-6 py-3 font-medium text-stone-900 hover:bg-stone-200">
          Create a free account
        </Link>
        <p className="mt-4 text-sm text-stone-300">Free · Up to {OUTFIT_ALLOWANCE} Outfits a day</p>
        <p className="mt-1 text-sm text-stone-300">Your photos go to Google&apos;s Gemini to make your Previews.</p>
        <LegalLinks className="mt-1 text-sm text-stone-300" />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-stone-900 text-stone-400">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-6 text-xs">
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          <li>Built for the Qloo LLM Hackathon</li>
          <li>For adults {MINIMUM_AGE}+</li>
          <li>{COPY.notAffiliated}</li>
        </ul>
        <LegalLinks />
      </div>
    </footer>
  );
}

function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <p className={className}>
      <Link href={ROUTES.privacy} className="underline underline-offset-2 hover:text-white">
        Privacy
      </Link>
      <span aria-hidden="true"> · </span>
      <Link href={ROUTES.terms} className="underline underline-offset-2 hover:text-white">
        Terms
      </Link>
    </p>
  );
}

/** A white card for one step's picture. */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xs rounded-2xl bg-white p-5 shadow-lg ring-1 ring-violet-100">
      <h3 className="text-xs font-semibold tracking-wide text-violet-700 uppercase">{title}</h3>
      {children}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-800">{children}</span>;
}

/** A Style Icon's initials, shown in place of a picture. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** The Budget Tier under step 4's Brands. */
function budgetTierLine(budgetTier: BudgetTier): string {
  return budgetTier === "no_budget" ? "No Budget: any price" : `${BUDGET_TIER_LABELS[budgetTier]} Budget Tier`;
}

/** Which Brands Qloo picks from, by the sample's Budget Tier. */
function budgetTierPhrase(budgetTier: BudgetTier | null): string {
  if (!budgetTier || budgetTier === "no_budget") return "at any price, since our example has No Budget";
  return `within the ${BUDGET_TIER_LABELS[budgetTier]} Budget Tier`;
}
