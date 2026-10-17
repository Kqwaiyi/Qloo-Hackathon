# 31: Delete account and the team's account scripts

**What to build:** A user deletes their account, confirmed with their password, which removes every Consultation, photo and Preview at once and tells them what providers keep and for how long. The team can do the same for an emailed request, and can correct a user's birth year and month by hand, deleting the account if the correction shows the user is under 18.

**Blocked by:** [17 My Consultations and deleting a Consultation](17-my-consultations-delete.md), [20 Settings: profile, password and signing out everywhere](20-settings-profile-password.md), [22 Outfit Allowance, photo-check limit and the usage summary](22-outfit-allowance-usage-summary.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Accounts" (Account deletion), "Team scripts", "Pages" (Settings: Danger) and "User-facing copy" (Sign-in and account). Stories 138 and 141. [ADR-0004](../../../docs/adr/0004-adults-only.md).

- [x] Settings → Danger → "Delete account" opens a modal saying "This deletes your account and every Consultation, with its photos and Previews, right away. Copies in our providers' systems are gone within a day, and Google's abuse-monitoring copy within 55 days. This can't be undone." It asks for the password only: `user.deleteUser.enabled`, without `sendDeleteAccountVerification`.
- [x] Deleting cancels any running Styling, deletes every Consultation and its Blob objects, strips the user from usage and email-log records, and deletes leftover verification tokens in `afterDelete`.
- [x] Afterwards the user is signed out and lands on the landing page with "Your account has been deleted."
- [x] A team script deletes an account by email through the same path, for emailed requests and under-18 reports.
- [x] A team script corrects a user's birth year and month by hand. If the correction shows the user is under 18, it deletes the account through the same path.
- [x] Both scripts go through the same code paths as the app.
- [x] Tests cover account deletion clearing Blob objects, Consultations, verification tokens and usage-record users, and the under-18 correction.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **Better Auth.** `user.deleteUser` is enabled, with no `sendDeleteAccountVerification`.
  - **Password only.** A `hooks.before` on `/delete-user` refuses a request without a password (`PASSWORD_REQUIRED`), for direct calls too. Better Auth 1.7.10 otherwise deletes on a session under a day old with no password at all.
  - **Rate limit (not in the spec, for the team to approve).** `/delete-user` gets a per-IP `customRules` entry of 3 tries in 10 seconds (`DELETE_ACCOUNT_RATE_LIMIT`). That matches Better Auth's own limit on password changes, since each try checks a password. It isn't a lockout.
- **The one deletion path** (`src/server/accounts/deletion.ts`):
  - `beforeAccountDeletion` runs while the user still exists. It calls `withdrawPhotoConsentOf`, which `withdrawPhotoConsent` now shares (moved to `photo-consent.ts`). That clears the consent first, so a "Get my Outfits" still checking its photo leaves nothing behind. Then it deletes every Consultation through `deleteConsultationOf`: Stylings stopped, Workflow runs cancelled, rows and Blob folders gone. A Blob failure throws and keeps the account; deleting again finishes the job.
  - Better Auth deletes the user, their sessions and their sign-in. The existing `on delete set null` keys strip the user from usage records and the email log, which stay and still count towards the app-wide caps.
  - `afterAccountDeletion` deletes the user's verification rows (`value` = the user's ID), which are the password reset links. Email verification and email-change links are JWTs and store nothing.
  - `deleteAccountOf(ctx, userId)` runs the same two hooks around `internalAdapter.deleteUser`, with no password. The team scripts use it, and **ticket 37's sweep** should too.
  - `createAuth` now takes `blob` and `stylings`.
- **Settings → Danger → "Delete account".** The `deleteAccount` operation posts to `/delete-user` with the password. Its refusals are `signed-out`, `wrong-password` and `rate-limited`. The server action redirects to `/?account-deleted=1`, and the landing page says "Your account has been deleted."
  - `ConfirmDialog` gained a `fields` slot (here the password), and is now a form, so Enter confirms. `onConfirm` can answer false to stay open. This changes the delete-Consultation and withdraw-consent modals too; withdraw was checked in the browser.
  - Wording the spec doesn't fix: the title "Delete your account?", "That isn't your password." and the line under the button.
- **Team scripts** (`npm run team:delete-account -- <email>`, `npm run team:correct-birth-date -- <email> <YYYY-MM-DD>`). They're thin shells over `deleteAccountByEmail` and `correctBirthDate` in `src/server/operations/team.ts`.
  - **Shared wiring.** `services.ts` was split. `src/server/app/environment.ts` (not server-only) builds the database, Better Auth, Blob store and email sender from the environment, and the app and `scripts/team-script.ts` both use it. Each script says which database it's on.
  - **Workflow runs.** A script's Styling runner can only cancel Workflow runs. From outside Vercel it usually can't reach one, so the cancel is logged and the deletion carries on.
  - **The birth-date correction takes the whole date of birth the user emailed.** The review found that judging from year and month alone, counting from the first of the month, could keep a 17-year-old for up to a month, against ADR-0004. So it judges the date with sign-up's own `judgeAge`, 18 to the day in every time zone, and keeps only the year and month. A user who isn't 18 everywhere yet has the account deleted. A date that isn't real, or is still to come, is refused, since a typo would otherwise delete the account.
  - The correction writes through Better Auth's `internalAdapter.updateUser`, because the update-user endpoint refuses the birth fields.
- **For ticket 36 (Demo Account):**
  - The scripts and `deleteAccountOf` don't go through `/delete-user`, so a Demo refusal in that endpoint's `hooks.before` won't stop them. Putting one in `beforeAccountDeletion` would stop the scripts too.
  - Ticket 36's Demo date-of-birth change will be a second path that writes the birth fields.
- **Tests.**
  - `src/server/operations/account-deletion.test.ts` covers:
    - deletion signing out every device;
    - Consultations, photos and Previews going, with a running Styling's Workflow run cancelled;
    - usage-record and email-log users stripped, with the rows kept;
    - a waiting reset link no longer working;
    - the username and email freed;
    - wrong, too-long and missing passwords, including a direct call to Better Auth;
    - the rate limit;
    - a Blob failure keeping the account;
    - the "Get my Outfits" race;
    - other users left alone.
  - `src/server/operations/team.test.ts` covers deleting by email (case ignored, the same clean-up, reset links included), the correction keeping only year and month, under-18 deletion, the day-and-time-zone boundary, invalid and future dates, and an unknown email.
- **Checked by hand:**
  - **In the browser on local development:** the Danger section and modal, a wrong password keeping the modal open with its message, deletion landing on the notice signed out, and the withdraw-consent modal still working.
  - **Both scripts, against throwaway PGlite databases:** an in-memory one and an on-disk one seeded by hand.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - the under-18 rule, as above;
    - the refusal type's name (`DeleteAccountByEmailRefusal`);
    - the names `exitWithUsage` and `confirmDeletion`;
    - a comment that restated the rate limit's numbers.
  - **Left as judgement calls:**
    - `Pick<OperationContext, …>` context types written out in several places;
    - `ctx.auth.$context` read in three places;
    - `beforeAccountDeletion` only calling `withdrawPhotoConsentOf`, kept as the named hook both paths share;
    - each test file's own sign-up helpers, as in every other operations test file.
- **Live calls used:** none.
