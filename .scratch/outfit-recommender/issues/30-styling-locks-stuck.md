# 30: Styling locks and stuck Stylings

**What to build:** Only one Styling runs at a time per Consultation and per user, so the Outfit Allowance count stays right. A Styling that gets stuck ends on its own after 10 minutes instead of locking its Consultation forever.

**Blocked by:** [17 My Consultations and deleting a Consultation](17-my-consultations-delete.md), [22 Outfit Allowance, photo-check limit and the usage summary](22-outfit-allowance-usage-summary.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Stylings" (Locks; Stuck Stylings; Finishing), "Server operations" (Start a Consultation, check 4; Read: the Styling status) and "Data model" (Stylings: unique constraints). Stories 90 and 127.

- [x] The database enforces one running Styling per Consultation and one per user, so two simultaneous requests can't both start one. Ticket 38 exempts the Demo Account from the per-user lock.
- [x] Start a Consultation (as its fourth check) and the shared start check refuse while a Styling is already running, with a plain message; the spec doesn't fix its wording.
- [x] A Styling whose stage hasn't moved for 10 minutes is finished whenever something reads its status: the poll, My Consultations, or an operation that would start a Styling. It finishes like any other Styling: whatever it made switches in, Previews not ready are marked failed and usage records are written, or it fails if it made nothing. Its Workflow run is cancelled if still alive, and both locks are released. There's no cron job for this.
- [x] Tests cover both locks and the stuck-Styling check, using the injectable clock.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The locks in the database.** Migration `0013_styling_locks` adds two partial unique indexes on `styling`, both `where status = 'running'`: `styling_running_per_consultation_unique` on `consultation_id` and `styling_running_per_user_unique` on `user_id`.
  - `createStyling` (`src/server/stylings/start.ts`) inserts with `on conflict do nothing`. When that creates nothing, it throws `AlreadyStylingError`, which rolls back the caller's transaction. `startConsultation` (which then deletes the stored photo) and `startStylingOn` turn it into the `already-styling` refusal.
  - **For ticket 38:** the per-user index covers every user, the Demo Account included. An index predicate can't look at the user table, so exempting the Demo Account needs a column on the Styling. One way: a copy of the user ID that's null for the Demo Account, with the index on that column. The per-user query in the shared start check needs the same exemption. The per-Consultation lock stays as it is.
  - **Migration:** the indexes can't be built on a database where a user already has two running Stylings. Finish those first.
- **The refusal.** Both locks share one refusal, `already-styling`. It moved from `ConsultationStylingRefusal` into `StylingStartRefusal`, so these all use it: "Get my Outfits", the four results actions, the usage summary and `LimitMessage`.
  - `checkStylingStart` refuses with it after the region gate and before the limits. That makes it check 4 of Start a Consultation, before the photo check. The per-Consultation check in `startStylingOn`, which holds the Consultation's row `for update`, returns the same refusal.
  - **Wording:** "You already have a Styling running. You can start another once it finishes." The spec doesn't fix it, so it sits in `LimitMessage` itself.
  - **Where it shows:** the usage summary runs the shared start check, so while one of the user's Stylings runs:
    - New Consultation shows the line in place of the Photo Type step;
    - on every Consultation, the allowance line beside the actions that start a Styling shows it in place of "Uses n of your m Outfits left today", and those actions are disabled. That includes a Consultation's header while its own "Show 2 more Outfits" runs.
- **Stuck Stylings.** `STUCK_STYLING_MS` (10 minutes) and `isStuck` live in `src/config/stylings.ts`.
  - `finishStuckStylings` (`src/server/stylings/stop.ts`) finishes each of the user's running Stylings whose stage hasn't moved for that long, or just the one on a given Consultation. It then cancels that Styling's Workflow run through `cancelWorkflowRun`, which deletion now shares and which logs a cancel that fails.
  - **What runs it:**
    - the Styling status (`readStylingStatus`, behind the poll and the results page), for its own Consultation;
    - My Consultations (`listConsultations`);
    - the shared start check, for all of the user's Stylings, before the lock and the limits, so the Outfits a stuck Styling made count first. That covers every operation that starts a Styling, and also the usage summary, so the page agrees with what the operations will do.
  - **Finishing:** `finishStyling` takes `"stuck"` beside `"completed"` and `"broke"`, and returns whether it finished.
    - It checks the stage again while holding the Styling, so one whose stage moved since it was read keeps running, Workflow run and all.
    - A stuck Styling ends like any other: what it made switches in, Previews not ready fail, and usage records are written.
    - One that made nothing fails as "something broke", so Try again picks it up.
  - The read contexts gain `stylings`, since a read can now cancel a Workflow run: `getReadContext`, `listConsultations`, `readStylingStatus`, `readUsageSummary` and `checkStylingStart`.
- **Tests.** In `src/server/operations/stylings.test.ts`:
  - "the Styling locks" covers:
    - a second Styling refused while one runs on another of the user's Consultations, for "Get my Outfits" (with no photo check and nothing stored), "Show 2 more Outfits", a Photo Style change and the usage summary, until it finishes;
    - the lock as check 4: before the Outfit Allowance, after the region gate;
    - two "Get my Outfits" at once, the second pressed during the first's photo check, so only the database can stop one;
    - two Stylings started at once on different Consultations;
    - other users left free.
  - "a stuck Styling" covers:
    - the poll at 9:59 and at 10:00, failing as broken with Try again, the Workflow run cancelled and never run, and Try again then starting;
    - a Styling stuck in Previews keeping its Outfits, their Previews failed and both Outfits counted, with no late Preview stored;
    - timing from the last stage move, not the start;
    - My Consultations;
    - "Get my Outfits", "Show 2 more Outfits" and the usage summary;
    - a Workflow run that can't be cancelled.
  - The new `whileEveryAiCall` helper holds every AI call of one kind while the test polls, as if the model hung.
  - **Other test files:** tests that started a second Consultation while the first was still Styling now run the first one before starting the second, in `account`, `consultations`, `photo-consent` and `usage`. One "Show 2 more Outfits" status test now uses two users.
  - With the shared start check's lock bypassed by hand, both tests that race two requests still passed. So the database lock holds on its own, in both `startConsultation` and `startStylingOn`.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - "Workflow run" spelled out in names and comments (`cancelWorkflowRun`), since the glossary avoids "run" for a Styling;
    - a stale comment in deletion;
    - the name of `finishStyling`'s parameter;
    - a comment on a test's clock.
  - **Left as known limits:**
    - Until ticket 38, the operations can't tell the per-Consultation index apart from the per-user lock, so dropping that index fails no test.
    - When two "Get my Outfits" race, the one that loses at the database has already had its photo checked, which counts, and its consent recorded. Then its photo is deleted.
    - Two places turn `AlreadyStylingError` into the refusal.
    - The shared start check reads the user's running Stylings twice: once for the stuck check, then once for the lock. The second read means a Styling that finished on its own in between isn't taken for one still running.
    - The test file's `getMyOutfits` helper matches the one in `usage.test.ts`.
  - **For the team to approve:**
    - the lock's wording;
    - the lock line on New Consultation and in place of the allowance line, which the spec's "Where limits show" doesn't list;
    - the usage summary as a fourth thing that runs the stuck check.
- **Not checked in the browser.** The only UI change is the lock line in `LimitMessage`, and typecheck makes sure the line has its wording.
- **Live calls used:** none.
