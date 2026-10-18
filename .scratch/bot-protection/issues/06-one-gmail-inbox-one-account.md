# 06: One Gmail inbox, one account

**What to build:** One real Gmail inbox can hold only one account. A sign-up, or an email change, whose Gmail address reaches the same inbox as an existing account's (ignoring dots and a `+tag`, and treating `googlemail.com` as `gmail.com`) is refused exactly as if the address were already in use. The Demo Account's `+demo` address is left out of the comparison on both sides. Addresses at other providers are unaffected.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › One Gmail inbox, one account", and "Sign-up and password reset refusals" (the `email-taken` mapping). Stories 6, 17, 24 and 36.

Note: 02 and 05 also edit the sign-up hook. Run this ticket one after another with them, not in parallel.

- [ ] Addresses at `gmail.com` and `googlemail.com` reduce to one inbox: lower-case, drop everything from the first `+` in the local part, remove dots from the local part, and treat `googlemail.com` as `gmail.com`.
- [ ] The existing sign-up hook refuses an address whose inbox matches an existing account's, and sign-up returns the existing `email-taken` refusal.
- [ ] The existing email-change hook refuses such a new address the same way it refuses an address already in use, so the other account stays unseen.
- [ ] The Demo Account's address is left out of the comparison: it neither blocks nor is blocked by the team's own address or other aliases.
- [ ] No schema change: the comparison reduces stored addresses in the query itself.
- [ ] Tests at the operation seam and by direct post: dotted, `+tag` and `googlemail.com` variants of an existing account's Gmail are refused at sign-up and at email change, and a different Gmail inbox goes through.
- [ ] Tests: non-Gmail addresses with dots or `+` are unaffected, and the Demo Account exemption holds.
