# 05: Ship to Production and measure

**What to build:** The fix reaches Production, and we know it worked rather than assume it. Preview deployments have no database, so Production is the only place the delay from Asia can be measured. The same Vercel observability queries as the investigation are run again after real use, and the before/after numbers are written into this ticket.

**Blocked by:** 02 (Renew sign-ins in the background instead of in front of every page), 03 (Every app page change shows the placeholder at once), 04 (Sign out and Sign out of all devices say "Signing out…")

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Testing Decisions" (Acceptance on Production) and "Further Notes" (The measurements behind this spec, Deploying). Story 39.

- [ ] Locally, the type check, the unit tests and the Playwright tests all pass.
- [ ] The change is committed following the team's commit conventions and pushed to `main`, which deploys Production. The team agreed to this push in the grilling; confirm with the user in chat before pushing all the same.
- [ ] After at least a day of real use, these Vercel observability queries for the project are compared with the "before" numbers below:
  - [ ] Proxy invocations: none on any path any more.
  - [ ] The renewal endpoint's duration: small, since it runs next to the database.
  - [ ] Page functions' time to first byte, at the median and 95th percentile, by route: about where it was.
- [ ] The results are appended under `## Comments` in this ticket, and anything surprising, such as cold starts still dominating, is called out as a possible follow-up.

## Before (Production, 16–19 October 2026)

- Proxy duration, median: about 450 ms on signed-in app paths in `sin1`, about 1.4 s on `/`, and 20–30 ms in `sfo1` and `cle1`.
- Page functions' time to first byte (GET): about 10 ms at the median and 1.3–2.4 s at the 95th percentile.
- Runtime logs: pg's one-per-process SSL warning appeared on nearly every page request, so most requests met a fresh process.
