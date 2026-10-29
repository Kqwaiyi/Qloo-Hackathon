# 06: Guest data is deleted

**What to build:** Trying the app leaves nothing behind. Once a Guest Consultation is an hour old, it is deleted with its guest user, photo and Previews, as an account's deletion deletes everything. This happens whenever any Guest opens the Guest Page, starts a Guest Consultation or reads one, and the daily sweep catches whatever a quiet day leaves, so deletion always happens within 24 hours. No Consultation is deleted while its Styling is running. A Guest who comes back after the hour is told their Guest Consultation has been deleted. Guest users are never treated as accounts anywhere else. Respect [ADR-0013](../../../docs/adr/0013-guest-consultations-are-kept-briefly-not-never.md).

**Blocked by:** 02 (A Guest gets two Outfits), 04 (One Guest Consultation per IP address a day)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Deletion", and "The throwaway guest user" (exclusions). Stories 39, 47 and 53–56.

- [x] A guest cleanup deletes every guest user whose Guest Consultation is an hour old or more and has no running Styling, reusing the account deletion. A Styling stuck past the existing stuck threshold counts as not running. The cleanup also purges guest usage older than 24 hours.
- [x] The cleanup runs in the background of every guest operation (opening the Guest Page, starting and reading a Guest Consultation), so it never slows the request, and in the daily sweep, whose report counts the guest users it deleted.
- [x] A guest cookie whose guest user is gone is treated as absent and cleared. The Guest Page then says the Guest Consultation was deleted, and shows the New Consultation steps or the used-up message from 04.
- [x] Guest users are left out of:
  - the inactivity warnings and deletions;
  - the unverified-account deletion;
  - every email;
  - the Gmail-inbox and Disposable Address rules;
  - any user count.
- [x] Tests at the operation seam, on the test clock:
  - an hour-old Guest Consultation deleted with its photo and Previews (as the existing deletion test checks) when another Guest acts;
  - one whose Styling is running kept until it stops, and a stuck one deleted;
  - the daily sweep deletes leftovers and purges guest usage;
  - the expired cookie is cleared with the deleted message;
  - guest users get no inactivity warning, no unverified deletion and no email.

## Comments

- 2026-10-30: Guest data is deleted.
  - **The guest cleanup** (`src/server/guests/cleanup.ts`, `cleanUpGuests`). It deletes every guest user made `GUEST_CONSULTATION_LIFETIME_SECONDS` (1 hour, `src/config/guests.ts`) ago or more, through `deleteAccountOf`, the account deletion. That deletes the Guest Consultation with its photo and Previews. The guest user is made in the same transaction as its Guest Consultation, so its age is the Consultation's. Each guest user is handled like this:
    - The stuck check (`finishStuckStylings`) runs first, so a Styling stuck past `STUCK_STYLING_MS` is finished, and anything it made counts toward the address.
    - A guest user that still has a running Styling is skipped until the Styling stops.
    - A guest user it can't delete is logged without whose it was, counted, and left for the next cleanup.

    The cleanup then purges guest usage records older than 24 hours (`purgeGuestUsageRecords`, moved out of the sweep's purges).
  - **In the background.** `OperationContext` has a new edge, `afterResponse`: Next.js's `after` in `getOperationContext` and `getReadContext`, and in the test harness an `AfterResponseQueue` that runs only when a test calls `harness.afterResponse.runPending()`. The team scripts' `browserRequests` start the work at once. `readGuestPage` and `startGuestConsultation` both leave the cleanup there first thing (`cleanUpGuestsAfterResponse`). `readGuestPage` covers opening the Guest Page, and coming back to a Guest Consultation on it. The request-less context the scripts use now has a name, `OperationContextWithoutRequest`.
  - **The daily sweep** runs `cleanUpGuests` after the account rules. Its report adds `guestUsersDeleted`, takes `guestUsageRecordsPurged` from the cleanup, and counts guest users it couldn't delete in `failures`. `docs/operations.md` says so.
  - **Guest users aren't accounts.**
    - **The sweep.** The unverified-account deletion, the warned-account deletion and the inactivity warnings all skip `is_guest` (`notAGuestUser`).
    - **Better Auth's emails.** Better Auth's verification and password-reset senders send nothing to a guest user's placeholder address (`isGuestPlaceholderAddress`, beside `guestPlaceholderAddress` in `src/config/guests.ts`). Anyone can ask for those two by address. Better Auth answers as it does for any address. The other two emails, the email-change approval and the password-changed notice, need a session, which a guest user never has.
    - **The Gmail-inbox and Disposable Address rules** already leave guest users out, so they have no new code. A `@guest.invalid` address never reduces to a Gmail inbox, so it can't match. The Disposable Address check only judges addresses sent to Better Auth's sign-up and email change, and a guest user goes through neither.
    - **User counts.** The app has none (no count of the user table outside tests). The sweep report's account counts now leave guest users out.
  - **Coming back after the hour.** `readGuestPage` sets `guestConsultationDeleted: true` on the New Consultation, used-up and closed views when the browser holds a guest cookie we signed that opens no Guest Consultation, because its guest user is gone or it's past its hour. The Guest Page then shows the notice (`COPY.guestConsultationDeleted`, `infoNotice`) above the steps or the used-up message. A page can't set cookies, so `ClearDeletedGuestCookie` asks `DELETE /api/guest-cookie` (`clearDeletedGuestCookie`) in the background. A server action would render the page again without the notice. The route clears only a cookie that opens nothing, so a new Guest Consultation's cookie set meanwhile stays.
  - **Tests.**
    - `guest-consultations.test.ts`, "the guest cleanup":
      - an hour-old Guest Consultation deleted with its photo, Previews and guest user, not before the hour and not before the background work runs;
      - the same when another Guest starts one, or comes back to their own;
      - a running Styling kept until it finishes, then deleted;
      - a stuck one deleted with its Workflow run cancelled;
      - guest usage purged in the background.
    - `guest-consultations.test.ts`, "the Guest Page": the deleted notice over the used-up and New Consultation views, then the cookie cleared; a cookie whose guest user is gone within the hour; a cookie that still opens one, and a forged one.
    - `guest-consultations.test.ts`, "a guest user": no password-reset or verification email to its address.
    - `daily-sweep.test.ts`, "guest users": the sweep's deletion and count, a guest user left over a week not deleted as an unverified account, no inactivity warning after 11 months, and one it can't delete left for the next sweep.
    - The full Vitest suite and the Guest Page e2e pass.
    - A throwaway Playwright spec, not committed, checked the notice and the cookie clearing in the real app, with a guest cookie past its hour.
- 2026-10-30: Choices the ticket left open:
  - **The browser keeps the guest cookie a day.** It used to be 1 hour, in the browser and in its signature, so a real browser had dropped it by the time the Guest Consultation was deleted, and nobody could be told. Its signed validity is still the hour (`GUEST_COOKIE_VALID_SECONDS`), so it opens nothing after that. Its Max-Age is now 24 hours (`GUEST_COOKIE_MAX_AGE_SECONDS`), the same as the deletion promise. A Guest who comes back more than a day later sees the plain Guest Page with no notice. Ticket 02's cookie test no longer checks a 1-hour Max-Age.
  - **"Deleted" follows the cookie's hour, not just the row.** A cookie past its hour is said to be deleted even while its guest user still exists. That happens before this request's background cleanup runs, or rarely while a Try again's Styling is still running, or after a cleanup failed. In every case the Consultation can't be opened, and it goes at the next cleanup. Waiting for the row to be gone would miss the most common return: the first visit after the hour on a quiet day, whose own cleanup runs only after the page has gone.
  - **Which operations run the cleanup: opening the Guest Page and starting a Guest Consultation.** That's ADR-0013's "starts or opens". Opening the Guest Page is also how a Guest reads their Guest Consultation. The Styling status polls, price refresh and Try again are the shared Consultation operations, and the polls run every second or so, so they don't run it.
  - **A guest user that can't be deleted fails the sweep run (500).** This matches an account that can't be deleted.
- 2026-10-30: For later tickets, from the review:
  - **07:** the Privacy Policy's cookie wording should say the guest cookie stays in the browser for 24 hours, opening the Guest Consultation for its first hour only. It should read `GUEST_CONSULTATION_LIFETIME_SECONDS` and `GUEST_COOKIE_MAX_AGE_SECONDS`.
  - **Judgement calls from the review, left as they are:**
    - Each test file keeps its own `jpeg()` and Guest input helpers, as the repo's test files do.
    - `cleanUpGuestsAfterResponse` is a thin wrapper, kept because it names what both operations do.
