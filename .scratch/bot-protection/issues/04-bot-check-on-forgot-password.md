# 04: Bot Check on forgot-password

**What to build:** Asking for a password reset needs a passing Bot Check, so a bot can't send reset emails to real users' addresses until the shared email cap stops every email for a day. The check runs before any address is looked up, so every address still gets the same answer, whether or not it has an account.

**Blocked by:** 02 (Bot Check on sign-up)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The Bot Check", "Sign-up and password reset refusals" (password reset's `bot-check-failed`), "Forms and copy" (the forgot-password form). Stories 9 and 10.

- [x] The Bot Check's endpoint list adds request-password-reset.
- [x] The password-reset request's input carries the Bot Check token from the form through the forwarding helper.
- [x] The password-reset request gains a `bot-check-failed` refusal. The forgot-password form shows the shared Bot Check message and resets the widget.
- [x] The forgot-password form renders the Turnstile widget like the sign-up form.
- [x] Tests at the operation seam and by direct post: a missing or rejected token is refused and sends no email, and a good token sends the reset email as today.
- [x] Tests: with a good token, an address with no account and one with an account get the same answer, as today.

**Notes from implementing:**

- `requestPasswordReset` now takes an input object, `{ email, botCheckToken? }`, parsed by `requestPasswordResetInputSchema` in its server action, as sign-in's does. Every caller in the tests changed with it. The forgot-password form now works like the sign-in form: it submits from JavaScript, so the email typed stays after any answer. It also resets the widget after every answer, a success included, because the form stays for another request and Cloudflare takes each token once.
- The submit steps the three forms shared (wait for the token, send the form, reset the widget) are now one `send` on `useBotCheck` in `src/components/bot-check.tsx`, which replaces its `token()` and `reset()`. The sign-up and sign-in forms use it too.
- `getBotCheckSiteKey` (`src/server/data/bot-check.ts`) now calls `connection()` first. Before this, the forgot-password page was prerendered at build time, which would have opened the database at build and fixed whatever site key it read then. The sign-up and sign-in pages already rendered for each request, so they're unchanged.
- The email field is now marked invalid only for `invalid-email`. Before, the rate-limited and emails-paused refusals marked it invalid too, and so would `bot-check-failed` have, though none of them is about the address.
- The Bot Check hook already runs before the emails-paused check and before Better Auth looks up the address. So with a missing or rejected token, an address with an account and one without get the same `bot-check-failed`, and the tests show it.
- Tests are in `src/server/operations/bot-check.test.ts`:
  - By our form: every verdict (pass, rejected, missing, unreachable, 5xx, slow).
  - By direct post: pass, missing, rejected, unreachable and slow.
  - The same answer for an address with an account and one without, with a good token and with a refused one.
  - Asking for a reset link to the Demo Account's address still needs a token.
  - Password reset works with no secret configured.
- `vi.waitFor` moves fake timers on by its interval (50 ms) at every check, so the "slow" tests had started counting 50 ms late. The forgot-password form's test caught it. The new `untilCloudflareIsAsked` waits without moving time, and all six slow tests use it. With the timer shortened by 10 ms, only the forgot-password form's test fails. The sign-up and sign-in form tests still pass, because their database work after the check is slow enough to hide a 10 ms difference. Their "not before 5 seconds" check is therefore loose. That was the case before this ticket and is left as it was.
- Ticket 02's and 03's direct-post tests also skip the 5xx answer. The 5xx case is covered by form for every endpoint.
- The whole suite passed (656/656) with `npx vitest run --maxWorkers=4`, and `npm run typecheck` is clean.
- e2e: `e2e/sign-up.spec.ts` passed (2/2, with `PLAYWRIGHT_CHANNEL=chrome` and placeholder Qloo variables). So did a throwaway spec, not kept: on Turnstile's always-pass keys, it asked for two reset links through the real widget, and both reset emails reached `.data/inbox`.
