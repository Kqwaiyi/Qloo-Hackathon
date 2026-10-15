# 38: Demo Account: unlimited Consultations with per-Consultation consent

**What to build:** Judges can try the app freely on the Demo Account: no usage limits, and one judge's Styling never blocks another's. Each judge gives their own consent before every Consultation, and the consent sheet and My Consultations tell them plainly that anyone with this login can see the Consultations made there.

**Blocked by:** [23 App-wide caps and the Qloo backstop](23-app-wide-caps-qloo-backstop.md), [30 Styling locks and stuck Stylings](30-styling-locks-stuck.md), [36 Demo Account: creation script and managed settings](36-demo-account-managed-settings.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Demo Account" (Exemptions; Still applies), "Consent" (The Demo Account), "Outfit Allowance, limits and backstops" (The Demo Account), "Stylings" (How many Outfits; Locks) and "User-facing copy" (Demo Account). Stories 130–132 and 135.

- [ ] The Demo Account is exempt from the Outfit Allowance, the photo-check limit, the app-wide caps and the Qloo backstop. No usage records are written for it, so its Outfits don't count towards the app-wide caps, and its Stylings always make up to 2 Outfits.
- [ ] It has no per-user Styling lock, so two judges can style different Consultations at the same time. The per-Consultation lock still applies.
- [ ] The consent sheet appears before every Consultation on it, and the acceptance (version and time) is stored on that Consultation instead of on the user.
- [ ] The consent sheet and My Consultations show "Shared demo account: anyone with this login can see Consultations made here. Delete yours when you're done."
- [ ] The photo check, the region gate and 18+ on its date of birth still apply.
- [ ] Tests cover the Demo Account's exemptions, per-Consultation consent, and two simultaneous Stylings on different Consultations.
