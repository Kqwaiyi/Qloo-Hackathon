# 03: Bot Check on sign-in, with the Demo Account exemption

**What to build:** Signing in, by email or by username, meets the same invisible Bot Check as sign-up, through the form or by a direct post. Judges signing in to the Demo Account, by its email or by the username `demo`, skip the Bot Check, but still meet Better Auth's per-IP sign-in rate limit. The exemption is "for now" (see the spec's Further Notes).

**Blocked by:** 01 (Sign-in goes through Better Auth's endpoints), 02 (Bot Check on sign-up)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The Bot Check" (the Demo Account exemption), "Sign-in" (the `bot-check-failed` refusal), "Forms and copy" (the sign-in form). Stories 7, 8, 22 and 23.

- [x] The Bot Check's endpoint list adds sign-in by email and sign-in by username.
- [x] Sign-in's input carries the Bot Check token from the form through the forwarding helper.
- [x] Sign-in gains a `bot-check-failed` refusal, kept distinct from `credentials-mismatch`. The form shows the shared Bot Check message and resets the widget.
- [x] The sign-in form renders the Turnstile widget like the sign-up form.
- [x] At sign-in only, an identifier that is the Demo Account's email or its username `demo` (compared the way Better Auth compares them) skips the Bot Check.
- [x] Tests at the operation seam and by direct post, for both email and username sign-in: a missing or rejected token is refused, and a good one signs in.
- [x] Tests: the Demo Account signs in with no token, by email and by username, and is still refused by the rate limit after too many tries.
- [x] Existing tests and e2e smoke tests that sign in still pass.

**Notes from implementing:**

- Better Auth compares both identifiers ignoring case and without trimming (`email.toLowerCase()`, and the username plugin's default `username.toLowerCase()`), so the exemption does the same. The Bot Check hook (`src/server/auth/bot-check.ts`) now takes the Demo Account's email and asks `signsInToDemoAccount` in `src/server/auth/demo-account.ts`, which shares its email comparison with the Demo Account's sign-up guard. ADR-0006's Consequences and the README's Demo Account paragraph now name the exemption and that it's "for now".
- The sign-in form now works like the sign-up form: it waits for the widget's token on submit, calls its server action with an input object (`signInInputSchema`), and resets the widget after any refusal. Unlike before, the fields keep what was typed after a refusal, as sign-up's do, so a visitor whose Bot Check failed can simply send it again.
- The sign-in and sign-up forms now share one submit shape: wait for the token, send it, reset the widget after a refusal. 04's forgot-password form would be a third copy, so a helper on `useBotCheck` may be worth it then.
- The site key reader moved from `src/server/data/sign-up.ts` to `src/server/data/bot-check.ts`, since the sign-in page (and 04's forgot-password page) need it too.
- The username `demo` skips the Bot Check whichever account holds it. Only before the team's script has made the Demo Account can someone else take that username (the script then refuses with `username-taken`), so this matters only in that window.
- Tests are in `src/server/operations/bot-check.test.ts`. They cover every verdict (pass, rejected, missing, unreachable, 5xx, slow) for sign-in by form, and pass, missing, rejected, unreachable and slow by direct post, for both email and username. The whole suite passed (639/639) with `npx vitest run --maxWorkers=4`, and `e2e/sign-up.spec.ts`, which signs back in through the real widget on Turnstile's always-pass keys, passed (2/2, with `PLAYWRIGHT_CHANNEL=chrome` and placeholder Qloo variables).
