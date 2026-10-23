# 06: Stylist's Notes on the results page

**What to build:** Once Outfits appear, the user can open a collapsed "Your AI Stylist's notes" section below them, with one entry for each Styling behind the Outfits on screen. A failed Styling's notes sit under its failure line, so the user can see what went wrong. Notes last as long as the Outfits they explain: a re-styling that replaces those Outfits deletes their notes. The Privacy Policy and the Terms say so.

**Blocked by:** 05 (Stylist's Notes on the waiting screen)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Storage" (which notes are kept), "What users see" and "Consent, legal and landing copy", and "Testing Decisions". Stories 8 and 39–44, and 51.

- [ ] The results page has a collapsed "Your AI Stylist's notes" section below the Outfits, above "Show 2 more Outfits":
  - one entry per Styling behind the current Outfits, oldest first;
  - each labelled by its kind: "First Styling", "Show 2 more Outfits", "Budget Tier changed to Medium", "Photo Style changed to edgy".
- [ ] A failed Styling's notes sit collapsed under its failure line.
- [ ] The first mention on each screen says "AI Stylist".
- [ ] Which notes are kept:
  - a Styling's notes stay while any of its Outfits is current, or while it is the failed Styling whose line the Consultation shows;
  - a Styling that switches in and replaces the current Outfits deletes the notes of the Stylings it replaced;
  - everything goes with the Consultation and the account.
- [ ] A Consultation made before this change shows no notes section.
- [ ] The Privacy Policy lists the Stylist's Notes among what's stored about a Consultation, and says when they're deleted.
- [ ] The Terms' list of what Outfits and Previews are gains a line: the AI Stylist's notes are written by AI and may not always be right.
- [ ] Operations tests check that:
  - notes stay while their Outfits are current;
  - a Budget Tier or Photo Style change that switches in deletes the replaced Stylings' notes;
  - "Show 2 more Outfits" keeps both Stylings' notes;
  - a failed Styling's notes stay under its line;
  - deleting the Consultation or the account deletes them.
- [ ] Playwright tests on the fake AI check that the results page shows the section with one entry per Styling, and that a failed Styling shows its notes under its line. Prior art: the app-pages and new-Consultation end-to-end tests.
