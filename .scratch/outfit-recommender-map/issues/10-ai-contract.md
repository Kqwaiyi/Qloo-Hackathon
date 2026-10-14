# What do we ask the AI model at each step?

Type: grilling
Status: open
Blocked by: 03, 08
Map: [Outfit Recommender](../map.md)

## Question

What exactly does each AI step take in and return?

- **Photo check:** does the photo match the chosen Photo Type? Is there exactly one person? What rejection reasons are shown to the user?
- **Piece tailoring:** turning each Brand or Style Icon into a concrete item or haircut suited to the photo (colour, fit, cut), with a one-line "why it suits you".
- **Preview:** the instruction for one image of the whole Outfit that keeps the person recognisable. A Face Photo changes the hairstyle only.
- **Bad results:** what happens when the model refuses or returns poor output.
