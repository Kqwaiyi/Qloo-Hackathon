# 16: One-Piece Outfits

**What to build:** A menswear or womenswear Outfit's Top and Bottom are sometimes one garment, such as a dress, jumpsuit or overalls, built on the Top Brand. The card shows one One-Piece row, and the Bottom Brand Qloo picked is left out of the Outfit but never offered to a later one.

**Blocked by:** [14 Body-photo Outfits: Brands become Pieces](14-body-photo-brands.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "AI provider interface" (2. Tailor: One-Piece), "Outfit assembly" (De-duplication; Price range) and "Data model" (Outfits: Brand picks; Pieces: Category). Story 95. [ADR-0003](../../../docs/adr/0003-ai-may-merge-top-and-bottom.md).

- [x] Tailoring may return one One-Piece in place of the Top and Bottom, built on the Top Brand. The output checks accept either a Top and a Bottom, or one One-Piece.
- [x] A One-Piece is stored as a Piece with Category One-Piece and the Top Brand's details. The Bottom Brand stays in the Outfit's Brand picks, reserved.
- [x] The card shows one One-Piece row, and the Outfit's price range leaves out the Bottom Brand.
- [x] De-duplication treats a reserved Bottom Brand as used in the Bottom Category.
- [x] The fake adapter gains a One-Piece scenario.
- [x] Tests cover One-Piece cards (server operation) and de-duplication with a reserved Bottom Brand (pure).

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **Piece Categories.** `PIECE_CATEGORIES` in `src/config/consultations.ts` is the four Categories plus `one_piece`, in card order (Hairstyle, Top, Bottom, One-Piece, Shoes), so a One-Piece row sits where the Top and Bottom would. `CATEGORIES` stays the four slots an Outfit fills. A Piece's `category`, `byCategoryOrder` and `CATEGORY_LABELS` ("One-Piece") take a `PieceCategory`. `withOnePiece(categories)` gives the Categories with a One-Piece in place of the Top and Bottom, or null without both.
  - **For /domain-modeling:** `PieceCategory` isn't a glossary term. The glossary calls a Category "one of the four slots", while the spec's data model gives a Piece the Category One-Piece.
- **Data.** Migration 0007 adds `one_piece` to the `category` enum. A One-Piece Piece keeps the Top Brand's entity ID, name, official site and prices. The Outfit still stores all three Brand picks, so the Bottom Brand stays reserved without any change to de-duplication (`brandsUsedBy` already reads the picks, not the Pieces).
- **Tailoring.** `TailoringInput` is unchanged: the model still gets the Top and Bottom with their Brands. The reply schema allows `one_piece`, and `checkTailoredPieces` accepts either one Piece per Category or one One-Piece in place of the Top and Bottom, only when both were asked for. A One-Piece beside a Top or Bottom, or on a Face Photo's Outfit, is bad output. `pieceBrand(category, picks)` in `src/server/outfit-assembly/brands.ts` builds a One-Piece on the Top Brand.
  - **For ticket 34:** the One-Piece rules are written on `AiProvider.tailorPieces`: only when the Top Brand plausibly makes one and it fits the line (a dress for womenswear, a jumpsuit or overalls for either), and the prompt prefers separates, with no cap.
- **The card.** The row reads "One-Piece" with the Top Brand's price and "Visit" link. The Outfit's range is summed from its Pieces, so it leaves out the Bottom Brand with no special case. The Preview gets the One-Piece's `details` in place of the Top's and Bottom's.
- **The fake adapter.** The `one-piece` scenario makes a One-Piece whenever the Top and Bottom are both asked for: a navy shirt dress for womenswear, an olive utility jumpsuit for menswear. A Face Photo tailors as usual. `tailoring-fails` gained a sixth broken reply, an extra One-Piece.
- **Tests.** Server-operation tests cover a One-Piece card (one row on the Top Brand, the price range without the Bottom Brand, the Preview's Pieces and the stored picks) and a later Outfit, planned after the One-Piece was saved, never getting the reserved Bottom Brand. A pure test covers de-duplication with a reserved Bottom Brand, which still lets that Brand be a later Outfit's Top.
- **Checked in the browser.** One no-preference, United Kingdom, 35–44 Full-Body Consultation on local development with `FAKE_AI_SCENARIO=one-piece` and live Qloo. It built a womenswear dress Outfit (Primark, Topshop) and a menswear jumpsuit Outfit (Reebok, Burberry). Each card had one "One-Piece" row on one line in the 80 px label column, and each range summed only the One-Piece and Shoes. There were no console or server errors.
- **Live calls used:** about 5 read-only calls on 2026-10-17 in the browser check (2 person calls, 3 Brand calls).
