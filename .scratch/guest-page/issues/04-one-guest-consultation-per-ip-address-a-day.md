# 04: One Guest Consultation per IP address a day

**What to build:** A Guest can't close the Guest Page and open a fresh one for more. Each internet address gets one Guest Consultation in any 24 hours, counted only once its first Outfit is shown, so a rejected photo, failed Styling or app-wide cap never uses it up. An address also gets 5 photo checks in any 24 hours. When an address is used up, the Guest Page shows when the next Guest Consultation opens, and offers to create an account, in place of the Photo Type step. The raw address is never stored: only a salted hash of it, kept for 24 hours. Respect [ADR-0013](../../../docs/adr/0013-guest-consultations-are-kept-briefly-not-never.md).

**Blocked by:** 02 (A Guest gets two Outfits)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › The daily limit by IP". Stories 40–44, 48 and 57.

- [ ] The IP is hashed with HMAC-SHA-256 under a secret salt from the environment, documented in the example env file. Local development without it uses a fixed development salt. On Production a missing salt keeps the Guest Page closed, never falling back to the development salt.
- [ ] A guest usage store records, per IP hash, a Guest Consultation and each photo check, with their times. No row anywhere holds the raw IP. The guest user records the IP hash it was made from.
- [ ] A Guest Consultation is recorded when its first Outfit is shown, in the same transaction that records Outfit usage. Photo checks are recorded where they are for users.
- [ ] Limits live in the limits config: 1 Guest Consultation and 5 photo checks per IP hash in the rolling 24-hour window.
- [ ] One at a time: starting a Guest Consultation is refused while the same IP hash has a guest user whose Guest Consultation is running, or has made Outfits in the window. A failed one doesn't block.
- [ ] Refusals carry when more become available. The Guest Page shows the used-up message with the existing limit-message component, saying when, and offering **Create an account**.
- [ ] The daily sweep purges guest usage older than 24 hours.
- [ ] Tests at the operation seam, using the test browser's IP and the test clock:
  - counted only once the first Outfit is shown;
  - a second browser on the same IP refused with the right time;
  - a different IP allowed;
  - allowed again 24 hours later;
  - two starts from one IP before either Styling finishes refused by one-at-a-time;
  - a failed Styling doesn't use up the IP;
  - 5 photo checks then refused with when more come;
  - no guest row holds the raw IP;
  - the sweep's purge.
