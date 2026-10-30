# 02: A Guest gets two Outfits

**What to build:** The tracer bullet. A signed-out visitor presses **Try it as a Guest** on the landing page and lands on the **Guest Page**: the Qurator wordmark tagged "Guest", a **Create an account** button on the right, and nothing else in the header. They go through the same New Consultation steps as a signed-in user. On the Budget Tier step they also give their birth date, Style Preference and Country. "Get my Outfits" opens the consent sheet, which for a Guest also asks them to agree to the Terms and Privacy Policy. Their **Guest Consultation**'s Styling then runs exactly as anyone's does, and they see two Outfits with Previews. Refreshing within the hour brings them back to it. This lays everything later tickets reuse: the guest user, the guest cookie, the Guest Page layout and the guest variants of the New Consultation and results components. Respect [ADR-0013](../../../docs/adr/0013-guest-consultations-are-kept-briefly-not-never.md) (throwaway guest user), [ADR-0004](../../../docs/adr/0004-adults-only.md) (age gate) and [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md) (photo consent).

**Blocked by:** 01 (Operations accept a Guest as well as a signed-in user)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The throwaway guest user", "Who the Guest is: the guest cookie", "Starting a Guest Consultation" (except the Bot Check and the IP limits), "Pages and routes", and "Testing Decisions". Stories 1–23, 27–30, 36–38, 45–46, 50–52 and 58.

- [x] The landing header's "Get started" becomes **Try it as a Guest**, linking to the Guest Page, on every screen width, for signed-out visitors only. "Sign in" / "Open the app" and the closing chapter's "Create a free account" are unchanged.
- [x] The Guest Page has its own route group and layout, outside the signed-in app layout. It never redirects to sign-in. Its tab title is "Guest Page · Qurator", and its header has the wordmark with a "Guest" tag and **Create an account** (to sign-up) only.
- [x] The guest user is a user row marked as a guest. It has a placeholder email and username at a reserved, never-mailed domain, and no password or session. It holds the Guest's Style Preference, Country and age, as a profile does. It's created only when "Get my Outfits" is accepted.
- [x] A start Guest Consultation operation reuses the existing photo check, Photo Type, Budget Tier, Consultation and first-Styling creation. Its input adds birth date, Style Preference, Country, the consent ticks and the Terms agreement. It refuses on the region gate, the age gate (storing nothing for an under-18 entry), missing consent or Terms, and the app-wide caps and backstops.
- [x] Photo consent and the Terms agreement are recorded on the Consultation, through the per-Consultation notice fields the Demo Account uses.
- [x] The guest cookie is signed, HTTP-only and valid for 1 hour, and holds the guest user's id. The viewer resolution from 01 accepts it, for that Guest's own Guest Consultation only.
- [x] Opening the Guest Page with a valid guest cookie shows that Guest Consultation, running or finished. Without one, it shows the New Consultation steps.
- [x] On the Budget Tier step, the guest variant adds the birth-date fields (the sign-up component: no default, no hint of the cut-off), Style Preference and Country. Country is pre-filled from the IP country when it's on the Country list. Missing fields are named under "Get my Outfits".
- [x] The consent sheet's guest variant opens every time and adds the Terms and Privacy tick. The line under "Get my Outfits" says it uses the Guest's one Guest Consultation.
- [x] The guest's Stylist runs with everyone's Styling limits, and its Outfits are recorded as usage, so they count toward the app-wide caps.
- [x] New strings live in the copy config.
- [x] Tests at the operation seam through the harness:
  - accepted with every field;
  - each missing field, consent or Terms refused;
  - under-18 refused with nothing stored;
  - region gate and app-wide caps refused;
  - the Styling runs to two Outfits readable with the guest cookie, and not from another browser;
  - Guest Outfits counted toward the app-wide caps.
- [x] Playwright happy path: **Try it as a Guest** from the landing page; the Guest Page header has only the wordmark, "Guest" tag and **Create an account**; a Guest Consultation with the fake AI shows two Outfits.

## Comments

- 2026-10-30: A Guest gets two Outfits from the Guest Page.
  - **The guest user** (migration `0027_guest_users`). A user row with `is_guest`, a placeholder email and username `<id>@guest.invalid` (`GUEST_EMAIL_DOMAIN`), no password, account row or session. It holds the Style Preference, Country and age group. A check constraint keeps an account's birth year and month and a guest user's age group apart, so no guest row can hold a birth date. It's inserted in the same transaction as the Consultation and its first Styling, so only an accepted photo makes one.
  - **Starting a Guest Consultation** (`startGuestConsultation` in `src/server/operations/guest-consultations.ts`). It refuses, in this order and before the photo is checked: the region gate; the age gate, as at sign-up (a blocked browser, a date that isn't real, or one not 18 everywhere, with an under-18 date blocking the browser); a missing Style Preference or Country; the photo boxes; the Terms box; then the app-wide caps and backstops (`checkAppWideStylingStart`, the shared start check without a user's lock or Outfit Allowance). It then reuses `startConsultation`'s photo check and Consultation creation, now `checkPhoto` and `createConsultation`, and sets the guest cookie. Its Stylings are not the Demo Account's, so they have everyone's limits and record Outfit usage, which the app-wide caps count.
  - **The guest cookie** (`src/server/guests/guest-cookie.ts`). An HMAC of the guest user's id and its expiry, under Better Auth's secret (`auth.cookieSecret`). It's HTTP-only, lasts an hour from "Get my Outfits", and is refused after the hour by the server's clock too. `readViewer` falls back to it when nobody is signed in, and now needs `db` and `clock`. It still opens only the guest user's own Consultation, and grants nothing that reads the signed-in user.
  - **The Guest Page** (`/guest`, route group `(guest)`). The layout is `AppFrame`, the frame shared with the app's layout, holding the wordmark, a "Guest" tag and **Create an account**. `readGuestPage` decides what the page opens on: the Guest Consultation, running or finished; the New Consultation steps, with the Country from the IP country; or a closed state for an age-gate-blocked browser, the region gate or a cap. The page reuses `NewConsultation` with a `guest` variant (`GuestDetails` beside "Get my Outfits", the Guest Consultation line), the consent sheet's `"guest"` notice (a third box for the Terms and Privacy Policy, and the guest retention line), `StylingInPlace` and `ConsultationResults`. Both of those are now shared with the Consultation page.
  - **Landing.** "Get started" is now **Try it as a Guest**, shown at every width to signed-out visitors only. Both header pills drop their glyph and some padding on phones, and below 375px the wordmark shrinks so they fit. The landing e2e checks the button instead of clicking "Get started".
  - **Tests.** `guest-consultations.test.ts` covers each case the ticket lists, plus the age gate's three verdicts, the Stylist's 30 turns, the Qloo signals the details steer, the agreements kept on the Consultation, the cookie's hour and signature, and what the Guest Page opens on. `e2e/guest-page.spec.ts` is the happy path. The full Vitest and Playwright suites pass. In one full Playwright run the guest test timed out with its Styling still at "Generating Previews (2 of 2)". It passed alone, after the app-pages spec, and in the next full run.
- 2026-10-30: Choices the ticket left open:
  - **Terms agreement.** It's recorded with the photo consent, through the Consultation's notice fields: the Guest's sheet sends only when all three boxes are ticked, and the server refuses without the Terms box. Sign-up stores no Terms agreement either. The guest wording shares `PHOTO_NOTICE_VERSION`, as the Demo Account's variant does.
  - **The sheet opens on every Guest press**, a rejected photo's one-tap switch included. The agreement doesn't carry over the way the Demo Account's does.
  - **A signed-in visitor opening `/guest` goes to the app.** Their session is the viewer, so a guest cookie in that browser couldn't open the Guest Consultation.
- 2026-10-30: For later tickets, from the review:
  - **Don't ship 02 without 03.** The Guest Page shows no re-styling controls (`ConsultationResults` with `usage={null}`), but "Show 2 more Outfits" and the Budget Tier and Photo Style changes still accept a guest viewer on the server until 03's `guest` refusal. The page also hides **Try again**, so a Guest whose first Styling broke can't retry it until 03 shows it.
  - **04:** a Guest's photo checks aren't counted yet (`checkPhoto`'s `counted` is a no-op for guests).
  - **06:** nothing outside the guest files reads `is_guest` yet. The daily sweep's unverified-account and inactivity rules, and any user count, still treat guest users as accounts (ADR-0013's consequence).
  - **`/domain-modeling`:** "guest user", "guest cookie" and "viewer" are code vocabulary, not yet in `GLOSSARY.md`.
