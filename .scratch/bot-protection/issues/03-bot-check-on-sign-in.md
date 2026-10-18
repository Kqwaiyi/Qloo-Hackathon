# 03: Bot Check on sign-in, with the Demo Account exemption

**What to build:** Signing in, by email or by username, meets the same invisible Bot Check as sign-up, through the form or by a direct post. Judges signing in to the Demo Account, by its email or by the username `demo`, skip the Bot Check, but still meet Better Auth's per-IP sign-in rate limit. The exemption is "for now" (see the spec's Further Notes).

**Blocked by:** 01 (Sign-in goes through Better Auth's endpoints), 02 (Bot Check on sign-up)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The Bot Check" (the Demo Account exemption), "Sign-in" (the `bot-check-failed` refusal), "Forms and copy" (the sign-in form). Stories 7, 8, 22 and 23.

- [ ] The Bot Check's endpoint list adds sign-in by email and sign-in by username.
- [ ] Sign-in's input carries the Bot Check token from the form through the forwarding helper.
- [ ] Sign-in gains a `bot-check-failed` refusal, kept distinct from `credentials-mismatch`. The form shows the shared Bot Check message and resets the widget.
- [ ] The sign-in form renders the Turnstile widget like the sign-up form.
- [ ] At sign-in only, an identifier that is the Demo Account's email or its username `demo` (compared the way Better Auth compares them) skips the Bot Check.
- [ ] Tests at the operation seam and by direct post, for both email and username sign-in: a missing or rejected token is refused, and a good one signs in.
- [ ] Tests: the Demo Account signs in with no token, by email and by username, and is still refused by the rate limit after too many tries.
- [ ] Existing tests and e2e smoke tests that sign in still pass.
