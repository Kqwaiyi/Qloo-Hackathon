# 03: Every app page change shows the placeholder at once

**What to build:** Clicking between app pages (New Consultation, My Consultations, a Consultation, Settings) shows something at once. The header and the email-verification banner stay where they are, and the main area switches to a quiet grey placeholder until the page arrives. Today a click shows nothing until the whole page comes back, because the app pages have no loading boundary and Next.js doesn't prefetch dynamic routes without one.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › The loading placeholder". Stories 1, 2, 3, 4, 5, 6, 7, 8, 31 and 32.

- [ ] One placeholder component, shared by every app page: a title bar and two or three content blocks in the app's stone greys, pulsing only when motion is allowed, with `role="status"` and a visually hidden "Loading…".
- [ ] It fills the main area only; the header and the email-verification banner stay visible while pages change.
- [ ] Loading boundaries at the app group and at the Consultations level both render that one placeholder. A boundary only at the app group isn't enough: My Consultations, New Consultation and a Consultation share a parent route segment, and during a navigation React keeps an already-shown boundary's old content instead of its fallback.
- [ ] Checked by hand in the browser: each of these page changes shows the placeholder at once, and a boundary is added wherever one is still missing:
  - [ ] Settings ↔ New Consultation
  - [ ] Settings ↔ My Consultations
  - [ ] My Consultations ↔ New Consultation
  - [ ] My Consultations → a Consultation
  - [ ] A Consultation → New Consultation
  - [ ] One Consultation → another
- [ ] While a page loads, clicking another header link goes there instead.
- [ ] No test asserts the placeholder on screen: it shows only for a moment. Every existing Playwright spec, unit test and the type check still pass.
