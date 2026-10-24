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

## Comments

- 2026-10-24: Claude Haiku 5.5, at high effort, now drives the Stylist.
  - **Config** (`src/config/ai.ts`). `CLAUDE_STYLIST_MODEL` is `CLAUDE_MODELS.haiku55`, and `CLAUDE_STYLIST_EFFORT` is `"high"`. `CLAUDE_STYLIST_MAX_OUTPUT_TOKENS` stays 16,000, the cap Haiku first ran the Stylist with. Their comments now say Haiku drives the Stylist and Sonnet judges each Preview (ADR-0012). The effort's comment says why: high is the effort at which Haiku built valid Outfits in every Styling of the Haiku check.
  - **The adapter.** Nothing in `anthropic.ts` changed: it reads the model and effort from the config. Its prompt caching, unforced tool calls and omitted thinking display are as they were.
  - **The agentic-stylist spec** gets a "Partly replaced" note, pointing to this spec and ADR-0012, under five headings:
    - the Solution, after "Models and privacy";
    - "Checking Previews";
    - "The Stylist and its tools";
    - "The loop";
    - "Models and providers".
- 2026-10-24: Choices the ticket left open:
  - **"Partly replaced", not "Replaced".** Older specs mark a section another spec supersedes with "> **Replaced** by". These sections still mostly hold, so the notes say "Partly replaced", as ADR-0011 says "Partly superseded".
  - **Notes, not rewrites.** The agentic-stylist spec's own text is left as it was, including "the Stylist on Claude Sonnet 5.5" in its Solution and Models sections, and `writeNote`'s Sonnet-specific reason. The notes say what changed. ADR-0011 already says ADR-0012 partly supersedes it.
  - **Sections left without a note:** "Storage", "Fakes and the check" and "Testing Decisions" still describe the Preview tools. The ticket names only the Stylist, Preview and model sections, and ticket 06 owns the check.
  - **Haiku 5.5 itself wasn't checked again here.** The app already ran this model and effort, with this output cap, in the Haiku check (agentic-stylist ticket 12). Ticket 07 runs the check on the finished work.
  - **Left for the team:**
    - `src/server/stylings/stylist.ts` still says the agent stops "not on a finish refused", though since ticket 02 finish is never refused.
    - The README's account of `npm run check:stylist` still has the AI Stylist keeping Previews. That's for ticket 06.
  - **For /domain-modeling: the glossary.** GLOSSARY's **Stylist** entry still says it "checks each Preview". Its **Outfit** entry still says an Outfit has no Preview when "the Stylist finds both its tries break a hard rule". Since ADR-0012, code keeps an image from Sonnet's verdicts.
- 2026-10-24: **Results.** Typecheck is clean, all 1,088 tests pass, and all 12 end-to-end tests pass on the fake AI.
  - The adapter's tests in `anthropic.test.ts` now pin the Stylist to `claude-haiku-5-5` at `high` effort. They failed first against Sonnet at medium.
  - `environment.test.ts` checks that real AI runs the Stylist on `claude-haiku-5-5`.
  - The verdict's tests still pin Sonnet 5.5 at medium effort.
  - The Stylist on real Claude wasn't run, since that costs money. Ticket 07 runs the check.
