# 01: Sign-in goes through Better Auth's endpoints

**What to build:** Signing in, by email or by username, goes through Better Auth's HTTP endpoints the way sign-up and password reset already do, instead of Better Auth's server API. So Better Auth's per-IP rate limit now applies to sign-in. A visitor who signs in too many times from one IP address is told to wait a little. Wrong credentials still all look the same, and nothing locks the account. This is a prefactor: it closes today's gap on its own (the Privacy Policy already implies sign-in attempts are limited) and makes the Bot Check on sign-in (03) a small change.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Sign-in", and "Testing Decisions" (Seam 1, sign-in rate limit). Stories 11, 23 and 37.

- [x] The sign-in operation posts to the sign-in-by-email endpoint when the identifier contains `@`, and to the sign-in-by-username endpoint otherwise, through the shared helper that forwards a server action's request to Better Auth. It no longer calls Better Auth's server API for sign-in.
- [x] The session cookie still reaches the browser on success, as today.
- [x] Every wrong-credentials failure, by email or by username, still returns the one `credentials-mismatch` refusal.
- [x] Better Auth's 429 maps to a new `too-many-sign-ins` refusal, and the sign-in form shows a "too many tries, wait a little" message in the style of the existing too-many-sign-ups one.
- [x] The sign-in rate limit is stated in the account rules next to the sign-up limit, using Better Auth's sign-in default unless there's reason to change it.
- [x] Tests at the operation seam, with a harness that turns rate limits on (as the sign-up rate-limit tests do): repeated sign-ins from one IP address are refused with `too-many-sign-ins`, another IP address is unaffected, and this holds for both email and username sign-in.
- [x] The existing sign-in tests and the e2e smoke tests still pass. (e2e: `sign-up.spec.ts`, which signs back in, passes in Chrome; the Consultation specs need real Qloo keys, which this checkout lacks, so they weren't run.)
