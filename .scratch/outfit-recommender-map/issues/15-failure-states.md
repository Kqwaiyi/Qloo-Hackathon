# What does the user see when a Consultation step fails?

Type: grilling
Status: open
Blocked by: 08, 10, 12
Map: [Outfit Recommender](../map.md)

## Question

In the guided-steps flow chosen in "Prototype the Consultation flow", what does the user see, and what can they do next, when a step fails?

- The photo check rejects the photo for one of the six reasons decided in "What do we ask the AI model at each step?": wrong Photo Type (with the type it looks like, so a switch could be offered), no person, more than one person, too unclear, not appropriate, or hair not visible (Face Photos only). The check runs in the "Get my Outfits" server action before anything is stored, so a rejected photo creates no Consultation (decided in "What's the architecture?").
- The photo is over the size limit or isn't a JPEG, PNG or WebP image (limits in "What's the architecture?").
- Qloo returns too few Style Icons or Brands, even after the quiet widening in "How does Qloo build and rank Outfits?", including when the Style Icons run out and "Show 2 more Outfits" disappears.
- Tailoring fails for an Outfit after its one retry.
- The image model refuses a Preview (final, never retried) or fails it.
- The user hits a usage limit: Consultations per day, "see more" presses, Budget Tier re-runs, or Photo Style re-runs.
- Whether a failed attempt still counts against those limits, and whether the Consultation is kept in history.
