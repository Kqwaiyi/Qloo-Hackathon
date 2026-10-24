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
