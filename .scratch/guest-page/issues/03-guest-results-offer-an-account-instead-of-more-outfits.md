# 03: Guest results offer an account instead of more Outfits

**What to build:** Once a Guest's two Outfits are shown, they can't make more. Where a signed-in user sees "Show 2 more Outfits", a Guest sees **Create an account to get more consultations**, with a line saying their guest results won't carry over. The Budget Tier dropdown and Photo Style editor are hidden after the Outfits are shown. The server refuses those Stylings for a guest user whatever the page shows. A Guest whose Styling made no Outfit, or got stuck, can still recover it, so a failure never costs them their Guest Consultation.

**Blocked by:** 02 (A Guest gets two Outfits)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Restylings a Guest can't have". Stories 31–35.

- [ ] Show more Outfits, change Budget Tier and change Photo Style refuse a guest user with a new `guest` refusal.
- [ ] Try again on a failed Styling, and the existing stuck-Styling recovery, still work for a guest user.
- [ ] Reading a Consultation returns an "is a Guest" flag, and the results page uses it to hide the Budget Tier dropdown and Photo Style editor and to swap "Show 2 more Outfits" for **Create an account to get more consultations** (to sign-up) and the "won't carry over" line.
- [ ] A signed-in user's results page is unchanged.
- [ ] Tests at the operation seam:
  - each of the three refused with `guest`;
  - Try again allowed after a failure that made no Outfit;
  - the read view's guest flag set for a Guest and unset for a user.
- [ ] The Playwright happy path from 02 also checks "Create an account to get more consultations" where "Show 2 more Outfits" would be.
