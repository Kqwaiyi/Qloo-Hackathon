# Outfit Recommender

A webapp for adults: take one photo of yourself and get complete Outfits, picked with Qloo's taste data and shown on you. Built for the Qloo LLM Hackathon. The spec lives in [.scratch/outfit-recommender/spec.md](.scratch/outfit-recommender/spec.md), and the vocabulary in [GLOSSARY.md](GLOSSARY.md).

## Run it locally

```bash
npm install
npm run dev
```

Without `DATABASE_URL`, local development uses an on-disk PGlite database in `.data/pglite`, migrated on start-up. Delete that folder to start over. See [.env.example](.env.example) for the environment variables.

## Tests

```bash
npm test
npm run typecheck
npm run test:e2e
```

- `npm test` runs the server operations against a fresh in-memory PGlite per test file, with the real migrations and Better Auth running for real.
- `npm run test:e2e` runs the Playwright smoke tests against a dev server on port 3100 with an in-memory database. Stop any other `npm run dev` in this folder first, since Next.js allows one dev server per folder. Run `npx playwright install chromium` once, or set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome.

## Database changes

Edit `src/server/db/schema.ts`, then run `npm run db:generate` to write a migration into `drizzle/`. `npm run build` applies migrations to `DATABASE_URL` before building, so each Vercel deploy migrates its own database.
