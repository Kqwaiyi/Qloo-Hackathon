# 33: Landing page walkthrough

**What to build:** The public landing page the demo link opens on. It walks visitors through one sample Consultation as they scroll, each step tagged Qloo, AI or You, so they see who decides what before they sign up. Every sample person is captioned as AI-generated, every Preview is badged, and the page never calls Qloo or Gemini. It ships with placeholder sample data in the final shape and a documented way to capture the real samples from the Demo Account later, in ticket 39.

**Blocked by:** [12 Previews of the user wearing each Outfit](12-previews.md), [14 Body-photo Outfits: Brands become Pieces](14-body-photo-brands.md), [32 Privacy Policy and Terms pages](32-privacy-terms.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Landing page" and "Pages" (Landing page), and the "Walkthrough" variant (B) on the `prototype/landing-page` branch. Stories 1–15 and 150.

- [ ] On wide screens the picture sticks on the left and changes with each step. On phones each step's picture sits above its text.
- [ ] Header: the logo, plus "Sign in", or "Open the app" when signed in.
- [ ] Opener: the line "One photo, start to finish"; a headline that doesn't call the person real; the legend "Qloo decides what to recommend" and "AI makes it concrete and shows it on you"; "Scroll to follow along"; and a way to skip ahead to sign-up.
- [ ] The 7 steps, in order:
  1. You: the Full-Body Photo;
  2. AI: the photo check, and the Photo Style it reads, which the user can edit;
  3. Qloo: the ranked Style Icons, with the example's Style Preference, age group, Country and Photo Style;
  4. Qloo: the Brands for the first Style Icon, within the example's Budget Tier;
  5. AI: the tailored Pieces, each with why it suits;
  6. AI: a before/after slider between the photo and its Preview;
  7. You: the finished Outfit card, reusing the app's card.
- [ ] "Not after a whole Outfit?" shows a Face Photo example and a Body-Only Photo example, each as photo → Preview, covering the other Style Preference between them.
- [ ] Final call to action: "Now try it on your own photo", a "Create a free account" button with "Free · Up to 10 Outfits a day" under it (the number from config), one line saying photos go to Google's Gemini to make Previews, and links to Privacy and Terms.
- [ ] Footer: "Built for the Qloo LLM Hackathon", "For adults 18+", "Style Icons and Brands aren't affiliated with Outfit Recommender", and links to Privacy and Terms.
- [ ] The AI steps just say "AI", and Gemini is named only in the line by the final button. Style Icons are shown by name with initials, never with photos. The 18+ rule appears in the footer only.
- [ ] Every sample person has "AI-generated person: not a real person." beside the photo, with alt text "AI-generated photo of a fictional person". Every Preview has the "AI-generated" badge.
- [ ] The text of three frozen Consultations (Photo Style, Style Icons, Brands and Pieces) ships with the page as static data, placeholders for now. The images live in the private Blob store, never in the repo, and the page renders dynamically with 1-hour signed links like every other image.
- [ ] Visitors never trigger a Qloo or AI call.
- [ ] A documented way, ideally a script, exports a Demo Account Consultation's text into the landing page's static data.
- [ ] The root URL shows this page and keeps any message already shown there, such as the account-deleted message.
