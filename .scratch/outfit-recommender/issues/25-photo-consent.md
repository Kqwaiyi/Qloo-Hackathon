# 25: Photo consent sheet and withdrawing consent

**What to build:** Before a user's first photo is sent, a consent sheet explains in plain English what happens to their photos and asks for two separate agreements: one for storing their photos and having AI process their face and body, and one for sending them to Google's Gemini. Nothing is sent until both are ticked, and the sheet comes back whenever the photo notice changes. In Settings, a user can withdraw consent, which deletes every Consultation but keeps the account.

**Blocked by:** [13 Styling progress checklist](13-styling-checklist.md), [17 My Consultations and deleting a Consultation](17-my-consultations-delete.md), [20 Settings: profile, password and signing out everywhere](20-settings-profile-password.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Consent", "Server operations" (Start a Consultation, check 3; Account: withdraw photo consent), "Pages" (Photo & budget step; Settings: Privacy), "Data model" (Users) and "User-facing copy" (the deletion promise; the withdraw-consent modal; Region and consent), plus "Testing Decisions" (browser smoke flow 2). Stories 57–64. [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md).

- [ ] The photo-notice version lives in config. Each user's accepted version and the time they accepted it are stored.
- [ ] Pressing "Get my Outfits" opens the consent sheet when the user has never accepted, or accepted an older version.
- [ ] The sheet explains in plain English what happens to the photos. It tells the user to upload only photos of themselves, with no nudity, and that a Body-Only Photo can still show their face. It carries the deletion promise, "Your photos and Previews are deleted immediately. Leftover records in our providers' systems are gone within a day, and Google's abuse-monitoring copy within 55 days.", and links to `/privacy` and `/terms`.
- [ ] It has two separate unticked boxes: one for storing photos and having AI process the face and body, and one for sending them to Google's Gemini. Continue stays disabled until both are ticked.
- [ ] Closing the sheet returns to the photo step with the photo and Budget Tier kept and nothing sent, and shows the quiet line "To get Outfits, agree to both boxes on the consent sheet."
- [ ] Start a Consultation, as its third check, refuses without a current acceptance or both ticks, and records the acceptance when the ticks arrive.
- [ ] Settings → Privacy → "Withdraw photo consent" opens a confirmation modal, with no password, saying every Consultation, photo and Preview goes for good and that the consent sheet comes back before the next Consultation. Confirming cancels any running Styling, deletes every Consultation with its photos and Previews, and clears the acceptance. The account stays.
- [ ] Tests cover consent recording, the sheet re-showing on a new version, the server refusal, and withdrawing consent.
- [ ] The New Consultation smoke test from ticket 13 now passes through the consent sheet.
