# Outfit Recommender

A webapp for adults: take one photo of yourself and get complete Outfits, picked with Qloo's taste data and shown on you. Built for the Qloo LLM Hackathon. The spec lives in [.scratch/outfit-recommender/spec.md](.scratch/outfit-recommender/spec.md), and the vocabulary in [GLOSSARY.md](GLOSSARY.md).

## Run it locally

```bash
npm install
npm run dev
```

Without `DATABASE_URL`, local development uses an on-disk PGlite database in `.data/pglite`, migrated on start-up. Without `BLOB_READ_WRITE_TOKEN`, photos and Previews are kept in `.data/blob`. Local development never sends real email, even with the Gmail variables set: each email is written as a JSON file to `.data/inbox`, where you can open its link, such as the verification link a new account needs before its first Consultation. The AI is a fake adapter that passes every photo after about a second and draws each Preview as your own photo with a "Fake Preview" banner, with `FAKE_AI_SCENARIO` and `FAKE_AI_DELAY_MS` to change what it does. Qloo is real, through the same 30-day cache in the database, so it needs `QLOO_API_URL` and `QLOO_API_KEY`. See [.env.example](.env.example) for the environment variables.

Stylings run as a Vercel Workflow. In local development that is Workflow's Local World, which keeps its runs in `.workflow-data`; `npx workflow web` shows them. Each run's data, its steps' inputs and outputs, is deleted as soon as it finishes, as the Privacy Policy promises, so a finished run shows its steps and timings but not what they returned. Delete `.data` and `.workflow-data` to start over.

## Tests

```bash
npm test
npm run typecheck
npm run test:e2e
```

- `npm test` runs the server operations against a fresh in-memory PGlite per test file, with the real migrations and Better Auth running for real, the fake AI adapter with no delay, an in-memory Blob store, a fake Qloo transport and a capturing email transport. Stylings run through an inline runner: the Workflow's own steps, in its order, in the test's process. It also runs the Qloo client and the Outfit assembly rules on their own, and the Gmail purge's Apps Script against a fake Gmail mailbox. No test calls Qloo or Gemini.
- `npm run check:photo-style-tags` is a live check, never run in CI: one read-only Qloo call confirming that every Photo Style word is a real Qloo `personal_style` tag, since Qloo silently ignores one it doesn't know.
- `npm run test:e2e` runs the Playwright smoke tests against a dev server on port 3100 with an in-memory database. They verify each new account by the link they find in `.data/inbox`. Like local development, it uses real Qloo, so each run that starts a Consultation makes a Qloo call or two. Stop any other `npm run dev` in this folder first, since Next.js allows one dev server per folder. Run `npx playwright install chromium` once, or set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome.

## Team Gmail

Every email the app sends goes out over SMTP from a throwaway team Gmail account, on Vercel only. One send function enforces caps that keep the account under Gmail's daily limit: they're in [src/config/email.ts](src/config/email.ts). To set it up, or to make a new app password after the account's password changes, run:

```bash
bash scripts/setup-team-gmail.sh
```

The wizard walks through the account, 2-Step Verification and the app password, and writes `GMAIL_USER` and `GMAIL_APP_PASSWORD` to `.env.local`. Next it sends a test email to the account's `+demo` address, which the Demo Account uses, then has you add both variables to Vercel for Production. Finally it installs [scripts/gmail-purge](scripts/gmail-purge/), an Apps Script in the account that permanently deletes sent mail older than a day, every day. That covers everything in Sent, the team's own replies included.

## Team scripts

Two scripts handle what users ask the team for by email. Each runs the same operation the app would, against the database and Blob store the environment names: with production's `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` set, production; without them, local development's (stop `npm run dev` first, since PGlite allows one process at a time). Each says which database it's using.

```bash
npm run team:delete-account -- someone@example.com
npm run team:correct-birth-date -- someone@example.com 2001-04-23
```

- `team:delete-account` deletes an account for an emailed request or an under-18 report, as the user's own deletion does: every Consultation with its photo and Previews, any Styling stopped, and the user stripped from usage records and the email log.
- `team:correct-birth-date` corrects an account's birth year and month, given the whole date of birth the user emailed. It judges that date as sign-up does, 18 to the day in every time zone, and keeps only the year and month. If the user is under 18, it deletes the account the same way instead.

A Styling still running is stopped either way. From outside Vercel the script usually can't reach its Workflow run to cancel it, so it says so and carries on: the run's steps find their Styling gone and save nothing.

## Database changes

Edit `src/server/db/schema.ts`, then run `npm run db:generate` to write a migration into `drizzle/`. `npm run build` applies migrations to `DATABASE_URL` before building, so each Vercel deploy migrates its own database.
