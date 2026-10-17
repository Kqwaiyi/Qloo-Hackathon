# 20: Settings: profile, password and signing out everywhere

**What to build:** A Settings page where users keep their profile right and secure their account. They can change their username, Style Preference and Country, which affect only new Consultations; see their date of birth read-only, with a way to report a mistake; change their password; and sign out of every device. The Privacy section links the policies and says how to ask for a copy of their data.

**Blocked by:** [18 Email sending and verification](18-email-verification.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Pages" (Settings: Profile, Sign-in, Privacy), "Server operations" (Account: update the profile, sign out of all devices), "Accounts" (Sign-up: Updates; Username and password; Password change), "Email" (Password changed) and "User-facing copy" (Sign-in and account). Stories 42, 48–50, 54–56 and 139.

- [x] Profile: change the username (Better Auth's rules apply, and the old name is freed at once), the Style Preference and the Country. Changes affect only new Consultations, because each Consultation keeps the values it was made with.
- [x] The date of birth shows read-only as "Born <Month YYYY> · Wrong? Email us", linking to the team's contact address from config. The server refuses changes to the birth fields through `updateUser`.
- [x] Sign-in section: the email address, a password change that asks for the current password, and "Sign out of all devices", which needs no confirmation.
- [x] Changing the password signs out the user's other devices and sends the password-changed email, which says to reset the password and contact the team if it wasn't them. This email goes only for changes made in Settings.
- [x] "Sign out of all devices" ends every sign-in, this one included.
- [x] Privacy section: links to `/privacy` and `/terms`, and "Email us for a copy of your data".
- [x] Tests cover profile updates, the refused birth-field update, and the password change's side effects.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **Operations.** `src/server/operations/account.ts` holds the three Settings operations. Each posts to Better Auth's own endpoint through `postToAuthEndpoint`, so Better Auth's rate limits apply in production.
  - `updateProfile` posts to `/update-user`.
    - `checkProfile` in `src/server/accounts/profile.ts` applies Better Auth's username rules and checks the Style Preference and Country against their lists. It then builds `name`, `username` and `displayUsername` from the username as typed.
    - `usernameProblem`, in the same file, reads Better Auth's username error codes. Sign-up uses both.
    - A taken username, ignoring case, gets "That username is taken". The old name is free at once.
  - Consultations already kept the Style Preference, Country and age group they started with, and re-stylings read them from the Consultation. So a changed profile reaches only new Consultations, and a test now pins this.
  - `changePassword` checks 8–128 characters, then posts to `/change-password`. A wrong current password, or one over 128 characters, gets "That isn't your current password." Better Auth's limit of 3 tries per IP in 10 seconds applies.
  - `signOutEverywhere` posts to `/revoke-sessions`, which ends every session, then signs this browser out to clear its cookie. It lands on sign-in with "You're signed out on every device."
- **Hooks in `createAuth`.** They shape `/change-password` for every caller: our form, a direct HTTP call, or `auth.api`.
  - A `hooks.before` forces `revokeOtherSessions: true`, so a change always signs out the other devices. This device gets a new session.
  - A `hooks.after` sends the password-changed email (`passwordChangedEmailSender` in `src/server/auth/emails.ts`) once the change succeeds. A reset goes through `/reset-password` and sends none.
  - The password has changed by the time the email goes, so an email the caps stop, or that fails, is only logged and the change stands.
- **The birth fields.** `birthYear` and `birthMonth` were already `input: false`, which makes Better Auth refuse them through `/update-user` with `FIELD_NOT_ALLOWED`. A test now covers it.
  - **For ticket 36:** the Demo Account's date-of-birth change needs its own operation, since `updateUser` will keep refusing the fields.
- **The team's address.** The spec keeps the team Gmail's address in the environment only, as `GMAIL_USER`.
  - `teamGmailAddress()` in `src/server/email/gmail.ts` reads it, for the transport and the contact address alike.
  - `services.ts` resolves it once as `teamEmail` and passes it to `createAuth` for the password-changed email. Tests pass `team@example.test`.
  - Pages read it through `getTeamEmail()` in `src/server/data/team.ts`.
  - Where `GMAIL_USER` isn't set (previews, and local development without `.env.local`) it's `team@outfit-recommender.invalid`.
  - **For tickets 21, 31 and 32:** the email-change approval email, the deletion copy and the Privacy Policy can use the same `teamEmail`.
- **A fix outside the ticket.** After a server action sets a cookie, Next.js renders the page again in the same request. `cookies()` then holds the new cookies, but `headers()` still holds what the browser sent.
  - `getReadContext` and `getOperationContext` (`src/server/app/context.ts`) now take the cookie header from `cookies()`.
  - Without this, a password change rendered Settings as signed out, and the browser bounced to New Consultation.
- **Pages.**
  - Settings has three sections: Profile, Sign-in and Privacy. Danger, withdrawing photo consent and the pending email-change step come with tickets 31, 25 and 21.
  - The username, Style Preference and Country fields moved to `src/components/profile-fields.tsx`, shared with sign-up.
  - Settings has no live "username taken" check, since Better Auth's check reports the user's own name as taken. The server refuses a taken name on save.
  - The sorted Country list is `COUNTRY_OPTIONS` in `src/config/countries.ts`. The hint line under a field is `fieldHint` in `src/components/ui.ts`.
- **Tests.** `account.test.ts` covers:
  - **Profile:**
    - saving the profile;
    - the old username freed at once;
    - a taken username refused, ignoring case;
    - a change of case only;
    - invalid fields changing nothing;
    - only new Consultations taking the changed profile.
  - **Birth fields:** refused through `/update-user` and `auth.api`.
  - **Password change:**
    - the new password working and the old one not;
    - a wrong current password;
    - the 8–128 rule;
    - other devices signed out while this one stays;
    - the notice email's wording;
    - no notice for a failed change or a reset;
    - the change standing when the email fails;
    - a signed-out visitor;
    - the rate limit.
  - **Direct calls:** a direct `/change-password` call that asks to keep the other devices still signs them out and sends the notice, and `auth.api` sends it too.
  - **Signing out everywhere:** "Sign out of all devices" ends every session of that user, and only theirs.
- **Checked in the browser.** Two throwaway Playwright runs against local development covered the whole page:
  - the read-only date of birth and its mailto links, with the real address rather than the fallback;
  - saving the profile and reloading;
  - a taken username;
  - signing in elsewhere with the new name;
  - a wrong, then a right, current password;
  - the other device signed out, and the notice email in `.data/inbox`;
  - "Sign out of all devices";
  - no sideways scroll at phone width.

  The four smoke tests still pass.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - Sign-up and Settings shared the profile checks, the body and the username error codes in two copies. Both now use `src/server/accounts/profile.ts`, and `signUpInputSchema` extends `profileInputSchema`.
    - The team's address moved out of `src/config` and is now injected. Config stays plain constants, and the email reads no global.
    - `UsernameField` takes `taken` and `invalid` instead of a ternary at each caller. The field-hint class name is shared.
    - The email no longer says the password was changed "in Settings", since a direct call sends it too.
    - The data mailto's subject is "My data", which fits a correction as well as a copy.
    - Log lines follow the "Label:" format, the user type is reused, and `birthMonthAndYearText` is named for what it returns.
  - **Left as known limits:**
    - The new-password field is written three times: sign-up, reset and Settings. They differ in label, and in whether the field is controlled.
    - The two Settings forms share a submit-and-notice shape without a shared component.
    - A direct `/update-user` call can set `displayUsername` without `username`, or `username` without it. Only the user ever sees their display name, and sign-in uses `username`.
    - With emails paused, or Gmail failing, a password change goes through without its notice.
    - A production deploy without `GMAIL_USER` would show the `.invalid` address. Its emails would fail too.
  - **For the team to approve:**
    - The spec says the password-changed email is "sent only for changes made in Settings". It goes for every `/change-password` call, direct ones included, so someone holding a stolen sign-in can't change the password unnoticed. Resets still send none.
    - Wording the spec doesn't fix:
      - the email's sentences;
      - "Saved. Your next Consultations use it; earlier ones keep the profile they were made with.";
      - "Password changed. Your other devices are signed out." and "That isn't your current password.";
      - the hint "Changing it signs you out on your other devices.";
      - "Ends every sign-in to your account, this one included.";
      - the sign-in line "You're signed out on every device.";
      - the Privacy line's "or to correct it. We answer within a month.", from story 139, which ticket 32's Policy text must match;
      - the mailto subjects "My date of birth is wrong" and "My data".
