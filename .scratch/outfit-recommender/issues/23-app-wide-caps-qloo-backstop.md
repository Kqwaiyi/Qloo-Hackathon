# 23: App-wide caps and the Qloo backstop

**What to build:** Whatever individual users do, the public demo can't run up costs. The app stops making Outfits after 100 in any 24 hours or 750 in a calendar month, and while Qloo's remaining calls are below 1,000. Users are told plainly that it isn't their fault, and when to come back.

**Blocked by:** [22 Outfit Allowance, photo-check limit and the usage summary](22-outfit-allowance-usage-summary.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Outfit Allowance, limits and backstops" (App-wide caps, Qloo backstop, Where limits show), "Qloo client and cache" (Quota tracking), "Data model" (Qloo limit state) and "User-facing copy" (Limits). Stories 128 and 143.

- [x] Every live Qloo response's `X-Month-RateLimit-Remaining` header, and its reset date if a header gives one, are saved to a one-row limit-state table with when they were observed. If the header is missing, nothing is recorded and Stylings go ahead.
- [x] No new Styling starts while Qloo's last reported remaining calls are below 1,000.
- [x] No Styling starts once 100 Outfits have been made in any rolling 24 hours, or 750 in the UTC calendar month, counted from the usage records. A Styling's Outfits are also limited by what the caps leave. A small overshoot from simultaneous Stylings by different users is accepted.
- [x] The 24-hour cap shows "Outfit Recommender has made all the Outfits it can for now. Please try again in a few hours." The monthly cap and the Qloo backstop show "Outfit Recommender has made all the Outfits it can for this month. Back on <date>.", where the backstop's date is Qloo's reset date if known.
- [x] These show on the Photo Type step before any photo is taken, and disable the results actions that start Stylings, through the usage summary. There's no app-wide banner, and sign-up, the landing page, reading and deleting stay open.
- [x] Every number lives in config.
- [x] Tests cover both caps, and the Qloo backstop with and without the header.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **Config.** `src/config/limits.ts` now also holds the 24-hour cap (`APP_WIDE_24_HOUR_CAP`, 100, over the same `USAGE_WINDOW_HOURS` window), the monthly cap (`APP_WIDE_MONTHLY_CAP`, 750) and the Qloo backstop (`QLOO_BACKSTOP_CALLS`, 1,000).
- **Counting.** `readAppWideOutfitsLeft` (`src/server/usage/records.ts`) counts every user's Outfit records, deleted accounts' included.
  - The 24-hour cap shares the Outfit Allowance's rolling-window count: the window is `at` minus 24 hours (exclusive) up to `at`. So it also knows when it lifts: 24 hours after the Outfit holding it.
  - The monthly cap counts from 00:00 UTC on the 1st, and lifts at 00:00 UTC on the next 1st. The helpers `startOfUtcMonth` and `startOfNextUtcMonth` are in `src/server/clock.ts`.
  - Migration `0011` adds the (kind, `used_at`) index that ticket 22 asked for.
- **The Qloo limit state.** The new one-row `qloo_limit_state` table (migration `0011`) holds `remaining_calls`, `resets_at` (null if Qloo didn't say) and `observed_at`. A check constraint keeps it to one row.
  - `QlooClient.send` saves it from every live response that carries `X-Month-RateLimit-Remaining`, and that includes a 429 or any other refusal. The newest report replaces the last.
  - The reset date is the time of the report plus `X-Month-RateLimit-Reset`, which is in seconds.
  - A missing, empty or non-numeric header records nothing, and leaves the last report as it was.
  - Cached answers never reach `send`, so they record nothing.
  - `readQlooLimitState` and `saveQlooLimitState` are in `src/server/qloo/limit-state.ts`.
- **The Qloo backstop** (`checkStylingStart` in `src/server/stylings/start.ts`) holds while the last report is below 1,000 calls. It lifts at Qloo's reset date. If Qloo gave no reset date, it lifts at the start of the next UTC month after the report, and that is also the "Back on" date.
  - The spec's literal "while the last reported remaining calls are below 1,000" would never lift, because no Styling calls Qloo while the backstop holds.
  - The no-reset-date fallback assumes Qloo's month is the calendar month, which it isn't. Qloo's month reset on about 13 November when checked on 16 October. That's low risk, since every live response carries the reset header (ticket 09).
- **The refusals.** `StylingStartRefusal` gains three:
  - `{ refusal: "app-wide-24-hour-cap" }`;
  - `{ refusal: "app-wide-monthly-cap", backOn }`;
  - `{ refusal: "qloo-backstop", backOn }`.

  `outfitsWanted` is now the least of 2, the Outfit Allowance left and what each cap leaves. A small overshoot from simultaneous Stylings is accepted, as the spec says.
- **When several limits hold, the refusal is the one that lifts last**, so nobody is told to come back while another limit still holds. That covers the Outfit Allowance, both caps and the backstop.
  - The 24-hour cap's wording gives no time, but it lifts as the allowance does.
  - On a tie, the app-wide limits win, since they aren't the user's doing.
  - The spec doesn't fix this order. A fixed order was tried first and changed after review (see below).
  - **For tickets 24 and 30:** a new refusal in `checkStylingStart` joins the `inForce` list with when it lifts.
- **UI.**
  - `LimitMessage` words the new refusals with the spec's two lines, now in `COPY`. "Back on <date>" uses the viewer's own time zone, as "More from <time>" does.
  - Because the month starts at 00:00 UTC, a viewer west of UTC sees the day before, such as "Back on 31 October 2026". That is accurate for them, if a little odd.
  - `useLocalTime` became `useLocalFormatters()` (`src/components/local-date.tsx`), which returns `{ date, time }`.
  - The New Consultation panel shows any of them in place of the Photo Type step, through the usage summary. There is no app-wide banner, and sign-up, the landing page, reading and deleting are untouched.
  - When "Get my Outfits" gets one of these refusals (a limit reached after the page loaded), it refreshes the page, which then shows the panel. A `satisfies` check fails typecheck if a refusal that isn't a limit or `unverified` reaches that refresh. **For ticket 25:** the consent refusal needs its own branch there.
  - **For tickets 26–29:** the results actions disable themselves through the summary's `stylingStart`, as ticket 22 describes.
- **Demo Account.** Its exemption from the caps and the backstop is ticket 38's.
- **Tests.**
  - `src/server/operations/usage.test.ts` now clears the usage records and the Qloo limit state before each test.
  - Seeding: hundreds of Outfits come from `recordUsage`, the function `finishStyling` writes with. Real Stylings would be far too slow.
  - The 24-hour cap tests cover: the summary refusing, a Styling limited to the 1 Outfit the cap leaves, the rolling window at and just before 24 hours, refusing before the photo check with nothing stored, and which refusal wins against a used-up allowance, both ways.
  - The monthly cap tests cover: refusing until 00:00 UTC on the 1st, last month's Outfits not counting, and a Styling limited to what the cap leaves.
  - The backstop tests cover:
    - 999 calls left refusing until Qloo's reset date, before the photo check;
    - 1,000 left going ahead;
    - no header going ahead;
    - no reset date holding until the next UTC month;
    - the later date winning when the monthly cap holds too.
  - `src/server/qloo/client.test.ts` covers:
    - the report kept from a live response, with its reset date;
    - a newer report replacing it, and one without a reset date;
    - nothing recorded from a cached answer or a response without the header;
    - nothing recorded until Qloo reports;
    - a 429's report kept.
- **Not checked in the browser.** A dev server was already running in this folder on its own database, and Next.js allows one per folder. **Restart `npm run dev`:** PGlite applies migration `0011` only at start-up. Until then, New Consultation and live Qloo calls fail on the missing `qloo_limit_state` table.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - The refusal order was first a fixed one (month-long limits, then the 24-hour cap, then the allowance). It could send a user back at the 24-hour cap's lift time while their own allowance still held. Now the limit that lifts last wins.
    - The rolling-window filter is no longer duplicated.
    - Each cap has one config name, matching the spec.
    - All four limits are built the same way in `checkStylingStart`.
    - The comments no longer promise a time for the 24-hour cap.
    - Added the typecheck guard on the "Get my Outfits" refresh.
    - Renamed the hook to `useLocalFormatters`.
    - Added a test helper for Qloo's report, replacing five copies.
  - **Left as known limits:**
    - Test seeding through `recordUsage`, explained above.
    - `clock.ts` now also holds the UTC month helpers.
    - The limit-state upsert doesn't compare `observed_at`, so a parallel Qloo call answered earlier but saved later can leave the report a call or two stale.
    - "App-wide cap", "Qloo backstop" and "Qloo limit state" aren't in `GLOSSARY.md` yet. That's for `/domain-modeling`.
  - **For the team to approve:**
    - the "lifts last" order;
    - the backstop lifting at the reset date, or at the next UTC month without one;
    - recording a refused response's report;
    - local-time dates for "Back on".
