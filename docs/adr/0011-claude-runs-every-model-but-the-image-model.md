# Claude runs every model but the image model, in the AI SDK's Workflow agent

The photo check and the Stylist ([ADR-0010](0010-the-stylist-chooses-among-qloos-picks.md)) run on Anthropic's Claude Haiku 5.5: the photo check at medium effort, the Stylist at high. Previews stay on Gemini's Nano Banana 2.1, which the Preview bake-off picked. Both sit behind our own AI interface, as [ADR-0001](0001-qloo-selects-ai-concretizes.md) asks, through the AI SDK's Anthropic provider. The Stylist's loop is the AI SDK's ready-made Workflow agent rather than one of our own: each model call and each tool call is a durable Workflow step, and we write far less code. That agent passes the whole conversation into each model step, the photo and any Preview it checks included, and Vercel keeps step inputs as Workflow run data. So, while a Styling runs, its photo, Previews and conversation sit encrypted in that run data. Styling runs already start with zero retention, which makes run data unreadable the moment the Styling ends and has Vercel delete every copy within 36 days. The Privacy Policy now says so, where it used to promise that run data never holds an image. Claude's thinking display is set to omitted, so no thinking text ever reaches us. What users see are notes the Stylist writes under our prompt, which our code checks and saves to our own database.

## Considered Options

- **A loop of our own**: each turn a step given only the Styling's ID, loading the conversation from our database and the photo from Blob, so no image ever reaches the run data and the Privacy Policy's promise stands. More code to write and keep, beside an agent the AI SDK already provides.
- **The Workflow agent, passing the photo as a URL**: the Blob store is private, so it would need a public or signed URL, which then sits in the run data instead.
- **Sonnet 5.5 for the Stylist**: likely better judgement, at about 20 times the price and slower.
- **Keep the photo check on Gemini and never show the Stylist the photo**: Anthropic would get no photos and nobody would consent again, but the Stylist couldn't match colours or check Previews.
- **Anthropic's own progress updates as the notes**: no extra output to pay for, but a beta that doesn't keep to our prompt's rules, and not offered on Haiku.

## Consequences

- Anthropic is a second processor of photos, and of Previews and seller photos when the Stylist checks a Preview. The photo consent's version is bumped, so every user consents again before their next Consultation, and the Privacy Policy, Terms and deletion copy name Anthropic and how long it keeps what it gets.
- Vercel's run data now holds photos and Previews while a Styling runs. Nothing can delete a finished run's data sooner than Vercel does, so deleting a Consultation or an account leaves those unreadable copies until Vercel's 36 days are up, and the deletion copy says "within 36 days" where it said "within a day".
- Seller photos go to the agent as their public URLs, fetched inside the step that sends them, so the run data holds only the URL ([ADR-0008](0008-pieces-are-real-products.md) still holds: they're never stored).
- The AI SDK now appears in the Stylist's Workflow as well as in the adapters. Which provider the Stylist runs on still appears only in the adapters, and the agent's package is pinned to the version built for the app's AI SDK.
- [ADR-0004](0004-adults-only.md) still holds: Previews stay on Gemini, whose terms set the age, and Anthropic's Usage Policy has its own rules for minors.
- Haiku 5.5 costs more per token once a prompt passes 100,000 tokens, so the Stylist's conversation is kept under that.
- The Anthropic workspace has a $50 monthly spend limit, as Gemini's project does, and each Styling a cap of 30 turns (60 on the Demo Account).
