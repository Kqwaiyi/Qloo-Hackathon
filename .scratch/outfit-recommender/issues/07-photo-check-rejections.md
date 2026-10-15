# 07: Photo check rejections and the one-tap Photo Type switch

**What to build:** When the photo check finds a problem, the user goes back to the photo step with their photo kept and a specific message saying what to fix, and nothing is stored. A photo that looks like a different Photo Type can be switched with one tap. People who cover their hair, and Body-Only Photos that show a face, are accepted. Fake adapter scenarios make every outcome reachable in local development and tests.

**Blocked by:** [06 Upload a photo to start a Consultation](06-upload-photo-start-consultation.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "AI provider interface" (1. Check a photo: Our code decides, Photo Type rules; Fake adapter: Scenarios), "User-facing copy" (Photo intake and check) and "Testing Decisions" (rejections, check error, wrong-type switch; browser smoke flow 3). Stories 77–84. [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md).

- [ ] Our code, not the model, decides the outcome, checking in this order:
  1. explicit, or Google blocked the photo: not appropriate;
  2. no people: no person;
  3. more than one person: more than one person;
  4. not clear enough: too unclear;
  5. the chosen Photo Type's rule fails but another type's rule passes: wrong Photo Type, naming that type;
  6. a Face Photo with covered or hidden hair: hair not visible;
  7. any other rule failure, such as a badly cropped photo: too unclear.
- [ ] Photo Type rules: a Face Photo needs the face and visible, uncovered hair, and one that shows the whole body is accepted. A Full-Body Photo needs head to feet, face included, and is accepted with covered hair. A Body-Only Photo needs shoulders to feet, and a visible face is allowed. Both body types need the feet.
- [ ] Each rejection shows its copy at the photo step: "This looks like a <Photo Type>." with the button "Use it as a <Photo Type>"; "We couldn't find a person in this photo."; "There's more than one person here. Use a photo of just you."; "This photo is too blurry, dark or tightly cropped to work with."; "We can't use this photo." with the content rule beneath it; "We need to see your hair to suggest a Hairstyle."
- [ ] "Use it as a <Photo Type>" switches the Photo Type and sends the same photo again as a fresh check.
- [ ] A rejected photo is never stored and creates no Consultation. The user returns to the photo step with the photo kept.
- [ ] A check that still errors after the AI SDK's own retries is a separate "check errored" outcome: it shows "We couldn't check your photo just now. Try again in a moment." and stores nothing.
- [ ] A Full-Body Photo with covered hair is accepted and stored as covered. A Body-Only Photo that shows a face is accepted, with the face recorded as visible.
- [ ] The fake adapter gains scenarios for each of the six rejection reasons, covered hair, and a photo check that errors.
- [ ] Tests cover each of the six rejections and the check error, rejected photos storing nothing, and the wrong-type switch.
- [ ] A Playwright smoke test walks through a wrong-Photo-Type rejection and the one-tap switch.
