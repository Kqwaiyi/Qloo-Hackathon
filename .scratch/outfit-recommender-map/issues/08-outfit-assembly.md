# How does Qloo build and rank Outfits?

Type: grilling
Status: open
Blocked by: 01, 02
Map: [Outfit Recommender](../map.md)

## Question

What exact recipe turns a user (age, Style Preference), a Photo Type and a Budget Tier into ranked Outfits?

- Which Style Icons, and in what order?
- Which Brand supplies each Piece, and how are Top and Bottom told apart?
- How Budget Tier applies, including mixing tiers under No Budget.
- What "top 2" and "see more" mean, and when we run out.
- When to fall back to Outfits themed on a shared style tag.
- Which Qloo calls are cached, and for how long.
- How the two research recipes combine. The Style Icon recipe passes the Style Icon as `signal.interests.entities`. The brand-filter recipe uses a popularity floor, `genre:brand:fashion`, `target_age_group`, a US market tag, and `personal_style` tags the AI reads from the photo. Does having the AI read style tags from the photo fit ADR-0001 (Qloo decides), or does it make the AI a co-decider?
- How Outfits stay distinct when similar Style Icons share most of their Brands.
