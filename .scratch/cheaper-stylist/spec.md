# Cheaper Stylist

Status: ready-for-agent

Every decision here comes from the grilling in this conversation. Use the vocabulary in [GLOSSARY.md](../../GLOSSARY.md), especially **Stylist**, **Stylist's Notes**, **Styling**, **Preview**, **Outfit**, **Piece**, **Product**, **Style Icon**, **Brand**, **Face Photo**, **Full-Body Photo**, **Body-Only Photo**, **Main Person**, **Outfit Allowance** and **Demo Account**. This spec carries out [ADR-0012](../../docs/adr/0012-haiku-drives-the-stylist-sonnet-judges-previews.md), which partly supersedes [ADR-0011](../../docs/adr/0011-claude-runs-every-model-but-the-image-model.md). It builds on the [agentic-stylist spec](../agentic-stylist/spec.md), whose decisions still hold except where this one says otherwise. Respect [ADR-0005](../../docs/adr/0005-photos-edited-never-analysed.md), [ADR-0008](../../docs/adr/0008-pieces-are-real-products.md), [ADR-0009](../../docs/adr/0009-only-the-main-person-is-styled.md) and [ADR-0010](../../docs/adr/0010-the-stylist-chooses-among-qloos-picks.md), which still hold.

## Problem Statement

The AI Stylist runs on Claude Sonnet 5.5, and it costs too much for the public demo. In the last Stylist check it cost $0.15–0.29 for a body-photo Styling and about $0.05 for a Face Photo's: $0.93 of Claude for six Stylings. The Anthropic workspace has a $50 monthly spend limit. The app's own monthly cap allows 750 Outfits, about 375 Stylings, which at today's cost comes to $58–109 of Claude. So the limit could run out mid-month, and then every user's Stylings would break until it resets, for a reason no user can see.

Where the money goes:
- **By kind:** 49% writing the prompt cache, 30% reading it, 21% output. Almost nothing is uncached.
- **By content:**
  - The prompt, tools and photo: 24%.
  - Preview images and seller photos: 22%. Seller photos go to Claude as their sellers publish them, about 2,000–2,700 tokens each, and they make up most of the costliest turn, the one that checks two Previews.
  - Product search results: 21%.
  - Output: 20%.
- **Wasted turns, about 12%:** finish is refused when called in the same turn as the last keepPreview, and startPreviews nearly always takes a turn of its own.

Sonnet runs the Stylist for one reason: Claude Haiku 5.5 missed a face added to a Body-Only Photo's Preview, a hard rule. Haiku built valid Outfits in every Styling of its check, for about $0.01 each. Nearly all of its misses were in checking Previews.

Separately, on a Face Photo the Hairstyle is the whole Outfit. Today a Style Icon whose signature cut needs far more length than the user's hair has is still used, and their cut is adapted into one the user's hair can reach. The result can barely relate to the Style Icon who inspired it.

## Solution

Nothing users rely on changes. The checklist, the "See what your AI Stylist is doing" control and the rules for Outfits stay the same. Every Preview is still checked before the user sees it, a wrong one is redrawn once, and one that breaks a hard rule is never shown.

Behind that:
- **Claude Haiku 5.5, at high effort, does the Stylist's building work:** finding Style Icons, choosing Brands, searching and picking Products, saving Outfits, and writing its notes. Its conversation never holds a Preview or a seller photo.
- **Once it has saved every Outfit, the Preview phase runs in code.** For each Outfit:
  1. Draw the Preview.
  2. Ask Claude Sonnet 5.5 for a verdict.
  3. On a fault, redraw once with Sonnet's correction.
  4. Ask Sonnet to compare the two images.
  5. Keep an image by the hard rules.
- **Claude sees smaller images:** seller photos at most 768 pixels on their long side, and Previews at most 1024. The photo goes as it is. The image model and the user still get full-size images.
- **On a Face Photo, the Stylist may pass over a Style Icon whose signature cut needs much more length than the user's hair has.** It says so in plain styling terms, and it does this at most twice in a Styling. After that, and on every other Photo Type, it adapts the cut, as today.

A Styling's Claude cost is expected to come to about $0.04–0.09 for a body photo and about $0.025 for a Face Photo, against $0.15–0.29 and $0.05 today.

## User Stories

### Previews

1. As a user, I want every Preview still checked against my photo and its Products before I see it, so that a wrong garment, a changed face or an invented face is caught as it is today.
2. As a user with a Body-Only Photo, I want a face or head never added to my Preview, so that the Preview respects the photo I chose to send.
3. As a user whose hair is covered, I want my head covering never removed or changed in my Preview, so that the Preview respects me.
4. As a user in a photo with other people, I want everyone else left exactly as they are in my Preview, so that only I am styled.
5. As a user with a Face Photo, I want my Preview to change only my hair, so that the Hairstyle is all that's new.
6. As a user whose Preview shows the wrong garment, I want it redrawn once with a correction, so that I get a Preview that shows the Outfit I was given.
7. As a user whose redrawn Preview is still imperfect, I want whichever of the two images is better, so that I get the best Preview the Stylist could make.
8. As a user whose two images both break a hard rule, I want the Outfit shown with no Preview, so that I never see a Preview that misrepresents me.
9. As a user whose first image breaks a hard rule and whose redraw doesn't, I want the redraw, even if it's otherwise worse, so that the Preview I see respects me.
10. As a user whose Preview couldn't be checked, because the AI couldn't answer or wouldn't look, I want the Outfit shown with no Preview rather than an unchecked one, so that I never see a Preview that might break a hard rule.
11. As a user whose redraw couldn't be checked, I want the first image if its only fault was a softer one, such as the wrong garment, and no Preview if it broke a hard rule, so that I keep what's safe to show.
12. As a user whose redraw the image model declined or couldn't draw, I want the first image unless it breaks a hard rule, as today, so that a failed redraw doesn't cost me a good-enough Preview.
13. As a user whose first Preview the image model declined, I want the Outfit shown with no Preview, as today, so that a refusal stays final.
14. As a user whose Styling ran out of turns, I want Previews drawn and checked for the Outfits it saved, so that the Stylist's work isn't left without Previews.
15. As a user whose Styling broke, I want no Previews drawn for its unfinished work, as today, so that Try again starts clean.
16. As a user, I want a Preview that couldn't be checked, or couldn't be drawn, never to break my whole Styling, so that I still get my Outfits.
17. As a user waiting on Previews, I want "Generating Previews (1 of 2)" still to count finished Previews only, so that a redraw doesn't make the count jump around.
18. As a user waiting for my Outfits, I want the checklist's four items in the same order as today, so that the waiting screen stays familiar.
19. As a user, I want my Previews to look exactly as the image model drew them, so that making the Stylist cheaper never makes my Previews smaller or blurrier.

### The Stylist's Notes

20. As a user watching the Stylist's Notes, I want each Preview drawn, redrawn and kept still to appear as its own step, so that I can follow the Preview check as I can today.
21. As a user whose Preview was redrawn, I want a short note saying what was put right, in styling terms, such as "the shoes should be the low-tops in their seller's photo", so that I know why it took longer.
22. As a user whose Outfit was left without a Preview, I want a short note saying it didn't show me as I am, so that a missing Preview doesn't look like a fault.
23. As a user, I want the notes about my Previews never to describe my body, skin, ethnicity or age, never to say what covers my hair, never to state a price, and to say about my face only whether a Preview changed it, so that being styled never feels like being judged.
24. As a user whose Preview was fine as first drawn, I want no extra note about it beyond its step, so that the notes stay short.
25. As a user watching the Stylist's Notes, I want a note in each turn where the Stylist searches or saves, as today, so that its work still reads as a stylist explaining their choices.
26. As a user, I want the notes still to call the Stylist an AI, so that I'm never misled into thinking a person is styling me.

### Face Photo pass-overs

27. As a user with short hair who sent a Face Photo, I want the Stylist to pass over a Style Icon whose signature cut needs much more length than my hair has, so that my Hairstyle actually resembles the cut of the Style Icon who inspired it.
28. As that user, I want to be told why in plain styling terms about the cut's length, such as "His signature long, loose hair needs much more length than a cut from yours can reach", so that I understand the choice.
29. As a user, I want no Style Icon passed over, and nothing written, about my hair's texture, so that no note can read as a remark about my ethnicity.
30. As a user whose Qloo list is mostly Style Icons with long hair, I want at most two passed over for hair length in a Styling, so that I'm not told again and again that my hair is too short, and my Outfits stay near the top of Qloo's picks.
31. As that user, I want any later Style Icon's cut adapted to what my hair can do, as today, so that I still get my Hairstyles.
32. As a user who sent a Full-Body Photo, I want my Hairstyle adapted as today, never a Style Icon passed over for hair length, since my Hairstyle is one Piece of four.
33. As a user asking for "Show 2 more Outfits" on a Face Photo, I want the same rule in that Styling, with at most two more pass-overs for hair length, so that every Styling treats me the same.
34. As a user, I want a Style Icon still passed over for style reasons, such as Brands that clash with my photo, as today, so that the hair-length rule only adds to the Stylist's choices.

### What stays the same

35. As a user, I want the Stylist still to choose each Category's Brand among a Style Icon's top 3 Qloo Brands, to pick each Product, to match colours to what I'm wearing and never to repeat a Brand within a Category, so that my Outfits are as good as today's.
36. As a user, I want my Budget Tier, my Country and every Product's price range, stock and newness still enforced by the tools, so that the cheaper Stylist can't break them.
37. As a user, I want every kind of Styling (a first Styling, "Show 2 more Outfits", a Budget Tier change, a Photo Style change, and Try again) to work as today, so that nothing about asking for Outfits changes.
38. As a user whose Styling breaks, I want Try again to work as today, so that I can carry on.
39. As a user, I want my Outfit Allowance to work as today, so that my limit is unchanged.
40. As a user, I want the consent sheet, the Privacy Policy and the deletion confirmations to stay as they are, so that I'm not asked to consent again: the same companies get the same things.
41. As a user, I want my photo checked as quickly and for the same reasons as today, so that sending a photo works as before.

### The judges, on the Demo Account

42. As a judge on the Demo Account, I want the Stylist to keep its extra room (60 turns, 10 Brand fetches, 40 product searches), so that my Stylings complete when I try the app.
43. As a judge on the Demo Account, I want every Preview checked by the same Sonnet verdict as everyone else's, so that what I see is what users see.

### The team

44. As the team, I want a Styling's Claude cost to come to about a third of today's, so that the $50 monthly limit outlasts the app's own monthly cap.
45. As the team, I want Sonnet's judgement kept for checking Previews, where Haiku fell short, so that the hard rules hold.
46. As the team, I want our code, not either model, to decide which image is kept from Sonnet's verdicts, so that a confused model can't show a Preview that breaks a hard rule.
47. As the team, I want code to enforce at most one redraw per Outfit, so that a Styling's image cost stays bounded.
48. As the team, I want the pass-over tool to enforce the hair-length rule, Face Photos only and at most twice a Styling, so that the rule doesn't rest on the Stylist's judgement.
49. As the team, I want no turn spent on a refused finish or on a Preview tool alone, so that no Styling pays for turns that do nothing.
50. As the team, I want the Stylist's conversation to hold no image but the photo, so that every turn reads less and stays well under the 100,000 tokens past which Haiku costs more.
51. As the team, I want images shrunk only for Claude, never for the image model or what users see, so that saving cost never lowers what users get.
52. As the team, I want a Styling's later verdict calls to read the verdict's rules and the photo from the prompt cache, so that each Outfit's verdict pays only for what's new.
53. As the team, I want every model name, effort and image size Claude is sent in the one AI config, so that each can change without hunting through code.
54. As a developer, I want the fake AI to stay the default, with a fake verdict that plays the existing "redrawn Preview" and "Preview it can't fix" scenarios under their existing names, so that local development and the end-to-end tests keep working and cost nothing.
55. As a developer, I want tests to script each verdict and see what each verdict call was sent, so that every path of the Preview phase can be tested.
56. As the team, I want the Stylist check to report Claude's cost across both models, each priced by its own rate card, so that we can compare it with the last run, 05-59-33.
57. As the team, I want the Stylist check to report, for each Outfit, whether its Preview was redrawn, with what correction, and which image was kept, as it does today, so that we can see whether the verdicts catch the check's deliberately bad Previews.
58. As the team, I want the Stylist check to report Style Icons passed over for hair length, so that we can see the new rule work on the Face Photo cases.
59. As the team, I want the Stylist check still to report turns and time, so that we can see how Haiku's speed compares.

## Implementation Decisions

### Models and the AI config

- **The Stylist's model becomes Claude Haiku 5.5 at high effort.** Its turn's output cap stays as it is.
- **A new setting holds the Preview verdict's model,** Claude Sonnet 5.5 at medium effort, which is what caught the added face.
- **Two new settings hold the most Claude is sent:** 768 pixels on the long side for a seller photo, and 1024 for a Preview.
- **The photo check is unchanged:** Claude Haiku 5.5 at medium effort.
- **The rate cards already price both models,** so no price changes.
- **Gemini's Preview model is unchanged.**

### Our AI interface

- **Our own AI provider interface gains one method that judges a Preview.** It's the one new seam, beside the photo check, the Stylist's model and the Preview. It's called in two ways:
  - **A first draw's verdict** is given:
    - the photo;
    - the Photo Type, and whether the hair is covered;
    - the Outfit's Pieces in Category order: each Product by its title and its seller's photo, which may be missing, and the Hairstyle by its cut's details;
    - the Preview.

    It returns whether the Preview is right. If it isn't, it also returns whether it breaks a hard rule, one correction sentence for the image model, and one note line for the user.
  - **A redraw's verdict** is given the same, plus the first image, the redraw and the first image's verdict. It returns whether the redraw breaks a hard rule, which of the two images shows the Outfit better, and one note line for the user.
- **The hard rules are today's:**
  - a changed or invented face, which on a Body-Only Photo means any face or head added;
  - a removed or changed head covering;
  - anyone else in the photo changed.

  Anything else wrong, such as a wrong garment, a cut not as described or a changed pose, is a fault a redraw may put right.
- **A verdict Claude refuses** comes back as refused, as the photo check reports a blocked photo. Errors behave as the other methods' do: worth retrying, or unretryable, and never carrying anything of the request.
- **Nothing a verdict returns describes the person** beyond whether a Preview changed their face, their head covering or anyone else (ADR-0005). The correction and the note follow today's rules for corrections and notes.

### The Anthropic adapter

- **The verdict goes through the AI SDK's Anthropic provider,** like the photo check: Sonnet 5.5 at medium effort, structured output, thinking display omitted, no temperature, no prefill, and every image inline as its bytes.
- **The verdict's prompt** carries today's "Checking each Preview" rules and hard rules, moved out of the Stylist's prompt, plus the rules for its correction and its note.
- **The verdict's request puts its rules, then the photo, first,** with a cache breakpoint after the photo, so a Styling's later verdict calls read them from cache. Each Outfit's Pieces, seller photos and images come after.
- **The adapter shrinks images before Claude sees them.** A seller photo larger than 768 pixels on its long side, or a Preview larger than 1024, is scaled down to fit, keeping its proportions. Smaller images and the photo are sent as they are. The domain keeps passing full-size images: the image model still gets each seller photo as today, and users see each Preview as it was drawn.
- **The Stylist's model is otherwise unchanged:** prompt caching as today, never forced to call a tool, thinking display omitted.

### The Stylist's loop

- **The Stylist's tools are findStyleIcons, fetchBrands, searchProducts, passOverStyleIcon, saveOutfit, writeNote and finish.** A Face Photo still drops fetchBrands and searchProducts. startPreviews, renderPreview, redrawPreview and keepPreview go. The tools still never change within a Styling.
- **finish ends the loop and is no longer refused** while a Preview waits, since no Preview waits on the Stylist any more. A Styling that saved no Outfit fails as today.
- **The prompt loses its Preview steps and its "Checking each Preview" section,** which move to the verdict's prompt. Its steps end at saving every Outfit the Stylist will make, then calling finish. It still asks for independent tool calls in the same turn and for every note through writeNote.
- **passOverStyleIcon takes a kind of reason: style or hair length.**
  - Hair length is accepted only on a Face Photo, and at most twice in a Styling. A third, or one on any other Photo Type, is refused with a reason that says to adapt the cut instead.
  - A style reason works as today.
  - Either reason is shown to the user as a note, as today.
- **The prompt gains the Face Photo rule:** pass over a Style Icon whose signature cut needs much more length than the person's hair has, giving a reason about the cut's length. Never pass over a Style Icon for the hair's texture, and never write about it: adapt the cut instead. The rest of the Hairstyle rules are unchanged.
- **The Stylist's conversation holds no image but the photo.** No seller photo links reach its model, so its model step no longer fetches any.

### The Preview phase

- **It runs in the Styling's Workflow after the loop ends,** with finish or at the turn cap, for each Outfit saved, with at most 2 Outfits at once as today. It doesn't run after a loop that broke the Styling.
- **The stored stage moves to "Generating Previews" as it starts.** Its count is still the Previews kept, refused or failed out of the Outfits saved.
- **For each Outfit, each call below is a durable step with today's retries:**
  1. **Draw the Preview** as today: the Product photos fetched, then the image model called. A refusal is final and leaves the Outfit with no Preview, and so does a draw that still fails after its retries, as today.
  2. **Ask for the first draw's verdict.** If it's right, keep it. If it's wrong, redraw once, with Sonnet's correction added to the fixed Preview instruction, never in its place.
  3. **Once a redraw is drawn, ask for the redraw's verdict.** Code keeps neither image if both break a hard rule, and the one that doesn't if only one does. Otherwise it keeps the one Sonnet says shows the Outfit better.
  4. **A redraw the image model declined, or couldn't draw,** keeps the first image, unless the first breaks a hard rule. Then it keeps none.
- **When a verdict fails after its retries, or Claude refuses it:**
  - A first draw's verdict leaves the Outfit with no Preview.
  - A redraw's verdict keeps the first image if its verdict found only a fault, and none if it found a hard-rule break.
- **The Preview phase never breaks a Styling.**
- **The Stylist's Notes get the Preview steps as today:** drawn or declined, redrawn, kept. A verdict's note line is added when it leads to a redraw or leaves an Outfit with no Preview, checked like any written note. One that fails the check is dropped silently. The step for a redraw left unkept when its Styling ended goes, since code always keeps an image.
- **Each verdict's step loads its own images:** the photo and the Previews from Blob, and the seller photos from their links. So the run data holds only the Styling's and the Outfit's IDs and the links (ADR-0008).

### What stays as it is

- **The rest of the Stylist's tools:** Qloo's queries, the Brand fetch, the product search and its results, which keep each candidate's full description, and every rule the tools enforce.
- **The limits:** the turn caps (30, and 60 on the Demo Account), the Demo Account's other limits, how many Outfits a Styling makes, and the Outfit Allowance.
- **The photo check.**
- **The consent sheet, the Privacy Policy, the Terms and the deletion copy.** The Privacy Policy's Workflow run data line still lists Previews, though they no longer need to sit there. It's left as it is, since it only overstates.

### Fakes and the check

- **The fake AI gains the verdict.** It records what each verdict call was sent, with images by their fingerprints, as it records Previews. It plays verdicts a test scripts, in order, and otherwise plays its scenario.
- **The scenarios "preview-redrawn" and "preview-unfixable" move from the fake Stylist to the fake verdict,** keeping their names, so the existing environment variable and the end-to-end tests pick them as today.
  - "Redrawn": the first image is wrong but breaks no hard rule, and the redraw is better.
  - "Unfixable": both break a hard rule.
- **The fake Stylist plays today's pipeline without the Preview tools:** it saves its Outfits and calls finish.
- **The Stylist check reports Claude's cost across both models.** The Stylist's turns are priced as its model, and each verdict call as the verdict's model, each with its own total and the sum. It reports the Stylist's cache figures and largest prompt as today.
- **The check reports each Outfit's Preview from the Preview phase:** whether it was redrawn, with what correction, and which image was kept. Its deliberately bad Previews, and serving Previews from an earlier run, still work at the image model, as today.
- **The check reports Style Icons passed over for hair length.**
- **The check runs once, after this spec's work is done,** with the team's go-ahead, on saved Previews, and its report is compared with run 05-59-33.
- **The agentic-stylist spec gets a note** on its Stylist, Preview and model sections, pointing here.

## Testing Decisions

- **A good test drives the app through a seam a caller uses** and checks what comes out: what the user sees, what's stored, and what each model was sent. It never reaches into a prompt builder, a tool's internals or a private helper.
- **The operations seam is the main one,** as in the agentic-stylist spec. Tests start Consultations and Stylings through the operations, run them with the inline Styling runner on the test harness, script the fake Stylist's turns, and script each verdict. New cases:
  - A first draw judged right is kept, with no redraw and no verdict note.
  - A first draw judged wrong is redrawn once, with the verdict's correction added to the Preview's instruction, and the image the redraw's verdict picks is kept.
  - Both images breaking a hard rule leave the Outfit with no Preview. Only the first breaking one keeps the redraw, even when the verdict calls the first better.
  - A declined or failed redraw keeps the first, or none when the first breaks a hard rule.
  - A failing or refused first verdict leaves no Preview. A failing redraw verdict keeps the first after a fault, and none after a hard-rule break. The Styling completes either way.
  - The Preview phase runs after finish and at the turn cap, and never after a turn that broke the Styling.
  - Its stage, count and steps are stored as today. A verdict's note is stored when it redraws or leaves an Outfit without a Preview, and is dropped when it states a price.
  - The Stylist is offered no Preview tool, and its requests hold no image but the photo.
  - finish called in the same turn as saveOutfit goes through.
  - On a Face Photo, two hair-length pass-overs are accepted and a third is refused. On a body photo, a hair-length pass-over is refused. A style pass-over works as today.
  - The Demo Account's limits and every existing rule of the tools still hold.
- **Today's tests of the Preview tools:**
  - The single redraw and keeping none move to the Preview phase.
  - The tests of rendering before every Outfit is saved, and of finish refused while a redraw waits, go with the tools.
- **The Anthropic adapter is tested as it is today,** with the Anthropic API faked at its edge:
  - The Stylist's model is Haiku 5.5 at high effort.
  - The verdict is Sonnet 5.5 at medium effort, with structured output, thinking display omitted, no temperature or prefill, and every image inline.
  - The cache breakpoint comes after the photo.
  - Sizes: a large seller photo arrives at most 768 pixels on its long side, a large Preview at most 1024, and smaller images and the photo unchanged.
  - A refusal comes back as refused, and errors carry nothing of the request.
- **The check is tested as today,** with its cost across both models priced by each one's rate card, its Preview report built from the Preview phase, and its hair-length pass-overs.
- **The end-to-end tests keep passing** on the fake AI, with their scenarios picked through the existing environment variable.
- **Prior art:** the Styling operations tests, the Anthropic adapter's tests, the Stylist check's tests, and the end-to-end tests that pick a fake AI scenario.

## Out of Scope

- A cost target. The aim is as cheap as the quality floor allows.
- Shortening or clearing product search results, context editing and compaction.
- Caching the prompt across Stylings, an hour-long cache, and Anthropic's Message Batches.
- The photo check's cost.
- Gemini's and the product search's costs.
- Changing the consent sheet, the Privacy Policy, the Terms or the deletion copy.
- Changing the Demo Account's limits, the turn caps or how many Outfits a Styling makes.
- A check run with real Nano Banana 2.1 Previews.
- Anything users see beyond the verdict's notes and the Face Photo pass-overs.

## Further Notes

- **The baseline is run 05-59-33,** on Sonnet 5.5 with the note tool and saved Previews: $0.93 of Claude for six Stylings and 65 turns. That's 49% cache writes, 30% cache reads and 21% output.
- **The estimates:** a verdict costs about $0.015–0.02 with shrunk seller photos, and a body-photo Styling makes 2–4 of them. Haiku's turns cost about $0.005–0.01 a Styling.
- **The risk is Haiku's choices.** In its check, Haiku built valid Outfits in every Styling. Sonnet passed over Style Icons for hair length, which the prompt didn't then ask for. The new Face Photo rule now asks for it, and the check's Face Photo cases test it.
- **The Haiku check's times aren't comparable.** Run 05-59-33 drew no images, so it was quicker than a real Styling. The next run's times can be compared with it only roughly.
- **This work lands on the `agentic-stylist` branch, which isn't merged yet.** The team merges it into `main` by hand once this spec's tickets are done, so production goes straight to this Stylist and never runs it on Sonnet 5.5.
