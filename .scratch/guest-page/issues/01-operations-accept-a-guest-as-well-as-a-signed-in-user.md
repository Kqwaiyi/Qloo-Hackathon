# 01: Operations accept a Guest as well as a signed-in user

**What to build:** A prefactor with no visible change. Opening a Consultation, reading its Styling status, Try again, the stuck-Styling recovery and the price refresh today each find "the signed-in user" from the session and refuse `signed-out` without one. Give them one way of asking who is viewing: a **viewer** resolved from the request, which today can only be a signed-in user. Ticket 02 then adds the Guest as a second kind of viewer without touching each operation again. "Make the change easy, then make the easy change."

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Who the Guest is: the guest cookie".

- [ ] The request context can resolve the viewer, and the operations above authorise a Consultation for its viewer rather than reading the session themselves.
- [ ] Every refusal is unchanged: `signed-out` without a viewer, `not-found` for someone else's Consultation.
- [ ] The styling-status and price-refresh routes and the consultation page go through the same viewer resolution.
- [ ] The listing, deletion, settings and account operations are untouched: they stay signed-in only.
- [ ] The whole existing suite passes unchanged, with no test edited except where a test helper reads the session directly.
