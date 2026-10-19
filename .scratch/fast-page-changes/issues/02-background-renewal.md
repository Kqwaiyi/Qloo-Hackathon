# 02: Renew sign-ins in the background instead of in front of every page

**What to build:** The proxy that ran before every signed-in page request is gone. It renewed the sign-in by reading the database in Washington DC from the region nearest the visitor, which cost about 450 ms per page change from Asia. Instead, each full load of an app page asks a renewal endpoint, in the background, to renew the sign-in. The endpoint runs next to the database, so nobody waits for it, and the 30-day rolling sign-in works exactly as before. A signed-in page change now costs what a signed-out one does. This ticket also writes ADR-0007, which explains why everything stays in Washington DC and why nothing that queries the database per request may run anywhere else.

**Blocked by:** 01 (Reading the signed-in user never renews a sign-in)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › No proxy", "› Renewing a sign-in" (The renewal endpoint, What sends it), "› Architecture decision", and "Testing Decisions" (Layer 2). Stories 9, 10, 11, 12, 13, 14, 18, 19, 25, 26, 27, 34, 35, 38, 40, 41 and 42.

- [x] The proxy is deleted, and nothing else runs in front of page requests.
- [x] A renewal endpoint, named in the routes config next to the Styling status poll and kept outside Better Auth's own routes:
  - [x] Accepts `POST` with no body, runs the renewal operation with the request's headers, and sets every cookie it hands back on the response.
  - [x] Answers `204 No Content` with `Cache-Control: no-store`, whether it renewed, found nothing due, or found no sign-in.
  - [x] On an unexpected error, logs "Couldn't refresh the session" with the error, as the proxy did, and answers with a server error.
- [x] A client component with no UI, rendered once in the app pages' shared layout, sends one renewal request when it mounts. It doesn't wait for, show or retry the result. It fires once per full load of an app page, not on every click.
- [x] Only the app pages send it; the landing page, Terms, Privacy and the sign-in, sign-up and password pages don't.
- [x] A comment where the renewal starts says why it isn't a proxy: a proxy runs in the region nearest the visitor, far from the database.
- [x] ADR-0007, "Everything stays in Washington DC", in the existing ADR format. Considered options: move all of it to Singapore; move only the functions; upgrade Neon. Consequences: one trip across the Pacific per page change for users in Asia; nothing that queries the database per request may run in another region; revisit if the judges or users are mostly in Asia.
- [x] A new Playwright check: a signed-in user clicks My Consultations, Settings and New Consultation in the header, and each lands on its own page with the header still there. Then Sign out lands on the landing page, and opening an app page sends them to sign-in.
- [x] Every existing Playwright spec, unit test and the type check still pass, and local development renews against the local database with nothing new to set up.
