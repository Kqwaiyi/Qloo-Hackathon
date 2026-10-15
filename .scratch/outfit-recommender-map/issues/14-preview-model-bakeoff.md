# Is Nano Banana 2 Lite good enough for Previews?

Type: prototype
Status: resolved
Map: [Outfit Recommender](../map.md)

## Question

"Which Google models fit Previews and photo checks?" recommends `gemini-3.1-flash-lite-image` but warns it is weaker at changing several items in one edit. Is it good enough, or do we need `gemini-nano-banana-2.1`?

Run a small comparison with a rough Preview prompt: a few real adult photos (subjects' consent) for each Photo Type, with every Piece changed in a single edit. Use the Preview instruction from "What do we ask the AI model at each step?": only the Pieces change, described in words and never by the Style Icon's name; face, body, skin, pose, background and head coverings stay. Include a One-Piece Outfit and a photo with covered hair. Judge whether the person stays recognisable, whether every Piece actually changed, and how often each model refuses.

This costs real money (a billing-enabled key, roughly a dollar), so get the user's go-ahead before making any calls.

## Answer

Resolved with the user on 2026-10-15. **No: Previews use `gemini-nano-banana-2.1` (Nano Banana 2.1).** Both models kept the person recognisable and changed every Piece. Lite kept breaking the "everything else stays" half of the Preview instruction; 2.1 didn't.

**The run.** 8 cases × 2 models × 2 runs = 32 `generateContent` calls, $1.15 in total, with the user's go-ahead (cap $1.50).
- **Where it lives:** the throwaway branch `prototype/preview-bakeoff` (commit `8ddb33a`, folder `prototypes/preview-bakeoff/`, run instructions in its README). Per-call outcomes, timings, token counts and costs are in `results-2026-10-15.json`. Photos and Previews were never committed.
- **Cases:** two Face Photos; two Full-Body Photos; a Full-Body Photo with covered hair (hijab); a One-Piece Outfit (slip dress); and two Body-Only Photos, one without a face and one showing the lower face.
- **Inputs:** the Preview instruction from "What do we ask the AI model at each step?". Each Piece's `details` were hand-written to stand in for tailoring, and each was picked to look clearly different from what the person wore.
- **Caveat on the photos:** the user chose to go ahead with images found online instead of consenting teammates. They were stock and retail photos, a stranger's mirror selfie, a CG render and AI-made faces, all small (236–740 px wide). No phone photo was tested, and each case ran only twice.

**Results.**

| | Nano Banana 2 Lite | Nano Banana 2.1 |
| --- | --- | --- |
| Previews / refusals / errors | 16 / 0 / 0 | 16 / 0 / 0 |
| Person recognisable | every Preview | every Preview |
| Every Piece changed (incl. One-Piece, covered hair) | every Preview | every Preview |
| Head covering kept | yes | yes |
| Body-Only Photo with no face | zoomed out and **invented a face** both times (a chin; then a chin, mouth and hair) | kept the framing, no face added |
| Receding hairline (Face Photo) | filled in to a straight line-up both times, which the user's real hair can't do | kept |
| Pose | changed in all 4 runs on one Full-Body photo (uncrossed legs, moved hands) | kept |
| Invented or lost details | a wristwatch twice, a bracelet, white socks, a patch of scarf through the waist; dropped earrings | none (once removed a stock watermark) |
| Time per Preview, median (range) | 3.2 s (2.7–4.5) | 11.4 s (10.1–13.7) |
| Cost per Preview, measured | $0.0342 | $0.0376 |

**Why 2.1.**
- Lite's slips break written rules. The worst is a face added to a Body-Only Photo, where the user chose to leave their face out.
- 2.1 avoids them for $0.0034 more per Preview, and about 8 s more per Styling, since Previews render 2 at a time.
- The spend limits in "What limits keep AI and Qloo spend bounded?" still hold: they assumed about $0.04 per Outfit.

**Request settings that worked.**
- `generationConfig: { responseModalities: ["IMAGE"], thinkingConfig: { thinkingLevel: "minimal" } }`. 2.1 defaults to `medium`, so set `minimal` explicitly. With it, no thought tokens were billed.
- No `imageConfig`. The output matched the photo's aspect ratio at about 1K (842×1264 from a 493×740 photo) and came back as JPEG.
- **Tokens per Preview:**
  - in: 1,200–1,310, of which the photo is 1,120;
  - out: 1,120 image tokens plus 250–350 other output tokens.
- `gemini-nano-banana-2.1` is in the AI SDK's `supportsFileInputs` set, so the plain-string model-ID workaround noted for Lite in "Which Google models fit Previews and photo checks?" isn't needed.

**Passed on.**
- "What do we ask the AI model at each step?": step 3 now names Nano Banana 2.1.
- **The spec:**
  - Previews call `gemini-nano-banana-2.1` at thinking level `minimal`. Lite stays only as a config fallback: 2.1 went GA on 2026-10-06, so expect churn.
  - A real Preview takes about 11 s, against the fake adapter's default of about 1 s.
  - None of the 32 calls was refused, so refusal handling is still untested against real responses. The fake adapter's refusal scenario covers it in tests.
  - Check the first real Consultations, on the Demo Account, with phone photos, since this test used only small web images.
