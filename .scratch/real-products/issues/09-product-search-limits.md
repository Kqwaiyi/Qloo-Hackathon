# 09: Product-search limits

**What to build:** Product searches can't run away with the team's budget. One Styling makes at most 24 searches, and once this UTC month's searches get close to the backstop, new Stylings are refused the way the Qloo backstop refuses them, until the month turns.

**Blocked by:** 03

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Limits and cost" and "Data model" (product-search usage), and "Testing Decisions" (Seam 1). Stories 63 and 64.

- [ ] A Styling makes at most 24 product searches (a config value). Positions it can't fill within the cap are left unfilled, as when Style Icons run out.
- [ ] Every live search is counted. A new migration adds what's needed to count this UTC month's searches, purged with the other usage records.
- [ ] A Styling starts only while this month's count leaves room for one Styling's cap below the backstop (5,000, a config value). The refusal, its lift time, the usage summary and the Demo Account's treatment match the Qloo backstop's.
- [ ] Brand lookups and Product checks are free and not counted.
- [ ] Tests at Seam 1: the per-Styling cap stopping searches; the backstop refusing a Styling, lifting at the start of the next UTC month, and showing in the usage summary; the Demo Account treated as the Qloo backstop treats it; free calls not counted.
