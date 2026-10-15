# 27: Change the Photo Style

**What to build:** A user who wants a different style picks 1–2 words from the Photo Style list in the results header. Qloo picks new Style Icons for that style and new Outfits replace the current ones, but only if the new Styling builds at least one; otherwise the old Outfits stay, with a message saying so. It works for every Photo Type, including a Consultation that ended with no Outfits.

**Blocked by:** [13 Styling progress checklist](13-styling-checklist.md), [14 Body-photo Outfits: Brands become Pieces](14-body-photo-brands.md), [22 Outfit Allowance, photo-check limit and the usage summary](22-outfit-allowance-usage-summary.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Stylings" (the Photo Style change row; Finishing), "Outfit assembly" (De-duplication), "Data model" (Style Icons), "Pages" (Results page header; Styling step) and "User-facing copy" (Styling and results). Stories 113–115. [ADR-0002](../../../docs/adr/0002-photo-style-steers-style-icons.md).

- [ ] The results header has a Photo Style editor that takes 1–2 words from the configured list, with the allowance line beside it. It is disabled with the time when the usage summary says no Styling can start.
- [ ] A change starts a Styling of kind "Photo Style change" through the shared start check. It enters at Style Icons with the new Photo Style, and its Style Icon list becomes current only if the Styling succeeds.
- [ ] De-duplication covers the Outfits it is building.
- [ ] On success, the new Outfits, Style Icons and Photo Style switch in together, replacing the current Outfits.
- [ ] On failure, the old Outfits and Photo Style stay, with the Photo Style version of "We couldn't build Outfits at <tier> for this photo. Your <previous tier> Outfits are still here."
- [ ] The Styling step returns with Checking your photo already ticked.
- [ ] It works from a Consultation with "No Outfits".
- [ ] Tests cover a Photo Style change switching in only on success, and a failed one keeping the old Outfits.
