# 02: Provision Vercel, Neon and Blob

**What to build:** The team sets up the hosting the app deploys to: the Vercel project, the Neon database through the Vercel Marketplace, and the private Blob store, with their credentials in environment variables. None of this needs code, and the first deploy can happen once ticket 01 lands. Separately, Hobby blocks deploying co-authored commits from a private repo. Choosing the plan or repo setup is outside the spec's scope, but it sits on the critical path for a public demo link, so settle it well before the submission period ends on 2026-10-30.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) sections "Setup and operations" (Vercel, Neon, Blob), "Stack and platform" and "Further Notes" (Deadline).

- [ ] Create the Vercel project and turn Fluid compute on.
- [ ] Opt out of Vercel AI training (Team Settings → Data Preferences) before any photo is stored.
- [ ] Create Neon through the Vercel Marketplace. Preview branches start from an empty or seed branch, never from production. Keep the default 6-hour restore window.
- [ ] Create the one private Vercel Blob store.
- [ ] Put the database and Blob credentials, `QLOO_API_KEY` and `QLOO_API_URL` in the project's environment variables. Secrets never go in tracked files.
- [ ] Once ticket 01 lands, confirm it deploys and runs on the production URL.
