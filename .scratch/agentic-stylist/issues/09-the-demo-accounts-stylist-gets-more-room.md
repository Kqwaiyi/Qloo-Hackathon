# 09: The Demo Account's Stylist gets more room

**What to build:** So that the judges' Stylings complete, each Styling on the Demo Account gets more room: 60 turns, 10 Brand fetches and 40 product searches. Every other account keeps 30, 6 and 24. Redraws stay at 1 per Outfit, and the monthly product-search backstop and the Anthropic spend limit still apply.

**Blocked by:** 04 (Body-photo Stylings run through the Stylist; the fixed pipeline goes)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The Stylist and its tools" and "The loop" (the turn cap). Story 61.

- [ ] The Styling config holds both sets of per-Styling limits: everyone's (30 turns, 6 Brand fetches, 24 product searches), and the Demo Account's (60, 10, 40).
- [ ] A Styling on the Demo Account uses the Demo Account's limits, and every other Styling uses everyone's.
- [ ] The product-search backstop's check, that a new Styling has a Styling's worth of searches left this month, uses 40 for a Demo Account Styling.
- [ ] Operations tests check that:
  - the Demo Account's 61st turn finishes the Styling, and its 11th Brand fetch and 41st search are refused;
  - another account's 31st turn, 7th Brand fetch and 25th search are, as before.

  Prior art: the Demo Account Consultations tests.
