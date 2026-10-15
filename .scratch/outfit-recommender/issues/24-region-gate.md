# 24: Region gate

**What to build:** Outfit Recommender only works where Gemini does. Someone whose request comes from an unsupported country is told the app isn't available where they are: at sign-up before they fill anything in, and on the Photo Type step. They can still sign in, read and delete their Consultations.

**Blocked by:** [22 Outfit Allowance, photo-check limit and the usage summary](22-outfit-allowance-usage-summary.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Region gate", "Accounts" (Sign-up: `hooks.before`), "Server operations" (Start a Consultation, check 2; the other operations that start a Styling) and "User-facing copy" (Region and consent). Stories 27 and 129.

- [ ] The `x-vercel-ip-country` header is checked against the Country list when the sign-up page loads and again on submit (in the sign-up `hooks.before`), when New Consultation opens, and by every operation that starts a Styling, through the shared start check. A missing header counts as allowed, which covers local development.
- [ ] The message is "Outfit Recommender isn't available where you are right now." It mentions neither the Country setting nor VPNs.
- [ ] At sign-up it shows before any field is filled in. On New Consultation it shows on the Photo Type step through the usage summary, and the results actions that start Stylings are disabled.
- [ ] Sign-in, reading and deleting are never region-checked.
- [ ] Tests cover the gate at sign-up, in Start a Consultation and in the shared start check, and a missing header.
