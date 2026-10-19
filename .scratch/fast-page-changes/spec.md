# Fast Page Changes

Status: ready-for-agent

Every decision here comes from the grilling in this conversation, which was backed by Production's own Vercel metrics (16–19 October 2026). Use the vocabulary in [GLOSSARY.md](../../GLOSSARY.md) (**Consultation**, **Outfit**, **Styling**, **Demo Account**, **Bot Check**). The glossary avoids "session" for a Consultation, so this spec says **sign-in** for Better Auth's session: what keeps a user signed in for 30 days after they last used the app. This work writes [ADR-0007](../../docs/adr/) (everything stays in Washington DC) as one of its pieces.

## Problem Statement

On the deployed app, clicking New Consultation, My Consultations, Settings or a Consultation feels unresponsive. Nothing happens on screen for most of a second, and sometimes for several seconds, before the next page appears. Clicking Sign out feels just as dead.

For a signed-in user there are three causes, measured on Production:

1. **The session refresh in front of every page waits on a database across the Pacific.** A proxy runs before every page request that carries a sign-in cookie, to keep the 30-day sign-in rolling. Vercel runs that proxy in the region nearest the visitor, which for the team is Singapore (`sin1`). The Neon database, the functions and the Blob store are all in Washington DC (`iad1`). So each renewal check crosses the Pacific: about **450 ms at the median** on every signed-in page change, **about 1.4 s** on `/`, and more when the proxy's process is fresh and has to open a database connection from Singapore. When the proxy ran in US regions it took 20–30 ms. Signed-out pages skip the database read, which is why `/sign-in` feels fine.
2. **Nothing appears until the whole page has arrived.** The app pages have no loading boundary, so Next.js doesn't prefetch them (it skips prefetching dynamic routes without one), and a click shows nothing until the server's full answer comes back.
3. **Fresh server processes and a sleeping database.** About 1 in 20 page loads takes 1.3–2.4 s before the first byte. That comes from functions starting fresh and from Neon's free tier waking up after 5 idle minutes.

Once warm, the page itself is fast: about 10 ms at the median before its first byte. The wait is everything around it.

## Solution

A click on an app page shows the next page's placeholder at once. The header and the email-verification banner stay where they are, and only the main area switches to a quiet grey placeholder until the page arrives. Nothing runs in front of page requests any more, so a signed-in page change costs what a signed-out one does: one trip to the app's servers and back.

The 30-day rolling sign-in works exactly as before, and nobody waits for it. Each time an app page loads in full, the app asks the server to renew the sign-in in the background. That request runs next to the database, renews the sign-in only once it's a day old, and sends the renewed cookie back. A sign-out, or "Sign out of all devices", still ends a sign-in immediately.

Sign out and Sign out of all devices say "Signing out…" and stop accepting clicks while they work, as every other action button already does.

Everything stays in Washington DC. Users in Asia still pay one trip across the Pacific per page change; ADR-0007 records why, and what would make us move.

## User Stories

### Moving between pages

1. As a signed-in user, I want a click on New Consultation, My Consultations or Settings to show something at once, so that I know the click registered.
2. As a signed-in user, I want the header to stay in place while the next page loads, so that I can see I'm still in the app and can click somewhere else.
3. As a signed-in user, I want the main area to show a placeholder the moment I click, so that the app never looks frozen.
4. As a signed-in user opening a Consultation from My Consultations, I want the placeholder at once, so that opening my results feels as quick as any other page change.
5. As a signed-in user going from a Consultation to New Consultation, or from New Consultation to My Consultations, I want the placeholder at once too, so that page changes within Consultations are no slower than switching to Settings.
6. As a signed-in user going from one Consultation to another, I want the placeholder at once, so that switching between my results is quick.
7. As a signed-in user who changes their mind while a page loads, I want to click another link and go there, so that a slow page never traps me.
8. As a signed-in user with an unverified email, I want the verification banner to stay visible while pages change, so that it doesn't flicker away and back.
9. As a user in Asia, I want a page change to stop waiting on a database read in Washington DC before the page even starts, so that each click costs one trip to the app's servers and no more.
10. As a user anywhere, I want signed-in page changes to cost the same as signed-out ones, so that being signed in doesn't make the app slower.
11. As a user who opens an app page by typing its address or refreshing, I want it to arrive without the old session-refresh wait in front of it, so that first loads are quicker too.
12. As a user on the landing page who is signed in, I want the landing page to lose the 1.4 s wait it had in front of it, so that the first impression is quicker.
13. As a judge on the Demo Account, I want page changes to feel immediate, so that the demo feels responsive.
14. As a judge in the US, I want nothing to get slower for me, so that the fix for Asia costs me nothing.

### Staying signed in

15. As a user, I want to stay signed in for 30 days after I last used the app, as today, so that the change doesn't sign me out sooner.
16. As a user who opens the app every few days, I want my sign-in to keep renewing, so that I'm never signed out while I'm actively using it.
17. As a user who hasn't used the app for over 30 days, I want to be signed out, as today, so that an abandoned browser doesn't stay signed in forever.
18. As a user, I want the renewal to happen in the background, so that it never delays a page.
19. As a user whose renewal fails (a network blip, a server error), I want nothing to change on screen, and the next full page load to try again, so that a failure is invisible to me.
20. As a user who signed out in another tab, I want a renewal still on its way not to sign me back in, so that signing out holds.
21. As a user who used "Sign out of all devices", I want every other browser to stay signed out even if one of them sends a renewal afterwards, so that the button keeps its promise.
22. As a user who reset their password, which signs them out everywhere, I want the same: no renewal brings an old sign-in back.
23. As a user whose sign-in has ended, I want the browser's dead sign-in cookie cleared when a renewal finds it ended, so that the app stops presenting a sign-in that's gone.
24. As a user who keeps using the app, I want my account to keep counting as active for the daily sweep, as it does today through renewal, so that I never get an inactivity warning while I'm using the app.
25. As a user signed in on the landing page, Terms or Privacy, I want those pages to send no renewal, so that they stay as light as possible; my sign-in renews the next time I open an app page.
26. As a signed-out visitor, I want the landing page, Terms, Privacy and the sign-in, sign-up and password pages to behave exactly as today, so that this change doesn't touch them.
27. As a judge on the Demo Account, I want its sign-in to renew like anyone's, so that the shared demo stays signed in while the judges use it.

### Action buttons

28. As a signed-in user clicking Sign out, I want the button to say "Signing out…" and stop accepting clicks while it works, so that I know it's happening and don't click twice.
29. As a user clicking "Sign out of all devices" in Settings, I want the same "Signing out…" and a disabled button while it works, so that I know it's happening.
30. As a user of every other action button (Get my Outfits, Show 2 more Outfits, changing the Budget Tier or Photo Style, Try again, the Settings forms, deleting a Consultation, deleting the account, withdrawing photo consent, resending the verification link), I want their existing pending states kept as they are, so that no button goes quiet.

### Accessibility

31. As a screen reader user, I want the placeholder announced as "Loading…", so that I know the page is on its way.
32. As a user who has turned off motion, I want the placeholder to stay still, so that it respects my setting.
33. As a screen reader user, I want "Signing out…" announced through the button's own label, as "Signing in…" is today, so that the pending state isn't only visual.

### The team

34. As the team, I want the renewal to run in the same region as the database, so that it costs one nearby read instead of a trip across the Pacific.
35. As the team, I want a renewal that fails unexpectedly written to the runtime log, as the proxy did, so that we notice if renewals start failing.
36. As the team, I want sign-in renewal to happen in exactly one place, so that a page read can never extend a sign-in in the database without its cookie reaching the browser.
37. As the team, I want the renewal rules tested at the operation seam, as the 30-day rules already are, so that the move can't quietly break them.
38. As the team, I want the existing browser smoke tests to keep passing and one more that moves between app pages and signs out, so that we know page changes and sign-out still work end to end.
39. As the team, I want to compare Production's Vercel metrics before and after, so that we know the fix worked rather than assume it.
40. As the team, I want local development to work as before, with renewal against the local database, so that `npm run dev` needs nothing new.
41. As a future maintainer, I want an ADR saying why everything stays in Washington DC, so that nobody moves only the functions to Singapore, which would put every database query across the Pacific.
42. As a future maintainer, I want a comment where the renewal starts that says why it isn't in a proxy, so that nobody puts one back in front of every page.

## Implementation Decisions

### No proxy

- The proxy is deleted. Its only job was renewing sign-ins, and that moves to the renewal endpoint below. Nothing runs in front of page requests any more, in any region.

### Renewing a sign-in

- **One place renews.** The existing renewal operation (`refreshSession`) stays the only code that renews a sign-in. It asks Better Auth for the sign-in with its response headers and passes every cookie on. Better Auth renews only once the sign-in is a day old (the existing update age), so most renewals are a single read.
- **Reads never renew.** Reading the signed-in user, which every page and action does, asks Better Auth not to refresh (its `disableRefresh` read option). Today the proxy renews before any page reads, so a page read never finds the sign-in due. Without the proxy, a page read could renew the sign-in in the database without being able to send the cookie, because pages can't set cookies. The background renewal would then find nothing due, and the browser's cookie would expire 30 days after sign-in despite daily use. Better Auth's own endpoints, and our hooks inside them, may still renew while handling a request, because they pass the cookie on with their response.
- **The renewal endpoint.** It is a new route handler, named in the routes config next to the Styling status poll and kept outside Better Auth's own routes:
  - `POST`, no body, same-origin. It is a POST so that no prefetcher, cache or browser ever repeats it on its own. It needs no CSRF token: a cross-site request carries no sign-in cookie (the cookie is `SameSite=Lax`), and renewal only ever extends the caller's own sign-in.
  - It runs the renewal operation with the request's headers and sets every cookie the operation hands back on its response: the renewed cookie, or the cleared one when the sign-in has ended.
  - It answers `204 No Content` with `Cache-Control: no-store`, whether it renewed, found nothing due, or found no sign-in at all.
  - On an unexpected error, for example Better Auth failing when the sign-in is deleted mid-renewal, it logs "Couldn't refresh the session" with the error, as the proxy did, and answers with a server error. The caller ignores the answer either way.
  - It runs as an ordinary function in the functions' region, Washington DC, next to the database.
- **What sends it.** A client component with no UI is rendered once in the app pages' shared layout. When it mounts, it sends one renewal request and doesn't wait for, show or retry the result. Because the shared layout stays mounted while the user moves between app pages, it fires once per full load of an app page (first visit, refresh, or arriving from sign-in or the landing page), not on every click. Only the app pages send it; the landing page, Terms, Privacy and the sign-in, sign-up and password pages don't.
- **Activity for the daily sweep is unchanged.** Renewing a sign-in already marks its user active through Better Auth's session hooks. Renewal still happens on each day the app is used, so active users still count as active.

### The loading placeholder

- One placeholder component, shared by every app page. It shows a title bar and two or three content blocks in the app's stone greys, pulsing only when motion is allowed, and it has `role="status"` with a visually hidden "Loading…". It fills the main area only; the header and the email-verification banner stay.
- **Every page change between the app pages, in any direction, shows it at once.** That covers New Consultation, My Consultations, a Consultation, Settings, and one Consultation to another. A loading boundary only at the app pages' group isn't enough. My Consultations, New Consultation and a Consultation share a parent route segment, and during a navigation React keeps an already-shown boundary's old content instead of its fallback. So the app group and the Consultations level each get a loading boundary, both rendering the same placeholder. Whoever implements this confirms each direction in the browser and adds a boundary wherever one is still missing.
- With these boundaries, Next.js prefetches the shared layout and the placeholder for app links in view, so the switch to the placeholder needs no request at click time. With no proxy in front, those prefetches are cheap.

### Pending states

- Sign out in the header and Sign out of all devices in Settings become submit buttons that read their form's pending status. While pending they are disabled and labelled "Signing out…", in the style of the existing "Signing in…" and "Sending…". The new label lives in the shared copy next to "Sign out of all devices".
- A check of every action button found these two to be the only ones without a pending state. Nothing else changes.

### Architecture decision

- ADR-0007, "Everything stays in Washington DC". The functions, the Neon database and the Blob store all stay in `iad1`. Considered options:
  - Move all of it to Singapore: needs a new Neon project and a data migration just before judging, and the judges' location is unknown.
  - Move only the functions: every database query would then cross the Pacific, which is exactly what made the proxy slow.
  - Upgrade Neon: needed only to stop it sleeping, and out of scope here.
- Consequences:
  - Users in Asia pay one trip across the Pacific per page change.
  - Nothing that queries the database per request may run in another region; that is why the proxy is gone.
  - Revisit if the judges or users turn out to be mostly in Asia.

### Not changing

- No schema changes, no new glossary terms, and no change to sign-in length (30 days) or renewal age (one day).

## Testing Decisions

- **What a good test looks like here:** it drives operations as a browser would, then asserts what a user can observe. That means which cookie the browser got and for how long, and whether the user is still signed in at a later date. It never asserts which Better Auth option was passed or which hook ran.
- **Layer 1, the server operations through the test harness (existing):** a test browser and a moved `Date`, as the existing session tests do. Cover:
  - Renewal rolls the sign-in 30 days forward from its last use (the existing test, unchanged).
  - Reading the signed-in user never renews. Sign in on day 0, read on day 2, then renew on day 2: the browser gets a fresh 30-day cookie and is still signed in on day 31. If page reads renewed, this test would fail.
  - Reads alone don't keep a sign-in alive: sign in on day 0, only read on day 2, and the user is signed out on day 31.
  - Renewing a sign-in less than a day old sends no new cookie.
  - Renewing with no sign-in cookie sends no cookie and doesn't throw.
  - Renewing after "Sign out of all devices" clears the browser's cookie, and that browser stays signed out.
- **Layer 2, Playwright smoke tests against local development (existing):** every existing spec keeps passing with the proxy gone; they move between app pages while signed in. One new check: a signed-in user clicks My Consultations, Settings and New Consultation in the header, and each lands on its own page with the header still there. Then Sign out lands on the landing page, and opening an app page sends them to sign-in.
- **Not tested:** the placeholder and "Signing out…" on screen. Each shows only for a moment, so a test would be flaky. The renewal endpoint itself is a thin adapter over the operation, like the Styling status poll's endpoint, and gets no tests of its own.
- **Acceptance on Production (by hand, after deploying):** run the same Vercel observability queries as the investigation, over at least a day of real use:
  - The proxy no longer runs on any path; it was about 450 ms at the median in `sin1`.
  - The renewal endpoint's own duration is small.
  - Page functions' time to first byte stays where it was, about 10 ms at the median.
- **Prior art:**
  - The session tests: the 30-day cookie, the end after 30 days without use, and the roll forward.
  - The sign-out-everywhere and password-reset tests, which end sign-ins.
  - The existing e2e helpers that sign up and verify a user.

## Out of Scope

- Moving any part of the app to another region; ADR-0007 records why.
- Cold starts: Neon's free tier sleeping after 5 idle minutes, and fresh function processes. We accepted these for now and will measure again after this ships; a paid Neon plan is the known fix.
- Placeholders shaped like each page; one shared placeholder for now.
- Better Auth's cookie cache, which would let an ended sign-in keep working for minutes after "Sign out of all devices".
- The landing page's own weight and its server read; it only loses the proxy's wait in front of it.
- Speeding up the work behind action buttons: sign-in's password check and Bot Check, the photo check, Stylings.
- The Vercel Firewall's bot-protection challenge.
- A Preview database, so the fix can only be measured on Production.

## Further Notes

- **The measurements behind this spec** come from Production's Vercel observability, 16–19 October 2026:
  - The proxy took about 450 ms at the median on signed-in app paths in `sin1`, about 1.4 s on `/`, and 20–30 ms in `sfo1` and `cle1`.
  - Page functions took about 10 ms at the median to their first byte, and 1.3–2.4 s at the 95th percentile.
  - Runtime logs showed a fresh process on most page requests: pg's one-per-process SSL warning appeared on nearly every request.
  - Functions' total durations of about 10 s are not user waits. The idle database connection is kept open after the response.
- **A tab kept open for weeks:** renewal fires on a full page load, not on every click. A user who keeps one tab open and moves between app pages without ever reloading for over 30 days would be signed out at day 30. We accept this; it's the trade for keeping each click free of any extra request. If it turns out to matter, the renewal component can also fire on page changes, throttled to once an hour.
- **Deploying:** after the type check, the unit tests and the Playwright tests pass locally, the change is committed (following the team's commit conventions) and pushed to `main`, which deploys Production. A Vercel rollback restores the previous deploy if anything breaks.
