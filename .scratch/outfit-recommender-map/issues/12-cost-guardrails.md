# What limits keep AI and Qloo spend bounded?

Type: grilling
Status: open
Blocked by: 03, 08
Map: [Outfit Recommender](../map.md)

## Question

Every Consultation and every "see more" costs real money in Previews, and Qloo allows 10,000 requests a month. What limits do we set?

- Consultations per user per day.
- "See more" presses per Consultation.
- Re-running when the Budget Tier changes.
- Re-running when the user changes the Photo Style: each change re-picks the Style Icons and makes new Previews.
- Qloo use: about 4–5 calls per uncached Consultation (1–2 person calls and 3 Brand calls, see "How does Qloo build and rank Outfits?"), plus about 2 per "see more" and per Budget Tier change, all cached for 30 days.
- Reusing results for identical requests.
- Whether a user can have two Consultations styling at once. "What's the architecture?" already allows only one run at a time per Consultation.
- What users see when they hit a limit.
