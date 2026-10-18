# 33: Landing page walkthrough

**What to build:** The public landing page the demo link opens on. It walks visitors through one sample Consultation as they scroll, each step tagged Qloo, AI or You, so they see who decides what before they sign up. Every sample person is captioned as AI-generated, every Preview is badged, and the page never calls Qloo or Gemini. It ships with placeholder sample data in the final shape and a documented way to capture the real samples from the Demo Account later, in ticket 39.

**Blocked by:** [12 Previews of the user wearing each Outfit](12-previews.md), [14 Body-photo Outfits: Brands become Pieces](14-body-photo-brands.md), [32 Privacy Policy and Terms pages](32-privacy-terms.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Landing page" and "Pages" (Landing page), and the "Walkthrough" variant (B) on the `prototype/landing-page` branch. Stories 1–15 and 150.

- [x] On wide screens the picture sticks on the left and changes with each step. On phones each step's picture sits above its text.
- [x] Header: the logo, plus "Sign in", or "Open the app" when signed in.
- [x] Opener: the line "One photo, start to finish"; a headline that doesn't call the person real; the legend "Qloo decides what to recommend" and "AI makes it concrete and shows it on you"; "Scroll to follow along"; and a way to skip ahead to sign-up.
- [x] The 7 steps, in order:
  1. You: the Full-Body Photo;
  2. AI: the photo check, and the Photo Style it reads, which the user can edit;
  3. Qloo: the ranked Style Icons, with the example's Style Preference, age group, Country and Photo Style;
  4. Qloo: the Brands for the first Style Icon, within the example's Budget Tier;
  5. AI: the tailored Pieces, each with why it suits;
  6. AI: a before/after slider between the photo and its Preview;
  7. You: the finished Outfit card, reusing the app's card.
- [x] "Not after a whole Outfit?" shows a Face Photo example and a Body-Only Photo example, each as photo → Preview, covering the other Style Preference between them.
- [x] Final call to action: "Now try it on your own photo", a "Create a free account" button with "Free · Up to 10 Outfits a day" under it (the number from config), one line saying photos go to Google's Gemini to make Previews, and links to Privacy and Terms.
- [x] Footer: "Built for the Qloo LLM Hackathon", "For adults 18+", "Style Icons and Brands aren't affiliated with Outfit Recommender", and links to Privacy and Terms.
- [x] The AI steps just say "AI", and Gemini is named only in the line by the final button. Style Icons are shown by name with initials, never with photos. The 18+ rule appears in the footer only.
- [x] Every sample person has "AI-generated person: not a real person." beside the photo, with alt text "AI-generated photo of a fictional person". Every Preview has the "AI-generated" badge.
- [x] The text of three frozen Consultations (Photo Style, Style Icons, Brands and Pieces) ships with the page as static data, placeholders for now. The images live in the private Blob store, never in the repo, and the page renders dynamically with 1-hour signed links like every other image.
- [x] Visitors never trigger a Qloo or AI call.
- [x] A documented way, ideally a script, exports a Demo Account Consultation's text into the landing page's static data.
- [x] The root URL shows this page and keeps any message already shown there, such as the account-deleted message.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The page.** `src/app/page.tsx` moved to a `src/app/(landing)/` route group, beside its parts:
  - `walkthrough.tsx`: the steps. On `md` and wider, the active step's picture sticks on the left and changes with the step crossing the middle of the screen, through an IntersectionObserver, as in the prototype. On phones each picture sits above its step's text.
  - `before-after.tsx`: the slider, a range input that works by keyboard too, with the Preview's badge in the top right so the photo side never covers it.
  - `sample-images.tsx`: the photos with their caption and alt text, and the placeholders.
  - `who-tag.tsx`: the Qloo, AI and You tags.
  - The page renders for each visit, reading the session for the header and making fresh 1-hour links. The account-deleted message still shows at `/?account-deleted=1`.
- **Wording.**
  - The headline is "Watch taste data and AI style one photo." The prototype's "one real photo" called the person real.
  - "Skip ahead" jumps to the final call to action, not straight to `/sign-up`, so a visitor still reads the Gemini line before signing up (story 8). Sign-up doesn't name Gemini.
  - `COPY` gains the caption "AI-generated person: not a real person." and the alt text "AI-generated photo of a fictional person". The footer uses `COPY.notAffiliated`, as ticket 32 asked. The other landing lines stay in the page, since they're used once. The numbers come from config: `OUTFIT_ALLOWANCE`, `OUTFITS_PER_STYLING` and `MINIMUM_AGE`.
  - `config/consultations.ts` gains `AGE_GROUP_LABELS` ("25–29", "65+").
- **The Outfit card** moved from the results page to `src/components/outfit-card.tsx`, so both pages use the same one. It now lays out by its own width, through Tailwind container queries, not the screen's: the Preview sits beside the Pieces from 672px of card, so it fits the walkthrough's narrow column.
  - On the results page, the card now goes side by side from about a 704px screen instead of 768px. Nothing else changes.
  - The card takes its Preview as a slot. The results page passes the badged image or its refused/failed placeholder; the landing page passes the sample's Preview.
  - `OutfitCardContent` (in `operations/consultations.ts`) is what a card shows beside its Preview. `pieceView` and `pieceViewColumns` now map a Piece's row for both `readConsultation` and the export.
- **The read.** `readLandingPage` (`src/server/operations/landing.ts`), behind `getLandingPage` in the data layer, returns whether the visitor is signed in and the three samples with their links. Its context has no Qloo client or AI provider, and a test checks that a visit, signed in or not, makes no Qloo or AI call.
  - An image the Blob store can't link shows as a placeholder rather than failing the public page. Local development holds none of the real samples' images, so after ticket 39 it shows placeholders, not an error.
- **The static data.** `src/server/landing-samples.ts` holds `LANDING_SAMPLES`, one `LandingSample` per Photo Type: the walkthrough's Full-Body Photo, then the Face Photo and the Body-Only Photo. Each holds the profile it was made with, the Photo Style, the top ranked Style Icons by name, the first Outfit's Pieces with their Brands, and `images`: the Blob pathnames of the landing page's copies, or null.
  - The placeholders have made-up Style Icons and Brands, no links, and `images: null`, so the page shows plain figures with "Sample photo to come". The Full-Body one is menswear, and the other two are womenswear.
  - The Brands step lists the Brands of the first Outfit's Pieces. Only those are stored: an Outfit keeps its Brand picks by entity ID alone.
- **The capture script.** `npm run team:export-landing-sample -- <Demo Account email> <consultation id>` (`scripts/export-landing-sample.ts`, over `exportLandingSample` in `operations/team.ts`). The README's "Landing page samples" section has the procedure.
  - It refuses a Consultation that isn't the named account's, one with no Outfit yet, and one whose first Outfit has no Preview.
  - It copies the photo and that Preview to `landing/<consultation id>/` in the Blob store, apart from the Consultation's own folder. The page then outlives the Consultation, which the Demo Account's users can delete. A rerun replaces the copies.
  - It writes the sample into `landing-samples.ts` in the place for its Photo Type, in the same format, which `npm run typecheck` checks.
  - It keeps the top `LANDING_STYLE_ICONS` (5) Style Icons, and down to the first Outfit's Style Icon when Style Icons passed over push it lower.
  - **Checked for real** against local development's database: a wrong email is refused, a Full-Body Consultation is exported with both copies, and the file it wrote typechecks. The placeholders were then put back and the local copies deleted.
- **For ticket 36:** the export trusts the email it's given, so it guards against a mistyped Consultation ID but not a mistyped email. Once config names the Demo Account, the script should use that email, or refuse any other.
- **For ticket 39:**
  - Run the README's procedure for each Photo Type. Between them, the Face and Body-Only samples should cover the Style Preference the Full-Body sample doesn't.
  - For the Full-Body Photo, pick a Consultation whose first Outfit has a separate Top and Bottom. The walkthrough lists Qloo's Brands from the Pieces, and a One-Piece leaves out the Bottom Brand.
  - The page never shows the photos ticket 05 uploads to Blob: they only feed the Demo Account's Consultations, and the page shows the export's copies.
- **Tests.** These are in `src/server/operations/landing.test.ts`, at the spec's server-operation seam. They cover:
  - the read's text and 1-hour links;
  - placeholders, and images that can't be linked;
  - the signed-in header;
  - no Qloo or AI call;
  - the export's text, the top Style Icons and a low-ranked first Style Icon;
  - copies that outlive the deleted Consultation;
  - rerunning the export;
  - each refusal.

  `qlooBrand` moved to `src/server/qloo/fake.ts` beside `qlooPerson`. The rest of the page was checked by hand, as the spec leaves the UI outside the smoke flows.
- **Checked in the browser** on local development, through headless Chromium at 1280×800, 820×1000 and 375×812:
  - every step;
  - the sticky picture following the step;
  - the slider by keyboard;
  - the skip link;
  - the account-deleted message;
  - "Open the app" when signed in;
  - no sideways scroll and no console errors;
  - Gemini named once, and 18+ only in the footer;
  - the results page's card at 375, 700 and 1280px.

  The Full-Body slot was checked with a real exported sample, and the other two with placeholders. Two problems were found and fixed:
  - The last step's card, taller than the screen, had its top pushed out of view. The steps list now has room after its last step, so a tall picture stays pinned top first.
  - The call to action's button was white on white.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - the low-ranked first Style Icon, as above;
    - "No Budget Budget Tier" under the Brands;
    - the README's claim about the email check;
    - the One-Piece note;
    - "footwear" and "look", which the glossary avoids;
    - a test variable naming a Consultation `styling`;
    - the Blob pathnames header;
    - the raw error in a log;
    - a test that relied on the local store's link format;
    - repeated card types, classes and a Brand-or-Style-Icon line;
    - the sample image components now take the sample;
    - the Qloo cache is cleared between the export tests.
  - **Left as judgement calls:**
    - `styleIconList` keeps `current-outfits.ts`'s name for a Style Icon list's Styling ID;
    - the export lives with the team's other script operations in `team.ts`, so it reads the tables itself;
    - only the two captions joined `COPY`;
    - the results page's refused/failed placeholder keeps its own sizing, because it isn't 3:4 on phones.
- **Live calls used:** two runs of the New Consultation smoke test, a Qloo call or two each.
