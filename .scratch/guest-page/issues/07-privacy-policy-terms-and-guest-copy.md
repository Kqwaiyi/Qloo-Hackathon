# 07: Privacy Policy, Terms and guest copy

**What to build:** A Guest can read exactly what guest mode keeps and for how long. The Privacy Policy gains a Guest section, the Terms cover use as a Guest, and the consent sheet's guest variant states the deletion promise. Every claim matches [ADR-0013](../../../docs/adr/0013-guest-consultations-are-kept-briefly-not-never.md) and the spec's numbers.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Copy and policy". Stories 22, 32, 47–49.

- [ ] The Privacy Policy's Guest section says:
  - **What is kept:** the Guest Consultation, its photo and Previews, the age group, Style Preference and Country, the consent and Terms agreement, and a salted hash of the IP address. The raw IP address and the birth date are never stored.
  - **Why:** to run the Styling, and to hold each address to one Guest Consultation and 5 photo checks a day.
  - **For how long:** the Guest Consultation is deleted within 24 hours (usually about an hour), and the hash after 24 hours.
  - **Who receives what:** Cloudflare for the Bot Check, and the AI and product-search providers as for any Consultation.
- [ ] The Terms cover use as a Guest: one Guest Consultation a day per connection, and nothing carried over to an account.
- [ ] The consent sheet's guest wording, and the "won't carry over" line, live in the copy config, ready for 02 and 03 to use.
- [ ] The Privacy Policy's version or last-updated date is bumped as the existing policy does for a change.
