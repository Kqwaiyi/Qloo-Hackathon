# Agentic Stylist

Status: ready-for-agent

Every decision here comes from the grilling in this conversation. Use the vocabulary in [GLOSSARY.md](../../GLOSSARY.md), especially the new **Stylist** and **Stylist's Notes**, along with **Styling**, **Style Icon**, **Brand**, **Product**, **Piece**, **Preview**, **Photo Style**, **Budget Tier**, **Main Person**, **Outfit Allowance** and **Demo Account**. This spec carries out [ADR-0010](../../docs/adr/0010-the-stylist-chooses-among-qloos-picks.md) and [ADR-0011](../../docs/adr/0011-claude-runs-every-model-but-the-image-model.md). Respect [ADR-0005](../../docs/adr/0005-photos-edited-never-analysed.md), [ADR-0008](../../docs/adr/0008-pieces-are-real-products.md) and [ADR-0009](../../docs/adr/0009-only-the-main-person-is-styled.md), which still hold, and [ADR-0004](../../docs/adr/0004-adults-only.md), which still holds because Previews stay on Gemini.

## Problem Statement

A user who sends a photo waits a minute or more while a four-item checklist ticks over. They can't see what is happening, and afterwards they can't see why the app picked what it picked. Behind the checklist is a fixed pipeline: Qloo picks the Style Icons and Brands, code always takes the first usable one, and the AI makes one choice, the Product for each Piece. So a sporty user can get heels because the Style Icon's top shoe Brand only sells heels. A Style Icon whose Brands clash with the photo still gets an Outfit. And a Preview with an invented face or the wrong garment reaches the user unchecked, because nothing looks at Previews. The team also wants the app to be genuinely agentic for the hackathon, and wants every model but the image model to run on Anthropic's Claude.

## Solution

Each Styling is carried out by the user's **AI Stylist**. It works in a loop with tools, and it decides more than today's pipeline does:

- **Choosing Brands:** for each Category, it chooses among a Style Icon's top 3 Qloo Brands the one that best fits the photo, the Photo Style and the rest of the Outfit.
- **Passing over Style Icons:** it may pass over a Style Icon that doesn't suit the photo, saying why.
- **Picking Products:** it picks each Piece's Product, as the AI does today.
- **Checking Previews:** it looks at each Preview it draws and redraws once when it's wrong.

Qloo still decides which Style Icons and Brands are candidates. The tools still enforce the Budget Tier, the Country, each Brand's price range, stock, the denylists and the rule that no Brand repeats.

**While the Styling runs**, the waiting screen keeps its checklist exactly as it is. Below it, a collapsed "See what your AI Stylist is doing" control opens the **Stylist's Notes**. These are short notes the Stylist writes to the user, plus each search it makes and each Preview it draws, and they appear about a second after each one happens.

**Afterwards**, the notes stay in a collapsed section under the Outfits, and a failed Styling's notes stay under its failure line.

**Models and privacy:**
- The photo check runs on Claude Haiku 5.5, and the Stylist on Claude Sonnet 5.5, since the Haiku check found Haiku fell short (ticket 12). Previews stay on Gemini's Nano Banana 2.1.
- Photos now also go to Anthropic. The photo notice says so and its version is raised, so every user sees the consent sheet again before their next Consultation.
- Claude's thinking is never shown or stored.
- While a Styling runs, its photo, Previews and the Stylist's conversation sit encrypted in the Workflow's run data. They're unreadable the moment it ends and gone within 36 days, and the Privacy Policy says so.

> **Partly replaced** by the [Cheaper Stylist spec](../cheaper-stylist/spec.md) and [ADR-0012](../../docs/adr/0012-haiku-drives-the-stylist-sonnet-judges-previews.md): Claude Haiku 5.5, at high effort, now drives the Stylist, and the Stylist no longer checks Previews. Once it has saved every Outfit, our code draws each Preview, asks Claude Sonnet 5.5 for a verdict, redraws once on a fault, and keeps an image by the hard rules.

## User Stories

### Waiting for Outfits

1. As a user waiting for my Outfits, I want the same four-item checklist as today (Checking your photo, Finding Style Icons, Building Outfits, Generating Previews), so that the waiting screen stays familiar.
2. As a user waiting for my Outfits, I want a collapsed "See what your AI Stylist is doing" control under the checklist, so that I can choose to watch the Stylist work or just wait.
3. As a user who opens that control, I want to see the Stylist's Notes so far, oldest first, so that I can catch up on what it has done.
4. As a user watching the Stylist's Notes, I want each new note to appear within about a second of the Stylist writing it, so that it feels live.
5. As a user watching the Stylist's Notes, I want each search the Stylist makes and each Preview it draws to appear as its own short step, such as "Asked Qloo for Style Icons popular in Indonesia with a sporty Photo Style" or "Searched Uniqlo's tops: 4 in stock", so that I can follow its work as well as its words.
6. As a user watching the Stylist's Notes, I want the notes written to me, in plain English, so that they read like a stylist explaining their choices.
7. As a user watching the Stylist's Notes, I want them never to describe my body, skin, ethnicity or age, or to state a price, so that being styled never feels like being judged.
8. As a user, I want to be told that the Stylist is an AI, so that I'm never misled into thinking a person is styling me.
9. As a user watching the Stylist's Notes, I want to collapse them again, so that I can go back to the plain checklist.
10. As a user who asked for "Show 2 more Outfits", I want the same "See what your AI Stylist is doing" control on the in-place progress, so that I can watch that Styling too.
11. As a user who changed the Budget Tier or the Photo Style, I want the same control on its waiting screen, so that every Styling can be watched.
12. As a user waiting on Previews, I want "Generating Previews (1 of 2)" to count finished Previews only, so that a redraw doesn't make the count jump around.
13. As a user waiting while the Stylist builds Outfits, I want to be told it's "taking longer than usual" only after about 3 minutes, so that I'm not told it's slow while it's working normally.
14. As a user who leaves the waiting screen and comes back, I want the Stylist's Notes so far to be there, so that I haven't missed anything.

### How the Stylist chooses

15. As a user, I want the Stylist to choose, for each Category, whichever of a Style Icon's top 3 Qloo Brands best suits my photo, my Photo Style and the rest of the Outfit, so that the Outfit goes together.
16. As a user whose Photo Style is sporty, I want the Stylist to skip a Brand that only sells heels for one that sells trainers, saying so, so that I don't get Shoes that clash with my style.
17. As a user, I want the Stylist to pass over a Style Icon whose Brands don't suit my photo, and to tell me why, so that I don't get an Outfit that clashes.
18. As a user, I want the reasons for passing over a Style Icon or a Brand to be about style ("her shoe Brand only sells heels, which don't fit sporty"), never about me or the Style Icon as a person, so that the notes stay respectful.
19. As a user, I want every Style Icon and Brand still to come from Qloo, so that my Outfits stay grounded in what's popular with people like me in my Country.
20. As a user who picked a Budget Tier, I want no Brand outside that tier, whatever the Stylist would like, so that my Budget Tier is kept.
21. As a user, I want every Product still to be sold in my Country, new, in stock and within its Brand's price range, so that I can actually buy it at the price its Brand was picked for.
22. As a user, I want no Brand repeated within a Category across my Outfits, as today, so that my Outfits feel different from each other.
23. As a user, I want each Piece's "why" line as today: one line, to me, never a price, so that the results page reads as it always has.
24. As a user, I want the Stylist to match colours to what I'm wearing, so that the Outfit works with my photo.
25. As a user in womenswear, I want the Stylist still able to make a One-Piece from the Top Brand's dresses, jumpsuits or overalls, as today, so that I can get a dress.
26. As a user, I want my Hairstyle Piece made as today: from the Style Icon's signature cut, or from the Outfit when the cut isn't known, achievable from my own hair, so that the Hairstyle works the same.
27. As a user in a photo with other people, I want the Stylist to style only the Main Person, so that nobody else is dressed or described.

### Checking Previews

> **Partly replaced** by the [Cheaper Stylist spec](../cheaper-stylist/spec.md) ("The Preview phase") and [ADR-0012](../../docs/adr/0012-haiku-drives-the-stylist-sonnet-judges-previews.md): the Stylist no longer checks Previews. Once its loop ends, with finish or at the turn cap, our code draws each Preview and asks Claude Sonnet 5.5 for a verdict on it, redraws once on a fault, and keeps an image by these hard rules. What the user gets is unchanged.

28. As a user, I want the Stylist to check each Preview against my photo and the Products, so that a wrong garment, a changed face or an invented face is caught before I see it.
29. As a user whose Preview is wrong, I want the Stylist to redraw it once, with a correction, so that I get a Preview that shows the Outfit.
30. As a user whose redrawn Preview is still imperfect, I want the Stylist to keep whichever of the two is better, so that I get the best Preview it could make.
31. As a user whose Previews both break a hard rule (my face changed or a face invented, my head covering removed, someone else in the photo changed), I want the Outfit shown with no Preview, as when the image model refuses, so that I never see a Preview that misrepresents me.
32. As a user with a Body-Only Photo, I want a face never added to my Preview, so that the Preview respects the photo I chose to send.
33. As a user whose hair is covered, I want my head covering never removed or changed in my Preview, so that the Preview respects me.

### Every kind of Styling

34. As a user asking for "Show 2 more Outfits", I want the Stylist to know the Brands of my current Outfits, so that the new ones don't repeat them.
35. As a user asking for "Show 2 more Outfits", I want it to carry on down my current Style Icons, as today, so that I get new Style Icons rather than the same ones again.
36. As a user changing the Budget Tier, I want the Stylist to work from my current Style Icons at the new tier, as today, so that only the price changes.
37. As a user changing the Photo Style, I want new Style Icons in tune with it, as today, so that my new Photo Style matters.
38. As a user whose Styling broke, I want Try again to start a fresh Stylist that knows which Style Icons were already used or passed over, so that it picks up where the broken one stopped and never checks my photo again.

### After the Styling

39. As a user whose Outfits have appeared, I want a collapsed "Your AI Stylist's notes" section below them, above "Show 2 more Outfits", so that I can read how they were chosen when I want to.
40. As a user who opens that section, I want one entry for each Styling behind the Outfits shown (such as "First Styling", then "Show 2 more Outfits"), oldest first, so that I can tell which notes explain which Outfits.
41. As a user who changes the Budget Tier or the Photo Style, I want the old Outfits' notes gone with those Outfits, so that the section only explains what's on the screen.
42. As a user whose Styling failed, I want its Stylist's Notes collapsed under the failure line, so that I can see what went wrong (such as "every Brand's shoes were out of stock in your Country").
43. As a user with a Consultation from before this change, I want its results page shown as before, with no notes section, so that nothing looks broken.
44. As a user who deletes a Consultation or my account, I want its Stylist's Notes deleted with it, so that nothing is left behind.

### Photo check

45. As a user, I want the photo check to accept and reject photos for the same reasons, with the same messages, as today, so that sending a photo works as before though Claude now runs it.
46. As a user whose photo Claude won't look at, I want it rejected as not appropriate, as when Google blocks a photo today, so that the outcome is the same.
47. As a user, I want the photo check to stay quick, so that I'm not waiting at upload.

### Consent and privacy

48. As an existing user, I want to see the consent sheet again before my next Consultation, so that I agree to my photos now going to Anthropic as well as Google.
49. As a user, I want the consent sheet to say my photos go to Anthropic's Claude and Google's Gemini, so that I know who gets them before I send one.
50. As a user, I want the Privacy Policy to name Anthropic, say what it gets (my photos, my Previews, the seller photos of my Products, and the Stylist's conversation), how long it keeps them, and that it doesn't train on them, so that I can decide whether to use the app.
51. As a user, I want the Privacy Policy to list the Stylist's Notes among what's stored about a Consultation, and when they're deleted, so that the retention schedule is complete.
52. As a user deleting my account or a Consultation, I want the confirmation to name Anthropic's retention as well as Google's, and to say the Workflow's copies are gone within 36 days, so that I know where copies remain.
53. As a user, I want the Privacy Policy to say that my photo, Previews and the Stylist's conversation sit encrypted in Vercel's Workflow run data while a Styling runs, can't be read once it ends, and are gone within 36 days, so that I know exactly where copies remain.
54. As a user, I want the Stylist's thinking never received or stored, so that nothing it might guess about me is kept.
55. As a user, I want the Stylist's working conversation unreadable as soon as the Styling finishes, so that only the notes I can see stay in use.
56. As a user on the Demo Account, I want the consent sheet before every Consultation, as today, so that each person using it agrees.

### Failures and limits

57. As a user, I want a Styling to break, keeping any earlier Outfits and offering Try again, when Anthropic is down or the Stylist stops part-way, so that I can try again rather than get something half-made.
58. As a user, I want a Styling that runs out of turns to keep the Outfits it saved, so that the Stylist's work so far isn't thrown away.
59. As a user, I want a Styling that made no Outfit to fail as today, so that the failure lines stay the same.
60. As a user, I want the Outfit Allowance to work as today, counting each Outfit once it's shown, so that my limit is unchanged.

### The judges, on the Demo Account

61. As a judge on the Demo Account, I want the Stylist to have more room on each Styling (60 turns, 10 Brand fetches, 40 product searches), so that my Stylings complete when I try the app.

### The team

62. As the team, I want every one of the Stylist's limits enforced by its tools, not by its judgement, so that a confused model can't overspend or break the rules.
63. As the team, I want at most 30 turns per Styling (60 on the Demo Account) and at most 1 redraw per Outfit, so that one Styling's cost is bounded.
64. As the team, I want a $50 monthly spend limit on the Anthropic workspace, as on the Gemini project, so that the public demo can't run up a bill.
65. As the team, I want a check that runs the real Stylist on fixed, AI-generated photos and reports whether it built valid Outfits, how many turns and how long it took, and what it cost, so that we know Haiku 5.5 is good enough before production switches.
66. As the team, I want that check to show the Stylist deliberately bad Previews and report whether it caught them, so that we know its Preview check works.
67. As the team, I want every model name in one config place, so that moving the Stylist to Sonnet 5.5 is a one-line change if Haiku falls short.
68. As a developer, I want the fake AI to stay the default, with a fake Stylist that plays today's pipeline, so that local development and tests cost nothing and the existing Styling tests keep their meaning.
69. As a developer, I want fake Stylist scenarios I can pick through the existing environment variable (passing over a Style Icon, a second Brand, a redrawn Preview, a Preview it can't fix, a Styling that breaks), so that I can see every path locally and in end-to-end tests.
70. As the team, I want the landing page's copy to say that Qloo finds the candidates and the AI Stylist chooses among them, picks real Products and checks each Preview, so that the landing page describes the app truthfully.
71. As the team, I want the landing sample script to keep working on the new Stylist, so that we can remake the sample later.

## Implementation Decisions

### The Stylist and its tools

> **Partly replaced** by the [Cheaper Stylist spec](../cheaper-stylist/spec.md) ("The Stylist's loop") and [ADR-0012](../../docs/adr/0012-haiku-drives-the-stylist-sonnet-judges-previews.md): the Stylist's tools are findStyleIcons, fetchBrands, searchProducts, passOverStyleIcon, saveOutfit, writeNote and finish. Drawing, redrawing and keeping a Preview are no longer tools: our code draws and judges each Preview after the Stylist finishes ("The Preview phase"). Finish is never refused. Passing over a Style Icon takes a kind of reason, style or hair length, and hair length is accepted only on a Face Photo, at most twice a Styling.

- **The Stylist runs on the AI SDK's Workflow agent** (ADR-0011). Our own AI interface supplies the agent's model, configured for the Stylist, beside the photo check and the Preview, so which provider runs it still appears only in the adapters. The tailoring method goes: the Stylist's "save an Outfit" tool takes its place. The agent's package is added, pinned to the release built for the app's AI SDK version, since each release pins exactly one.
- **The Stylist's tools** are the only way it acts. Each tool checks its own rules and returns an error the Stylist can read and correct in its next turn, instead of today's "ask again once":
  - **Find Style Icons:** today's person calls for the Styling's lines, ranked and saved as today. It's offered only to Stylings that rank their own Style Icons. Others get the current list in their brief.
  - **Fetch a Style Icon's Brands:** today's Brand call, widening included. It returns, for each Category, the top 3 usable Brands the product search knows, looking Brands up as today. Capped at 6 Style Icons per Styling (10 on the Demo Account).
  - **Search a Piece's Products:** today's product search with today's filters, for one of those Brands in one Category (and the Top Brand's One-Pieces). It returns the qualifying candidates by their words alone, kept with the Styling as today. Capped at 24 searches per Styling (40 on the Demo Account), each counted once towards the monthly backstop as today.
  - **Pass over a Style Icon,** with a reason in style terms. It marks the Style Icon skipped, as today, and adds the reason to the notes.
  - **Save an Outfit:** the Style Icon; for each Category, a Brand among that Style Icon's top 3 for it; for each Piece, a Product by ID among that Brand's searched candidates (or a One-Piece in place of the Top and Bottom); the Hairstyle's cut, details and whether the cut is known; and each "why". It applies every rule today's tailoring check applies (one Piece per Category, IDs among candidates, no prices, the Hairstyle's fields), plus that no Brand repeats within a Category across the Consultation's current Outfits and this Styling's.
  - **Render a Preview** for a saved Outfit. It opens only once the Stylist says it has saved every Outfit it will make, so the checklist keeps its order. As today, the Product photos are fetched, the image model is called, and a refusal is final. At most 2 run at once.
  - **Redraw a Preview** with one correction sentence the Stylist writes, added to the fixed Preview instruction rather than replacing it. At most once per Outfit.
  - **Keep a Preview:** the first image, the redraw, or none when both break a hard rule (a changed or invented face, a removed head covering, another person changed). None leaves the Outfit with no Preview, as a refusal does.
  - **Finish.**
  - **Write a note** to the user, its text checked like any written note. Claude Sonnet 5.5 returns a note longer than a sentence or two as a progress-update thinking block, empty under the "omitted" display, so the prompt asks for every note through this tool, called first in the turn whose calls it explains. It's offered from the first turn, so the tools never change within a Styling.
- **Qloo's queries are built exactly as today.** The Brand query never carries the Photo Style (ADR-0002). The Stylist may weigh the photo and the Photo Style only when choosing among what came back (ADR-0010).
- **A brief for each kind of Styling:**
  - **A first Styling** finds its own Style Icons.
  - **"Show 2 more Outfits"** gets the next unused Style Icons and the current Outfits' Brands.
  - **A Budget Tier change** gets the current Style Icons and the new tier.
  - **A Photo Style change** finds new Style Icons for the new Photo Style.
  - **Try again** gets the Style Icons the broken Styling used or passed over, and never checks the photo again.

  How many Outfits each Styling may make is decided as today, by the shared start check.
- **The Stylist's prompt** carries today's tailoring rules: style only the Main Person, named as the most prominent person; never guess age or gender, never infer ethnicity, skin tone, body measurements or health; no prices; prefer separates to a One-Piece; the Hairstyle rules. It adds the rules for notes: second person, English, short, about style, naming Qloo but not the product search provider.

### The loop

> **Partly replaced** by the [Cheaper Stylist spec](../cheaper-stylist/spec.md) ("The Stylist's loop", "The Preview phase") and [ADR-0012](../../docs/adr/0012-haiku-drives-the-stylist-sonnet-judges-previews.md): the Stylist's conversation holds no image but the photo. No Preview or seller photo enters it, so its model step fetches none. The Preview phase runs in the Styling's Workflow once the loop ends, with finish or at the turn cap, and never after a turn that broke the Styling.

- **The loop is the Workflow agent's** (ADR-0011). A Styling's Workflow loads what the brief needs in a step, then runs the agent. Each model call is a durable step the agent makes, and each tool's work is a durable step of ours.
  - **The conversation** lives in the run, not in our database. The agent sends the whole conversation each turn, the photo included, and keeps Claude's thinking blocks as Claude needs them back.
  - **The photo** enters the conversation once, at the start, read from Blob in a step.
  - **A Preview the Stylist checks** enters the conversation as its image, read from Blob by the step that rendered it.
  - **Seller photos** enter only as their public URLs. The model step fetches them, so the run data holds the URL, never the image.
  - **Tool steps** keep today's retries and today's at-once limits: 3 Qloo calls, 3 product-search calls, 2 Previews. Each gets the Styling's ID and the call's input, and loads the rest itself.
  - **Notes reach our database** from a step after each model call: the agent's step-end callback hands it the turn's text. Tool steps write their own entries. The Stylist's Notes never wait on the run's data. (The Workflow agent calls its step-end callback only once the turn's tools are done, so ticket 05 saves a turn's text as its first tool starts, from the turn's own message, and keeps the step-end callback for a turn with no tool call.) The notes a turn writes with the note tool are saved from that message too, after its text and before any of its tools' steps, in the order it wrote them.
  - **Styling runs keep starting with zero retention,** so the run data is unreadable the moment the Styling ends and gone within 36 days.
- **The turn cap** is a stop condition on the agent: 30 turns per Styling, 60 on the Demo Account. A Styling that reaches it finishes with the Outfits it saved, as if the Stylist had called Finish. It replaces today's 2 tailoring attempts and 2 substitutes: a Stylist that keeps getting an Outfit wrong is bounded by its turns instead.
- **When a step fails:** a turn that still fails after its retries, or that Claude refuses, breaks the Styling, keeping what today's finish keeps. A tool that still fails after its retries behaves as today: a product search that never answers passes that Brand over, and every search failing breaks the Styling.
- **Stuck Stylings** are finished by whatever next reads their status after 10 minutes without progress, as today.

### Storage

- **The Stylist's conversation** isn't stored by us: it lives in the run's data (see The loop). With thinking display omitted, its thinking blocks hold no text.
- **The Stylist's Notes** are a new table: one Styling's entries, in order. Each is either a note the Stylist wrote or a step our code wrote for a tool call and its result. Our code writes the steps from the data (Qloo's names, the Brand, the Category, counts), so names never come from the model.
  - Each written note is checked like a "why" line: not empty, no price, and a short length cap. A note in a turn's text that fails is dropped silently. One written with the note tool is refused instead, saying why, so the Stylist can write it again. Either way the user never sees it. A note written with the tool, or a pass-over reason, that its turn has already shown isn't shown again.
- **Which notes are kept:** a Styling's notes are kept while any of its Outfits is current, or while it is the failed Styling whose line the Consultation shows. A Styling that switches in and replaces the current Outfits deletes the notes of the Stylings it replaced. Everything goes with the Consultation and the account.
- **The stored stage moves with the tools:**
  - Finding Style Icons: "Finding Style Icons".
  - Fetching Brands, searching Products and saving Outfits: "Building Outfits".
  - Rendering, redrawing and keeping Previews: "Generating Previews". Its count is the Previews kept, refused or failed out of the Outfits saved.

### What users see

- **The Styling status** that the waiting page polls once a second also returns the Styling's notes after a given index. The page sends how many it already has, so each poll carries only new entries.
- **The waiting screen:**
  - The checklist is unchanged.
  - Under it is a "See what your AI Stylist is doing" control, collapsed by default, that shows the Stylist's Notes in order.
  - The notes list isn't announced as it grows, since the checklist already announces progress.
  - The in-place progress for "Show 2 more Outfits" gets the same control.
- **The results page:** a collapsed "Your AI Stylist's notes" section below the Outfits, above "Show 2 more Outfits". It has one entry per Styling behind the current Outfits, labelled by kind ("First Styling", "Show 2 more Outfits", "Budget Tier changed to Medium", "Photo Style changed to edgy"), oldest first. A failed Styling's notes sit collapsed under its failure line. Each first mention on a screen says "AI Stylist".
- **The "taking longer than usual" line** waits 3 minutes on "Building Outfits". Every other item keeps 60 seconds.

### Models and providers

> **Partly replaced** by the [Cheaper Stylist spec](../cheaper-stylist/spec.md) ("Models and the AI config", "The Anthropic adapter") and [ADR-0012](../../docs/adr/0012-haiku-drives-the-stylist-sonnet-judges-previews.md): Claude Haiku 5.5, at high effort, drives the Stylist. Its turn's output cap is unchanged, and its prompt caching, thinking display and never-forced tool calls are as here. Claude Sonnet 5.5, at medium effort, judges each Preview in a call of its own, through a new method of our AI interface. Claude is sent each seller photo at most 768 pixels on its long side and each Preview at most 1024. The photo check and the Preview model are unchanged.

- **Models:** Claude Haiku 5.5 for the photo check (medium effort), and Claude Sonnet 5.5 for the Stylist (medium effort), moved from Haiku 5.5 at high effort after the Haiku check (ticket 12). Gemini's Nano Banana 2.1 for Previews. Every model name stays in the AI config. The Gemini photo-check and tailoring model settings go.
- **The new Anthropic adapter** implements the photo check and supplies the Stylist's model, both through the AI SDK's Anthropic provider at the version built for the app's AI SDK. The Gemini adapter keeps only the Preview.
  - **The photo check** keeps its prompt, its report and its rejection order, and our code still decides. It is asked for structured output. A refusal is reported as blocked.
  - **The Stylist** is never forced to call a tool, because Haiku skips thinking when forced.
  - **Neither** sets temperature or prefills a reply, which these models reject.
- **Thinking display is "omitted"** for both. Nothing shows or stores thinking text.
- **Prompt caching:** the Stylist's stable prefix (tools, brief and photo) is cached, so each turn reads the photo from cache rather than paying for it again.
- **Errors:** as in the Gemini adapter, an Anthropic error is stripped of its request before it's thrown or logged, so the photo never reaches a log. For the Stylist, that means wrapping the model the agent calls. A request Anthropic will refuse again, such as a bad request or key, is unretryable.
- **Switching real AI on:** the setting that does so needs both an Anthropic and a Gemini key, and the app refuses to start without either. The example environment file documents the Anthropic key.
- **The $50 monthly spend limit** is set by the team on the Anthropic workspace, not in code.

### Consent, legal and landing copy

- **The photo notice** says photos go to Anthropic's Claude and Google's Gemini. The second tick box says the same. The notice version goes up by one.
- **The Privacy Policy:**
  - It names Anthropic as a processor and says what it gets: photos, Previews, seller photos when a Preview is checked, and the Stylist's conversation.
  - It says how long Anthropic keeps them. It states the longer of Anthropic's own published figures (within 30 days), and up to 2 years for anything its trust and safety team flags.
  - It says Anthropic doesn't train on them.
  - It lists the Stylist's Notes among what's stored about a Consultation, with when they're deleted.
  - Its Product-photo paragraph adds Anthropic, which gets each seller photo's link.
  - Its Workflow run data line, and the matching row of the photo schedule, now say that run data holds the photo, its Previews and the Stylist's conversation, encrypted, while a Styling runs. They're unreadable the moment it ends and every copy is gone within 36 days. Seller photos are only ever links there.
- **The Terms' list** of what Outfits and Previews are ("made automatically by Qloo and AI", "AI-generated") gains one line: the AI Stylist's notes are written by AI and may not always be right.
- **The deletion confirmations** name Anthropic's retention next to Google's. "Leftover records in our providers' systems are gone within a day" becomes "within 36 days", since nothing can delete a finished run's data sooner.
- **The landing page's copy**, wherever it says what Qloo and the AI do, now says that Qloo finds the candidates and the AI Stylist chooses among them, picks real Products and checks each Preview. The frozen landing sample isn't remade.

### Fakes and the check

- **The fake AI's Stylist** is a scripted fake model that the fake AI supplies to the agent, in place of Claude:
  - **By default it plays today's pipeline:** Qloo's order, each Category's first usable Brand, each Piece's first candidate, and every Preview kept on the first draw. It writes deterministic notes.
  - **Today's tailoring scenarios** (One-Piece, unknown cut, bad replies) become fake-Stylist behaviours.
  - **New scenarios:** passing over the first Style Icon, picking a second Brand, redrawing a Preview, a Preview it can't fix, and a Styling that breaks part-way.
  - **The existing environment variable** picks a scenario, as today.
- **The Haiku check** is a team script like the existing check scripts. It costs money, so it runs only with the team's go-ahead.
  - It runs the real Stylist on fixed, AI-generated photos: the landing sample's, and others like it.
  - It reports, for each run: whether the Outfits are valid, the turns used, the time taken, the cost, and the largest prompt.
  - It also shows the Stylist deliberately bad Previews and reports whether it caught them. The bake-off's images were never committed, so the script makes its own bad Previews: Nano Banana 2 Lite on a Body-Only Photo with no face, which invented one in the bake-off, plus Previews with known faults.
  - Production switches only after the team has read the report.
- **The outfit-recommender and real-products specs** get a note on their tailoring sections, pointing to this spec.

## Testing Decisions

- A good test drives the app through a seam a caller uses and checks what comes out: what the user sees, what's stored, and what was sent to Qloo, the product search or the AI. It never reaches into the Stylist's prompt builder, a tool's internals or a private helper.
- **The operations seam is the main one.** Tests start Consultations and Stylings through the operations, run them with the inline Styling runner on the test harness, and use the fake Stylist.
  - **The inline runner** calls the Stylist's Workflow function directly. Without the Workflow compiler, its directives do nothing, so the agent's steps run as ordinary functions. Confirm this first, in the ticket that brings in the agent. If the agent needs the Workflow runtime even so, the inline runner uses the Workflow SDK's Vitest plugin instead, which runs whole workflows in-process.
  - **Today's Styling tests** keep testing the rules the tools now enforce, on the default fake Stylist: thin pools, widening, price ranges, markets and currencies, the denylists, the 24-search cap, the Brand-fetch cap, unknown Brands, failed searches, One-Pieces and the Outfit Allowance.
  - **Tests that were about tailoring replies** move to the "save an Outfit" tool's refusals. The tests of tailoring substitutes go, replaced by the turn-cap tests.
  - **New cases, with the fake Stylist's turns scripted:**
    - It picks a Style Icon's second or third Brand for a Category and the Outfit saves.
    - A 4th Brand, or a Brand Qloo didn't return, is refused.
    - A repeated Brand within a Category is refused.
    - A Product that isn't among the candidates is refused.
    - Passing over a Style Icon marks it skipped and adds its reason to the notes.
    - Rendering before every Outfit is saved is refused.
    - A redraw is allowed once per Outfit and a second is refused.
    - Keeping none leaves the Outfit without a Preview.
    - The 31st turn, or the 61st on the Demo Account, finishes the Styling with what it saved.
    - The Demo Account's 10 Brand fetches and 40 searches.
    - A turn that throws breaks the Styling.
    - Each kind of Styling gets its brief: Try again knows the Style Icons already used, and "Show 2 more Outfits" knows the current Outfits' Brands.
    - Notes are stored in order, tool steps are written from the data, and a note with a price is dropped.
    - The status returns only notes after the index asked for.
    - Notes are kept while their Outfits are current, deleted when a re-styling replaces them, kept under a failure line, and deleted with the Consultation and the account.
    - The fake model receives the photo once, each checked Preview as an image, and seller photos only as links.
    - The stored stage and the Preview count follow the tools.

  Prior art: the operations tests for Stylings, Consultations, the Demo Account's Consultations, deletion and the daily sweep, and the inline runner's retry options.
- **The Anthropic adapter** is tested against a fake Anthropic API, the way the Gemini adapter is tested against a fake Gemini:
  - **The photo check:** the request carries the photo inline, the photo check prompt, structured output, medium effort and thinking display omitted, and the report carries what the model said. A refusal comes back as blocked.
  - **The Stylist's model:** one of its calls carries the brief, tools, conversation and photo with cache control, at high effort, with thinking display omitted. Its text and tool calls come back, and a failed call's error has lost its request.
  - **Errors:** which ones are worth retrying, and that neither the photo nor the request appears in an error.
  - **The Gemini adapter's tests** drop the photo check and tailoring.

  Prior art: the Gemini adapter tests and the AI environment tests.
- **The browser seam** is Playwright, end to end, on the fake AI:
  - The waiting screen's control opens and fills with notes.
  - The results page shows the "Your AI Stylist's notes" section with one entry per Styling.
  - A failed Styling shows its notes under its line.
  - An existing user sees the consent sheet again.

  Prior art: the new-Consultation and app-pages end-to-end tests.
- **Copy** on the consent sheet, Privacy Policy, Terms, deletion confirmations and landing page isn't tested automatically. The repo has no component tests, so check it by eye in the running app. The photo notice version bump is covered by the existing photo consent test.
- **The Haiku check** is a team script, not a test, and never runs in CI.

## Out of Scope

- Showing Claude's thinking, whether summarised or through Anthropic's progress-updates display.
- Streaming notes word by word, or any channel other than the existing status poll.
- Stylist's Notes on the landing page, or remaking the frozen landing sample.
- Notes on each Outfit card.
- Running the Stylist on Sonnet 5.5 or Opus 5.5, unless the Haiku check falls short (then it's a one-line change, in a follow-up).
- Letting the Stylist write its own Qloo queries, use a Style Icon or Brand Qloo didn't return, or loosen a product search.
- Letting the user talk to or steer the Stylist.
- Zero data retention with Anthropic.
- Any change to the Outfit Allowance, the app-wide caps, the photo-check limit, or the Qloo and product-search backstops.
- Any change to the Preview model.
- Notes for Consultations made before this change.

## Further Notes

- ADR-0010 and ADR-0011 record why the other options were turned down: the Stylist only driving or driving Qloo, one Stylist per Outfit, no Preview check, a loop of our own, Sonnet for the Stylist, and Anthropic's own progress updates as the notes.
- The photo notice bump means every active user meets the consent sheet once more after this ships. That's deliberate: photos now go to a second processor.
- Haiku 5.5 costs more per token once a prompt passes 100,000 tokens. The agent sends the whole conversation every turn, and Claude refuses edits to earlier turns that carry thinking, so the conversation has to stay small from the start: candidates as compact lines, tool results without anything the Stylist doesn't need. The Haiku check reports the largest prompt it saw.
- Each model step's stored input is the whole conversation so far, so the photo is stored once per turn in the run data, encrypted. With zero retention, none of it is billed as retained data.
- A Consultation deleted while its Styling runs cancels the run. Cancelling ends it, which starts its 36 days.
- Anthropic's own documents disagree on how long API inputs and outputs are kept by default. The Privacy Policy states the longer figure.
- Anthropic's Usage Policy requires consumer agents to say they are AI, which is why the UI says "AI Stylist".
- A rough estimate is a few cents of Claude per Styling on Haiku, on top of the Gemini Previews. The Haiku check measures the real figure.
- Prompt caches are per model, so changing the Stylist's model or effort part-way through a Styling would miss the cache.
