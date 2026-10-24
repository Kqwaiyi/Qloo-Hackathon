# 11: The Haiku check

**What to build:** A team script that tells the team, before production switches, whether Claude Haiku 5.5 is good enough for the Stylist. It runs the real Stylist on fixed, AI-generated photos and reports:
- whether it built valid Outfits;
- the turns it used and the time it took;
- what it cost;
- the largest prompt it sent;
- whether its Preview check caught deliberately bad Previews.

It costs money, so it runs only with the team's go-ahead and never in CI. Running it, and acting on what it finds, is ticket 12.

**Blocked by:** 03 (The Stylist runs on Claude), 07 (The Stylist chooses among Qloo's picks), 08 (The Stylist checks each Preview)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Fakes and the check", and "Further Notes". Stories 65–67.

- [x] A team script, like the existing check scripts, run by hand and never in CI. It needs both the Anthropic and Gemini keys, and says before it starts roughly what a run will cost.
- [x] It runs the real Stylist inline on fixed, AI-generated photos: the landing sample's, and others like it, one for each Photo Type. For each run it reports:
  - whether the Outfits are valid;
  - the turns used;
  - the time taken;
  - the cost, from the token usage;
  - the largest prompt sent.
- [x] The bake-off's images were never committed, so the script makes its own bad Previews: Nano Banana 2 Lite on a Body-Only Photo with no face, which invented one in the bake-off, plus Previews with known faults. It also makes good Previews from Nano Banana 2.1, which the Stylist shouldn't redraw.
- [x] The script shows the Stylist each Preview and reports whether it redrew or kept it, and whether it rightly kept none.
- [x] It prints a report the team can paste into ticket 12, and saves no photo or Preview to the repository.

## Comments

- 2026-10-24: The Haiku check is `npm run check:stylist` (`scripts/check-stylist.ts`). Run on its own, it says what it would do and roughly what that costs, about $0.97, then stops. With `--go-ahead` it spends it.
  - **What it runs on.** It builds a fresh app that lives only while the script runs: PGlite and Blob in memory, live Qloo and Channel3, real Claude, and inline Stylings with the Workflow's retries. The landing sample script now builds the same app from `scripts/fresh-app.ts`.
  - **The operation.** `checkStylist` is in `src/server/operations/stylist-check.ts`. Each photo is styled by a new account, signed up through `signUp` and marked verified, in the United States, at No Budget and everyone's limits (30 turns). Each check starts "Get my Outfits" and runs that first Styling to its end.
    - `StylistCheckAi` wraps the app's AI. It keeps each turn's model, token usage, tool calls, finish reason and the calls it was told were refused. It draws each Preview the way the check says.
    - `StylistCheckBlob` keeps a copy of every Preview put in Blob, so the report has both images of a redraw, the one not kept included.
  - **What it reports, per Styling:**
    - Valid means it made every Outfit it could and the Stylist called finish. Otherwise it says why: "made 1 of 2 Outfits", "ran out of turns", "had a turn refused" or "stopped without finishing".
    - The turns used, the time from the Styling's start to its finish, and the cost from token usage. The cost is priced by the model that ran each turn, on the rate card its prompt length picks, beside what the same turns would cost with nothing cached.
    - The largest prompt, and the fewest tokens any turn after the first read from the cache. That covers ticket 03's "What to watch". So does any turn that stopped at its output cap.
    - Product searches made, and tool calls refused.
    - Each Outfit's Brands, and what the Stylist did with its Preview: kept it as drawn, or redrew it (with its correction) and kept the first, the redraw or neither.
  - **The photos.** All are AI-generated, and none is new to the repo. The Full-Body Photo is the landing sample's. The Face Photo (head and shoulders) and the Body-Only Photo (shoulders to feet) are cut from it at fixed coordinates. The script refuses to run if the sample isn't the 1024 px square they were measured on.
  - **The seven Stylings:**
    - Each Photo Type with Nano Banana 2.1 Previews. The Stylist should keep each as drawn.
    - Lite's first tries on the Body-Only Photo, with 2.1 redraws.
    - Three faults made from the photos, which cost no image call:
      - the Full-Body Photo unchanged, with 2.1 redraws. It should keep the redraw.
      - the Face Photo with its face pixelated, with 2.1 redraws. It should keep the redraw.
      - the Body-Only Photo zoomed out to show the head, as both the first try and the redraw. It should keep neither.
  - **Saved files.** The photos, every Preview drawn, the notes and each turn's usage go to `stylist-check-<time>` in the system's temporary folder, never the repository.
  - **Config.** `CLAUDE_MODELS` (Haiku 5.5, Sonnet 5.5) with `CLAUDE_PRICES`, so the check prices whichever the Stylist runs on. Moving to Sonnet stays one line: `CLAUDE_STYLIST_MODEL = CLAUDE_MODELS.sonnet55`. Also `GEMINI_PREVIEW_PRICES_USD` (the bake-off's measured cost per Preview), and the check accounts' birth date and Country in `config/accounts.ts`. `GeminiAiProvider` takes an optional `model`, so the check can draw on Lite.
- 2026-10-24: Choices the ticket left open:
  - **Lite is judged by eye, not counted.** Lite may not invent a face this time, so its Previews stay out of the "bad Previews" tallies. The report says what the Stylist did with each, and to check the saved images.
  - **"Kept from the user"** counts a bad Preview whose image never reached the user. For a fault a redraw can fix, that's the redraw kept, or neither. For the face added twice, it's neither kept only. A redraw followed by keeping the first doesn't count.
  - **Valid relies on the tools.** The check doesn't re-check each Outfit's rules: the save tool already refuses a broken Outfit (story 62). The count of refused tool calls shows how often Haiku hit them.
  - **Costs left out of the per-Styling line.** The photo check isn't counted, since its usage never leaves the adapter; the estimate includes it. Gemini is priced at the bake-off's measured cost per Preview, and Channel3 at about $0.007 per search, the real-products spec's figure.
  - **One person, three crops.** Every photo shows the same AI-generated person, since only the Full-Body sample has a photo. That gives one photo of each Photo Type without making new images.
- 2026-10-24: **Results.** Typecheck is clean and all 1,032 tests pass. The end-to-end tests weren't run, since no page changed.
  - **New tests:**
    - `stylist-check.test.ts` runs the operation on the fake AI. It covers the Outfits and Brands reported; the cost priced by the model that ran it, past 100,000 tokens included; the cache figures; the turn cap and refused calls; fewer Outfits; the time, searches and notes; a fresh account each time; a rejected photo; the check's own drawn Previews, redrawn, with neither kept, declined and failed; and each Outfit's own images when two Outfits' Pieces are alike.
    - `gemini.test.ts` covers drawing on another model.
  - **Dry run.** A throwaway copy of the script, with every service faked and not committed, ran start to finish. It printed the report and saved the expected files. The cut photos and faults were checked by eye.
- 2026-10-24: **A live run, to spend less.** The user asked for one with every Preview on Nano Banana 2 Lite.
  - **The new option.** `--image-model gemini-3.1-flash-lite-image` draws every Preview that Nano Banana 2.1 would draw on Lite instead, redraws included. Those Previews aren't production's, so the report leaves them to the eye, not to the tallies. With every Preview on Lite, the Lite-first Body-Only case is left out, since it would repeat the Body-Only Styling.
  - **The run.** `npm run check:stylist -- --go-ahead --image-model gemini-3.1-flash-lite-image` made 6 Stylings, all valid, in 68 turns.
    - Cost: $0.056 of Claude, against $0.18 with nothing cached; 12 Lite Previews, about $0.41; 36 searches, about $0.25.
    - The largest prompt was 61,489 tokens, well under 100,000. Nothing errored.
  - **What it found.** The report and what the eye saw are in ticket 12's Comments. The finding that matters: the Stylist missed a head added to the Body-Only Photo in both its Previews, and kept them.
- 2026-10-24: **Rerunning on saved Previews.** The Stylist moved to Claude Sonnet 5.5 at medium effort, and the check ran again with no new images.
  - **The new option.** `--previews-from <folder>`, given an earlier run's folder and its `--image-model`, serves each Preview from that folder instead of drawing it. It serves the image saved for the Outfit of the same Style Icon there, which the folder's notes name. A Preview with no saved image is declined, as the image model can decline. No image model is asked, and a guard throws if one ever is.
  - **How the drawer knows the Outfit.** `checkStylist` now tells the check's drawer which Outfit each Preview is for, by its number and Style Icon. It tells by the Pieces a Preview is drawn from, or gives null when two Outfits' Pieces are alike.
  - **Notes count.** The report now counts the notes the Stylist wrote to the user.
  - **Results.** Sonnet's run and what it changes are in ticket 12's Comments.
