# 16: One-Piece Outfits

**What to build:** A menswear or womenswear Outfit's Top and Bottom are sometimes one garment, such as a dress, jumpsuit or overalls, built on the Top Brand. The card shows one One-Piece row, and the Bottom Brand Qloo picked is left out of the Outfit but never offered to a later one.

**Blocked by:** [14 Body-photo Outfits: Brands become Pieces](14-body-photo-brands.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "AI provider interface" (2. Tailor: One-Piece), "Outfit assembly" (De-duplication; Price range) and "Data model" (Outfits: Brand picks; Pieces: Category). Story 95. [ADR-0003](../../../docs/adr/0003-ai-may-merge-top-and-bottom.md).

- [ ] Tailoring may return one One-Piece in place of the Top and Bottom, built on the Top Brand. The output checks accept either a Top and a Bottom, or one One-Piece.
- [ ] A One-Piece is stored as a Piece with Category One-Piece and the Top Brand's details. The Bottom Brand stays in the Outfit's Brand picks, reserved.
- [ ] The card shows one One-Piece row, and the Outfit's price range leaves out the Bottom Brand.
- [ ] De-duplication treats a reserved Bottom Brand as used in the Bottom Category.
- [ ] The fake adapter gains a One-Piece scenario.
- [ ] Tests cover One-Piece cards (server operation) and de-duplication with a reserved Bottom Brand (pure).
