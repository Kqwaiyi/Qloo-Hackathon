# 07: Privacy Policy, Terms and guest copy

**What to build:** A Guest can read exactly what guest mode keeps and for how long. The Privacy Policy gains a Guest section, the Terms cover use as a Guest, and the consent sheet's guest variant states the deletion promise. Every claim matches [ADR-0013](../../../docs/adr/0013-guest-consultations-are-kept-briefly-not-never.md) and the spec's numbers.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Copy and policy". Stories 22, 32, 47–49.

- [x] The Privacy Policy's Guest section says:
  - **What is kept:** the Guest Consultation, its photo and Previews, the age group, Style Preference and Country, the consent and Terms agreement, and a salted hash of the IP address. The raw IP address and the birth date are never stored.
  - **Why:** to run the Styling, and to hold each address to one Guest Consultation and 5 photo checks a day.
  - **For how long:** the Guest Consultation is deleted within 24 hours (usually about an hour), and the hash after 24 hours.
  - **Who receives what:** Cloudflare for the Bot Check, and the AI and product-search providers as for any Consultation.
- [x] The Terms cover use as a Guest: one Guest Consultation a day per connection, and nothing carried over to an account.
- [x] The consent sheet's guest wording, and the "won't carry over" line, live in the copy config, ready for 02 and 03 to use.
- [x] The Privacy Policy's version or last-updated date is bumped as the existing policy does for a change.

## Comments

- 2026-10-30: The Privacy Policy and Terms cover the Guest.
  - **The Privacy Policy's Guest section** (`#guests`, "Using Qurator as a Guest", after "How long we keep it"). It has four parts:
    - **What we keep:** the Guest Consultation (photo, Outfits, Previews, Stylist's notes, photo check findings), the age group, Style Preference and Country, the consent sheet agreement, and a salted hash of the IP address. It says the date of birth and the raw IP address are never stored, and adds the Outfit usage records as anyone's.
    - **Why:** to run the Styling (contract, and consent for the photo), and to hold each connection to 1 Guest Consultation and 5 photo checks in any 24 hours (legitimate interest).
    - **How long:** the Guest Consultation, with everything kept for it, within 24 hours, usually about 1 hour after it starts, never while its Styling runs. The hash after 24 hours. Usage records about 35 days, unlinked once the Guest Consultation goes.
    - **Who receives what:** Cloudflare for the Bot Check, and the AI, product-search and hosting providers as for any Consultation.

    It also describes the guest cookie: valid for 1 hour, kept by the browser for 24 hours (06's note). Every number reads config: `GUEST_CONSULTATION_LIFETIME_SECONDS`, `GUEST_COOKIE_VALID_SECONDS`, `GUEST_COOKIE_MAX_AGE_SECONDS`, `GUEST_CONSULTATIONS_PER_ADDRESS`, `GUEST_PHOTO_CHECK_LIMIT`, `USAGE_WINDOW_HOURS` and `GUEST_USAGE_RECORD_LIFETIME_HOURS` (04's note). The 24-hour deletion promise is a new constant, `GUEST_CONSULTATION_DELETED_WITHIN_HOURS` in `src/config/guests.ts`. Both pages state the promise through `guestConsultationDeleted` in `legal-text.tsx`, so their wording can't drift apart.
  - **The rest of the Privacy Policy, where it would otherwise be wrong for a Guest:**
    - the opening summary;
    - the cookies (the guest cookie, and the age-gate cookie on the Guest Page too);
    - the IP country check filling in a Guest's Country;
    - what a Guest Consultation needs;
    - the Bot Check's purpose and Cloudflare's recipient entry, now naming the Guest Page's photo step before "Get my Outfits" (05's note);
    - a retention line;
    - the consent sheet's third box, asked before every Guest Consultation;
    - who can open a Guest's photo;
    - how long a Guest's photos are kept;
    - what a Guest can change;
    - Adults only.
  - **The Terms.** Agreeing on the Guest Page's consent sheet now counts, as creating an account does. A new "Using Qurator as a Guest" section says:
    - one Guest Consultation of up to 2 Outfits, with no restyling;
    - 1 Guest Consultation and 5 photo checks a day per internet connection, shared on a shared connection, and not to be got around;
    - deletion within 24 hours, usually about 1 hour;
    - `COPY.guestResultsWontCarryOver`.

    "What you may upload" covers a Guest's photos.
  - **The copy config.** The consent sheet's guest wording (`guestPhotosKept`, `whenTheyAreDeleted`, `agreeToTermsAndPrivacy`, `agreeToAllThreeBoxes`) and the "won't carry over" line (`guestResultsWontCarryOver`) were already there from 02 and 03. The sheet's guest variant already states the deletion promise. The Terms and Privacy Policy now reuse `guestResultsWontCarryOver`, and its comment says so.
  - **Tests.** None added. The ticket changes no operation, and the legal pages are outside the spec's two agreed seams (the operations harness and the Guest Page e2e happy path). The typecheck and full Vitest suite pass. Both pages were rendered in the dev server and read through in full, with no console errors.
- 2026-10-30: Choices the ticket left open:
  - **No version or date was bumped.** The Privacy Policy has never carried a version or a last-updated date, and no earlier change to it added one. The only versioned legal text is the photo notice (`PHOTO_NOTICE_VERSION`). It stays at 4 because no consent sheet wording changed. Raising it would make every account holder agree again for nothing.
  - **The Terms agreement is described as part of the consent sheet agreement.** As 02 chose, it's recorded through the Consultation's photo-notice fields. The sheet can't be sent, and the server refuses, without the Terms box. So the policy says the agreement covered the photo notice, the Terms and the Privacy Policy together, and records which photo notice version and when.
  - **"Don't try to get around this"** is added to the Terms for the Guest's daily limit, as the existing Terms say for the Outfit Allowance.
- 2026-10-30: For later tickets, from the review:
  - **Neither 24-hour promise is met by the code in every case.** The spec, ADR-0013, `COPY.guestPhotosKept` and now both pages make them. Without an hourly cron (out of scope) they hold only while Guests keep visiting. On a quiet day:
    - **A Guest Consultation can last about 25 hours.** One made less than an hour before the daily sweep (12:00 UTC) isn't due at that sweep, so it waits for the next one. Vercel Hobby can fire the cron any time within its hour, which adds to that.
    - **A guest usage record, with its IP hash, can last about 48 hours.** One made just after a sweep is under 24 hours old at the next sweep, so it waits for the one after.

    Either the wording changes (to "within about a day" and "about 24 hours", as the policy says "about" for other sweep-purged records), or the deletion changes. That's a product and legal decision, so the wording follows the spec here.
  - **The landing page's "Careful with your photos" cards** say "Only your account can open your photos" and "Deleted on request". Both are true for accounts only. The spec only asked that the line beside "Create a free account" stay true for both, which it does.
