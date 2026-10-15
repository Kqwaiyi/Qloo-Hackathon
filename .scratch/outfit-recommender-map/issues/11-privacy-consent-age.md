# What consent, retention and minimum age do we commit to?

Type: grilling
Status: resolved
Blocked by: 06
Map: [Outfit Recommender](../map.md)

## Question

Given the rules found in "What privacy and age rules apply to stored face photos?", what do we commit to?

- What the consent screen says, and what the user must agree to.
- The minimum age. The 13+ decided while charting conflicts with Gemini's terms, which forbid apps likely used by under-18s (found by both "Which Google models fit Previews and photo checks?" and the privacy research). Options: gate the app to 18+, or route under-18s to a different AI provider whose terms allow them. Also, how age is checked. If under-18s stay, Outfit assembly keeps its teen age rows and excludes lingerie Brands for them (see "How does Qloo build and rank Outfits?"); otherwise those rules go.
- Illinois and Washington biometric-law handling (notice, release, retention schedule), or whether to treat every user that way.
- Retention and deletion of photos, Previews, Consultations and accounts.
- Any other notices or controls we owe users, including for the Country now collected at sign-up and the Photo Style the AI reads from each photo.
- Verification and reset emails go out through a team Gmail account (decided in "What's the architecture?"), so Google handles users' email addresses.
- A Body-Only Photo may still show the user's face, which is stored and sent to Google like the rest of the photo (decided in "What do we ask the AI model at each step?"). The consent wording can't promise that Body-Only keeps the face out.

## Answer

Resolved with the user on 2026-10-15. It builds on "What privacy and age rules apply to stored face photos?" and a lookup of how long each provider keeps data (sources at the end). Two ADRs come out of it: **adults only** ([ADR-0004](../../../docs/adr/0004-adults-only.md)), and **photos are edited, never analysed** ([ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md)). None of this is legal advice. Having it checked by someone qualified is a known gap for the spec, not a blocker.

**1. Minimum age: 18, everywhere.** This replaces the 13+ from charting.
- Routing teens to another AI provider was rejected. It needs a second adapter and the full UK Children's Code, and Google's child-image filter would refuse teen Previews anyway.
- **The gate is self-declared and neutral:** no default, no hint of the cut-off, no ID check, and no estimating age from the face.
- **An under-18 entry creates no account and stores nothing.** A cookie blocks another sign-up attempt from that browser for 30 days. The message is "You need to be 18 or older to use Outfit Recommender."
- If we learn that a user is under 18 (for example, a report to the team Gmail), their account and everything in it is deleted.
- How age is entered stays with "How do the account flows behave?".

**2. What the user agrees to, and where.**
- **Sign-up:** one unticked checkbox, "I agree to the Terms and Privacy Policy".
- **Consent sheet** (the first press of "Get my Outfits"): a short plain-English summary and two separate unticked checkboxes. Both are required.
  - **Photo release:** we store your photos and Previews, and the AI processes your face and body to make them. This is the BIPA-style written release, and every user sees it.
  - **Sharing with Google:** your photos go to Google's Gemini to check them and make Previews, and Google keeps them up to 55 days for abuse monitoring. This is a separate box because Washington's My Health My Data Act wants sharing consent kept apart from collection consent.
  - Plain text, not a checkbox: upload only photos of yourself, with no nudity. A Body-Only Photo can still show your face, which is stored and sent like the rest of the photo.
- **Proof:** each user's accepted photo-notice version and the time they accepted it are stored. A new version shows the sheet again.
- **Withdrawing:** Settings has "Withdraw photo consent". It deletes every Consultation with its photos and Previews, keeps the account, and shows the sheet again before the next Consultation.

**3. Photos and biometric law ([ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md)).**
- Photos stay ordinary personal data, not GDPR special-category data, as long as we:
  - build no face templates;
  - never guess age;
  - never infer ethnicity, skin tone, body measurements or health.
- Every user gets the release above and the public retention and destruction schedule in section 5. So Illinois and Washington need no state field, and nobody is blocked.
- **Change to "What do we ask the AI model at each step?":** the photo check reports only whether the hair is covered, never what covers it. The prompt may still name hijabs, turbans and caps as examples, but a stored "hijab" or "turban" would be an inference about religion.

**4. Where the app is offered.**
- The Country list offers only Gemini's available regions. That leaves out mainland China, Hong Kong, Macao, Russia, Iran, Cuba, Belarus, North Korea and Syria.
- Sign-up and "Get my Outfits" are also refused when Vercel's `x-vercel-ip-country` header names an unsupported region.
  - The header works on Hobby. A server action reads it through `headers()`.
  - The header is missing in local development, so a missing header counts as allowed.

**5. Retention and deletion.**
- **Consultations** are kept until one of these happens: the user deletes them, the user withdraws photo consent, or the account goes.
- **Inactive accounts** are deleted whole after 12 months without a sign-in, with a warning email 30 days before.
- **Unverified accounts** are deleted 7 days after sign-up.
- One daily Vercel cron job runs both sweeps. Hobby allows once a day.
- **The promise:** "Your photos and Previews are deleted immediately. Leftover records in our providers' systems are gone within a day, and Google's abuse-monitoring copy within 55 days."
  - In round 2 the leftovers were put at 6 hours. Workflow run data lasts a day, so the promise says a day.
- **What makes that promise true:**
  - Deleting a Consultation that's still Styling cancels its Workflow run first. Its rows and Blob objects then go in the same action.
  - **Blob:** we accept that the CDN can serve a deleted image for up to about 60 seconds, rather than bypassing the cache on every view.
  - **Workflow run data:** kept 1 day after the run, encrypted, with no purge API. It holds only Blob pathnames, Style Icons and Piece text, never images. Disclosed.
  - **Neon:** keep the default 6-hour restore window, so we can undo our own mistakes. Disclosed.
  - **Neon preview branches** start from an empty or seed branch, never from production.
  - **Better Auth:** the `afterDelete` hook also deletes leftover verification tokens, which `deleteUser` otherwise leaves until they expire.
  - **Gemini:**
    - images are always sent inline, never through the Files API;
    - paid tier for all traffic;
    - API logging off;
    - no dataset sharing.
  - **Logs:** no personal data in logs or URLs. Hobby runtime logs keep query strings for 1 hour.
  - **Email requests:** deletions asked for by email are done within 30 days.
- **The team Gmail:**
  - Every verification, reset and warning email is copied to the Sent folder, with the user's address and the token link.
  - On a free Gmail account, Google holds those copies as controller under its consumer terms, not as our processor.
  - A daily Apps Script trigger in the team Gmail permanently deletes sent mail older than 1 day, using the Gmail API's delete with the full-mail scope.
  - The notice says email addresses pass through Gmail under Google's own privacy policy.
  - Moving to a domain and Resend stays possible later.

**6. Who we are, and users' rights.**
- **Controller:** "the Outfit Recommender team", with the members named in the notice.
- **Contact:** the team Gmail is the single contact for privacy requests and complaints. Email counts as the UK's electronic complaints route. We reply within 30 days.
- **EU representative:** we claim GDPR Article 27(2)'s exemption for occasional, low-risk processing, with the reasoning written down.
- **Access and export:** by email request, answered within a month. The team sends a zip by hand. Deletion stays self-serve.
- **Qloo:** a written commitment, checked by a test, that Qloo receives only:
  - the age group;
  - the gender signal;
  - the Country;
  - Photo Style tags;
  - entity IDs.

  It never receives a user ID, username, email or photo, or anything that links two calls to one user. One test asserts that the Qloo client's request type has no user fields.
- **AI label:** every Preview carries a visible "AI-generated" badge in the UI (EU AI Act Article 50). Nothing is burned into the image.

**7. Privacy Policy and Terms.**
- **Pages:** public `/privacy` and `/terms` pages, linked from sign-up, the consent sheet, the landing page and the footer.
- **`/privacy`** carries the 15 disclosures listed in the research. They include:
  - the Country sent to Qloo;
  - the Photo Style the AI reads, as automated recommendations with no legal effect.

  A "Photos" section holds the biometric notice and the public retention and destruction schedule from section 5.
- **`/terms`** carries the 18+ rule, the content rules, and the fact that this is a free hackathon project.
- **Wording:** the spec lists what each page must say as acceptance criteria, and the implementation issue writes the text.

**Setup reminders for the spec.**
- **Gemini:** paid tier, API logging off, no dataset sharing.
- **Neon:** preview branches start from an empty or seed branch.
- **Vercel:** the daily sweep cron job.
- **Team Gmail:** the Apps Script purge trigger.

**Passed on.**
- **"How do the account flows behave?":**
  - the 18+ gate and its cookie;
  - the 7-day unverified sweep;
  - inactivity warnings counting against Gmail's 500 a day;
  - "Withdraw photo consent" in settings;
  - Better Auth's ways to confirm account deletion.
- **"What does the user see when a Consultation step fails?":**
  - "Get my Outfits" refused for an unsupported region;
  - a user who closes the consent sheet without ticking both boxes.
- **"Prototype the landing page":**
  - it states the 18+ rule and links `/privacy` and `/terms`;
  - any real person in its examples needs their consent (the hackathon rules forbid real users' PII).
- **The spec:**
  - drop the teen age rows and the teen-only lingerie rule from Outfit assembly (the apparel/footwear filter still drops lingerie for everyone);
  - the photo check's hair-covered field is a yes/no.
- **The data model:**
  - each user's accepted photo-notice version and time;
  - the last sign-in, for the sweep.

**Retention sources** (read 2026-10-15):
- [Neon history window](https://neon.com/docs/postgres/backup-restore/history-window)
- [Vercel Blob private storage](https://vercel.com/docs/vercel-blob/private-storage)
- [Vercel Workflow pricing and retention](https://vercel.com/docs/workflows/pricing)
- [Vercel runtime logs](https://vercel.com/docs/logs/runtime)
- [Vercel request headers](https://vercel.com/docs/headers/request-headers)
- [Better Auth users and accounts](https://www.better-auth.com/docs/concepts/users-accounts)
- [Gmail SMTP sent copies](https://support.google.com/mail/answer/78892)
- [Google Workspace processor terms](https://business.safety.google/services/)
