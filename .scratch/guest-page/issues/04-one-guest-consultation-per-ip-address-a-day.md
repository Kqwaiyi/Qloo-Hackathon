# 04: One Guest Consultation per IP address a day

**What to build:** A Guest can't close the Guest Page and open a fresh one for more. Each internet address gets one Guest Consultation in any 24 hours, counted only once its first Outfit is shown, so a rejected photo, failed Styling or app-wide cap never uses it up. An address also gets 5 photo checks in any 24 hours. When an address is used up, the Guest Page shows when the next Guest Consultation opens, and offers to create an account, in place of the Photo Type step. The raw address is never stored: only a salted hash of it, kept for 24 hours. Respect [ADR-0013](../../../docs/adr/0013-guest-consultations-are-kept-briefly-not-never.md).

**Blocked by:** 02 (A Guest gets two Outfits)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › The daily limit by IP". Stories 40–44, 48 and 57.

- [x] The IP is hashed with HMAC-SHA-256 under a secret salt from the environment, documented in the example env file. Local development without it uses a fixed development salt. On Production a missing salt keeps the Guest Page closed, never falling back to the development salt.
- [x] A guest usage store records, per IP hash, a Guest Consultation and each photo check, with their times. No row anywhere holds the raw IP. The guest user records the IP hash it was made from.
- [x] A Guest Consultation is recorded when its first Outfit is shown, in the same transaction that records Outfit usage. Photo checks are recorded where they are for users.
- [x] Limits live in the limits config: 1 Guest Consultation and 5 photo checks per IP hash in the rolling 24-hour window.
- [x] One at a time: starting a Guest Consultation is refused while the same IP hash has a guest user whose Guest Consultation is running, or has made Outfits in the window. A failed one doesn't block.
- [x] Refusals carry when more become available. The Guest Page shows the used-up message with the existing limit-message component, saying when, and offering **Create an account**.
- [x] The daily sweep purges guest usage older than 24 hours.
- [x] Tests at the operation seam, using the test browser's IP and the test clock:
  - counted only once the first Outfit is shown;
  - a second browser on the same IP refused with the right time;
  - a different IP allowed;
  - allowed again 24 hours later;
  - two starts from one IP before either Styling finishes refused by one-at-a-time;
  - a failed Styling doesn't use up the IP;
  - 5 photo checks then refused with when more come;
  - no guest row holds the raw IP;
  - the sweep's purge.

## Comments

- 2026-10-30: Each internet address gets one Guest Consultation a day.
  - **The IP hash** (`src/server/guests/ip-hash.ts`). HMAC-SHA-256 of the request's address under `GUEST_IP_SALT`, documented in `.env.example`. The address is read as Better Auth reads it for its rate limits, from `x-forwarded-for`. Local development without the salt uses a fixed development salt. A Vercel deployment without it gets `guestIpSalt: null` in the operation context, and the Guest Page is closed ("The Guest Page isn't available right now."), never falling back.
  - **The guest usage store** (migration `0028_guest_usage`). `guest_usage_record` holds a kind (`guest_consultation` or `photo_check`), the IP hash and a time, nothing else. The guest user's new `guest_ip_hash` holds the hash it was made from. `src/server/usage/guest-records.ts` records, reads and purges them over the Outfit Allowance's rolling window (`inUsageWindow` and `usageLeftOf`, now shared with `usage/records.ts`).
  - **Counting.** `finishStyling` counts a Guest Consultation in the transaction that records Outfit usage, when they're the first Outfits it shows: a first Styling's, or a Try again's (`countGuestConsultation`). A Guest's photo checks are recorded through `checkPhoto`'s `counted`, as a user's are.
  - **The limits** (`src/config/limits.ts`): `GUEST_CONSULTATIONS_PER_ADDRESS` 1, `GUEST_PHOTO_CHECK_LIMIT` 5, `GUEST_USAGE_RECORD_LIFETIME_HOURS` 24.
  - **The check** (`src/server/guests/daily-limit.ts`). Right after the region gate, leaving room for 05's Bot Check there, `startGuestConsultation` refuses: no salt (`guest-page-unavailable`); the address's photo checks (`guest-photo-check-limit`, with `moreFrom`); its Guest Consultation (`guest-consultation-used`, with `moreFrom`); then one at a time (`guest-consultation-running`). The stuck check first finishes any stuck Styling of the address's guest users. The check runs again in the transaction that creates the guest user, under a per-address advisory lock, so two "Get my Outfits" at once from one address can't both start.
  - **The Guest Page.** `readGuestPage` has a new `used-up` view, which shows `LimitMessage` (three new cases, copy in `copy.ts`) in place of the Photo Type step, with **Create an account**. A limit refusal on "Get my Outfits" refreshes onto it.
  - **The daily sweep** purges guest usage records once 24 hours old (`guestUsageRecordsPurged`). `docs/operations.md` says so, and names `GUEST_IP_SALT` for local development.
  - **Tests.** `guest-consultations.test.ts` covers each case the ticket lists:
    - the moment of counting, a first Styling's and a Try again's;
    - the time a second browser is told;
    - another address;
    - 24 hours later;
    - one at a time, sequential and two presses at once;
    - a stuck and a failed Styling;
    - 5 photo checks;
    - a scan of every row of every table for the raw address;
    - no salt.

    The sweep's purge is in `daily-sweep.test.ts`'s purges. Earlier guest tests now start with no guest users or guest usage, and those starting several Guest Consultations use addresses of their own. The full Vitest suite and the Guest Page e2e pass. A throwaway Playwright spec, not committed, checked the used-up page in a second browser after the e2e's Guest Consultation.
- 2026-10-30: Choices the ticket left open:
  - **"Or has made Outfits in the window" is the daily limit itself.** A Guest Consultation is counted in the same transaction that shows its Outfits, so one at a time checks only running Stylings, and the count covers the rest. Checking guest users' Outfits too would give the same answer twice. It would also hold the address to one even if the limit were raised.
  - **The running refusal carries no time.** When it lifts depends on how that Styling ends: at once if it fails, in 24 hours if it shows Outfits. It says "A Guest Consultation is already running on your internet connection. Only one runs at a time."
  - **IPv6.** An address stands for its /64 network, as in Better Auth's rate limits, since one connection's devices share it and change addresses within it.
  - **No salt closes the Guest Page on every Vercel deployment, Preview included.** A hash under the development salt, which is in the code, is as good as the address. Ticket 08 sets the salt on Production only, so Preview's Guest Page stays closed unless it's set there too.
  - **A request whose address can't be read** shares one hash with every other such request.
  - **The photo-check limit closes the Guest Page too**, not only "Get my Outfits".
  - **The stuck check runs on the address's other Guests' Stylings,** so a Styling stuck in a closed tab doesn't hold the address until 06's cleanup.
  - **The Guest Page checks the age gate before the address's limits,** unlike "Get my Outfits". So a blocked browser on a used-up address isn't offered an account that sign-up won't give it.
- 2026-10-30: For later tickets, from the review:
  - **Try again isn't held to the address's limits.** That's a product decision. `tryAgain` and the Guest Page's usage summary run only `checkStylingStart`.
    - **How it happens:** Guest A's Styling breaks, so it doesn't block. Guest B on the same address starts, which is allowed, and B's Outfits are counted. A then tries again within the hour, and A's Outfits are counted too: two Guest Consultations that day.
    - **The race:** A's Try again while B's Styling runs has both running at once.
    - **The trade-off:** the spec says a failed Guest Consultation "can be tried again", and also "one Guest Consultation in any 24 hours".
  - **06: don't ship 04 without 06.** The IP hash on a guest user lasts as long as the user does. Until 06 deletes guest users after the hour, it outlives ADR-0013's 24 hours (only the unverified-account sweep removes them, after 7 days). 06's cleanup can reuse `purgeGuestUsageRecords`.
  - **07:** the Privacy Policy's Guest section should read `GUEST_USAGE_RECORD_LIFETIME_HOURS`, as it reads the other numbers.
  - **`/domain-modeling`:** "daily limit", "one at a time", "IP hash" and "guest usage" are code vocabulary, not yet in `GLOSSARY.md`.
  - **Judgement calls from the review, left as they are:**
    - `rowsHolding` is close to `stylings.test.ts`'s `everyRowAsText`, so a shared helper would serve both.
    - `startGuestConsultation` and `readGuestPage` both go salt, then hash, then check.
    - The IP hash is a plain `string` rather than a type of its own.
