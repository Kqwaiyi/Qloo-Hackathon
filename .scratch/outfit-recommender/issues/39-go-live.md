# 39: Go live: Demo Account, landing samples and first real Consultations

**What to build:** The last steps before the public demo link goes to the judges: the Demo Account exists in production, the landing page shows real frozen Consultations, real Previews from phone photos have been checked, and the judges have the login.

**Blocked by:** [02 Provision Vercel, Neon and Blob](02-provision-vercel-neon-blob.md), [03 Set up the team Gmail account](03-team-gmail-account.md), [04 Set up the Gemini API project and spend caps](04-gemini-project-spend-caps.md), [05 Pick the landing page sample photos](05-landing-sample-photos.md), [33 Landing page walkthrough](33-landing-page.md), [35 Gemini adapter: Previews](35-gemini-previews.md), [37 Daily sweep](37-daily-sweep.md), [38 Demo Account: unlimited Consultations with per-Consultation consent](38-demo-account-consultations.md)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) sections "Setup and operations" (Vercel, Demo Account, Landing page images, First real Consultations) and "Further Notes" (Hobby Blob limits; Untested).

- [x] Switch the Gemini adapter on in production.
- [ ] Set `CRON_SECRET` on Vercel for Production, since the daily sweep refuses every call without it (ticket 37). Then confirm the cron is active in production, and that the firewall's Bot Protection challenge doesn't block it (ticket 02).
- [ ] Run the Demo Account creation script once against the production database.
- [ ] Run the three frozen Consultations on the Demo Account with the photos from ticket 05, and save their text as the landing page's static data using ticket 33's capture procedure.
- [x] Fill in the team members' names on `/privacy`.
- [ ] Check the first real Consultations on the Demo Account with phone photos, since the Preview bake-off used only small web images.
- [ ] Keep an eye on Blob usage: Hobby's 1 GB and 2,000 writes a month bind before the 750-Outfit monthly cap does.
- [ ] Delete the team's own test Consultations, then send the Demo Account's login to the judges privately.

## Progress (2026-10-18)

- **Production deploy:** `main` at `5a21d28` is READY on production (`dpl_ABhSqx64QaHsmGUgA7YJ9wKsq7mL`). It brought tickets 36, 37 and 38 live, which had been sitting unpushed: the build log shows "Migrations applied." for `0014_daily_sweep` and `0015_demo_account_consultations`. Tests passed before the push (582).
- **Gemini:** `AI_PROVIDER=gemini` is on **Production only** (encrypted), beside the `GEMINI_API_KEY` already there, so every Consultation in production now runs on real Gemini and costs money. Preview and Development stay on the fake adapter. Tickets 34 and 35's smoke runs never happened, so the first real Gemini calls anywhere will be the Demo Account's, under the checklist's phone-photo check.
- **`CRON_SECRET`:** set on **Production only**, as Sensitive, 64 random hex characters. Nobody needs its value: Vercel Cron sends it. Set a new value in the dashboard and redeploy to run the sweep by hand.
- **The cron:** `vercel.json`'s 12:00 UTC sweep is in the deployed build. Whether the firewall lets it through isn't confirmed yet: Bot Protection is still on challenge (AI bots deny), the Vercel docs don't say whether cron calls are exempt, and there's no Vercel login here to press Run. The first scheduled run, at 12:00 UTC today, is the check: a 200 with the report in the runtime logs means it's through. If the firewall stops it, the fix is a WAF bypass rule for `/api/daily-sweep`, which `CRON_SECRET` still guards.
- **`/privacy`:** names the team as Kqwaiyi, AlexanderBudi and alisakujou0711, its GitHub handles, as the team chose.
- **Blob:** 2 files, 194 KB, quota not exceeded. The team is on Pro (ticket 02), so Hobby's 1 GB and 2,000 writes don't apply as written. Pro bills usage past its included amounts instead, so the box now means watching the bill, under Vercel's Usage page.
- **Still blocked:** ticket 05's photos aren't picked yet, so the three frozen Consultations wait for it.
- **Demo Account:** for the team to run, since it takes production's `DATABASE_URL` (Sensitive, so the API can't read it back: copy it from the Neon database's page under Vercel → Storage) and the judges' password, which only the team should see. From Git Bash, with a leading space so the shell doesn't keep it in history:

  ```bash
   GMAIL_USER='<the team Gmail address>' DATABASE_URL='<production DATABASE_URL>' DEMO_ACCOUNT_PASSWORD='<8 to 128 characters>' npm run team:create-demo-account
  ```

  It should say "Using the database in DATABASE_URL." first. `GMAIL_USER` must be the same address as production's, or the app won't know the account as the Demo Account. Its one verification email lands in this laptop's `.data/inbox`, not Gmail, and counts once in production's email log.
