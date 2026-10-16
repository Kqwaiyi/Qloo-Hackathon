# 02: Provision Vercel, Neon and Blob

**What to build:** The team sets up the hosting the app deploys to: the Vercel project, the Neon database through the Vercel Marketplace, and the private Blob store, with their credentials in environment variables. None of this needs code, and the first deploy can happen once ticket 01 lands. Separately, Hobby blocks deploying co-authored commits from a private repo. Choosing the plan or repo setup is outside the spec's scope, but it sits on the critical path for a public demo link, so settle it well before the submission period ends on 2026-10-30.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) sections "Setup and operations" (Vercel, Neon, Blob), "Stack and platform" and "Further Notes" (Deadline).

- [x] Create the Vercel project and turn Fluid compute on.
- [ ] Opt out of Vercel AI training (Team Settings → Data Preferences) before any photo is stored.
- [ ] Create Neon through the Vercel Marketplace. Preview branches start from an empty or seed branch, never from production. Keep the default 6-hour restore window.
- [x] Create the one private Vercel Blob store.
- [ ] Put the database and Blob credentials, `QLOO_API_KEY` and `QLOO_API_URL` in the project's environment variables. Secrets never go in tracked files.
- [ ] Once ticket 01 lands, confirm it deploys and runs on the production URL.

## Progress (2026-10-16)

- Vercel project `qloo-hackathon` (`prj_FskER8UxvzXfZuanEYaA3oVJlInM`) on team `kqw`, linked to `Kqwaiyi/Qloo-Hackathon`. `main` deploys to production at `qloo-hackathon-kohl.vercel.app`. Fluid compute and a 300 s default function timeout are set through the API. Vercel doesn't echo that setting back, so it shows only under Settings → Functions.
- A duplicate project, `outfit-recommender` (`prj_KhDS4AZkQkNiuImw3zZnVOrk3diK`), was created by mistake and is linked to the same repo. Delete it in the dashboard (Settings → General → Delete Project). Until then every push deploys twice.
- Deployment protection is Standard (`all_except_custom_domains`): preview deployments need a Vercel login and the production domain is public.
- Private Blob store `outfit-recommender-blob` (`store_lHnFeE6utRPUCkZi`, iad1). Connect it to `qloo-hackathon` with "Add a read-write token env var" ticked, so `BLOB_READ_WRITE_TOKEN` exists.
- `QLOO_API_KEY`, `QLOO_API_URL` and `GEMINI_API_KEY` are set as Sensitive on Production, Preview and Development.
- Plan: the team is on Pro, so co-authored commits from the private repo deploy as long as the commit author is a team member. Today the only member is Kqwaiyi. Teammates who push their own commits need seats.
- Still for a human: delete `outfit-recommender`, connect Blob to `qloo-hackathon`, the AI-training opt-out, Neon through the Marketplace (sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`), and `BETTER_AUTH_SECRET`. Then redeploy and check the production URL.
