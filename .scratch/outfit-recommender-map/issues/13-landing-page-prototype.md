# Prototype the landing page

Type: prototype
Status: resolved
Blocked by: 07
Map: [Outfit Recommender](../map.md)

## Question

What does the landing page say and show?

- Its sections and main message.
- How it explains the use of Qloo and AI.
- Where its example Outfits and screenshots come from: screenshots of the built app, or sample Consultations generated from consenting or stock photos. Any real person shown needs their consent; the hackathon rules forbid showing real users' personal data.
- How it states the 18+ rule and links the public `/privacy` and `/terms` pages (decided in "What consent, retention and minimum age do we commit to?"). Every Preview it shows carries the "AI-generated" badge.

## Answer

Resolved with the user on 2026-10-15. The prototype offered three variants:
- A "Classic": a usual marketing page.
- B "Walkthrough": one sample Consultation told as you scroll.
- C "Front door": one screen with the sign-up form on it.

They live on the throwaway branch `prototype/landing-page` (commits `1063d1b` and `183b2aa`, folder `prototypes/landing-page/`, with run instructions in its README). **Variant B, "Walkthrough", won.** After the verdict it was revised to match the points below.

**Shape.** The landing page tells one sample Consultation in 7 steps as you scroll. Each step is tagged **Qloo**, **AI** or **You**, so [ADR-0001](../../../docs/adr/0001-qloo-selects-ai-concretizes.md) is the story. On wide screens the picture sticks on the left and changes with the step. On phones it sits above each step's text.
- **Header:** the logo and "Sign in".
- **Opener:**
  - the line "One photo, start to finish";
  - a headline (the prototype's "Watch taste data and AI style one real photo." must drop "real", since the person isn't);
  - a legend: "Qloo decides what to recommend" and "AI makes it concrete and shows it on you";
  - "Scroll to follow along", or skip ahead to create an account.
- **The 7 steps:**
  1. **You:** the Full-Body Photo.
  2. **AI:** the photo check, and the Photo Style it reads, which the user can edit.
  3. **Qloo:** the ranked Style Icons, with the example's Style Preference, age group, Country and Photo Style.
  4. **Qloo:** the Brands for the first Style Icon, within the example's Budget Tier.
  5. **AI:** the tailored Pieces, each with "why it suits you".
  6. **AI:** a before/after slider between the photo and its Preview.
  7. **You:** the finished Outfit card, as the app shows it.
- **"Not after a whole Outfit?":** a Face Photo example and a Body-Only Photo example, each shown as photo → Preview.
- **Final call to action:**
  - the line "Now try it on your own photo";
  - a "Create a free account" button with "Free · Up to 10 Outfits a day" under it;
  - one line saying photos go to Google's Gemini to make Previews;
  - links to Privacy and Terms.
- **Footer:**
  - "Built for the Qloo LLM Hackathon";
  - "For adults 18+";
  - "Style Icons and Brands aren't affiliated with Outfit Recommender";
  - links to Privacy and Terms.

**Examples.**
- **No real people.** Every person on the page is a realistic, fully AI-generated person found online. That needs nobody's consent and shows no real user's data, which the hackathon rules forbid.
  - One person is followed through the whole walkthrough.
  - Two more give the Face Photo and Body-Only Photo examples, covering the other Style Preference.
  - The source is settled in "Where can we get realistic AI-generated people for the landing page?": Pixabay images tagged "AI generated".
- **One real run, frozen.** The walkthrough person's photo goes through the built app once, on the Demo Account. That run's Photo Style, ranked Style Icons, Brands and Pieces are saved as static files the page ships with. Its photo and Preview are served from Vercel Blob, never committed (refined in the Pixabay ticket). The two small examples are frozen the same way.
  - Visitors never trigger a Qloo or Gemini call.
  - The runs cost a few cents of the Demo Account's budget.
  - What's committed is a few runs' small output, not bulk Qloo data.

**Labels and links.**
- **AI labels:** every Preview carries the "AI-generated" badge. Every photo of an AI-generated person carries its own label, so nobody takes it for a real user. The Pixabay ticket refines it into the caption "AI-generated person: not a real person." beside the photo, with matching alt text.
- **Gemini:** the AI-tagged steps just say "AI". Google's Gemini is named once, in the line by the final button, matching the consent sheet and `/privacy`. Swapping providers is a copy change.
- **18+:** stated in the footer only (and on `/terms`), away from the "Create account" button. The sign-up age field one click later stays neutral, with no hint of the cut-off.
- **`/privacy` and `/terms`:** linked from the final call to action and the footer.
- **Style Icons:** shown by name with initials, never photos, since Qloo's images have no stated licence. The footer's "not affiliated" line covers Style Icons and Brands.
- **Signed-in users** see the same landing page. The header's "Sign in" becomes "Open the app".

**Considered.**
- **Rejected variants:**
  - A "Classic": a hero with one Preview, How it works, a "Who does what" section, app screenshots, an FAQ.
  - C "Front door": a before/after slider beside the sign-up form, on one screen.
- **Rejected example sources:**
  - team members' photos with their consent;
  - stock photos, whose licences may not allow AI editing.
- **Rejected alternatives to these points:**
  - 18+ beside the button;
  - Gemini on every AI step, or only on `/privacy`;
  - hiding Style Icon names;
  - hand-written walkthrough content;
  - a menswear/womenswear switch;
  - redirecting signed-in users into the app.

**Passed on.**
- **The spec:**
  - capturing the frozen runs once the app works and before submission, as a documented step;
  - the walkthrough's copy as acceptance criteria;
  - the landing page as the public demo link's first screen.
- **"How do the account flows behave?":** sign-up and sign-in are their own pages, reached from the landing page. Signed-in users get "Open the app" in its header.
