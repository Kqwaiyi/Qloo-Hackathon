# 13: Styling progress checklist

**What to build:** While Outfits are built, the user watches a checklist tick through Checking your photo, Finding Style Icons, Building Outfits and Generating Previews (n of N), with a note if a step is slow. They can leave and come back: reopening the Consultation mid-Styling shows the checklist again.

**Blocked by:** [12 Previews of the user wearing each Outfit](12-previews.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Stylings" (Progress) and "Pages" (Styling step), plus "Testing Decisions" (browser smoke flow 2). Stories 86–89.

- [ ] The Styling step shows the checklist: Checking your photo, Finding Style Icons, Building Outfits, Generating Previews (n of N), where N is the number of Outfits the Styling will make.
- [ ] The checklist follows the stored stage, polled from the Styling status route about once a second. Workflow's own progress stream isn't used.
- [ ] If one step has taken over 60 s, the checklist adds "This is taking longer than usual."
- [ ] The Outfits appear all at once when the Styling finishes; half-finished cards are never shown.
- [ ] Opening a Consultation whose Styling is still running shows the checklist again.
- [ ] The checklist can start with its earlier items already ticked, so re-stylings can reuse it (tickets 27, 28 and 29).
- [ ] A Playwright smoke test goes New Consultation → Styling checklist → two Outfit cards against local development with the fake adapter. Ticket 25 adds the consent sheet to this flow.
