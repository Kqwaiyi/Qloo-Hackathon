# 26: Show 2 more Outfits

**What to build:** On the results page, "Show 2 more Outfits" builds two new Outfits from the next unused Style Icons and adds them below the current ones, which stay visible meanwhile. Each new Outfit is different: no Brand repeats in a Category across the current Outfits. When the Style Icons run out, the user is told and pointed to another Budget Tier or Photo Style.

**Blocked by:** [13 Styling progress checklist](13-styling-checklist.md), [14 Body-photo Outfits: Brands become Pieces](14-body-photo-brands.md), [22 Outfit Allowance, photo-check limit and the usage summary](22-outfit-allowance-usage-summary.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Stylings" (the "Show 2 more Outfits" row; How many Outfits; Finishing), "Outfit assembly" (De-duplication), "Pages" (Results page: "Show 2 more Outfits") and "User-facing copy" (Styling and results). Stories 107–111 and 115.

- [ ] "Show 2 more Outfits" starts a Styling of kind "more" through the shared start check. It enters at Brands for the next unused Style Icons, fetching Brands as needed within the limit of 6 Style Icons per Styling. For a Face Photo, each new Outfit is the next Style Icon's Hairstyle.
- [ ] The current Outfits stay visible while it runs. The button becomes a compact progress checklist, and the new Outfits appear together, below the current ones, once both are ready.
- [ ] No Brand repeats within a Category across the existing current Outfits and the new ones.
- [ ] With one Outfit left in the allowance, it makes one.
- [ ] The allowance line "Uses <n> of your <left> Outfits left today" sits beside the button, and the button is disabled with the time when the usage summary says no Styling can start.
- [ ] When the Style Icons run out, the button is replaced by "That's every Outfit we can build for this photo. Try another Budget Tier or Photo Style for more." A Face Photo suggests only the Photo Style. A failed "Show 2 more Outfits" keeps the current Outfits and shows the same line in place of the button.
- [ ] Tests cover de-duplication against the current Outfits, the one-left case, and running out.
