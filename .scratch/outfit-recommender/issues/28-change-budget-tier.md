# 28: Change the Budget Tier

**What to build:** A user who sent a body photo changes the Budget Tier from the results header and gets new Outfits from the same Style Icons at the new price point. As with a Photo Style change, the new Outfits replace the current ones only on success; otherwise the user keeps the old tier's Outfits and is told why.

**Blocked by:** [15 Budget Tiers with thin-pool widening](15-budget-tiers-widening.md), [27 Change the Photo Style](27-change-photo-style.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Stylings" (the Budget Tier change row; Finishing), "Outfit assembly" (De-duplication), "Outfit Allowance, limits and backstops" (No reuse), "Pages" (Results page header; Styling step) and "User-facing copy" (Styling and results). Stories 112 and 114.

- [ ] A body photo's results header has a Budget Tier dropdown, with the allowance line beside it, disabled with the time when the usage summary says no Styling can start. A Face Photo has none.
- [ ] A change starts a Styling of kind "Budget Tier change" through the shared start check. It enters at Brands from the top of the current Style Icons, with de-duplication over the Outfits it builds.
- [ ] On success, the new Outfits and Budget Tier switch in together, replacing the current Outfits.
- [ ] On failure, the old Outfits stay, with "We couldn't build Outfits at <tier> for this photo. Your <previous tier> Outfits are still here."
- [ ] The Styling step returns with Checking your photo and Finding Style Icons already ticked.
- [ ] It works from a Consultation with "No Outfits".
- [ ] Switching back to an earlier tier builds new Outfits; nothing is reused beyond the Qloo cache.
- [ ] Tests cover a Budget Tier change switching in only on success, and a failed one keeping the old Outfits.
