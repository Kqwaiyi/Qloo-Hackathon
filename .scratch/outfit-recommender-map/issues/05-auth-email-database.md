# Which auth, email and database options fit?

Type: research
Status: resolved
Map: [Outfit Recommender](../map.md)

## Question

Sign-up asks for username, email, password, age and Style Preference. Users verify their email, sign in with username or email, reset passwords by email, and can delete their account and all their Consultations. Which options fit a Next.js App Router app on Vercel?

1. **Auth library:** for example Better Auth (username plugin), Auth.js credentials, Supabase Auth, Clerk. For each: support for username + email + password, email verification, password reset, sessions, extra profile fields (age, Style Preference), account deletion, maintenance status and cost.
2. **Transactional email:** providers with a free tier (for example Resend), sending limits, and whether a custom domain is required.
3. **Postgres via the Vercel Marketplace:** for example Neon or Supabase. Free tier limits, serverless connection handling, Drizzle or Prisma compatibility.

## Answer

**Recommended: Better Auth + Drizzle + Neon + Resend, sending from a subdomain of a domain the team owns.**

- **Auth:** Better Auth (1.7.x, MIT) with its `username` plugin is the only free option that covers everything while keeping users in our own Postgres. It handles username, email and password; sign-in by either one (two endpoints, with the UI routing on `@`); email verification and password reset by link; typed `additionalFields` for age and Style Preference; and `deleteUser` with hooks to purge images. Clerk is the hosted fallback, but it needs an owned domain for production, caps dev instances at 100 users, and resets passwords with a code rather than a link. Supabase Auth and Neon Auth have no username sign-in. Auth.js is in maintenance mode and discourages passwords. Lucia is deprecated.
- **Email:** Resend's free tier allows 3,000 emails a month and 100 a day, integrates with Vercel and configures DNS automatically there. **Every credible free provider needs a domain we control before it will email arbitrary users.** Without one, Resend only delivers to the account owner.
- **Database:** Neon's free tier through the Vercel Marketplace gives 1 GB, 100 CU-hours a month and scale-to-zero without pausing, plus an injected pooled `DATABASE_URL`. Supabase's free tier pauses after 7 idle days. Use Drizzle 0.45.x as the ORM; Prisma 8 RC is outside Better Auth's supported range.
- **Gotchas:**
  - Better Auth keeps rate limits in memory by default; set `storage: "database"`.
  - Better Auth requires `name` at sign-up; pass the username.
  - Account deletion and revoking sessions on password reset are both off by default; turn them on.
  - Neon suspends the database until next month if the free budget runs out.
  - Buy the domain early, because DNS verification can take hours.

Findings: branch `research/auth-email-database`, file `.scratch/outfit-recommender-map/research/auth-email-database.md`.
