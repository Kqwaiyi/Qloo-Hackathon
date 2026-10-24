# 07: The Stylist chooses among Qloo's picks

**What to build:** For each Category, the Stylist may now choose whichever of a Style Icon's top 3 usable Brands best suits the photo, the Photo Style and the rest of the Outfit, rather than only the first. It may also pass over a Style Icon that doesn't suit the photo, and the user reads why in the Stylist's Notes. Qloo still decides which Style Icons and Brands are candidates, and the tools still enforce everything else. This is [ADR-0010](../../../docs/adr/0010-the-stylist-chooses-among-qloos-picks.md); [ADR-0002](../../../docs/adr/0002-photo-style-steers-style-icons.md) still holds for Qloo's queries.

**Blocked by:** 04 (Body-photo Stylings run through the Stylist; the fixed pipeline goes), 05 (Stylist's Notes on the waiting screen)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › The Stylist and its tools", and "Testing Decisions" (the operations seam). Stories 15–18 and 69.

- [x] For each Category, the save tool accepts any of the Style Icon's top 3 usable Brands still in play. The top 3 slide: a Brand whose search found nothing drops out, and the next one moves in.
- [x] Save refuses a 4th Brand, and any Brand Qloo didn't return. The rule that no Brand repeats within a Category is unchanged.
- [x] A new tool passes over a Style Icon, with a reason in style terms. It marks the Style Icon skipped, as today, and adds the reason to the Stylist's Notes.
- [x] If the real model is in place, the Stylist's prompt explains the choice:
  - weigh the photo, the Photo Style and the rest of the Outfit;
  - give reasons about style ("her shoe Brand only sells heels, which don't fit sporty"), never about the user or the Style Icon as a person.
- [x] Qloo's queries are unchanged, and the Brand query never carries the Photo Style.
- [x] New fake scenarios, picked through the existing environment variable: passing over the first Style Icon, and picking a second Brand. The default fake model still plays today's pipeline.
- [x] Operations tests check that:
  - a second or third Brand saves;
  - a 4th Brand is refused;
  - a Brand Qloo didn't return is refused;
  - once the first Brand's search finds nothing, the 4th Brand moves into the top 3 and is accepted;
  - passing over a Style Icon marks it skipped and adds its reason to the notes.

## Comments

- 2026-10-24: The Stylist chooses each Category's Brand among a Style Icon's top 3, and may pass over a Style Icon.
  - **Top 3.** `TOP_BRANDS_PER_CATEGORY` (3) is in `src/config/stylings.ts`. `topBrandsInPlay` in `outfit-assembly/brands.ts` gives each Category's first 3 Brands still in play. A Brand drops out, and the next moves in, when an Outfit uses it in that Category, when its search there finds nothing, or when the product search doesn't know it. The Bottom's list puts first the denim Brands Qloo ranks in its top 10, so `firstBrandsInPlay`'s picks, the old pipeline's, are always among the 3.
  - **The tools.** `fetchBrands` lists only the top 3, with `denimFirst` naming the Bottom's denim ones. `searchProducts` and `saveOutfit` refuse any other Brand with one refusal, `cantTakeRefusal` in `brand-steps.ts`, such as "Ember isn't among Ava Stone's top 3 Top Brands still in play: Bolt, Dune and Jeanery." A Brand Qloo didn't return is refused as before.
  - **Passing over.** `passOverStyleIcon` (`stylist-steps.ts`, a Workflow step) takes the Style Icon's number and a reason. It marks the Style Icon skipped, writes the step "Passed over Ava Stone", then the reason as a note. The `stylist_note` table needs a turn on every note, so the tool passes its turn to the step. The reason is checked like a note (`noteFault` in `stylist-notes.ts`), but refused rather than dropped, so the Stylist can say it again. The tool is refused before the Style Icons are found, once the Previews start, and for a Style Icon not on the list or already used. A Style Icon already passed over gives an ok, so a retry does nothing more. Every Styling is offered it.
  - **The prompt** gains "Choosing among Qloo's picks": weigh what the person is wearing in the photo, their Photo Style and the rest of the Outfit; reasons are about style, never about the user or the Style Icon as a person. The Brands section no longer gives the pipeline's picking rules.
  - **The fake.** `FAKE_AI_SCENARIO=style-icon-passed-over` passes over the first Style Icon the Styling may use, once its Brands are fetched for a body photo. `second-brand` takes each Category's second Brand in play. Tests can set either per Style Icon in `styleIconScenarios`, as `passed-over` and `second-brand`. The default fake still plays the pipeline. It plans from the top 3 it was shown, and fetches a Style Icon's Brands again, which is free, when a list cut at 3 no longer settles a pick (`picksFrom` and `outOfPlaySince` in `fake-stylist.ts`).
- 2026-10-24: Choices the ticket left open:
  - **Lookups.** `fetchBrands` now looks up each Category's top 3 before listing them, not only the pipeline's picks, so the Stylist is only offered Brands the product search knows ("the top 3 usable Brands the product search knows"). That's about 6 lookups per Style Icon rather than 3. Lookups stay free and kept for 30 days, and the lookup tests in `stylings.test.ts` changed with them. `searchProducts` still looks up a Brand that slid in since the last fetch.
  - **Searches** are held to the top 3 too, reversing ticket 04's choice, so no search is spent on a Brand the Outfit can't take. The 25th-search test now searches two Style Icons' top 3s.
  - **The Bottom** may take the Top's Brand whenever it's in the Bottom's top 3. The Shoes still never share the Top's or the Bottom's. The pipeline's preference for a Bottom on another Brand, or on denim, is now only the list's order and the Stylist's choice. With 3 or more of Qloo's top-10 denim Brands in play, the Bottom's top 3 are all denim.
  - **A Brand that slides in** shows in the refusal that names the new top 3, or on the next `fetchBrands`. A search that puts a Brand out doesn't name its replacement. Naming it would save the Stylist a turn: a possible follow-up once the Haiku check (11) shows how often it happens.
  - **Passing over** isn't limited to the next Style Icon. On a Budget Tier change it only marks the Styling's own copy of the list.
- 2026-10-24: **Results.** Typecheck is clean, all 996 tests pass, and all 12 end-to-end tests pass. New tests in `src/server/operations/stylist.test.ts`: a second or third Brand saves; a 4th Brand and Brands Qloo didn't return are refused; once Bolt's Tops find nothing, Ember moves into the top 3 for search, save and the next fetch; passing over marks the Style Icon skipped and adds its reason, and its refusals; the prompt's choosing and passing over; and both fake scenarios, with no Photo Style on Brand calls. In `environment.test.ts`, both scenarios are accepted from `FAKE_AI_SCENARIO`. **Not done:** the prompt on the real Stylist, which costs money and is the Haiku check's (11) to run.
