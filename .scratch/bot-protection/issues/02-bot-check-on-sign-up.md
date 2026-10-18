# 02: Bot Check on sign-up

**What to build:** A visitor signs up through Cloudflare Turnstile's widget, which most people never see, and a script posting straight to the sign-up endpoint without a valid token is refused. When Cloudflare can't be reached, sign-up goes ahead anyway and the fail-open is logged. This is the tracer bullet: it lays everything the other Bot Check tickets reuse. That means the Turnstile transport seam and its fake in the test harness, the Bot Check hook, the token's path from form to server action to Better Auth, the off-unless-configured switch, the environment docs, the copy, and e2e on always-pass keys. Respect [ADR-0006](../../../docs/adr/0006-bot-check-fails-open-in-our-own-hook.md): our own `before` hook, not Better Auth's captcha plugin.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The Bot Check", "Sign-up and password reset refusals" (sign-up's `bot-check-failed`), "Forms and copy" (the sign-up form), and "Testing Decisions" (all three seams). Stories 1–4, 12–14, 25–30 and 32–35.

- [x] The Turnstile verify call is a transport passed into the auth setup, as the Qloo client takes its transport. The real one calls Cloudflare's verify endpoint with the secret, the token and the visitor's IP address as Better Auth reads it.
- [x] One Better Auth `before` hook runs the Bot Check on the sign-up-by-email endpoint. The endpoint list lives in the account rules, so 03 and 04 only add entries.
- [x] Verdicts:
  - a good token goes on;
  - a missing token, or one Cloudflare rejects (invalid, expired, already used, or wrong hostname on Production), is refused with a Bot Check error code;
  - only a network error, a 5xx answer, or no answer within 5 seconds fails open, writing one runtime-log line with the endpoint and the reason.
- [x] A call with no request headers (a team script's) skips the Bot Check, as it skips the region gate.
- [x] The shared forwarding helper takes an optional Bot Check token and sets it as `x-captcha-response`, overriding any such header the browser sent. Sign-up's input carries the token from the form.
- [x] Sign-up gains a `bot-check-failed` refusal. The form shows "We couldn't check that you're not a bot. Please try again." and resets the widget.
- [x] The sign-up form renders the Turnstile widget with `appearance: interaction-only` and `refresh-expired: auto`.
- [x] Configuration:
  - a Turnstile site key (which reaches the form) and a Turnstile secret (server only), documented in the example env file next to the AI provider;
  - with no secret, the Bot Check is off and no widget renders;
  - on Production, a missing secret is an error at startup;
  - the 5-second timeout lives in the account rules.
- [x] The test harness gains a fake Turnstile transport, modelled on the fake Qloo transport. It answers pass, reject (with an error code), unreachable or slow as a test sets, and records each request's token and IP. The harness turns the Bot Check on with it, and the test browser sends a passing token, so existing tests keep passing.
- [x] Tests at the operation seam, through the sign-up operation and through the harness's direct post: each verdict (pass, rejected, missing, unreachable, slow past 5 seconds), the fail-open log line, the visitor's IP reaching Cloudflare, header-less calls skipping the check, and the check being off with no secret configured.
- [x] Playwright's dev server runs with Turnstile's always-pass test keys, and the existing sign-up smoke test passes through the widget.

**Notes from implementing:**

- Built on what the ticket 01 session had already started in this checkout (`src/server/auth/bot-check.ts`, `fake-turnstile.ts`, `src/components/bot-check.tsx`). The transport type and verify call live in `bot-check.ts`, and the fake in `src/server/auth/fake-turnstile.ts`. Tests are in `src/server/operations/bot-check.test.ts` (operation seam) and `src/server/auth/bot-check.test.ts` (environment).
- A token from the form replaces the browser's header. A browser's own `x-captcha-response` header still reaches Better Auth when the form sends none, which is how a direct post carries its token. The test browser sends a passing token that way, so existing tests needed no changes.
- On Production, a token must have been made on one of the app's own hostnames (the base URL and the Vercel URLs).
- The form waits for the widget's token on submit. A form sent before the widget had a token used to send an empty one and get refused: the e2e caught it.
- `npm test` at the default worker count timed out one file's `beforeAll` (`send-email.test.ts`, the known Windows flake). That file passes alone, and the whole suite passed (604/604) with `npx vitest run --maxWorkers=4`.
- `npm run typecheck` is clean once the stale `.next/types` is cleared.
- e2e: only `e2e/sign-up.spec.ts` was run (2/2, with `PLAYWRIGHT_CHANNEL=chrome` and placeholder Qloo variables). The other specs sign up through `signUpNewUser` too and should pass the same way, but weren't run.
