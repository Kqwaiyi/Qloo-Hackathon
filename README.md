# Outfit Recommender

A webapp for adults: take one photo of yourself and get complete Outfits, picked with Qloo's taste data and shown on you. Built for the Qloo LLM Hackathon. The spec lives in [.scratch/outfit-recommender/spec.md](.scratch/outfit-recommender/spec.md), and the vocabulary in [GLOSSARY.md](GLOSSARY.md).

## Run it locally

```bash
npm install
npm run dev
```

Without `DATABASE_URL`, local development uses an on-disk PGlite database in `.data/pglite`, migrated on start-up. Without `BLOB_READ_WRITE_TOKEN`, photos are kept in `.data/blob`. Delete `.data` to start over. The AI is a fake adapter that passes every photo after about a second, with `FAKE_AI_SCENARIO` and `FAKE_AI_DELAY_MS` to change what it does. See [.env.example](.env.example) for the environment variables.

## Tests

```bash
npm test
npm run typecheck
npm run test:e2e
```

- `npm test` runs the server operations against a fresh in-memory PGlite per test file, with the real migrations and Better Auth running for real, the fake AI adapter with no delay, and an in-memory Blob store. It also runs the Gmail purge's Apps Script against a fake Gmail mailbox.
- `npm run test:e2e` runs the Playwright smoke tests against a dev server on port 3100 with an in-memory database. Stop any other `npm run dev` in this folder first, since Next.js allows one dev server per folder. Run `npx playwright install chromium` once, or set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome.

## Team Gmail

Every email the app sends goes out over SMTP from a throwaway team Gmail account. To set it up, or to make a new app password after the account's password changes, run:

```bash
bash scripts/setup-team-gmail.sh
```

The wizard walks through the account, 2-Step Verification and the app password, and writes `GMAIL_USER` and `GMAIL_APP_PASSWORD` to `.env.local`. Next it sends a test email to the account's `+demo` address, which the Demo Account uses, then has you add both variables to Vercel for Production. Finally it installs [scripts/gmail-purge](scripts/gmail-purge/), an Apps Script in the account that permanently deletes sent mail older than a day, every day. That covers everything in Sent, the team's own replies included.

## Database changes

Edit `src/server/db/schema.ts`, then run `npm run db:generate` to write a migration into `drizzle/`. `npm run build` applies migrations to `DATABASE_URL` before building, so each Vercel deploy migrates its own database.
