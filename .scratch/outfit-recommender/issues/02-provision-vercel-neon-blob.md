# 02: Provision Vercel, Neon and Blob

**What to build:** The team sets up the hosting the app deploys to: the Vercel project, the Neon database through the Vercel Marketplace, and the private Blob store, with their credentials in environment variables. None of this needs code, and the first deploy can happen once ticket 01 lands. Separately, Hobby blocks deploying co-authored commits from a private repo. Choosing the plan or repo setup is outside the spec's scope, but it sits on the critical path for a public demo link, so settle it well before the submission period ends on 2026-10-30.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) sections "Setup and operations" (Vercel, Neon, Blob), "Stack and platform" and "Further Notes" (Deadline).

- [x] Create the Vercel project and turn Fluid compute on.
- [x] Opt out of Vercel AI training (Team Settings → Data Preferences) before any photo is stored.
- [x] Create Neon through the Vercel Marketplace. Preview branches start from an empty or seed branch, never from production. Keep the default 6-hour restore window.
- [x] Create the one private Vercel Blob store.
- [x] Put the database and Blob credentials, `QLOO_API_KEY` and `QLOO_API_URL` in the project's environment variables. Secrets never go in tracked files.
- [x] Once ticket 01 lands, confirm it deploys and runs on the production URL.

## Progress (2026-10-16)

- **Vercel:** project `qloo-hackathon` (`prj_FskER8UxvzXfZuanEYaA3oVJlInM`) on team `kqw`, linked to `Kqwaiyi/Qloo-Hackathon`. `main` deploys to production at `qloo-hackathon-kohl.vercel.app`. Fluid compute and a 300 s default function timeout are set through the API. Vercel doesn't echo that setting back, so it shows only under Settings → Functions. The duplicate `outfit-recommender` project has been deleted.
- **Plan:** the team is on Pro, so co-authored commits from the private repo deploy as long as the commit author is a team member. The co-authored commits `50bf54e` and `ad585a2` deployed fine. Today the only member is Kqwaiyi, so teammates who push their own commits need seats.
- **Protection:** deployment protection is Standard (`all_except_custom_domains`): preview deployments need a Vercel login and the production domain is public. The firewall's managed Bot Protection is set to challenge and AI bots to deny. Browsers pass the challenge, but curl and other scripted requests get a 429 "Vercel Security Checkpoint". When the daily sweep cron lands, check that this rule doesn't block it.
- **AI training opt-out:** reported done by the team. The API can't show it.
- **Neon:** created through the Marketplace (iad1, Free, Neon Auth off) and connected to **Production only** (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, ...). Preview and Development have no database URL, so no preview can touch production data. Deferred: the empty or seed Neon branch for Preview. Until someone creates one and sets Preview's `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to it, preview builds skip migrations and have no database.
- **Blob:** private store `outfit-recommender-blob` (`store_lHnFeE6utRPUCkZi`, iad1) is connected to Production and Preview with `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY`.
- **Secrets:** `BETTER_AUTH_SECRET` is on Production and Preview. `QLOO_API_KEY`, `QLOO_API_URL` and `GEMINI_API_KEY` are on Production, Preview and Development. All are Sensitive.
- **First deploy:** `ad585a2` built in iad1 and is READY on production (`dpl_727JTjFfLnp4at42XZnWkkEUryUd`). The build log shows "Migrations applied." against Neon. Sign-up, sign-in and sign-out work in a browser on the production URL, and the runtime logs show no errors. Every function cold start logs `pg`'s "SSL modes ... treated as aliases for 'verify-full'" warning at error level, because Neon's URL uses `sslmode=require`. It's harmless, but it clutters the runtime-errors view. Setting `sslmode=verify-full` explicitly on the connection silences it.
