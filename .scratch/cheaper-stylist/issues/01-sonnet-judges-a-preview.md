# 01: Sonnet judges a Preview, through our AI interface

**What to build:** Our own AI interface can ask Claude Sonnet 5.5 whether a Preview is right, ready for the Preview phase (02) to use. There are two forms: a first draw's verdict, and a redraw's verdict, which also compares the two images. The Anthropic adapter does the work:
- It sends Claude each seller photo at most 768 pixels on its long side, and each Preview at most 1024. The photo goes as it is.
- It puts the verdict's rules and the photo first, cached, so a Styling's later verdicts read them from cache.

The fake AI records every verdict call and plays scripted verdicts. Nothing in the app calls the verdict yet. Respect [ADR-0012](../../../docs/adr/0012-haiku-drives-the-stylist-sonnet-judges-previews.md), [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md) and [ADR-0009](../../../docs/adr/0009-only-the-main-person-is-styled.md).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Models and the AI config", "Our AI interface", "The Anthropic adapter" and "Fakes and the check", and "Testing Decisions" (the Anthropic adapter). Stories 1–5, 23, 45, 51–53 and 55.

- [ ] Our AI interface gains a method that judges a Preview. It's given:
  - the photo;
  - the Photo Type, and whether the hair is covered;
  - the Outfit's Pieces in Category order: each Product by its title and its seller's photo, which may be missing, and the Hairstyle by its cut's details;
  - the Preview.

  A redraw's verdict is also given the first image, the redraw and the first image's verdict.
- [ ] A first draw's verdict returns whether the Preview is right. If it isn't, it also returns whether it breaks a hard rule, one correction sentence for the image model, and one note line for the user.
- [ ] A redraw's verdict returns whether the redraw breaks a hard rule, which of the two images shows the Outfit better, and one note line.
- [ ] The hard rules are today's:
  - a changed or invented face, which on a Body-Only Photo means any face or head added;
  - a removed or changed head covering;
  - anyone else in the photo changed.

  Anything else wrong is a fault a redraw may put right.
- [ ] A verdict Claude refuses comes back as refused. Errors are worth retrying or unretryable, as the other methods' are, and never carry anything of the request.
- [ ] The AI config gains the verdict's model, Claude Sonnet 5.5 at medium effort, and the two image sizes, 768 and 1024 pixels on the long side.
- [ ] The Anthropic adapter asks for structured output, with thinking display omitted, no temperature, no prefill, and every image inline as its bytes.
- [ ] The verdict's prompt carries today's "Checking each Preview" rules and hard rules. Its correction and note follow today's rules:
  - nothing about the person's body, skin, ethnicity or age;
  - the face only as whether the Preview changed it;
  - a head covering only as "their head covering";
  - no price.
- [ ] The adapter scales a seller photo larger than 768 pixels on its long side, or a Preview larger than 1024, down to fit, keeping its proportions. Smaller images and the photo are sent as they are.
- [ ] The request puts the rules, then the photo, first, with a cache breakpoint after the photo. Each Outfit's Pieces, seller photos and images come after.
- [ ] The fake AI records what each verdict call was sent, with images by their fingerprints. It plays verdicts a test scripts, in order, and otherwise judges every Preview right.
- [ ] The Anthropic adapter's tests, with the Anthropic API faked at its edge as today, check:
  - the model and effort;
  - structured output and thinking display omitted;
  - images inline;
  - the cache breakpoint after the photo;
  - the image sizes, with large seller photos and Previews scaled down and small ones and the photo unchanged;
  - a refusal coming back as refused;
  - errors carrying nothing of the request.

## Comments

- 2026-10-24: Sonnet judges a Preview, through `AiProvider.judgePreview`. Nothing in the app calls it yet.
  - **The interface** (`src/server/ai/provider.ts`). One method, with two forms: `judgePreview(FirstDrawToJudge)` gives a `FirstDrawVerdict`, and `judgePreview(RedrawToJudge)` gives a `RedrawVerdict`. Either may come back `{ refused: true }`.
    - Both forms are given the photo, the Photo Type, `hairCovered` and the Pieces as `PreviewPiece`s.
    - A first draw adds `preview`. A redraw adds `first`, `redraw` and `firstVerdict`, a `WrongPreview`.
    - A `WrongPreview` is `{ right: false, breaksHardRule, correction, note }`.
    - A `RedrawVerdict` is `{ breaksHardRule, better: "first" | "redraw", note }`.
  - **Config** (`src/config/ai.ts`): `CLAUDE_PREVIEW_VERDICT_MODEL` (Sonnet 5.5), `CLAUDE_PREVIEW_VERDICT_EFFORT` (medium), `CLAUDE_SELLER_PHOTO_MAX_LONG_SIDE_PX` (768) and `CLAUDE_PREVIEW_MAX_LONG_SIDE_PX` (1024).
  - **The adapter** (`src/server/ai/anthropic.ts`). The verdict's prompt carries the "Checking each Preview" rules, the hard rules, and the rules for corrections and notes. The request runs in this order:
    1. the photo's Photo Type and whether the hair is covered;
    2. the photo, with the cache breakpoint;
    3. the Pieces;
    4. each seller photo, after a caption;
    5. the image or images to judge.

    Seller photos over 768 px and Previews over 1024 px are scaled down with sharp, keeping their format; the photo goes as it is. Correction and note come back on one line each.
  - **The fake** (`src/server/ai/fake.ts`). `verdictRequests` records every call, with images by their fingerprints. `previewVerdicts` plays scripted verdicts in order: a first draw's, a redraw's, or `{ refused: true }`. Once they run out, every Preview is judged right, and a redraw is judged better than the first.
- 2026-10-24: Choices the ticket left open:
  - **One output format for both forms.** Anthropic says a changed `output_config.format` misses the prompt cache. So both forms ask for one schema: `{ verdict }`, where the verdict is one of three shapes, a right first draw, a wrong first draw, or a redraw's verdict. That way a redraw's verdict reads the rules and photo from the cache a first draw's wrote. Because a right first draw holds only `right: true`, it can't also break a hard rule. A reply in the wrong form, or a wrong first draw with no correction, throws an error worth retrying.
  - **Photo Type and covered hair go before the photo,** inside the cached prefix, since they never change within a Styling.
  - **A refusal part-way** comes back refused, as the photo check's does.
  - **An image sharp can't read** throws an error worth retrying. Seller photos and Previews are already checked as JPEG, PNG or WebP before they get here.
- 2026-10-24: **Results.** Typecheck is clean and all 1,070 tests pass.
  - **The adapter's tests** cover:
    - the model and effort;
    - structured output, thinking display omitted, no temperature and no prefill;
    - the order, with images inline and the breakpoint after the photo;
    - both forms sharing everything up to the breakpoint;
    - the sizes;
    - refusals, before writing and part-way;
    - retryable and unretryable errors, which carry nothing of the request;
    - replies in the wrong form, contradictory, or with no correction.

    `environment.test.ts` checks that real AI judges Previews on Claude.
  - **Not done:** the verdict on real Claude. That costs money, and ticket 07 runs the check.
