# 03: Guest results offer an account instead of more Outfits

**What to build:** Once a Guest's two Outfits are shown, they can't make more. Where a signed-in user sees "Show 2 more Outfits", a Guest sees **Create an account to get more consultations**, with a line saying their guest results won't carry over. The Budget Tier dropdown and Photo Style editor are hidden after the Outfits are shown. The server refuses those Stylings for a guest user whatever the page shows. A Guest whose Styling made no Outfit, or got stuck, can still recover it, so a failure never costs them their Guest Consultation.

**Blocked by:** 02 (A Guest gets two Outfits)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Restylings a Guest can't have". Stories 31–35.

- [x] Show more Outfits, change Budget Tier and change Photo Style refuse a guest user with a new `guest` refusal.
- [x] Try again on a failed Styling, and the existing stuck-Styling recovery, still work for a guest user.
- [x] Reading a Consultation returns an "is a Guest" flag, and the results page uses it to hide the Budget Tier dropdown and Photo Style editor and to swap "Show 2 more Outfits" for **Create an account to get more consultations** (to sign-up) and the "won't carry over" line.
- [x] A signed-in user's results page is unchanged.
- [x] Tests at the operation seam:
  - each of the three refused with `guest`;
  - Try again allowed after a failure that made no Outfit;
  - the read view's guest flag set for a Guest and unset for a user.
- [x] The Playwright happy path from 02 also checks "Create an account to get more consultations" where "Show 2 more Outfits" would be.

## Comments

- 2026-10-30: A Guest's results offer an account instead of more Outfits.
  - **The `guest` refusal** (`GuestRefusal` in `src/server/operations/stylings.ts`). "Show 2 more Outfits" and the Budget Tier and Photo Style changes now start through `startStylingOnUnlessGuest`, which refuses a guest viewer before the shared start check, so it holds whatever else would and starts nothing. Try again still goes through `startStylingOn` alone, so a Guest can try a broken Styling again, and the stuck check in the Styling status poll finishes a Guest's stuck Styling as it does anyone's. The `Viewer` has an `isGuest` flag for this. `checkStylingStart` now takes only the viewer's id and Demo Account flag, so a signed-in user still passes as one.
  - **The read view's flag** (`ConsultationView.isGuestConsultation`). It's set when the viewer is a Guest, whose only Consultation is their Guest Consultation, and unset for a signed-in owner.
  - **The results page** (`ConsultationResults`). It now takes the flag from the Consultation instead of a null `usage`. For a Guest Consultation it hides the Budget Tier dropdown, the Photo Style editor and their allowance line. Where "Show 2 more Outfits" sits, it shows **Create an account to get more consultations**, linking to sign-up, with "Your guest results won't carry over to a new account." under it. Both strings are in the copy config. A signed-in user's page is unchanged.
  - **Try again on the Guest Page.** It shows for a Guest as for anyone. `readGuestPage` gives the Guest Consultation with the Guest's usage summary (`readGuestUsageSummary` in `usage.ts`): `checkStylingStart` for the guest user, and no Outfit Allowance, as the Demo Account's has none. So Try again is disabled with the limit message while an app-wide cap or backstop holds, as it is for a signed-in user. `readUsageSummary` itself stays signed-in only. `tryAgainAction` is told when it's on the Guest Page, so a Guest whose guest cookie has run out isn't sent to sign-in: the page refreshes onto the New Consultation steps.
  - **A Guest's first Styling that built nothing** says only "We couldn't build Outfits for this photo." (`guestFirstStylingBuiltNothing`), without "Try another Budget Tier or Photo Style", which a Guest can't do.
  - **Tests.** In `guest-consultations.test.ts`:
    - each of the three Stylings refused with `guest`, on a Body-Only Photo with Style Icons left, keeping its Outfits, Budget Tier and Photo Style;
    - Try again after a Styling that broke at Style Icons, to two Outfits;
    - a stuck Styling finished by the Guest's own status poll, then tried again;
    - the read view's flag set for a Guest;
    - the Guest Page's usage summary, with and without a cap in force.

    The full-view test in `consultations.test.ts` now has the flag unset for a signed-in owner. `e2e/guest-page.spec.ts` checks **Create an account to get more consultations** (to sign-up) and the "won't carry over" line, and that there's no "Show 2 more Outfits" or "Change Photo Style". The full Vitest and Playwright suites pass.
- 2026-10-30: Choices the ticket left open:
  - **The `guest` refusal comes right after `signed-out`,** before the shared start check and the Consultation lookup, so a Guest is never told about a cap or "already Styling" for something they can't have anyway.
  - **No Budget Tier or Photo Style text in place of the controls.** The Guest's header shows the Photo Type and date only, as the ticket says to hide the controls and doesn't ask for anything in their place.
  - **The account button is the secondary style "Show 2 more Outfits" has,** in the same place, and wraps to two lines on a phone.
- 2026-10-30: For later tickets, from the review:
  - **A Guest whose first Styling built nothing is stuck for the hour.** Try again is only for a Styling that broke, as for everyone, so after "We couldn't build Outfits for this photo." a Guest has nothing to press. Their guest cookie keeps the Guest Page on that Guest Consultation, so they can't start another until it expires. The ticket's "A Guest whose Styling made no Outfit ... can still recover it", and the spec's "A Styling that makes no Outfit can be tried again until it does", may want Try again for this case too, or a fresh start from the Guest Page. That's a product decision, so it's left open here.
  - **Shared test fixtures.** `guest-consultations.test.ts` adds another copy of the made-up Brands and a Brand-or-person Qloo responder, as several test files have. A shared fixture would serve them all.
