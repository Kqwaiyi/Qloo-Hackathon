# 12: Switch production to the AI Stylist

**What to build:** Production runs the AI Stylist. The team checks that Haiku is good enough, caps Anthropic's spend, sets the keys, merges the branch and tries every Photo Type live, the Demo Account included.

**Blocked by:** 01–11 (every other ticket)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Models and providers" and "Fakes and the check". Stories 61, 64 and 65.

- [ ] Run the Haiku check (ticket 11) with the team's go-ahead, and paste its report into this ticket's Comments. If Haiku falls short, move the Stylist to Sonnet 5.5 in the AI config, a one-line change, and run the check again.
- [ ] Set a $50 monthly spend limit on the Anthropic workspace, as on the Gemini project.
- [ ] Add the Anthropic key on Vercel for Production and Preview, as `ANTHROPIC_API_KEY`.
- [ ] Change Production's `AI_PROVIDER` from `gemini` to `real`: ticket 01 renamed the setting, and `gemini` is now refused, so every request fails until it's changed.
- [ ] Merge `agentic-stylist` into `main`, with real AI switched on in production and both keys set.
- [ ] On production, run one real Styling for each Photo Type, and one on the Demo Account. Check that:
  - the consent sheet comes back for an existing user;
  - the Stylist's Notes fill while each Styling runs and stay under its Outfits;
  - the Privacy Policy reads as the spec says.

## Comments

- 2026-10-24: **The Haiku check** (`npm run check:stylist`) on claude-haiku-5-5 at high effort, with live Qloo and Channel3. Each Styling was a new user's first, in the United States, at No Budget, with everyone's limits.
  - Previews production would draw on gemini-nano-banana-2.1 were drawn on gemini-3.1-flash-lite-image, which is cheaper. So the "good" Previews here are gemini-3.1-flash-lite-image's, which may have faults of their own, and only the eye can judge what the Stylist did with them.
  - **Full-Body Photo** (No preference): Valid: 2 of 2 Outfits. 14 of 30 turns, 1 min 14 s, $0.012, against $0.037 with nothing cached. Largest prompt 43,538 tokens; each turn after the first read at least 9,424 tokens from the cache. 7 product searches, 0 tool calls refused. Drawn on gemini-3.1-flash-lite-image, not production's gemini-nano-banana-2.1: check its Previews by eye, to see whether the Stylist was right to keep or redraw each one.
    - Outfit 1, inspired by Bhad Bhabie (Hairstyle: Short textured crop with tousled, piecey top, Top: Dolls Kill, Bottom: Dolls Kill, Shoes: Boohoo): kept its Preview as drawn.
    - Outfit 2, inspired by J. Cole (Hairstyle: Close-cropped fade with neat short top, Top: Fear Of God, Bottom: Fear Of God, Shoes: Kith): redrew its Preview ("Remove the two people added in the background on the left sidewalk so the background matches the original photo exactly, and keep everyone else as they are."), then kept the redraw.
  - **Face Photo** (Menswear): Valid: 2 of 2 Outfits. 6 of 30 turns, 19 s, $0.0032, against $0.0073 with nothing cached. Largest prompt 13,620 tokens; each turn after the first read at least 7,394 tokens from the cache. 0 product searches, 0 tool calls refused. Drawn on gemini-3.1-flash-lite-image, not production's gemini-nano-banana-2.1: check its Previews by eye, to see whether the Stylist was right to keep or redraw each one.
    - Outfit 1, inspired by Post Malone (Hairstyle: Textured short crop with tousled, slightly longer top): kept its Preview as drawn.
    - Outfit 2, inspired by J. Cole (Hairstyle: Short tapered cut with defined soft waves): kept its Preview as drawn.
  - **Body-Only Photo** (Menswear): Valid: 2 of 2 Outfits. 12 of 30 turns, 2 min 55 s, $0.011, against $0.031 with nothing cached. Largest prompt 42,960 tokens; each turn after the first read at least 8,659 tokens from the cache. 7 product searches, 0 tool calls refused. Drawn on gemini-3.1-flash-lite-image, not production's gemini-nano-banana-2.1: check its Previews by eye, to see whether the Stylist was right to keep or redraw each one.
    - Outfit 1, inspired by Post Malone (Top: Stance, Bottom: Pacsun, Shoes: Kith): kept its Preview as drawn.
    - Outfit 2, inspired by J. Cole (Top: Fear Of God, Bottom: Fear Of God, Shoes: Undefeated): redrew its Preview ("The shoes should be the white low-top adidas Campus sneakers with three stripes and a blue heel tab, as in their seller's photo, not high-tops."), then kept the first.
  - **Full-Body Photo, first drawn as the photo unchanged** (No preference): Valid: 2 of 2 Outfits. 19 of 30 turns, 1 min 30 s, $0.017, against $0.065 with nothing cached. Largest prompt 61,489 tokens; each turn after the first read at least 9,424 tokens from the cache. 16 product searches, 0 tool calls refused.
    - Outfit 1, inspired by J. Cole (Hairstyle: Short textured crop with soft volume on top, Top: Sprayground, Bottom: Fear Of God, Shoes: Kith): redrew its Preview ("Replace the white tee with the light green shark-print t-shirt, the jeans with the iron grey Storm Pant, and the white sneakers with the tan suede high-top Kith sneakers, as in their seller's photos, keeping the face exactly as it is in the photo."), then kept the redraw, as expected.
    - Outfit 2, inspired by Millie Bobby Brown (Hairstyle: Tousled short layers with a soft front fringe, Top: Urban Outfitters, Bottom: Urban Outfitters, Shoes: American Eagle Outfitters): redrew its Preview ("Replace the white tee with the charcoal vintage graphic tee, keep the light-wash straight-leg denim jeans, and replace the white sneakers with the dark green suede low-profile runners, as in their seller's photos, keeping the face exactly as it is in the photo."), then kept the redraw, as expected.
  - **Face Photo, first drawn with the face pixelated** (Menswear): Valid: 2 of 2 Outfits. 7 of 30 turns, 23 s, $0.0033, against $0.0094 with nothing cached. Largest prompt 15,295 tokens; each turn after the first read at least 7,394 tokens from the cache. 0 product searches, 0 tool calls refused.
    - Outfit 1, inspired by Post Malone (Hairstyle: Textured crop with tousled front and short sides): redrew its Preview ("Keep the face exactly as it is in the photo, unblurred and unpixelated, and show the hairstyle clearly."), then kept the redraw, as expected.
    - Outfit 2, inspired by J. Cole (Hairstyle: Short tapered crop with neat, defined hairline): redrew its Preview ("Keep the face exactly as it is in the photo, unblurred and unpixelated, and show the hairstyle clearly."), then kept the redraw, as expected.
  - **Body-Only Photo, drawn and redrawn with a face added** (Menswear): Valid: 2 of 2 Outfits. 10 of 30 turns, 44 s, $0.0092, against $0.026 with nothing cached. Largest prompt 42,583 tokens; each turn after the first read at least 9,908 tokens from the cache. 6 product searches, 0 tool calls refused.
    - Outfit 1, inspired by Post Malone (Top: Stance, Bottom: Pacsun, Shoes: Kith): redrew its Preview ("The top should be the heathered grey crew-neck tee, the bottom the medium-blue baggy wide-leg jeans, and the shoes the light blue and white ASICS sneakers, as in their seller's photos; keep the face exactly as it is in the photo."), then kept the first, where it should have redrawn it and kept neither.
    - Outfit 2, inspired by J. Cole (Top: Sprayground, Bottom: Fear Of God, Shoes: Big Baller Brand): redrew its Preview ("The top should be the off-white tee with the black shark-mouth graphic on the chest, the straight-leg black nylon pants, and the navy athletic sneakers, as in their seller's photos; keep the face exactly as it is in the photo."), then kept the first, where it should have redrawn it and kept neither.
  - **Totals:** valid Outfits in 6 of 6 Stylings. 68 turns, $0.056 of Claude, against $0.18 with nothing cached, for the Stylist's turns (photo checks aside). Largest prompt 61,489 tokens. 12 Previews on Gemini, about $0.41. 36 product searches, about $0.25.
  - **The Preview check:** kept 4 of 6 bad Previews from the user, redrawing each and keeping a redraw that put it right, or neither. Kept the redraw for 4 of the 4 a redraw could put right, and rightly kept neither image for 0 of the 2 whose redraws broke a hard rule too. Of the 6 Previews left to the eye, it redrew 2.
  - The photos, every Preview drawn, and each Styling's Stylist's Notes and turns are in C:\Users\steve\AppData\Local\Temp\stylist-check-2026-10-24T04-23-00, outside the repository.
- 2026-10-24: **What the eye saw**, from the saved images of the run above. The report leaves these to the eye.
  - **Lite's own faults:**
    - On the Full-Body Photo, Lite added two people walking on the sidewalk behind Outfit 2. The Stylist caught them and redrew without them, but the redraw changed the pose: legs uncrossed.
    - The redraw of the unchanged photo's Outfit 1 crossed the person's arms. The Stylist kept it anyway.
    - Lite drew no face on any Body-Only Preview this time.
    - The Face Photo Previews kept the face.
  - **Body-Only Photo, Outfit 2:** Lite drew low-top canvas sneakers instead of the seller's adidas Campus. The redraw was high-tops, further off, so keeping the first was the better of two wrong images.
  - **The miss that matters: the face added to the Body-Only Photo.** Both images show the whole head and face, on a photo that leaves the face out. The Stylist saw only that the clothes were unchanged. Its note: "Neither breaks a hard rule: the face is unchanged". It kept the first image for both Outfits. In production that Preview would have reached the user. It's the bake-off's Lite failure, and story 32's hard rule. Before switching, either sharpen the prompt's Body-Only check or try Sonnet 5.5, then run the check again.
  - **Caveats:**
    - Every Preview Nano Banana 2.1 would draw was drawn on Nano Banana 2 Lite, to spend less (`--image-model gemini-3.1-flash-lite-image`), so the "good" Previews are Lite's. A run on 2.1 is still needed to see whether Haiku keeps production's Previews as drawn.
    - The Lite-first Body-Only case was left out, since with every Preview on Lite it would repeat the Body-Only Styling.
    - Spent: $0.056 of Claude for the Stylist's turns, plus six photo checks, which the check doesn't measure: well under a cent each. About $0.41 of Gemini, for 12 Lite Previews at the bake-off's $0.0342 each. 36 Channel3 searches, about $0.25 past the free credits. That's about $0.72 in all, against the $0.71 estimate. Nothing failed or errored.
