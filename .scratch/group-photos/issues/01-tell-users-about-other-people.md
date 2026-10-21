# 01: Tell users about other people in their photos

**What to build:** Before group photos are accepted, users are told what happens to anyone else in their photo, and asked to have those people's consent. The consent sheet gains one line. The photo notice version goes up, so every user, existing users included, sees the consent sheet again before their next Consultation. The Privacy Policy and Terms say the same thing. See [the spec](../spec.md) and [ADR-0009](../../../docs/adr/0009-only-the-main-person-is-styled.md).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] The consent sheet shows, beside its existing lines: "If anyone else is in your photo, it's stored and sent to Google with it, but only the main person is styled. Please make sure you have the consent of everyone else in it." It's the same on the Demo Account's sheet.
- [x] No new tick box: the two existing boxes stay as they are.
- [x] The photo notice version is raised by one. A user who agreed to the old version sees the consent sheet again before their next Consultation, and their new agreement is recorded once both boxes are ticked. The existing photo consent test that covers a changed notice still passes.
- [x] The Privacy Policy has a short paragraph on other people in a photo: they're stored and sent to Google with it, never styled, read or identified, nothing about them is kept from the check, and they're deleted with the Consultation.
- [x] The Terms' photos section has one line saying you only upload photos that the other people in them are fine with.
- [x] Checked by eye in the running app: the consent sheet, the Privacy Policy and the Terms read correctly on a phone-width and a desktop-width screen.

## Comments

- 2026-10-22: Copy and the notice version bump are in. Typecheck is clean and all 907 tests pass. Checked by eye in local development at 375px and 1280px: the consent sheet (a regular account; the Demo Account renders the same component, with the line not conditional on it), the Privacy Policy and the Terms.
