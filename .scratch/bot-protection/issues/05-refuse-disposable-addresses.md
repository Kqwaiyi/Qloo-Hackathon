# 05: Refuse Disposable Addresses

**What to build:** Signing up with a Disposable Address is refused with "This email provider isn't accepted. Please use a different address.", and so is changing an account's email to one, through the forms or by a direct post. Accounts that already have a Disposable Address keep it. The list of throwaway-inbox domains is bundled into the app and kept with the team's other curated lists.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Disposable Addresses", "Sign-up and password reset refusals" (sign-up's `disposable-address`), "Forms and copy" (the Disposable Address message). Stories 5, 15, 16 and 31.

Note: 02 and 06 also edit the sign-up hook. Run this ticket one after another with them, not in parallel.

- [x] A list of throwaway-inbox domains, seeded from a maintained open-source list, lives with the team's other curated lists. Note where it came from, so the team can refresh it.
- [x] An address matches when its domain, or any parent domain, is on the list, compared case-insensitively.
- [x] The existing sign-up hook refuses a matching address, and sign-up returns a new `disposable-address` refusal that the form shows with the message above.
- [x] The existing email-change hook refuses a matching new address, and the email form shows the same message.
- [x] Tests at the operation seam and by direct post: a listed domain and a subdomain of one are refused at sign-up and at email change, while ordinary domains (including the e2e tests' `example.com`) go through.
- [x] Test: an account that already has a Disposable Address can still sign in and use the app.

**Notes from implementing:**

- The list is `DISPOSABLE_ADDRESS_DOMAINS` in `src/config/denylists.ts`. It holds the seeded list plus a place for domains the team adds, which a refresh keeps.
- The seeded list is `src/config/disposable-address-domains.ts`. It is the disposable-email-domains project's `disposable_email_blocklist.conf` (CC0) at commit `c619f0a`, 2026-10-18: 9,901 domains, pasted as published, one per line inside a template literal. The file's header gives the source, the commit and how to refresh it: paste the upstream file between the backticks.
  - Before bundling, I checked that every line is a lower-case domain and that there are no duplicates.
  - None of the common providers is listed (gmail.com, googlemail.com, outlook.com, yahoo.com, icloud.com, proton.me), and neither are the domains the tests and scripts use (`example.com`, `example.test`, `example.org`).
- `refuseDisposableAddress` (`src/server/auth/disposable-address.ts`) does the matching. It checks the domain after the last `@` and each parent domain, lower-cased. A value that isn't an address never matches, and Better Auth refuses it as malformed on its own. The error code is `DISPOSABLE_ADDRESS`.
- Sign-up checks it after the age and region checks and before the sign-ups-paused cap. A visitor whose address can never work hears that before being told to come back tomorrow.
  - An address that is both disposable and already taken gets `disposable-address`. That says nothing about whether it's in use.
- An email change checks it once there's a session, before the email cap. Better Auth would otherwise change an unverified user's address at once.
- No Bot Check-style exemption for header-less calls: the team's scripts meet the check too. None of them uses a Disposable Address (the Demo Account is the team Gmail's `+demo` address).
- The forms:
  - The sign-up form shows the message under the email field, marks the field invalid, and clears the message once the address is edited, as it does for `email-taken`.
  - Settings' email form and the verification banner's "Change email" both show it through `changeEmailProblem`.
- Tests are in `src/server/operations/disposable-address.test.ts`:
  - By form and by direct post, at sign-up and at email change: a listed domain is refused, so is a subdomain of one, in any case, and nothing is created or sent.
  - `example.com`, and `mymailinator.com` (a name that only ends in a listed one), go through.
  - An account whose address became a Disposable Address before the rule, an update in the database since nothing else can make one now, can still sign in, get Outfits, change its profile and get a reset link.
- An email change already waiting on its links when this ships can still finish to a Disposable Address, because opening a link doesn't recheck the address. I left this as it is.
- The whole suite passed (669/669) with `npx vitest run --maxWorkers=4`, and `npm run typecheck` is clean.
- e2e: `e2e/sign-up.spec.ts` passed (2/2, with `PLAYWRIGHT_CHANNEL=chrome` and placeholder Qloo variables). So did a throwaway spec, not kept. On Turnstile's always-pass keys it showed the message on the sign-up form, then signed up once the address was changed to `example.com`, and showed it on Settings' email form and in the verification banner.
