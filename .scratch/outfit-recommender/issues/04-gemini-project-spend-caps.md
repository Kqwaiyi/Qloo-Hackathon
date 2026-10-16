# 04: Set up the Gemini API project and spend caps

**What to build:** A billing-enabled Google project for the Gemini API, locked down for privacy and capped on spend, so the real Gemini adapter can be smoke-tested and then switched on in production.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) sections "Setup and operations" (Gemini) and "AI provider interface" (Gemini adapter: Models).

- [x] Create a billing-enabled project, and keep `GEMINI_API_KEY` only in environment variables.
- [x] Turn API logging off, with no dataset sharing.
- [x] Set a Cloud Billing spend-cap budget of $50 on the Gemini API, plus alert budgets.
- [x] On Prepay, keep auto-reload able to cover $50.
- [x] Read the Tier 1 rate limits for `gemini-3.5-flash-lite`, `gemini-nano-banana-2.1` and `gemini-3.1-flash-lite-image` at `aistudio.google.com/rate-limit`, and note them in this ticket's comments.

## Progress (2026-10-16)

Done: the team set up the project on 2026-10-16.

- **Checked:** `.env.local` holds `GEMINI_API_KEY`, and git ignores it.
- **Reported by the team:** the project has billing on, API logging is off with no dataset sharing, the $50 spend-cap budget and the alert budgets are set, and Prepay auto-reload can cover $50. None of this can be checked from here.
- **Unblocks:** ticket 34's manual smoke run against real Gemini, which still needs the user's go-ahead.

## Comments

**Tier 1 rate limits** (from `aistudio.google.com/rate-limit`, which needs the team's sign-in):

| Model | RPM | TPM | RPD |
| --- | --- | --- | --- |
| `gemini-3.5-flash-lite` | not yet copied in | not yet copied in | not yet copied in |
| `gemini-nano-banana-2.1` | not yet copied in | not yet copied in | not yet copied in |
| `gemini-3.1-flash-lite-image` | not yet copied in | not yet copied in | not yet copied in |
