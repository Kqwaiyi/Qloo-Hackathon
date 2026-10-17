# 22: Outfit Allowance, photo-check limit and the usage summary

**What to build:** Each user can have up to 10 Outfits made and 20 photos checked in any rolling 24 hours. "Get my Outfits" says how many Outfits it will use and how many are left today. A user who has used them all is told on the Photo Type step, before taking a photo, when more become available, and a Styling makes only as many Outfits as the user has left. One usage summary tells the UI whether a Styling can start and why not, so the later limits and results actions plug into it.

**Blocked by:** [07 Photo check rejections and the one-tap Photo Type switch](07-photo-check-rejections.md), [10 First Styling: Outfits inspired by ranked Style Icons](10-first-styling-style-icons.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Outfit Allowance, limits and backstops" (Outfit Allowance, Photo checks, Where limits show), "Stylings" (How many Outfits; Finishing), "Server operations" (Start a Consultation, checks 5 and 6; Read: the usage summary), "Data model" (Usage records; Deletion) and "User-facing copy" (Limits). Stories 76, 111, 123–126 and 144.

- [x] Usage records hold a kind (Outfit or photo check), the user (nullable) and the time, kept apart from Consultations, with no photo and no Outfit content. Deleting a Consultation keeps its usage records.
- [x] One usage record is written per Outfit switched in when a Styling finishes, with or without a Preview. Skipped Outfits and failed Stylings write none, and nothing is given back.
- [x] Each photo check writes one, accepted or rejected. A check that errors, and the server's file refusal, write none.
- [x] The Outfit Allowance is 10 Outfits in any rolling 24 hours, and the photo-check limit is 20. Both live in config.
- [x] A Styling makes up to 2 Outfits, limited by the Outfit Allowance left.
- [x] Start a Consultation, in the spec's check order, refuses when the allowance leaves no Outfit, and refuses at the photo-check limit with "You've checked 20 photos today. More from <time>."
- [x] The usage summary reports the Outfits left, when more become available (the oldest counted Outfit's time plus 24 hours, shown in the user's local time), and whether a Styling can start, with the reason when it can't.
- [x] "Get my Outfits" shows "Uses <n> of your <left> Outfits left today".
- [x] With the allowance used up, the Photo Type step shows "You've made today's 10 Outfits. More from <time>." before any photo is taken. Results actions that start Stylings use the summary to disable themselves with the same time, while reading and deleting always work. (None exist yet: tickets 26–29 wire them to the summary. See the comments.)
- [x] Tests cover the allowance across a rolling window, including partial Stylings (one that makes 1 Outfit counts 1), a first Styling with one Outfit left making one, the photo-check limit, and an errored check not counting.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **Usage records.** The new `usage_record` table (migration `0010`) holds a kind (`outfit` or `photo_check`), the user and `used_at`, and nothing else. It has no link to Consultations, so deleting one keeps its records.
  - The user is `on delete set null`, as in the email log. **For ticket 31:** account deletion strips the user without further code.
  - The only index is (user, kind, `used_at`). **For tickets 23 and 37:** the app-wide caps will want (kind, `used_at`), and the purge `used_at`.
- **Config.** `src/config/limits.ts` holds the 24-hour window, the Outfit Allowance (10), the photo-check limit (20) and `USAGE_LIMITS`, which maps each kind to its limit.
- **Reading and writing.** `src/server/usage/records.ts` has `recordUsage` and `readUsageLeft`.
  - `readUsageLeft` returns `{ usedUp: false, left, moreFrom }` or `{ usedUp: true, left: 0, moreFrom }`.
  - The window counts records after `at` minus 24 hours, up to `at`. An Outfit made at 09:00 is free again at exactly 09:00 the next day.
  - `moreFrom` is the oldest counted use plus 24 hours, which is the spec's formula. If simultaneous Stylings push the count over the limit (possible until ticket 30's locks), it uses the record that holds the limit instead. That is when one really comes back.
- **What counts.**
  - **Outfits.** `finishStyling` writes one Outfit record per Outfit it switches in, at the finish time, Preview or not. A failed Styling or a skipped Style Icon writes none.
  - **Photo checks.** "Get my Outfits" writes one photo-check record once a check comes back, accepted or rejected. A check that errors, or a file refused first, writes none.
- **Deleting mid-Styling counts, for the team to approve.** `deleteConsultation` (ticket 17) finishes a running Styling before deleting it, so the Outfits it had built switch in and count, though the user never sees them. It's kept because:
  - their tailoring and Previews were already paid for;
  - ticket 23's app-wide caps count the same records, so leaving them out would undercount spend.

  A test pins it. Ticket 31's account deletion takes the same path.
- **The shared start check.** `checkStylingStart` returns `Result<{ outfitsWanted }, StylingStartRefusal>`.
  - `outfitsWanted` is the usual 2, or what the allowance leaves if fewer. `createStyling` now takes it, so a Styling with one Outfit left makes one, and its checklist says "of 1".
  - Its first refusal is `{ refusal: "allowance-used", moreFrom }`.
  - **For tickets 23, 24 and 30:** add each new refusal to `StylingStartRefusal`. `LimitMessage`'s switch then fails to typecheck until the refusal has its wording. Ticket 24 will need to widen the check's context to `requestHeaders`.
- **"Get my Outfits"** checks in the spec's order: verified, then the shared start check (the allowance), then the photo-check limit (`{ refusal: "photo-check-limit", moreFrom }`), then the file.
- **The usage summary.**
  - `readUsageSummary` (`src/server/operations/usage.ts`) returns `{ outfitsLeft, moreOutfitsFrom, stylingStart }`. Pages read it through `getUsageSummary` (`src/server/data/usage.ts`).
  - `stylingStart` is the shared check's result, or `{ ok: false, refusal: "unverified" }`. A signed-out visitor gets null.
  - **For tickets 26–29:** the results page has no actions that start Stylings yet. Each should:
    - read the summary;
    - show "Uses <n> of your <left> Outfits left today" from `outfitsWanted` and `outfitsLeft` (`COPY.outfitsItUses`);
    - while `stylingStart` isn't ok, disable itself with `<LimitMessage refusal={...} />`.
- **Pages.**
  - **New Consultation** now gates on the summary alone:
    - an unverified user sees the verify panel, as before;
    - when no Styling can start, a panel replaces the Photo Type step, before any photo is taken. It shows "You've made today's 10 Outfits. More from <time>." under the Stepper;
    - otherwise the wizard shows.
  - **"Get my Outfits"** has the allowance line under it, tied to it with `aria-describedby`.
    - An `allowance-used` refusal (the page loaded before the last Outfits were made) refreshes the page, which then shows the panel.
    - A `photo-check-limit` refusal shows "You've checked 20 photos today. More from <time>." where the photo's problems show.
  - **Shared pieces.**
    - `LimitMessage` (`src/components/limit-message.tsx`) words every limit refusal, using the numbers from config.
    - `useLocalTime` (`src/components/local-date.tsx`) gives "HH:MM" in the viewer's own time zone. Like `LocalDate`, the server renders UTC until the page hydrates, so the time can change once it loads.
  - The three Limits lines are in `COPY` word for word.
- **Tests.** `src/server/operations/usage.test.ts` drives `startConsultation`, `readUsageSummary`, `deleteConsultation` and the inline Stylings. It covers:
  - the summary for a new, unverified and signed-out user;
  - each Outfit switched in counting, with more 24 hours after the oldest;
  - a partial Styling counting 1;
  - a failed Styling, and a skipped Style Icon, counting nothing;
  - Outfits without a Preview counting;
  - the rolling window at and just before 24 hours;
  - deleted Consultations, deleted mid-Styling included, still counting;
  - usage being each user's own;
  - a first Styling with one Outfit left making one;
  - a used-up allowance refusing before the photo check and storing nothing, and freeing Outfits 24 hours on;
  - the photo-check limit: accepted and rejected checks counting, the 21st refused before checking, checks allowed again 24 hours on, an errored check or a refused file not counting, and its place after the allowance in the order of checks.
- **Checked in the browser.** A throwaway Playwright run against local development, with the browser in New York time, showed:
  - the allowance line under "Get my Outfits";
  - the photo-check message after 20 rejected photos;
  - the Photo Type panel after 10 Outfits, with both times in the viewer's own time zone;
  - no sideways scroll at phone width.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - comments that restated config numbers;
    - `StylingStart` is now a `Result`;
    - the per-kind limit table moved to config;
    - `UsageLeft` says by its type when nothing is left, so no `!` is needed;
    - one `moreFrom` replaces three names;
    - clearer names: `LimitRefusal`, `outfitsWanted`, `useInViewersTimeZone`;
    - `LimitRefusal` is derived from `StartConsultationRefusal`, so the UI imports types only from the operations seam;
    - added tests for Outfits without a Preview and for deleting mid-Styling.
  - **Left as known limits:**
    - The usage summary reads the user's Outfit records twice: once for `outfitsLeft`, and again inside the shared start check.
    - The read context `Pick<...>` is spelled out once more (see ticket 17).
    - The test file keeps its own copy of the sign-up and photo helpers, like the other test files.
  - **For the team to approve:**
    - counting Outfits a Styling built when its Consultation is deleted mid-Styling, explained above;
    - the "More from" time when usage is over the limit, explained above;
    - the panel's second line, "You can still open and delete your Consultations in My Consultations.", which isn't spec wording;
    - times shown as 24-hour "HH:MM", such as "09:00".
