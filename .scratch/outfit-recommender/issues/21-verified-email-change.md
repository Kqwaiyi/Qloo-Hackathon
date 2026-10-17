# 21: Verified email change

**What to build:** A user with a verified email changes it safely: their old address approves the change first, then the new address verifies it, so someone holding only their sign-in can't take the account over. Settings shows which step is pending.

**Blocked by:** [20 Settings: profile, password and signing out everywhere](20-settings-profile-password.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Accounts" (Email change), "Email" (Email-change approval; Email-change verification; caps), "Pages" (Settings: Sign-in) and "User-facing copy" (Sign-in and account). Stories 51 and 52.

- [x] `user.changeEmail.enabled` with `sendChangeEmailConfirmation`: the old address gets the approval email, saying a change to the new address was requested, with the approve link and a line to contact the team if it wasn't them. It doubles as the "your email is changing" notice. After approval, the new address gets the verify link.
- [x] Settings shows which step of an email change is pending.
- [x] An address already in use gets the neutral reply "If that address isn't already in use, we've sent a link to it."
- [x] Email changes count towards the cap of 3 per account per day.
- [x] An unverified user changing their email in Settings gets the immediate change from ticket 18.
- [x] Tests cover the verified path end to end, including the neutral reply.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The operation.** `changeEmail` (`src/server/operations/email-change.ts`) serves Settings and the verification banner alike, replacing ticket 18's `changeUnverifiedEmail`. It posts to Better Auth's `/change-email` through `postToAuthEndpoint`, so Better Auth's limit of 3 in 10 seconds applies in production.
  - It answers `{ awaiting: "approval" }` for a verified user and `{ awaiting: "verification" }` for an unverified one, whose change is still ticket 18's immediate change.
  - Its refusals are `signed-out`, `invalid-email`, `same-email`, `change-limit`, `emails-paused` and `rate-limited`.
- **The approval email.** `sendChangeEmailConfirmation` sends it through `emailChangeApprovalSender` (`src/server/auth/emails.ts`) to the old address.
  - It says who asked for which new address, and gives the approve link and its 24 hours. If it wasn't them, it says the email stays as it is, and asks them to reset their password and email `teamEmail`.
  - It is logged as `email-change`, the one email every change starts with, verified or not. So the cap of 3 a day counts changes across both paths, and the new address's link doesn't use it up.
  - Ticket 18 suggested a kind of its own. That would have let a user make 3 unverified and 3 verified changes in a day.
  - Better Auth ignores a refused email and answers as if it went. So the `/change-email` hook checks the cap for every user, and no longer refuses verified users.
- **After approval.** Opening the approval link makes Better Auth send the new address its link through `sendVerificationEmail`.
  - `verificationEmailSender` tells it apart by its endpoint, `/verify-email`. It sends it as the new kind `email-change-verification`, worded as an email change rather than a sign-up.
  - That kind has its own cap of 3 per account per day, since opening the approval link again sends another link.
  - Opening the new address's link changes the email, marks it verified and signs in the device that opened it.
- **The pending change.** Better Auth's email-change links are signed tokens with no row behind them. So the new `email_change` table (migration `0009`) holds each user's one pending change: the new address, the step, and when its link went.
  - A step is recorded only once its email has gone. Settings shows it while its link works, 24 hours.
  - `afterEmailVerification` ends it once the email has changed.
  - `emailChangeLinkCheck` (`src/server/auth/email-change.ts`), a `hooks.before` on `/verify-email`, reads the token with Better Auth's `verifyJWT`.
    - It lets a link work only for the user's newest change, while its new address is still free.
    - It stops an approval link while the new address's link would be refused, so the page never claims a link went when it didn't.
  - **For ticket 31:** the table's user is `on delete cascade`, so account deletion clears it.
- **Pages.**
  - Settings' Sign-in section has a "New email" field under the address, with a hint saying which path the change takes. A verified user sees the pending step under the address, such as "Changing to <new>. Step 1 of 2: approve it with the link we sent to <old>."
  - Both links land on the new `/email-change` page (`EMAIL_CHANGE_LANDINGS` in `src/config/routes.ts`):
    - after the approval link, it says "Change approved";
    - after the new address's link, it goes on to Settings, which says "Email changed to <new>.";
    - a link that didn't work gets "This link has expired or isn't valid", or a line for the cap or for paused emails.
  - The banner's "Change email" uses the same operation. Its wording moved to `src/components/email-change/`.
- **Tests.** `email-change.test.ts` covers:
  - **the verified path, end to end:** the approval email, the new address's link after approval on any device, and the change signing that device in;
  - **the neutral reply** for an address already in use;
  - **the pending step:** both steps, its 24 hours, and no step for a taken address;
  - **the cap:**
    - counted once per verified change;
    - shared with unverified changes;
    - a taken address refused at the cap like any other;
    - the approval link opened again;
    - changes allowed again 24 hours later;
  - **emails paused**;
  - **direct HTTP and `auth.api` calls**;
  - **the links' 24 hours, and a broken link**;
  - **links stopped** by a newer change, or by an address taken since.

  `email-verification.test.ts` now drives the unverified change through `changeEmail`.
- **Checked in the browser.** Throwaway Playwright runs against local development covered:
  - Settings at each step;
  - the approval opened signed out on another device;
  - the new address's link landing on Settings with "Email changed to …";
  - the used approval link afterwards;
  - another user asking for the now-taken address and getting the same reply with no step;
  - the unverified change from Settings;
  - no sideways scroll at phone width.

  The five smoke tests pass. One passed on its second run, after its first page compile was slow.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - The `/verify-email` link is built in one place.
    - Each step's landing is named once (`EMAIL_CHANGE_LANDINGS`), and the URL uses the step names.
    - Refusal codes come from one table (`emailRefusalCode`).
    - Lookups and lowercasing aren't repeated.
    - `awaiting` is typed as `EmailChangeStep`.
    - The button uses `COPY.changeEmail`.
    - The link-problem wording moved into a messages file.
  - **Left as known limits:**
    - **A taken address shows no step.** Settings shows a pending step only when an email went, so after asking for an address already in use, no step appears. That shows the address was taken. Recording a step anyway would tell the real user a link went when none did. Sign-up already reveals taken addresses.
    - **A taken address doesn't count towards the cap.** It sends nothing, so it isn't counted. That is a second, weak way to probe for accounts, for the same reason.
    - **The approval link is a plain GET, as Better Auth makes it.** A mail scanner that opens links, such as Outlook Safe Links, could approve a change by itself, and someone holding the sign-in would then get the new address's link. An "Approve" button page in front of the link would close this, if the team wants it.
    - **A failed send after approval still says "Change approved".** If the transport fails at that point, Better Auth lands there anyway. The step stays at approval, and opening the link again retries.
    - **Two clocks.** Better Auth times its links by the real clock, and the pending step uses the app's clock. They agree outside tests.
  - **For the team to approve:**
    - **The verified path's reply.** It is "If that address isn't already in use, we've sent a link to <old address> to approve the change." rather than the spec's "…we've sent a link to it.". At that point the link has gone to the old address, so the spec's line would be untrue. The unverified path keeps the spec's line word for word.
    - **Two additions beyond the spec:**
      - the fourth per-account cap, 3 new-address links a day;
      - older links stopping once a newer change replaces them, or their address is taken.
    - **Wording the spec doesn't fix:**
      - both emails' sentences, including the approval email's reset-password link, which goes beyond "contact the team";
      - "Change approved" and its line;
      - the two pending-step lines;
      - "Email changed to <new>.";
      - the hints "We'll ask <old> to approve the change first." and "We'll send a new link there.";
      - "That's already your email." and "You can change your email 3 times a day. Try again tomorrow.", which replace ticket 18's wording;
      - the link-problem headings, and "A newer change, or one that's finished, stops the links of an earlier one.";
      - "Sign in to change your email" and "Go to Settings".
