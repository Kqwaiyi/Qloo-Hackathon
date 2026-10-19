# 01: Groundwork: motion libraries, Onest, tokens and the landing layout

**What to build:** The base the chapters stand on: the motion libraries pinned exactly, Onest for the landing page only, the design tokens, and a landing layout whose stylesheet can't leak into the app.

**Blocked by:** none

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) "Design".

- [x] Add `gsap` 3.15.0, `@gsap/react` 2.1.2 and `lenis` 1.3.26, each at least two weeks old, pinned exactly.
- [x] Load Onest with `next/font/google` in `src/app/(landing)/layout.tsx`, scoped to the `.landing` root.
- [x] Add the colour, type and easing tokens to `@theme` in `globals.css`; drop the walkthrough's old fade-in token.
- [x] Scope every landing rule to `.landing`, since Next keeps stylesheets loaded across client navigation.
