# 06: One-Pieces from real Products

**What to build:** A body-photo Outfit can again be a real dress, jumpsuit or overalls in place of its Top and Bottom, as [ADR-0003](../../../docs/adr/0003-ai-may-merge-top-and-bottom.md) allows, now as a real Product of the Top Brand. A One-Piece is offered only when it passes every filter a Top or Bottom would.

**Blocked by:** 03

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Candidates" (the One-Piece search) and "Tailoring contract", and "Testing Decisions" (Seam 1). Stories 32 and 33.

- [ ] For an Outfit with a Top and a Bottom, one more search covers the Top Brand's One-Pieces that suit the line: dresses for womenswear, jumpsuits or overalls for either. It carries the same market, line, stock, price range and photo rules as any other search, and its candidates qualify by the same rules.
- [ ] An empty One-Piece search leaves the Outfit to separates only, without excluding the Top Brand or falling back to another Brand.
- [ ] Tailoring receives the One-Piece candidates alongside the Top's. The prompt still prefers separates, with no cap. The check accepts either one Piece per Category, or one One-Piece (from the One-Piece candidates) in place of the Top and Bottom.
- [ ] A One-Piece Outfit's card and Preview show the One-Piece as one Product Piece, and the Bottom Brand stays reserved as today.
- [ ] Tests at Seam 1: the One-Piece search's request; One-Piece candidates only when they pass the filters; an Outfit tailored as a One-Piece saving one Product Piece in place of the Top and Bottom; an empty One-Piece search leaving separates.
