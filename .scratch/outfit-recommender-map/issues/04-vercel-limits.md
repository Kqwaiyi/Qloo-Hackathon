# What limits does Vercel put on the Consultation pipeline?

Type: research
Status: resolved
Map: [Outfit Recommender](../map.md)

## Question

One Consultation runs a photo check, several Qloo calls, Piece tailoring and two image generations, likely 30 to 90 seconds end to end. What does Vercel allow, and what are the options?

1. Maximum function duration on Hobby vs Pro (with Fluid compute), and whether responses can stream progress to the browser.
2. Request body size limits, and how to upload photos directly from the browser to storage instead.
3. Options for work that outlives a request: `after()` / `waitUntil`, Vercel Queues, Vercel Workflow, Inngest, Trigger.dev. Availability on Hobby, limits and cost.
4. Private file storage for photos and Previews: Vercel Blob private access and signed URLs vs alternatives (Supabase Storage, S3, Cloudflare R2).
5. Hobby plan terms (for example non-commercial use) that matter for a public hackathon demo.

## Answer

A 90-second Consultation fits on the free Hobby plan.

- **Binding limits:** functions run for up to 300 s on Hobby (Fluid compute) and 800 s on Pro. `after()`/`waitUntil` work shares that same timeout. Requests and responses are capped at 4.5 MB (Server Actions at 1 MB), except streamed responses. Hobby has no overage billing: going over an allowance pauses that feature for 30 days. Blob's 1 GB of storage and 2,000 writes/month will run out first.
- **Pipeline shapes:** (A) one streaming route; (B) a **Vercel Workflow** (GA, on Hobby; each step gets its own 300 s and retries; the progress stream can be resumed; run data is kept only 1 day on Hobby, so we store results ourselves and keep image bytes in Blob); (C) `after()` plus polling. **Recommended: B**, with A as the fallback since they share step code. Neither has a cross-run rate limiter for Qloo's 5 req/s, so we build our own. Inngest and Trigger.dev work but add another account; Vercel Queues is too low-level.
- **Storage:** **private Vercel Blob**. Upload straight from the browser via signed upload, compress photos first, show them through short-lived signed URLs. Deletes take about 60 s to clear Vercel's cache. Cloudflare R2 has the best free tier but needs a separate account. Supabase pauses after a week of inactivity, a demo risk.
- **Hobby caveats:** non-commercial use only (prize money is a grey area). **Opt out of Vercel AI training** (Team Settings → Data Preferences) before storing face photos. Hobby blocks deploys from private or organisation-owned repos with other collaborators, and reportedly from co-authored commits too. Fixes: a public repo, deploying from the owner's account, or Pro at $20/mo. Logs are kept 1 hour.

Findings: branch `research/vercel-limits`, file `.scratch/outfit-recommender-map/research/vercel-limits.md`.
