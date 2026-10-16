# 07: Photo check rejections and the one-tap Photo Type switch

**What to build:** When the photo check finds a problem, the user goes back to the photo step with their photo kept and a specific message saying what to fix, and nothing is stored. A photo that looks like a different Photo Type can be switched with one tap. People who cover their hair, and Body-Only Photos that show a face, are accepted. Fake adapter scenarios make every outcome reachable in local development and tests.

**Blocked by:** [06 Upload a photo to start a Consultation](06-upload-photo-start-consultation.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "AI provider interface" (1. Check a photo: Our code decides, Photo Type rules; Fake adapter: Scenarios), "User-facing copy" (Photo intake and check) and "Testing Decisions" (rejections, check error, wrong-type switch; browser smoke flow 3). Stories 77–84. [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md).

- [x] Our code, not the model, decides the outcome, checking in this order:
  1. explicit, or Google blocked the photo: not appropriate;
  2. no people: no person;
  3. more than one person: more than one person;
  4. not clear enough: too unclear;
  5. the chosen Photo Type's rule fails but another type's rule passes: wrong Photo Type, naming that type;
  6. a Face Photo with covered or hidden hair: hair not visible;
  7. any other rule failure, such as a badly cropped photo: too unclear.
- [x] Photo Type rules: a Face Photo needs the face and visible, uncovered hair, and one that shows the whole body is accepted. A Full-Body Photo needs head to feet, face included, and is accepted with covered hair. A Body-Only Photo needs shoulders to feet, and a visible face is allowed. Both body types need the feet.
- [x] Each rejection shows its copy at the photo step: "This looks like a <Photo Type>." with the button "Use it as a <Photo Type>"; "We couldn't find a person in this photo."; "There's more than one person here. Use a photo of just you."; "This photo is too blurry, dark or tightly cropped to work with."; "We can't use this photo." with the content rule beneath it; "We need to see your hair to suggest a Hairstyle."
- [x] "Use it as a <Photo Type>" switches the Photo Type and sends the same photo again as a fresh check.
- [x] A rejected photo is never stored and creates no Consultation. The user returns to the photo step with the photo kept.
- [x] A check that still errors after the AI SDK's own retries is a separate "check errored" outcome: it shows "We couldn't check your photo just now. Try again in a moment." and stores nothing.
- [x] A Full-Body Photo with covered hair is accepted and stored as covered. A Body-Only Photo that shows a face is accepted, with the face recorded as visible.
- [x] The fake adapter gains scenarios for each of the six rejection reasons, covered hair, and a photo check that errors.
- [x] Tests cover each of the six rejections and the check error, rejected photos storing nothing, and the wrong-type switch.
- [x] A Playwright smoke test walks through a wrong-Photo-Type rejection and the one-tap switch.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The interface.** `checkPhoto` returns `{ blocked: true }` when Google blocks the photo, and `{ blocked: false, report }` otherwise. It throws when the check still errors after the AI SDK's own retries. Ticket 34's adapter maps a block reason to `blocked` and lets other errors throw. Our rules live in `src/server/consultations/photo-check.ts`, and Start a Consultation returns `photo-rejected` (with the reason, and the type it looks like for a wrong Photo Type) or `check-errored`.
- **How the rules were read.**
  - A Full-Body Photo needs the face, upper body, legs and feet. The hair isn't required, covered or not, so a Full-Body Photo with the hair out of frame is accepted with `hairVisible` false. Ticket 11 should drop the Hairstyle when the hair isn't visible or is covered, not only when it's covered.
  - "Hair not visible" applies only when the face shows. A Face Photo that shows neither face nor hair is "too unclear".
  - When a Face Photo fails and both body types pass, the rejection names Full-Body Photo.
- **Fake scenarios:** `pass`, `not-appropriate`, `blocked` (one more than asked, so the Google-block path is testable), `no-person`, `more-than-one-person`, `too-unclear`, `wrong-photo-type`, `hair-not-visible`, `hair-covered` and `check-errors`. The three named after what the photo shows describe a fixed photo whatever Photo Type was chosen, so the switch can pass the same photo: `wrong-photo-type` is just a face and hair, `hair-not-visible` just a face, and `hair-covered` the whole person with covered hair.
- **A departure from the spec's "one environment variable":** in local development (`next dev` only, with the fake adapter) a browser's `fake_ai_scenario` cookie overrides `FAKE_AI_SCENARIO` for that browser. Next 16 allows only one `next dev` per project, so this is how the smoke tests play different scenarios against one server. Ticket 13's flow can keep the default `pass`.
- **A check that errors** is logged with its message only, never the error object, which could carry the request and so the photo. It returns before the photo is stored; ticket 22 should count only checks that came back, so an errored check never counts.
- **Not reached by a test:** a Face Photo that shows the whole body, and a Face Photo whose hair shows but is covered. The rules accept and reject them as the spec says, but no fake scenario produces those reports.
- **Budget Tier kept:** there's no picker yet (ticket 15). The photo is kept in the wizard's state, so a picker kept there survives rejections too.
- **Smoke tests** share their sign-up steps in `e2e/support.ts`. They need a browser: `npx playwright install chromium`, or `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome.
