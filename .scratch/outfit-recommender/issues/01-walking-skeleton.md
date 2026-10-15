# 01: Walking skeleton: sign up, sign in and the app shell

**What to build:** A visitor creates an account in two steps and gets into an empty app. Step 1 asks only for a date of birth, and anyone under 18 is stopped there with nothing stored. Step 2 asks for a username, email, password, Style Preference and Country. The user can then sign in with their username or email, sign out, and move between placeholder pages from the top nav. This ticket also lays the ground every later ticket builds on: the Next.js app, Postgres through Drizzle migrations, Better Auth, the server-operation pattern and the test harness.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Stack and platform", "Backend shape", "Server operations (the main seam)", "Accounts" (Sign-up, Username and password, Sessions, Redirects), "Region gate" (the Country list only) and "Testing Decisions" (Seam 1 set-up, browser smoke tests). Stories 16–26, 38–41 and 43.

- [x] The app is Next.js App Router with React and TypeScript, built to fit Vercel's Hobby plan with Fluid compute (300 s per function).
- [x] Data lives in Postgres through Drizzle 0.45.x with real migrations. Pages read through one server-only data layer, and every change goes through a server action that is a thin wrapper over a server operation.
- [x] Tests run server operations against PGlite with the real migrations, fresh per test file, with Better Auth running for real against the same database and driven through its server API, and an injectable clock. Later tickets add their own edge fakes (AI provider, Qloo transport, email transport, Blob store) to this harness.
- [x] Better Auth 1.7.x with the `username` plugin keeps users in our database. The user table also holds Style Preference (menswear, womenswear or no preference), Country code and birth year and month.
- [x] Sign-up step 1 shows blank day, month and year fields, with no default and no hint of the age cut-off.
- [x] An under-18 date shows "You need to be 18 or older to use Outfit Recommender.", stores nothing and sets a 30-day cookie. While the cookie lasts, step 1 shows the same message.
- [x] Step 2 asks for username, email, password (with a show/hide toggle), Style Preference (no default), Country (pre-filled from the browser's locale region) and one unticked checkbox agreeing to the Terms and Privacy Policy, linking to `/terms` and `/privacy`.
- [x] The Country list in config holds only countries Gemini serves, leaving out mainland China, Hong Kong, Macao, Russia, Iran, Cuba, Belarus, North Korea and Syria. Each entry carries its ISO code, display name and Qloo location query (ticket 14 adds `key_market` tags).
- [x] As the user types a username, the form says "That username is taken" when it is.
- [x] An email that already has an account gets "An account with that email already exists. Sign in or reset your password.", with links to sign in and to reset the password.
- [x] A `hooks.before` on email sign-up rechecks 18+ to the day before anything is read or written, setting the cookie on refusal.
- [x] Only the birth year and month are stored; the day is dropped. The username is passed as `name`, and `displayUsername` is sent along with `username`.
- [x] Usernames follow Better Auth's defaults: 3–30 characters of letters, digits, `_` and `.`, unique ignoring case, shown as typed. Passwords are 8–128 characters, with no composition rules and no breached-password check.
- [x] Sign-in takes a username or an email in one field, and every failure shows "That username or email and password don't match." There is no account lockout.
- [x] Sessions last 30 days and roll, with `updateAge` set to 1 day.
- [x] Signed-in users who open sign-in or sign-up are taken into the app.
- [x] The signed-in app has a top nav with New Consultation, My Consultations, Settings and Sign out. The first three are placeholder pages for now, and Sign out works. The root URL is a minimal public page linking to sign-in and sign-up until the landing page ticket replaces it.
- [x] Tests cover the age gate and its cookie (including an 18th birthday falling today) and that only the birth year and month are stored.
- [x] A Playwright smoke test signs up through both steps against local development. Ticket 18 adds verifying by link to this flow.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **"18+ to the day" across time zones.** Sign-up admits someone only once they are 18 in every time zone (UTC−12). While their 18th birthday has begun somewhere (UTC+14) but not everywhere, they get the under-18 message but no 30-day cookie, so nobody turning 18 today is blocked for a month. A browser already carrying the cookie is refused without restarting its 30 days.
- **The clock.** Our code reads the injected clock. Better Auth keeps session and token time with the real `Date`, so tests about its expiry (sessions here; links and resets in tickets 18 and 19) fake `Date` with `vi.useFakeTimers({ toFake: ["Date"] })`.
- **Rolling sessions.** `src/proxy.ts` refreshes the session on page loads and re-sends its cookie, since pages can't set cookies.
- **Local development** runs on an on-disk PGlite in `.data/pglite` when `DATABASE_URL` is unset. Next.js allows one dev server per folder, so stop `npm run dev` before `npm run test:e2e`.
- **Migrations run before every `npm run build`** against `DATABASE_URL` (skipped when it's unset). Ticket 02 must give preview deployments their own Neon branch, or a preview build would migrate production.
- `/terms`, `/privacy` and `/forgot-password` are placeholders until tickets 32 and 19. Set `BETTER_AUTH_SECRET` in Vercel (ticket 02).
