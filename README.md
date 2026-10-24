# Qurator

A webapp for adults: take one photo of yourself and get complete Outfits, picked with Qloo's taste data and shown on you. Built for the Qloo LLM Hackathon. The spec lives in [.scratch/outfit-recommender/spec.md](.scratch/outfit-recommender/spec.md), and the vocabulary in [GLOSSARY.md](GLOSSARY.md).

## Run it locally

```bash
npm install
npm run dev
```

Without `DATABASE_URL`, local development uses an on-disk PGlite database in `.data/pglite`, migrated on start-up. Without `BLOB_READ_WRITE_TOKEN`, photos and Previews are kept in `.data/blob`. Local development never sends real email, even with the Gmail variables set: each email is written as a JSON file to `.data/inbox`, where you can open its link, such as the verification link a new account needs before its first Consultation. The AI is a fake adapter that passes every photo after about a second, plays the AI Stylist with a scripted fake model that makes the fixed pipeline's choices and writes the same notes to the user each time, and draws each Preview as your own photo with a "Fake Preview" banner ("Fake Preview, redrawn" when the AI Stylist redraws one), with `FAKE_AI_SCENARIO` and `FAKE_AI_DELAY_MS` to change what it does. `AI_PROVIDER=real` switches on real AI instead: the photo check and the AI Stylist on Anthropic's Claude, with `ANTHROPIC_API_KEY`, and Previews on Google's Gemini, with `GEMINI_API_KEY`. It needs both keys, and refuses to start without either. It costs money, so the fake stays the default everywhere. Qloo is real, through the same 30-day cache in the database, so it needs `QLOO_API_URL` and `QLOO_API_KEY`. The product search that finds each Piece's real Products is a fake that sells every Brand the same small catalogue, and serves each of its Products' photos itself, as a plain swatch of the Product's colour, so Previews fetch nothing from the web; `PRODUCT_SEARCH=channel3` switches on Channel3 instead, with `CHANNEL3_API_KEY`: its searches cost credits, so the fake stays the default everywhere but production. With Channel3, each Preview fetches its Products' photos from their sellers while it's drawn, and never keeps them. Prices are shown in the currency of the user's Country, converted with the exchange rates the daily sweep stores; until it has run once, a Styling in a market outside the US breaks rather than search beyond its Brands' price ranges, so run the sweep by hand first (see [Daily sweep](#daily-sweep)). The Bot Check on sign-up, sign-in and password reset (Cloudflare Turnstile) is off unless `TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY` are set. See [.env.example](.env.example) for the environment variables.

Stylings run as a Vercel Workflow. In local development that is Workflow's Local World, which keeps its runs in `.workflow-data`; `npx workflow web` shows them. Each run starts with no retention: here its data, its steps' inputs and outputs, is deleted as soon as it finishes, and on Vercel it's unreadable from then on and gone within 36 days, as the Privacy Policy promises. A finished run shows its steps and timings but not what they returned. While a Styling runs, that data holds the photo, its Previews and the Stylist's conversation, with its Products' seller photos only as their links. Delete `.data` and `.workflow-data` to start over.

## Tests

```bash
npm test
npm run typecheck
npm run test:e2e
```

- `npm test` runs the server operations against a fresh in-memory PGlite per test file, with the real migrations and Better Auth running for real, the fake AI adapter with no delay, an in-memory Blob store, a fake Qloo transport, a fake Channel3 transport that knows every Brand by its own name and sells each a small catalogue, fake exchange-rate sources, and a capturing email transport. Stylings run through an inline runner: the Workflow's own steps, in its order, in the test's process, a Face Photo's Stylist included, whose Workflow agent runs there too, on the fake's scripted model. It also runs the Qloo client, the Channel3 product search against a fake Channel3 transport, and the Outfit assembly rules on their own, the Anthropic and Gemini adapters against fake Anthropic and Gemini APIs, and the Gmail purge's Apps Script against a fake Gmail mailbox. No test calls Qloo, Anthropic, Gemini, Channel3 or the exchange-rate sources.
- `npm run check:photo-style-tags` is a live check, never run in CI: one read-only Qloo call confirming that every Photo Style word is a real Qloo `personal_style` tag, since Qloo silently ignores one it doesn't know.
- `npm run check:product-search-coverage` is a live check, never run in CI, and the go/no-go for building Pieces from real Products: it takes the Brands in the Qloo cache (or, with `--fresh`, from fresh Qloo calls), looks each up through Channel3's free Brand lookup, and reports how many Channel3 knows and whether its websites lookup broke the ties it met. Then it runs one search for each line and Category the Brands picked most often would fill, one Channel3 credit each, and reports how many of the Brands that would be picked are usable. `--max-brands` caps how many Brands it checks, and `--lookups-only` makes no search. It needs `CHANNEL3_API_KEY`.
- `npm run check:stylist` is the Haiku check, a live check that costs money and never runs in CI: is the AI Stylist's model (`CLAUDE_STYLIST_MODEL` in [src/config/ai.ts](src/config/ai.ts)) good enough for production? It runs the real AI Stylist on Claude, with live Qloo and Channel3, on fixed AI-generated photos: the landing page's Full-Body sample photo, and a Face Photo and a Body-Only Photo cut from it. Each is styled once, as a new user's first Styling in the United States, at No Budget and everyone's limits, on an app of its own that lives only while it runs, as the landing sample script's does. Three Stylings draw their Previews on Nano Banana 2.1, as production does, and the AI Stylist should keep each as it was drawn. Four show it deliberately bad Previews: Nano Banana 2 Lite on the Body-Only Photo, where Lite invented a face in the Preview bake-off, though only the eye can tell whether it did this time, and faults the check makes from the photos themselves (the photo unchanged, its face pixelated, and a head added to the Body-Only Photo, twice, so neither image can be kept). For each Styling it reports whether its Outfits are valid (every Outfit it could make, and the AI Stylist finished), the AI Stylist's turns, the time taken, what its turns cost against what they'd cost with nothing cached, its largest prompt and what it did with each Preview, then prints a report to paste into ticket 12. It saves the photos, every Preview drawn and each Styling's notes and turns to a folder of the system's temporary files, never the repository. Run on its own, it says only what it would do and roughly what that costs, about a dollar; with `--go-ahead`, once the team has agreed to the cost, it spends it. `--image-model gemini-3.1-flash-lite-image` draws every Preview Nano Banana 2.1 would draw on the cheaper Nano Banana 2 Lite instead, and leaves those Previews to the eye, since they aren't production's. It needs `QLOO_API_URL`, `QLOO_API_KEY`, `CHANNEL3_API_KEY`, `ANTHROPIC_API_KEY` and `GEMINI_API_KEY`, whatever `AI_PROVIDER` and `PRODUCT_SEARCH` say.
- `npm run test:e2e` runs the Playwright smoke tests against a dev server on port 3100 with an in-memory database. They verify each new account by the link they find in `.data/inbox`. Like local development, it uses real Qloo, so each run that starts a Consultation makes a Qloo call or two, and it runs the daily sweep first, which fetches the day's exchange rates from their live sources. Sign-up and sign-in go through Turnstile's real widget on its always-pass test keys, so the tests need internet access. Stop any other `npm run dev` in this folder first, since Next.js allows one dev server per folder. Run `npx playwright install chromium` once, or set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome.

## Team Gmail

Every email the app sends goes out over SMTP from a throwaway team Gmail account, on Vercel only. One send function enforces caps that keep the account under Gmail's daily limit: they're in [src/config/email.ts](src/config/email.ts). To set it up, or to make a new app password after the account's password changes, run:

```bash
bash scripts/setup-team-gmail.sh
```

The wizard walks through the account, 2-Step Verification and the app password, and writes `GMAIL_USER` and `GMAIL_APP_PASSWORD` to `.env.local`. Next it sends a test email to the account's `+demo` address, which the Demo Account uses, then has you add both variables to Vercel for Production. Finally it installs [scripts/gmail-purge](scripts/gmail-purge/), an Apps Script in the account that permanently deletes sent mail older than a day, every day. That covers everything in Sent, the team's own replies included.

## Daily sweep

Once a day at 12:00 UTC, Vercel Cron calls `/api/daily-sweep` ([vercel.json](vercel.json)), which keeps the Privacy Policy's retention promises and refreshes the exchange rates:

- It deletes accounts still unverified 7 days after sign-up, on the date the verification email and banner give.
- It emails a warning to accounts with no activity for 12 months minus 30 days: the account and its Consultations go on a date 30 days away unless the user signs in. Activity means a session created or refreshed: signing up or in, opening a verification link, or using the app, which refreshes the session at most once a day. At most 50 warnings go out a day, the longest inactive first, and the rest wait for the next day.
- It deletes an account on the date its warning gave, 30 days after the warning actually went, unless the user has been active since.
- It purges usage records and email-log rows older than 35 days, and Qloo cache entries older than 30 days.
- It stores each currency's rate to the US dollar from [Frankfurter](https://frankfurter.dev), or from [fawazahmed0's currency API](https://github.com/fawazahmed0/exchange-api) when Frankfurter fails. Both are free and keyless, and are sent nothing about any user. When both fail, the day before's rates stay. Every price is converted with them as its page is shown, into the currency of the viewer's Country ([src/config/currencies.ts](src/config/currencies.ts)), and each search's price filter is its Brand's range converted into its market's currency. A market whose currency has no rate stored yet can't be searched, so after a first deploy, run the sweep once by hand before anyone outside the US styles.

It never sweeps the Demo Account, and it deletes an account the same way as the user's own deletion. The emails give UTC dates, and the sweep deletes at whatever time of that UTC day it runs. Midday UTC keeps that on the date the reader sees in almost every time zone. The numbers are in [src/config](src/config/), which the Privacy Policy reads too.

The route refuses any request without the `CRON_SECRET` bearer token, so the sweep doesn't run until `CRON_SECRET` is set on Vercel for Production. Vercel Cron then sends it with each call. An account the sweep can't delete or warn is logged without its address, and the run answers 500 so it shows as failed in the runtime logs. The account is still due, so the next day's sweep tries it again. A day neither rate source answered fails the run the same way. To run the sweep by hand in local development, set `CRON_SECRET` in `.env.local` and, with `npm run dev` running:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/daily-sweep
```

## Team scripts

Two scripts handle what users ask the team for by email, and a third creates the Demo Account. Each runs the same operation the app would, against the database and Blob store the environment names: with production's `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` set, production; without them, local development's (stop `npm run dev` first, since PGlite allows one process at a time). Each says which database it's using.

```bash
npm run team:delete-account -- someone@example.com
npm run team:correct-birth-date -- someone@example.com 2001-04-23
```

- `team:delete-account` deletes an account for an emailed request or an under-18 report, as the user's own deletion does: every Consultation with its photo and Previews, any Styling stopped, and the user stripped from usage records and the email log.
- `team:correct-birth-date` corrects an account's birth year and month, given the whole date of birth the user emailed. It judges that date as sign-up does, 18 to the day in every time zone, and keeps only the year and month. If the user is under 18, it deletes the account the same way instead.

A Styling still running is stopped either way. From outside Vercel the script usually can't reach its Workflow run to cancel it, so it says so and carries on: the run's steps find their Styling gone and save nothing.

### The Demo Account

The judges share one Demo Account. Run this once, against production, after the production database exists:

```bash
GMAIL_USER=<the team Gmail address> DEMO_ACCOUNT_PASSWORD=<its password> npm run team:create-demo-account
```

It signs the account up through Better Auth as the app does, already verified, with the username `demo`, born January 2000, at `GMAIL_USER`'s `+demo` plus-address, which is how the app knows it ([src/config/accounts.ts](src/config/accounts.ts)). So `GMAIL_USER` must match production's. Type the password into the shell for that one run: never put it in `.env.local` or any other file. If the account already exists, it changes nothing.

On the Demo Account, Settings shows the password, email and username, account deletion, withdrawing photo consent and "Sign out of all devices" disabled, with a lock and "Managed by the team", and the server refuses them, Better Auth's own endpoints included. Judges can still change its date of birth (18 or over), Style Preference and Country. Its password reset links go to the team's `+demo` inbox, so a reset is how the team changes the password, and `team:delete-account` still deletes it.

No usage limit applies to the Demo Account: not the Outfit Allowance, the photo-check limit, the app-wide caps, the Qloo backstop or the product-search backstop. Its Outfits and photo checks write no usage record, so its Outfits don't count towards the app-wide caps, and each of its Stylings makes 2 Outfits. Its product searches still count towards the product-search backstop, as its Qloo calls count towards Qloo's. Its AI Stylist also has more room on each Styling, so the judges' Stylings complete: 60 turns, the Brands of 10 Style Icons and 40 product searches, where everyone else's has 30, 6 and 24 (`EVERYONES_STYLING_LIMITS` and `DEMO_ACCOUNT_STYLING_LIMITS` in [src/config/stylings.ts](src/config/stylings.ts)). Each Outfit's Preview is still redrawn at most once, and the Anthropic workspace's spend limit still applies. Judges can style different Consultations at the same time, though each Consultation still runs one Styling at a time. The photo check, the region gate and the 18+ rule still apply. For now, judges signing in to it, by its email or the username `demo`, skip the Bot Check, so only Better Auth's per-IP sign-in rate limit guards its password: revisit that before the app reaches anyone beyond the judges. The consent sheet comes before every Consultation on it, and each judge's agreement (the photo notice version and when) is kept on that Consultation rather than on the account. The sheet and My Consultations both say that anyone with the login can see the Consultations made there. Before submitting, the team deletes its own test Consultations from it.

## Landing page samples

The landing page walks visitors through three frozen Consultations, one of each Photo Type: a Full-Body Photo for the walkthrough, then a Face Photo and a Body-Only Photo. Their text ships with the page in [src/server/landing-samples.ts](src/server/landing-samples.ts), and their photo and Preview in `public/landing/samples/<Photo Type>/`, so the page never calls Qloo, the AI, the product search or the Blob store. A sample's Products keep the offers, prices and dates they were found with: the page never checks them again. Every sample person is AI-generated, which is why their images can live in the repo. Until they're captured, the samples are placeholders shown with plain figures.

### Making a sample with real Products

Once a sample has its photo, the team makes it again with real Products by running a real Styling once on that photo, with live Qloo, Channel3 and real AI and the United States as the Country. This costs money (a photo check, the AI Stylist's turns, a Preview for each of its 2 Outfits, and around 8 product searches), so get the team's go-ahead first. With `QLOO_API_URL`, `QLOO_API_KEY`, `CHANNEL3_API_KEY`, `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` in `.env.local`, whatever `AI_PROVIDER` and `PRODUCT_SEARCH` say, run this, leaving out the Outfit number for the first:

```bash
npm run team:make-landing-sample -- <full_body | face | body_only> <Outfit number>
```

It runs on an app of its own that lives only while it runs, its database and Blob store in memory, so it reads and writes no other database and sends no email, and its Qloo calls and product searches count towards no backstop but that app's own. There it creates the Demo Account, gives it the sample's Style Preference and the United States, presses "Get my Outfits" with the photo in `public/landing/samples/<Photo Type>/` and the sample's Budget Tier, and runs that Styling to its end. Then it freezes the picked Outfit as `team:export-landing-sample` below does, replacing the sample's photo, Preview and text, and ends by naming that Outfit's Style Icon and Products, with their prices, dates and shops. The Full-Body sample's Style Preference is No preference, whose Style Icons alternate lines, womenswear first, so its menswear Outfit is usually Outfit 2. Pick one with a separate Top and Bottom, for the reason in step 2 below. A run that fails partway writes nothing, so run it again: here, unlike in the Workflow, a Qloo call that errors isn't tried again, though each of the AI Stylist's turns gets the AI SDK's own retries. Check the Preview and the diff by eye, then commit them.

### Capturing a sample from a Consultation

To capture a sample from a Consultation on the Demo Account, with an AI-generated photo from ticket 05:

1. Sign in to the Demo Account in production and run a Consultation with the photo. Between them, the Face Photo and Body-Only Photo should cover the Style Preference the Full-Body Photo's doesn't, so change the Demo Account's Style Preference in Settings as you go.
2. Pick the Outfit the page will show, one with a Preview that looks right, and note its number ("Outfit N"). The first is the default. For the Full-Body Photo, pick one with a separate Top and Bottom, since the walkthrough lists the Brands Qloo picked from its Pieces, and a One-Piece leaves out the Bottom Brand. Copy the Consultation's ID from the end of its page's address, `/consultations/<id>`.
3. With production's `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` set, as for the team scripts above, run this, leaving out the Outfit number for the first:

   ```bash
   npm run team:export-landing-sample -- <the Demo Account's email> <id> <Outfit number>
   ```

   It refuses a Consultation that isn't the named account's, so a mistyped ID can't put another user's photo on the page: name the Demo Account. It writes the photo and the picked Outfit's Preview into `public/landing/samples/<Photo Type>/`, replacing what was there, so the Demo Account can then delete the Consultation. It writes the Photo Style, the top ranked Style Icons (as many as `LANDING_STYLE_ICONS` in [src/config/landing.ts](src/config/landing.ts)), and the picked Outfit's Brands and Pieces into `src/server/landing-samples.ts`, in the place for the Photo Type. It ends by naming that Outfit's Style Icon and Pieces, so you can check it's the one you meant.
4. Check the diff, then commit and deploy it.

## Database changes

Edit `src/server/db/schema.ts`, then run `npm run db:generate` to write a migration into `drizzle/`. `npm run build` applies migrations to `DATABASE_URL` before building, so each Vercel deploy migrates its own database.
