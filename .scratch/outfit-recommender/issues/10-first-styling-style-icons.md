# 10: First Styling: Outfits inspired by ranked Style Icons

**What to build:** After an accepted photo, the Consultation's first Styling runs in the background as a Vercel Workflow. Qloo ranks Style Icons popular with people of the user's age group, Style Preference and Country, in tune with the Photo Style, and the Consultation shows up to two Outfit cards, "Outfit N · Inspired by <Style Icon>". The cards have no Pieces yet: tickets 11 and 14 fill them. This ticket builds the Styling machinery every later kind of Styling reuses, including one shared check that runs before any Styling starts.

**Blocked by:** [06 Upload a photo to start a Consultation](06-upload-photo-start-consultation.md), [09 Qloo client with a 30-day cache](09-qloo-client-cache.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Stylings", "Outfit assembly (pure module)" (Inputs, Age groups, Style Icons, Config, denylist seeds), "Server operations" (Read: the Styling status), "Data model" (Stylings, Style Icons, Outfits) and "Testing Decisions" (Seam 1 inline runner; Seam 2; the Qloo privacy commitment; live checks). Stories 87, 92 (the title), 140, 147, 148 and 151. [ADR-0001](../../../docs/adr/0001-qloo-selects-ai-concretizes.md), [ADR-0002](../../../docs/adr/0002-photo-style-steers-style-icons.md), [ADR-0004](../../../docs/adr/0004-adults-only.md).

- [ ] Starting a Consultation now also starts its first Styling. Every operation that starts a Styling goes through one shared start check, so the region, lock and limit tickets each add their check in one place.
- [ ] Stylings run as one "build Outfits" Vercel Workflow. Tests run the same step functions in order through an inline runner; the Workflow function is a thin shell over those steps and isn't itself under test.
- [ ] Each Qloo call is its own Workflow step with its own retries, backing off on "too many requests". Each step saves its output as it finishes, so a retried step resumes and nothing relies on Workflow's run data (kept 1 day on Hobby). Every step checks that its Styling is still running before it saves.
- [ ] A Styling records its Consultation and user, kind, target Budget Tier and Photo Style, status (running, succeeded or failed), stage and when the stage last moved, Outfits wanted and Outfits made, failure reason, Workflow run ID, and start and finish times.
- [ ] The Outfit assembly module is pure, with no framework or I/O code. It works out the age group from the birth year and month using the spec's table (18+ only) and builds the Style Icon query: `filter.type=urn:entity:person`; `filter.tags` = model, fashion_model, singer, rapper, actor, athlete, influencer; `filter.gender` and `signal.demographics.gender` from the line; `signal.demographics.age`; `signal.location.query=<Country>`; `signal.interests.tags` = the Photo Style's `personal_style` tags; `filter.popularity.min=0.995`; `take=50`; and `filter.exclude.tags` for the politician, stand_up_comedian and astronomer occupations plus the `genre:person` comedian, academic, journalist and youtuber tags.
- [ ] A menswear or womenswear user gets one person call. A no-preference user gets two, one womenswear and one menswear, interleaved W1, M1, W2, M2…. Each Style Icon keeps its line: for a no-preference user, the list it came from.
- [ ] The module drops anyone with a death date and anyone on the Style Icon denylist, and keeps Qloo's affinity order. The denylist lives in config, matches by Qloo entity ID with the name kept for readability, and is seeded with the spec's names.
- [ ] Queries use the Style Preference, Country and age group stored on the Consultation.
- [ ] Each Consultation's ranked Style Icons are stored with the Styling that picked them, their position, Qloo entity ID, name, line and status (unused, used or skipped).
- [ ] The Styling builds up to 2 Outfits, one per top unused Style Icon. Each Outfit stores its Consultation, the Styling that made it, its position, its Style Icon and whether it's current.
- [ ] When the Styling finishes, its Outfits switch in at once and the Consultation is ready. A Styling that made no Outfit has failed: nothing switches, its reason is recorded as "nothing could be built" or "something broke", and the Consultation shows "No Outfits".
- [ ] While the Styling runs, the Consultation shows "Styling…" and the page polls the Styling status route about once a second. The Outfits appear all at once when it finishes. The full checklist comes in ticket 13.
- [ ] The results page shows each Outfit card as "Outfit N · Inspired by <Style Icon>". Style Icons are shown by name, never with Qloo's image.
- [ ] Local development uses real Qloo through the cache.
- [ ] Pure tests cover the Style Icon query for each age group and Style Preference (including the no-preference interleave and per-line gender signal) and for the Country, plus the death-date and denylist filters.
- [ ] A server-operation test runs a new Consultation through the inline runner to two Outfits and asserts that the recorded Qloo requests contain no user identifiers.
- [ ] An opt-in live check, never run in CI, makes one read-only Qloo tag call confirming that all 11 Photo Style words are real `personal_style` tags.
