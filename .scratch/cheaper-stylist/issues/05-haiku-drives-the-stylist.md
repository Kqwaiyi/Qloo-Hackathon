# 05: Haiku 5.5 at high effort drives the Stylist

**What to build:** The Stylist's loop runs on Claude Haiku 5.5 at high effort, which costs about a twentieth of Sonnet. Sonnet now only judges Previews, the one job Haiku fell short at, so Haiku never checks a Preview. Users get the same Outfits, chosen by the same rules. Respect [ADR-0012](../../../docs/adr/0012-haiku-drives-the-stylist-sonnet-judges-previews.md).

**Blocked by:** 02 (Previews are drawn and judged after the Stylist finishes)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Models and the AI config", "The Anthropic adapter" and "Fakes and the check", and "Testing Decisions" (the Anthropic adapter). Stories 35–39, 42, 44 and 53.

- [ ] The AI config moves the Stylist to Claude Haiku 5.5 at high effort. Its turn's output cap is unchanged.
- [ ] The Anthropic adapter's tests pin the Stylist's model and effort. Everything else about it is unchanged: prompt caching, never forced to call a tool, thinking display omitted.
- [ ] Comments and docs that say Sonnet runs the Stylist now say Haiku drives it and Sonnet judges each Preview.
- [ ] The agentic-stylist spec gets a note on its Stylist, Preview and model sections, pointing to this spec.
- [ ] Every test and every end-to-end test passes.
