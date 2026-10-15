# 11: Hairstyle Pieces tailored to the photo

**What to build:** Each Outfit gets its Hairstyle Piece, tailored by the AI to the user's photo: the cut, the Style Icon who inspired it and one line on why it suits the user, with no price or link. If tailoring fails for a Style Icon, the next one quietly takes its place. With this, a Face Photo Consultation is complete apart from its Previews. Ticket 14 adds the Brand Pieces and the covered-hair rule for body photos.

**Blocked by:** [10 First Styling: Outfits inspired by ranked Style Icons](10-first-styling-style-icons.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "AI provider interface" (2. Tailor one Outfit's Pieces: In, Out, Hairstyle, Bad output; Fake adapter), "Stylings" (Stages; Tailoring failures), "Outfit assembly" (Categories by photo) and "Data model" (Pieces). Stories 94, 97, 98, 115 and 118.

- [ ] The AI provider interface gains its tailoring operation, with structured output. In: the photo itself (never a stored text description of the person), the Photo Type, the age group, the Photo Style, the Outfit's line, the Style Icon's name, and each Piece's Category. Ticket 14 adds the Brand details. It never receives the Country or the Budget Tier.
- [ ] Out, per Piece: `item`, a card label of about 6 words (for the Hairstyle, the cut); `details`, one sentence on colour, fabric, fit and cut, used for the Preview and not shown; and `why`, one line of about 20 words in English and second person. The Hairstyle also carries an "unknown cut" flag.
- [ ] Output is checked against the schema and our rules (the expected Categories, no prices, no empty fields), retried once, then reported as "tailoring failed".
- [ ] Building Outfits is its own Workflow stage, and each AI call is its own step.
- [ ] A Style Icon whose tailoring fails after its retry is marked skipped and the next unused Style Icon is tried. A Styling makes at most 2 such substitutes, so a broken model can't burn through the Style Icons.
- [ ] A Face Photo's Outfits are Hairstyle-only, each one the next Style Icon's Hairstyle. A Full-Body Photo's Outfits also get a Hairstyle Piece.
- [ ] Pieces are stored per Outfit with their Category, `item`, `details`, `why` and, for the Hairstyle, the unknown-cut flag.
- [ ] The fake adapter's tailoring is deterministic and built from its inputs: generic items in the right Categories, a `why` naming the Style Icon, and the cut marked as known. New scenarios: an unknown signature cut, and tailoring failure.
- [ ] The Outfit card's Hairstyle row shows the cut, its Style Icon and why it suits, with no price and no link.
- [ ] Tests cover Face Photo Outfits being Hairstyle-only, unknown-cut Hairstyles, and tailoring substitutes stopping at 2.
