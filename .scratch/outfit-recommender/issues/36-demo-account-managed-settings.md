# 36: Demo Account: creation script and managed settings

**What to build:** The single shared Demo Account the judges use. A team script creates it the same way every time. Its sign-in details, and anything that could lock other judges out, are managed by the team: Settings shows them with a lock and "Managed by the team", and the server refuses them too. Judges can still change its date of birth (18 or over), Style Preference and Country to see how Outfits change.

**Blocked by:** [21 Verified email change](21-verified-email-change.md), [25 Photo consent sheet and withdrawing consent](25-photo-consent.md), [31 Delete account and the team's account scripts](31-delete-account-scripts.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Demo Account", "Accounts" (Sign-up: Updates; The Demo Account), "Server operations" (Account: change the Demo Account's date of birth), "Pages" (Settings) and "User-facing copy" (Sign-in and account). Stories 133, 134 and 149.

- [x] Config names the Demo Account by email.
- [x] A team script creates it against production through Better Auth's server API: already verified, username `demo`, the team Gmail's `+demo` plus-address as its email (so resets reach the team), the password from an environment variable and never a file, and a date of birth in the 25–29 age group, for example January 2000.
- [x] Its password change, email change, username change, account deletion, consent withdrawal and "Sign out of all devices" show their values disabled, with a lock icon and "Managed by the team", and the server refuses each of them, including through Better Auth's own endpoints.
- [x] Its date of birth, Style Preference and Country stay editable, and its date of birth must stay 18 or over.
- [x] Tests cover each locked operation being refused on the server, and the date-of-birth change including the 18+ rule.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **Which account is the Demo Account.** The spec keeps the team Gmail's address in the environment only (`GMAIL_USER`), so config can't hold the address itself. `src/config/accounts.ts` names the Demo Account as the team address's `+demo` plus-address: `demoAccountEmailOf(teamEmail)`, lowercased.
  - `createAuth` derives it from the `teamEmail` it already takes. The Better Auth instance carries it as `auth.demoAccountEmail`, so anything holding `auth` can tell.
  - `readSignedInUser` sets `SignedInUser.isDemoAccount`. **For ticket 38:** read `user.isDemoAccount` for the exemptions and the per-Consultation consent.
  - **For ticket 37:** the sweeps can skip it with `ne(user.email, ctx.auth.demoAccountEmail)`.
  - The creation script refuses to run without `GMAIL_USER`. Without it, the fallback address would make an account the app on Vercel doesn't treat as the Demo Account. The `GMAIL_USER` in the script's shell must match production's.
- **The creation script.** It runs as `GMAIL_USER=… DEMO_ACCOUNT_PASSWORD=… npm run team:create-demo-account`, a thin shell over `createDemoAccount` in `src/server/operations/team.ts`.
  - It signs up through `auth.api.signUpEmail`, so the sign-up hooks check the date of birth as for anyone else. The account gets:
    - the username `demo`;
    - the Style Preference "No preference" and the Country US;
    - a birth date of 2000-01-01, from `DEMO_ACCOUNT_PROFILE` and `DEMO_ACCOUNT_BIRTH_DATE`.
  - Then it marks the email verified, and ends the session sign-up opened, which nobody holds.
  - The password comes from `DEMO_ACCOUNT_PASSWORD` only, and must be 8 to 128 characters.
  - Its refusals are `invalid-password`, `already-exists` (nothing changes) and `username-taken`.
- **The locks, on the server.** `demoAccountGuard` (`src/server/auth/demo-account.ts`) runs first in `hooks.before`. It covers our forms, direct HTTP calls and `auth.api` calls alike. For the Demo Account it answers 403 `MANAGED_BY_THE_TEAM`, "Managed by the team", on:
  - `/change-password` and `/change-email`;
  - `/delete-user`;
  - `/revoke-sessions`, and also `/revoke-other-sessions` and `/revoke-session`, which sign other judges out just as surely;
  - `/update-user`, when it would change anything but the Style Preference and Country. A username sent unchanged is fine, so the Profile form still saves.

  Each operation turns that code into the refusal `managed-by-the-team`. `withdrawPhotoConsent` isn't a Better Auth endpoint, so it refuses the Demo Account itself.
  - **The team's own paths still work:** `team:delete-account` deletes it (`deleteAccountOf` skips the endpoint), and `team:correct-birth-date` corrects it.
  - **Sign-up with its address** is refused as taken when it comes from a request, like any address already in use. Only a server call, the script, can create the account, so nobody can claim the address before the script runs.
- **The date of birth.** `changeDemoAccountBirthDate` (`src/server/operations/account.ts`) takes the three sign-up fields.
  - It judges the date as sign-up does: 18 to the day, in every time zone (ADR-0004).
  - It keeps only the year and month, through `storeBirthYearAndMonth` (`src/server/accounts/birth-date.ts`), which `correctBirthDate` now shares.
  - Its refusals are `signed-out`, `not-demo-account`, `invalid-birth-date` and `under-18`.
  - A refusal stores nothing and sets no age-gate cookie, since a judge is only trying out a date.
  - `/update-user` still refuses the birth fields, the Demo Account's included, since it would skip the 18+ rule.
- **Settings.** On the Demo Account, each locked item shows its value disabled, with a lock icon and "Managed by the team" (`src/components/managed-by-the-team.tsx`, `COPY.managedByTheTeam`).
  - The values shown are the username and email.
  - The buttons shown disabled are Change password, Sign out of all devices, Withdraw photo consent and Delete account.
  - There's no new-email field and no password fields.
  - **The Profile section** shows "Born <Month YYYY>" and a date-of-birth form. The form starts on the month and year held, with the day blank. Other users still see "Born … · Wrong? Email us".
  - **Shared fields.** Sign-up's Day, Month and Year fields moved to `src/components/birth-date-inputs.tsx`, and both forms use them.
  - **Disabled styles.** The disabled buttons follow "Show 2 more Outfits", and the shared `input` class gained disabled styles.
- **Tests.** `src/server/operations/demo-account.test.ts` covers:
  - **Creation:**
    - a verified `demo` account at the `+demo` address, born January 2000, that signs in with the password;
    - an account that already exists;
    - the 8–128 rule and a taken username;
    - a sign-up with its address refused before the account exists;
    - the team's script still deleting it;
    - resets reaching the `+demo` address and working;
    - nobody else counting as the Demo Account.
  - **Each lock,** refused through our operation, Better Auth's endpoint and `auth.api`, with nothing changed:
    - the password, with no notice email;
    - the email, with no email sent and no pending step;
    - the username, a change of case included;
    - deleting the account;
    - signing out of all devices or of other devices, with both judges still signed in;
    - withdrawing consent, with the Consultations kept.
  - **What stays editable:** the Style Preference and Country, through Settings and directly.
  - **The date of birth:**
    - the new year and month kept;
    - under 18, and turning 18 later today somewhere, refused;
    - 18 everywhere today accepted;
    - unreal dates and a signed-out visitor refused;
    - other users refused;
    - `/update-user` refused.
- **Checked by hand.**
  - **The script, against a throwaway PGlite:** run with no environment, with a short password, to create the account, and a second time.
  - **A dev server on that database,** with throwaway Playwright runs. On the Demo Account, Settings:
    - showed every lock;
    - saved the Style Preference and Country;
    - refused an under-18 date with its line;
    - saved a new date that still showed after a reload;
    - had no sideways scroll at phone width.

    A new user's sign-up and Settings were unchanged.
  - **The five smoke tests** pass.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - Shared wording moved to `src/components/messages.ts` (`PROFILE_SAVED`, `INVALID_BIRTH_DATE`).
    - `UpdateProfileRefusal` now has one member per refusal, so the form's `Exclude` really excludes.
    - The date-of-birth form is named `DemoAccountBirthDateForm`.
    - The script takes the username from config, and the plus tag is private to config.
    - The editable fields are checked against `ProfileBody`'s keys.
    - Sign-ups with the Demo Account's address are refused, as above.
  - **Left as judgement calls:**
    - each form handling `managed-by-the-team` itself;
    - the Demo Account's address carried on the Better Auth instance (`Object.assign`);
    - `storeBirthYearAndMonth` living in the otherwise pure `birth-date.ts`;
    - five `isDemoAccount ? … : …` branches in the Settings page.
  - **Left as known limits:**
    - **Creating the account sends one verification email.** `auth.api.signUpEmail` sends the sign-up email before the account is marked verified. Run from a laptop, the email lands in that laptop's `.data/inbox`, and production's email log counts it once.
    - **Resets stay open,** since the spec gives the account the `+demo` address "so resets reach the team". Only the team can open the link. Still, judges pressing "Forgot your password?" with its address can use up its 3 resets a day.
    - **A changed `GMAIL_USER` moves the Demo Account.** Changing the team address would turn the existing account into an ordinary one, with no locks and the usual limits.
  - **For the team to approve:**
    - deriving the address from the team address, rather than writing it into config;
    - keeping password resets open;
    - also refusing `/revoke-other-sessions` and `/revoke-session`;
    - the starting Style Preference and Country: no preference and the US;
    - wording the spec doesn't fix: "The Demo Account must stay 18 or over.", "Change the date of birth", "Save date of birth", and the script's messages.
- **Live calls used:** none.
