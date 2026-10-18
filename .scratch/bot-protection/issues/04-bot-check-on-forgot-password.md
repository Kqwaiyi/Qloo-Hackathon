# 04: Bot Check on forgot-password

**What to build:** Asking for a password reset needs a passing Bot Check, so a bot can't send reset emails to real users' addresses until the shared email cap stops every email for a day. The check runs before any address is looked up, so every address still gets the same answer, whether or not it has an account.

**Blocked by:** 02 (Bot Check on sign-up)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The Bot Check", "Sign-up and password reset refusals" (password reset's `bot-check-failed`), "Forms and copy" (the forgot-password form). Stories 9 and 10.

- [ ] The Bot Check's endpoint list adds request-password-reset.
- [ ] The password-reset request's input carries the Bot Check token from the form through the forwarding helper.
- [ ] The password-reset request gains a `bot-check-failed` refusal. The forgot-password form shows the shared Bot Check message and resets the widget.
- [ ] The forgot-password form renders the Turnstile widget like the sign-up form.
- [ ] Tests at the operation seam and by direct post: a missing or rejected token is refused and sends no email, and a good token sends the reset email as today.
- [ ] Tests: with a good token, an address with no account and one with an account get the same answer, as today.
