# 32: Privacy Policy and Terms pages

**What to build:** Public `/privacy` and `/terms` pages that tell users, in plain English, everything the spec requires, including a Photos section with the retention and destruction schedule. Sign-up links to them now; the consent sheet, landing page and footer link to them in their own tickets.

**Blocked by:** [01 Walking skeleton: sign up, sign in and the app shell](01-walking-skeleton.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Privacy Policy and Terms (acceptance criteria; the implementation issue writes the text)" and "User-facing copy" (the deletion promise). Stories 136, 137 and 139. [ADR-0004](../../../docs/adr/0004-adults-only.md), [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md).

**Decided while slicing:** the team members' names stay a clearly marked placeholder for now; ticket 39 fills them in.

- [x] `/privacy` discloses all 16 items in the spec's list:
  1. who we are: "the Outfit Recommender team", with the members named, and the team Gmail as the single contact for privacy requests and complaints;
  2. the GDPR Article 27(2) exemption from appointing an EU representative, with the reasoning;
  3. what we collect, exactly as the spec lists it;
  4. the purposes, and the legal basis for each;
  5. the recipients, including exactly what Qloo gets (the age group, the gender signal, the Country, Photo Style tags and entity IDs);
  6. international transfers and their safeguards;
  7. the retention list, item by item;
  8. the rights, with access and export by email answered within a month, self-serve deletion, and emailed deletions done within 30 days;
  9. the right to withdraw consent, and how;
  10. the right to complain to a supervisory authority, and our own email complaints route, answered within 30 days;
  11. that a photo is required to get Outfits;
  12. that recommendations are automated, including the Photo Style the AI reads, with no legal or similarly significant effect;
  13. the 18+ rule, and that an account found to belong to someone under 18 is deleted;
  14. the Photos section (next criterion);
  15. that Previews are AI-generated and labelled so;
  16. the content rules: only photos of yourself, which you have the rights to, and no nudity or intimate images.
- [x] The Photos section has the biometric notice (AI processes face and body only to edit the image); no face templates, no age guessing and no sensitive inferences; the release; that photos are redrawn in the browser, which drops location metadata; and the public retention and destruction schedule with the deletion promise, worded exactly as in "User-facing copy".
- [x] `/terms` states the 18+ rule, the content rules, and that this is a free hackathon project with no affiliation with Style Icons or Brands.
- [x] Both pages are public and need no sign-in.
- [x] The contact address comes from config, and the team members' names are a clearly marked placeholder.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **Pages.** Both live in a `src/app/(legal)/` route group, with a public layout: the logo, plus Privacy and Terms through the shared `NavLink`, which moved to `src/components/nav-link.tsx`. Both pages are statically prerendered and need no sign-in. `src/components/placeholder.tsx` is gone, since nothing else used it.
  - `legal-text.tsx` holds the pages' shared parts: `LegalSection` (a heading with an id to link to, such as `/privacy#photos`), `TeamEmailLink`, `count` and the class names.
  - `/privacy` opens with an "On this page" list. Its 16 disclosures are 15 sections, because the EU representative gets its own section right after "Who we are".
- **Wording from config.** The deletion promise, the content rules and "AI-generated" come from `COPY`. `COPY.notAffiliated` ("Style Icons and Brands aren't affiliated with Outfit Recommender.") is new, and **ticket 33's footer** should use it. The numbers come from config: the age, the allowance, the cookie and sign-in lengths, the photo size and every retention period we enforce ourselves. Providers' periods (55 days, 6 hours, 1 day) are written into the text.
- **New retention constants, for ticket 37.** `INACTIVE_ACCOUNT_LIFETIME_MONTHS` (12) and `INACTIVITY_WARNING_NOTICE_DAYS` (30) are in `accounts.ts`, `USAGE_RECORD_LIFETIME_DAYS` (35) is in `limits.ts`, and `EMAIL_LOG_LIFETIME_DAYS` (35) is in `email.ts`. Only the policy reads them so far. The sweep should use them, so the policy and the sweep can't drift apart.
- **The contact address.** `getTeamEmail()` is now synchronous and reads `GMAIL_USER` through `teamEmailAddress()` in `src/server/email/gmail.ts`, with the same `.invalid` fallback. That way the static pages never open the database. Since the pages are prerendered, a deployment shows the address it was built with. On Vercel, a changed environment variable only reaches new deployments anyway. `mailto` moved to `src/components/mailto.ts`, out of Settings.
- **Team members' names:** a highlighted "[Team members' names to be added]" in "Who we are", with a code comment. **Ticket 39** replaces it.
- **Found while reviewing: the spec's provider periods were Hobby's, but the team is on Pro** (ticket 02). Vercel's docs, read 2026-10-18, give Pro **7 days** of Workflow run data (Hobby: 1 day) and **1 day** of runtime logs (Hobby: 1 hour). The 7 days broke the deletion promise ("Leftover records in our providers' systems are gone within a day"), which the consent sheet and the account-deletion modal already show.
  - **Fix (for the team to approve):** `workflowStylingRunner.start` passes `experimental_retention: 0`. Workflow then deletes a run's inputs, outputs and event payloads as soon as the run completes, fails or is cancelled, and keeps only its metadata. Nothing reads a finished run's data, since every step saves to the database. The option is marked experimental in workflow 5.2.2, which the repo pins.
    - **Checked:** the New Consultation smoke test passes with it. The finished Local World run afterwards had `expiredAt` set, and neither the run nor its steps had input or output left.
    - The README notes that `npx workflow web` now shows finished runs without their data.
  - The policy therefore says Workflow run data is deleted as soon as the Styling ends, and runtime logs last 1 day. That departs from the spec's "lasts 1 day" and "1 hour", but it's true on Pro and keeps the promise. If the team moves back to Hobby, logs drop to 1 hour and the text overstates, which is harmless.
- **Things the policy says that aren't true yet:** "when you last used the app" and the inactivity deletion wait for ticket 37. The Gemini recipient and its 55-day copy wait for tickets 34 and 35, since the fake adapter sends nothing anywhere. **Ticket 39** should check both before the demo link goes out.
- **More than the spec listed, for the team to approve:**
  - **`/privacy`, "What we collect":** besides the spec's list, it names what the app actually keeps to run accounts. That's sign-ins with their IP address and browser (Better Auth's session table), IP addresses in rate-limit counts, the photo-notice acceptance, the email log, and the last-active date. Retention covers each of these. It also covers the cookies (the sign-in cookie and the age gate's), and the country of the connection, which is read but not stored.
  - **`/privacy`, the UK GDPR:** it claims the same Article 27(2) exemption from a UK representative as from an EU one.
  - **`/terms` goes past the three required points.** It adds:
    - your photos stay yours, and you let us use them only to make your Outfits;
    - we may delete an account that breaks the rules;
    - Outfits are suggestions;
    - the allowance, and no getting around limits;
    - no guarantees, and that we may change or end the app.
  - **Transfers:** the text says the providers' data processing terms use safeguards "such as" the Standard Contractual Clauses and the UK addendum. Each provider's terms weren't read for this.
  - **No legal review.** That's the spec's known gap.
- **Tests.** No new automated test. The spec's agreed seams are the server operations, Outfit assembly and four smoke flows, and it leaves the rest of the UI to be checked by hand. This ticket is page text and a link already covered by sign-up.
  - **Checked in the browser on local development, signed out:** both pages at desktop and phone width (375 px, no sideways scroll), the contents links, `aria-current` in the header, and the mailto links.
  - `npm run build` lists `/privacy` and `/terms` as static.
  - `npm run typecheck` and `npm test` pass (485 tests). The New Consultation smoke test passes.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - the Pro retention periods, as above;
    - "only you can open it" became "only someone signed in to your account", which is also true of the Demo Account;
    - "a date under 18 stores nothing" now says the age gate's cookie stays in the browser;
    - the rate-limit period now comes from config;
    - the heading "Automated recommendations" became "Automated decisions", since the glossary avoids "recommendation";
    - the legal header now uses `NavLink`;
    - the section list is now a record, so a title can't be missing;
    - `teamGmailAddress`'s comment.
  - **Left as judgement calls:**
    - `getTeamEmail()` passes straight through, but keeps pages reading through the server-only data layer;
    - the contact address lives in `gmail.ts`, since the spec makes the team Gmail the contact;
    - providers' periods are written into both the retention list and the Photos table;
    - Settings keeps its own card-style `Section` and "Email us" links.
- **Live calls used:**
  - the New Consultation smoke test made its usual Qloo call or two;
  - Vercel's public docs were read for the Workflow and runtime-log periods.
