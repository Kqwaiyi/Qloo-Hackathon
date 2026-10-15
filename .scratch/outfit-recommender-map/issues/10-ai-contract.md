# What do we ask the AI model at each step?

Type: grilling
Status: open
Blocked by: 03, 08
Map: [Outfit Recommender](../map.md)

## Question

What exactly does each AI step take in and return?

- **Photo check:** does the photo match the chosen Photo Type? Is there exactly one person? What rejection reasons are shown to the user?
- **Photo Style:** the photo check also returns 1–2 words from a fixed list of Qloo style values ("How does Qloo build and rank Outfits?" proposes edgy, classic, sporty, rugged, glamorous, bohemian, minimalist, preppy, streetwear, chic, casual, elegant). Settle the final list, and what happens when a photo shows no clear style.
- **Piece tailoring:** turning each Brand or Style Icon into a concrete item or haircut suited to the photo (colour, fit, cut), with a one-line "why it suits you". For the Hairstyle, does the model work from the Style Icon's name alone, or also from Qloo's image of them (whose licence isn't stated)? The model chooses the actual Top and Bottom garments, since one clothing Brand can supply both.
- **Preview:** the instruction for one image of the whole Outfit that keeps the person recognisable. A Face Photo changes the hairstyle only.
- **Bad results:** what happens when the model refuses or returns poor output.
