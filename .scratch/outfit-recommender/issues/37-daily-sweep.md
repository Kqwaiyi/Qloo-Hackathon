# 37: Daily sweep

**What to build:** One daily job keeps the retention promises: unverified accounts go after 7 days, inactive accounts are warned and then deleted, and old usage, email-log and Qloo cache rows are purged. The Demo Account is never swept.

**Blocked by:** [36 Demo Account: creation script and managed settings](36-demo-account-managed-settings.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Daily sweep", "Accounts" (Last active), "Email" (the inactivity warning; caps), "Server operations" (Daily sweep), "Backend shape" and "Data model" (Users: last active, inactivity warning sent at). Stories 37, 142 and 144.

- [x] "Last active" is our own user field, set from session hooks whenever a session is created or refreshed.
- [x] One daily Vercel cron job calls a route handler that runs one sweep operation, given the current time. The route refuses requests that don't come from Vercel Cron.
- [x] It deletes unverified accounts 7 days after sign-up.
- [x] It warns accounts whose last activity was 11 months ago (12 months minus 30 days) and that haven't been warned since, with the inactivity email: the account and its Consultations will be deleted on <date>, 30 days away, unless the user signs in. The 50-a-day cap applies, and the warning time is recorded only when the email was actually sent.
- [x] It deletes an account 30 days after its warning was actually sent, if there has been no activity since. Activity after a warning clears it.
- [x] It skips the Demo Account in both account sweeps.
- [x] Deletions go through the same path as a user's own account deletion.
- [x] It purges usage records and email-log rows older than 35 days, and Qloo cache entries older than 30 days.
- [x] Tests cover the warn, delete and skip rules and the purges, using the injectable clock.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **Last active.** Two new user columns, `last_active_at` (not null, default `now()`, so existing accounts count from the migration) and `inactivity_warning_sent_at` (migration `0014_daily_sweep`). Better Auth doesn't know them, so they never reach the browser.
  - `databaseHooks.session.create.after` and `update.after` in `createAuth` call `recordActivity` (`src/server/accounts/activity.ts`). That covers signing up or in, opening a verification link, and the once-a-day refresh `proxy.ts` triggers on page loads.
  - It sets the time from our clock, and **clears any inactivity warning**, which is how "activity after a warning clears it" works.
- **The sweep operation.** `runDailySweep(ctx)` in `src/server/operations/daily-sweep.ts` reads the clock once, then runs, in order:
  1. deleting unverified accounts;
  2. deleting warned accounts;
  3. warning inactive accounts;
  4. the three purges.

  It returns a report of counts, plus `failures`.
  - **Deletions** go through `deleteAccountOf`, the path the team scripts and the user's own deletion share.
  - **The Demo Account** is left out of all three account steps, by `ne(user.email, auth.demoAccountEmail)`.
- **Deletion dates.** An account goes on the date its email gave: the verification email's and banner's (`createdAt` + 7 days), or the warning's (sent + 30 days). It goes at whatever time of that UTC day the sweep runs.
  - Comparing exact durations deleted most accounts a day after the date shown, and let a slightly earlier cron start push a deletion to day 31.
  - The cron runs at 12:00 UTC (`vercel.json`). The emails give UTC dates, and midday UTC keeps the deletion on the reader's own date from UTC-12 to UTC+12. Further east, it lands up to 2 hours after their date ends.
- **Warnings.**
  - **Who:** accounts whose 12 calendar months without activity end within 30 days, and that haven't been warned since they were last active.
  - **Order:** the longest inactive go first.
  - **The email:** `inactivityWarningEmail` in `messages.ts`. Its subject is "Your Outfit Recommender account will be deleted on <date>". It says the account goes with its Consultations, photos and Previews on that date, 30 days from now, unless the user signs in, and links to `/sign-in`. The link is built from Better Auth's own `baseURL`.
  - **Caps:** they're enforced in the send-email function as before. A refusal (the 50-a-day cap, or every email paused) stops the warnings for that run, and the rest wait for a later sweep.
  - **Recording:** `inactivity_warning_sent_at` is written only after the email went, and only if the user is still inactive. A sign-in while the email is on its way leaves the account unwarned.
- **Failures.** An account whose deletion or warning throws is logged without its address and counted in `failures`, and the sweep carries on with the rest.
  - **Examples:** Blob down, or Gmail refusing one recipient.
  - **Retry:** the account is still due, so the next day's sweep tries it again.
  - **Re-checking:** each due account is checked again just before it's deleted. One that verified or signed in while earlier deletions ran stays.
- **The route.** `GET /api/daily-sweep` (`src/app/api/daily-sweep/route.ts`).
  - **Who it accepts:** only requests with `Authorization: Bearer $CRON_SECRET`, which Vercel Cron sends once `CRON_SECRET` is set. `isFromVercelCron` (`src/server/http/cron.ts`) compares in constant time, and with no secret set it refuses everything.
  - **What it answers:** the report as JSON, with 500 when any account failed, so the run shows as failed in Vercel's logs. It logs the report's counts.
  - **The proxy** doesn't run on `/api/`.
- **For ticket 39:** `CRON_SECRET` is a new secret the spec didn't list. Until it's set on Vercel for Production, every cron call gets a 401 and none of the retention promises hold. Ticket 02 also asked to check that the firewall's Bot Protection challenge doesn't block the cron. Both are on ticket 39's checklist now.
- **Test doubles.** The capturing email transport gained `refusedRecipients` and `duringSend`, and the inline Styling runner gained `duringCancel`. They follow the existing `ai.duringCall`.
- **Tests.** `src/server/operations/daily-sweep.test.ts` gives each test a fresh database, since the sweep touches every account, and closes it afterwards. It covers:
  - **Unverified accounts:** deletion on the date the verification email gave, kept the minute before, a verified account kept, and the username and email freed.
  - **Warnings:**
    - the warning at 12 months minus 30 days and not a minute before, with its text, date and link;
    - one warning only;
    - signing in clearing it, with a new warning 12 months minus 30 days after that sign-in;
    - a session refresh counting as activity, with Date faked only while the session ages;
    - the 50-a-day cap: the longest inactive first, the rest the next day, each deleted 30 days after its own warning;
    - a failed send recorded as nothing, with the next account still warned;
    - a sign-in while the email is on its way.
  - **Deletions:** on the warning's date, earlier in the day than the warning went, with every Consultation, photo and Preview; an account signed in to mid-sweep kept; a Blob failure keeping the account until the next sweep, with no address in the log.
  - **The Demo Account:** never warned or deleted however long it's unused, nor deleted as unverified.
  - **Purges:** usage records and email-log rows at 35 days, Qloo cache entries at 30, each kept up to the minute and purged after it.
- **Checked by hand.** On a throwaway dev server with an in-memory database and a made-up `CRON_SECRET`:
  - **Refused with 401:** no header, a wrong secret, and the `vercel-cron/1.0` user agent alone.
  - **Accepted:** the right secret got 200 and an all-zero report. `POST` got 405.
  - **Sign-up:** it still works over HTTP with the session hooks, and `get-session` doesn't return the two new fields.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - deletions now fall on the date the email gave (above);
    - the re-check before each deletion;
    - the sign-in link uses Better Auth's `baseURL`, instead of a new `baseURL` service threaded through the services and test harness;
    - `SweepContext` is built from `AccountDeletionContext` rather than the team scripts' `TeamContext`, and `deleteAccountOf`'s doc names the sweep;
    - `isFromVercelCron` lost its unused secret parameter;
    - `recordActivity` takes `Pick<OperationContext, "db" | "clock">`;
    - clearer names, and the deletion date computed once.
  - **Left as judgement calls:**
    - the three purge statements and the three test helpers that read their times, written out rather than made generic;
    - the 7-day rule's SQL cutoff sitting beside `unverifiedAccountDeletionDate`, both from the same constant;
    - the warning's link built in the sweep, not in `src/server/auth/emails.ts`, since the warning isn't a Better Auth email;
    - the route's 401 checked by hand, not tested.
  - **Left as known limits:**
    - **A refused address is never deleted.** An address the mail server always refuses never gets its warning, so that account is never deleted, which breaks the Privacy Policy's 12 months.
    - **A cron delivered twice at once** can send a warning twice. Only one is recorded.
    - **The cap's 24 hours roll.** If a day's 50 warnings all went, a run the next day that starts a little earlier in the day finds the cap still full. That only matters with a backlog.
    - **Existing accounts** count as active from the migration.
  - **For the team to approve:**
    - the 12:00 UTC schedule;
    - warning the longest inactive first;
    - the route's report and its 500 on any failure;
    - the warning's sign-in link and its wording: the subject, and "If you don't need it any more, you don't have to do anything.";
    - leaving a sign-in mid-send unwarned;
    - the re-check before each deletion;
    - `CRON_SECRET`.
- **Live calls used:** none.
