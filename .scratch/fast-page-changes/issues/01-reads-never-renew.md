# 01: Reading the signed-in user never renews a sign-in

**What to build:** Renewing a sign-in happens in exactly one place: the existing renewal operation, which always passes the renewed cookie on to the browser. Reading the signed-in user, which every page and server action does, no longer renews the sign-in. Pages can't set cookies, so if a page read renewed the sign-in in the database, its cookie would never reach the browser. Today the proxy renews before any page reads, so it never matters. Once the proxy goes (02), it would: the browser's cookie would expire 30 days after sign-in despite daily use. This is a prefactor: while the proxy still runs nothing changes for users, but it makes 02 safe.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Renewing a sign-in" (One place renews, Reads never renew) and "Testing Decisions" (Layer 1). Stories 15, 16, 17, 20, 21, 22, 23, 24, 36 and 37.

- [x] Reading the signed-in user asks Better Auth not to refresh the sign-in (its read option for that), so no page or action read renews it.
- [x] The renewal operation is unchanged: it renews only once the sign-in is a day old, and passes every cookie Better Auth hands back to the response, including a cleared cookie when the sign-in has ended.
- [x] Renewal still marks the user active for the daily sweep, through the existing session hooks; nothing changes there.
- [x] Tests at the operation seam, with a test browser and a moved `Date` as the existing session tests do:
  - [x] The existing "roll forward 30 days from when they were last used" test still passes.
  - [x] Signed in on day 0, read on day 2, then renewed on day 2: the browser gets a fresh 30-day cookie and is still signed in on day 31.
  - [x] Signed in on day 0, only read on day 2: the user is signed out on day 31.
  - [x] Renewing a sign-in less than a day old sends no new cookie.
  - [x] Renewing with no sign-in cookie sends no cookie and doesn't throw.
  - [x] Renewing after "Sign out of all devices" clears that browser's cookie, and the browser stays signed out.
- [x] Every existing unit test and the type check still pass.
