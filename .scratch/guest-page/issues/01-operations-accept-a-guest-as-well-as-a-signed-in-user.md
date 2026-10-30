# 01: Operations accept a Guest as well as a signed-in user

**What to build:** A prefactor with no visible change. Opening a Consultation, reading its Styling status, Try again, the stuck-Styling recovery and the price refresh today each find "the signed-in user" from the session and refuse `signed-out` without one. Give them one way of asking who is viewing: a **viewer** resolved from the request, which today can only be a signed-in user. Ticket 02 then adds the Guest as a second kind of viewer without touching each operation again. "Make the change easy, then make the easy change."

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Who the Guest is: the guest cookie".

- [x] The request context can resolve the viewer, and the operations above authorise a Consultation for its viewer rather than reading the session themselves.
- [x] Every refusal is unchanged: `signed-out` without a viewer, `not-found` for someone else's Consultation.
- [x] The styling-status and price-refresh routes and the consultation page go through the same viewer resolution.
- [x] The listing, deletion, settings and account operations are untouched: they stay signed-in only.
- [x] The whole existing suite passes unchanged, with no test edited except where a test helper reads the session directly.

## Comments

- 2026-10-30: Opening a Consultation, its Styling status, Try again, the stuck check that runs with them, and the price refresh now act for a **viewer**.
  - **The viewer** (`src/server/operations/viewer.ts`). `readViewer(ctx)` finds who the request comes from in the request context every operation already has. Today that's the signed-in user, read as `readSignedInUser` reads them, or null. A `Viewer` holds only what those operations use: the user whose Consultations they are, their Country, and whether it's the Demo Account. Ticket 02 adds the Guest inside `readViewer`.
  - **Authorising a Consultation.** `viewersConsultation(viewer, consultationId)` is the one condition the four queries share, where each used to write the owner check itself. Anyone else's Consultation is still not found.
  - **Refusals unchanged.** Each operation still refuses `signed-out` (the two reads return null) when there's no viewer, before anything else. It refuses `not-found` at the same point as before. Try again still runs the shared start check before it looks the Consultation up.
  - **The shared start check.** `checkStylingStart` takes a `Viewer` in place of a `SignedInUser`. A signed-in user is one, so "Get my Outfits" and the usage summary pass theirs as before.
  - **Routes and the page.** The Styling status route and the Consultation page reach these operations through `getReadContext`, and the price-refresh route with its request's headers. All three resolve the viewer through `readViewer`. Only the data layer's comments changed.
  - **Untouched.** My Consultations, deleting a Consultation, Settings, the account operations, "Get my Outfits" and the usage summary still read the signed-in user.
  - **Tests.** No existing test changed. One new test covers the refusal the suite didn't: anyone else's Styling status poll, or a signed-out visitor's, leaves a stuck Styling running.
- 2026-10-30: Choices the ticket left open:
  - **A function, not a field on the context.** `readViewer(ctx)` works like `readSignedInUser(ctx)`. The harness, the server actions' and pages' contexts and the price-refresh route's all stay as they were, so no test helper needed editing.
  - **"Show 2 more Outfits" and the Budget Tier and Photo Style changes go through the viewer too.** They share Try again's start, so they can't read the session separately. Ticket 03 refuses them to a Guest with its `guest` refusal.
- 2026-10-30: For ticket 02, from the review:
  - **Restylings open to a Guest until 03.** Once 02 makes the Guest a viewer, a Guest could start "Show 2 more Outfits" and the Budget Tier and Photo Style changes until 03 adds the `guest` refusal. Ship 02 and 03 together, or have 02 add that refusal.
  - **The Consultation page stays signed-in.** Its two Consultation reads go through the viewer. It still sits under the signed-in app layout, though, and redirects to sign-in when the usage summary, which is signed-in only, finds no user. The spec gives the Guest Page its own route group, so 02 reuses the results components there rather than opening this page to a Guest.
  - **Clearing a stale guest cookie.** `readViewer` takes only `auth` and the request's headers. Treating a deleted guest user's cookie as absent needs `db`, which every caller already has. Clearing that cookie can't happen from a page read, since `getReadContext` has no response cookies.
  - **"Viewer" isn't in GLOSSARY.md.** It's code vocabulary today. Once 02 makes it a signed-in user or a Guest, it's worth a `/domain-modeling` pass.
