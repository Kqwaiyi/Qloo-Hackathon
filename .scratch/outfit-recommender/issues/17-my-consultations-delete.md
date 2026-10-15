# 17: My Consultations and deleting a Consultation

**What to build:** A user sees all their Consultations in one list, opens any of them, and can delete one for good after a confirmation, even while it's still Styling: the Styling is cancelled and the photo, Outfits and Previews are removed at once.

**Blocked by:** [12 Previews of the user wearing each Outfit](12-previews.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Server operations" (Delete a Consultation; Read: the list for My Consultations), "Pages" (My Consultations), "Stylings" (Deletion), "Data model" (Deletion) and "User-facing copy" (the delete-Consultation modal), plus "Testing Decisions" (browser smoke flow 4). Stories 119–122.

- [ ] My Consultations lists one row per Consultation with its photo (through a signed link), Photo Type, Outfit count, date and Budget Tier, or "Styling…" or "No Outfits" instead. Each row has Open and Delete.
- [ ] Open shows the Consultation's results page.
- [ ] Delete confirms in a modal that says the Consultation's photo, Outfits and Previews are gone for good.
- [ ] Deleting cancels the Consultation's running Workflow run if there is one, then deletes its Stylings, Style Icons, Outfits and Pieces, plus its photo and Preview Blob objects, in the same operation.
- [ ] A Styling step that tries to save after its Consultation was deleted writes nothing.
- [ ] Tests cover deleting a Consultation mid-Styling.
- [ ] A Playwright smoke test deletes a Consultation from My Consultations.
