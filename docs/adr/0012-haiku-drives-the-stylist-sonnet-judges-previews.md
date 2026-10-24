# Haiku drives the Stylist, and Sonnet judges each Preview

On Claude Sonnet 5.5 ([ADR-0011](0011-claude-runs-every-model-but-the-image-model.md)), the Stylist cost $0.15–0.29 for a body-photo Styling in the Stylist check, and about $0.05 for a Face Photo's. At that price the Anthropic workspace's $50 monthly limit runs out before the app's own cap of 750 Outfits a month. Sonnet was chosen only because Claude Haiku 5.5 missed a face added to a Body-Only Photo's Preview, and nearly every Haiku miss in the Haiku check was in checking Previews, not in building Outfits. So the Stylist's loop now runs on Claude Haiku 5.5 at high effort and never sees a Preview. Once it finishes, or reaches its turn cap, our code draws each saved Outfit's Preview and asks Claude Sonnet 5.5, at medium effort and in a call of its own, for a verdict. On a fault it redraws once, with Sonnet's correction, and asks Sonnet to compare the two images. Our code, not either model, then keeps an image by the hard rules: [ADR-0010](0010-the-stylist-chooses-among-qloos-picks.md)'s check and single redraw, carried out by code. Claude is sent each seller photo at most 768 pixels on its long side and each Preview at most 1024. The photo goes as it is. A Styling's Claude cost is expected to fall to about a third: about $0.04–0.09 for a body photo and $0.025 for a Face Photo. The photo check stays on Haiku 5.5 at medium effort, and Previews stay on Nano Banana 2.1.

## Considered Options

- **Sonnet for the whole Stylist, with cheaper plumbing**: shrinking images and cutting wasted turns saves about 35–40%, about $0.09–0.10 a Styling, which only just fits the $50 limit.
- **Sonnet drives, and Haiku shortlists Products inside the tools**: keeps Sonnet's judgement on every choice, but saves only about 10–20%.
- **Haiku until every Outfit is saved, then Sonnet in the same conversation**: switching models misses the prompt cache, so Sonnet writes the whole build conversation, then reads it every turn.
- **Haiku keeps the Preview tools, with Sonnet's verdict coming back as text**: puts Haiku's judgement back where it fell short, and costs more turns.
- **Sonnet judges hard rules only, from the photo and the Preview**: about half the cost of a verdict, but a wrong garment is no longer caught.

## Consequences

- The Stylist loses its four Preview tools. finish now means "every Outfit I'll make is saved", so it can no longer be refused while a redraw waits for a keep, which cost 1–3 wasted turns in half the check's Stylings.
- A Preview that Sonnet can't judge after its retries, or won't, falls back to the best image already known to be safe. For a first draw that's none. For a redraw it's the first, if its verdict found only a soft fault, and none otherwise. The Preview phase never breaks a Styling.
- Anthropic still gets the photo, Previews and seller photos, but Previews and seller photos now go only to the verdict calls, not into the Stylist's conversation. The Privacy Policy's Workflow run data line still lists Previews. It's left as it is, since it only overstates.
- Seller photos are fetched inside the verdict's step, so the run data still holds only their links ([ADR-0008](0008-pieces-are-real-products.md)).
- The Stylist's conversation holds no image but the photo, so it stays well under the 100,000 tokens past which Haiku 5.5 costs more.
