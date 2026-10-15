# The AI reads a Photo Style that steers Qloo's Style Icon picks

ADR-0001 makes Qloo the only decider of what is recommended, but with nothing from the photo reaching Qloo, every user with the same age, Style Preference and Country would get the same Style Icons and Brands. So the AI also describes the photo as a Photo Style: one or two words from a fixed list of Qloo's own style vocabulary (edgy, classic, sporty…). The Photo Style is sent to Qloo as a signal on the Style Icon query only. Qloo still picks and orders the Style Icons, and each Outfit's Brands come from its Style Icon alone, never from the Photo Style. The user sees the Photo Style on the results and may change it, which re-picks the Style Icons; the AI never ranks anything itself.

## Considered Options

- **The photo never feeds Qloo**: fully predictable and cacheable per segment, but Outfits for users with the same profile differ only in tailoring.
- **The Photo Style also steers Brands**: more personal, but it lets the AI shape every Piece and multiplies the Brand cache keys.
- **Brand entities as the signal instead of style words**: tested; it works but is noisier than Qloo's style tags.
