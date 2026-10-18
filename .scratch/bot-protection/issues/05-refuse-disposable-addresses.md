# 05: Refuse Disposable Addresses

**What to build:** Signing up with a Disposable Address is refused with "This email provider isn't accepted. Please use a different address.", and so is changing an account's email to one, through the forms or by a direct post. Accounts that already have a Disposable Address keep it. The list of throwaway-inbox domains is bundled into the app and kept with the team's other curated lists.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Disposable Addresses", "Sign-up and password reset refusals" (sign-up's `disposable-address`), "Forms and copy" (the Disposable Address message). Stories 5, 15, 16 and 31.

Note: 02 and 06 also edit the sign-up hook. Run this ticket one after another with them, not in parallel.

- [ ] A list of throwaway-inbox domains, seeded from a maintained open-source list, lives with the team's other curated lists. Note where it came from, so the team can refresh it.
- [ ] An address matches when its domain, or any parent domain, is on the list, compared case-insensitively.
- [ ] The existing sign-up hook refuses a matching address, and sign-up returns a new `disposable-address` refusal that the form shows with the message above.
- [ ] The existing email-change hook refuses a matching new address, and the email form shows the same message.
- [ ] Tests at the operation seam and by direct post: a listed domain and a subdomain of one are refused at sign-up and at email change, while ordinary domains (including the e2e tests' `example.com`) go through.
- [ ] Test: an account that already has a Disposable Address can still sign in and use the app.
