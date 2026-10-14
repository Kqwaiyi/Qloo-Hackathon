# What's the architecture?

Type: grilling
Status: open
Blocked by: 03, 04, 05
Map: [Outfit Recommender](../map.md)

## Question

How is the Next.js app on Vercel put together?

- Backend shape: route handlers, server actions, or both.
- Database and ORM.
- Storage for photos and Previews.
- Auth library and email provider, including whether the team buys a domain: every free email provider needs one before it will email arbitrary users, and email verification and reset depend on it.
- How the Consultation pipeline (photo check → Outfit assembly → Piece tailoring → 2 Previews, then 2 more on "see more") runs within Vercel's limits: one streamed request, or a background job the browser polls or subscribes to.
- Where the swappable AI provider seam sits (ADR-0001).
