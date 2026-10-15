# 04: Set up the Gemini API project and spend caps

**What to build:** A billing-enabled Google project for the Gemini API, locked down for privacy and capped on spend, so the real Gemini adapter can be smoke-tested and then switched on in production.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) sections "Setup and operations" (Gemini) and "AI provider interface" (Gemini adapter: Models).

- [ ] Create a billing-enabled project, and keep `GEMINI_API_KEY` only in environment variables.
- [ ] Turn API logging off, with no dataset sharing.
- [ ] Set a Cloud Billing spend-cap budget of $50 on the Gemini API, plus alert budgets.
- [ ] On Prepay, keep auto-reload able to cover $50.
- [ ] Read the Tier 1 rate limits for `gemini-3.5-flash-lite`, `gemini-nano-banana-2.1` and `gemini-3.1-flash-lite-image` at `aistudio.google.com/rate-limit`, and note them in this ticket's comments.
