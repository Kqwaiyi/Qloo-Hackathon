# What's the architecture?

Type: grilling
Status: resolved
Blocked by: 03, 04, 05
Map: [Outfit Recommender](../map.md)

## Question

How is the Next.js app on Vercel put together?

- Backend shape: route handlers, server actions, or both.
- Database and ORM.
- Storage for photos and Previews.
- Auth library and email provider, including whether the team buys a domain: every free email provider needs one before it will email arbitrary users, and email verification and reset depend on it.
- How the Consultation pipeline (photo check → Outfit assembly → Piece tailoring → 2 Previews, then 2 more on "see more") runs within Vercel's limits: one streamed request, or a background job the browser polls or subscribes to.
- Where the swappable AI provider seam sits (ADR-0001).

## Answer

Resolved with the user on 2026-10-15. Everything runs on free tiers and is designed to fit Vercel's Hobby limits. Which Vercel plan and repo setup actually deploys the team's commits stays with the hackathon submission.

**Stack.**
- Next.js App Router on Vercel.
- Better Auth with the `username` plugin.
- Neon Postgres through the Vercel Marketplace, with Drizzle.
- A private Vercel Blob store for photos and Previews.
- Vercel Workflow for the Consultation pipeline.

**Email without a domain.** No domain is bought and Resend is dropped.
- Verification and reset emails go out through a **throwaway team Gmail account** with an app password (2-Step Verification on), over Gmail SMTP with Nodemailer, awaiting each send. Gmail allows up to 500 a day.
- Sending sits behind one small send-email function, so moving to a domain and Resend later is a config change.
- Credentials live in `.env.local` as `GMAIL_USER` and `GMAIL_APP_PASSWORD`.
- Risks accepted:
  - Google says app passwords "aren't recommended" and may lock a new account that sends automated mail.
  - Vercel's community advice prefers HTTP email APIs over SMTP from functions.
  - The sender is a @gmail.com address.
- Considered: a free first-year domain from the GitHub Student Developer Pack (keeps Resend as researched), and dropping email entirely (reopens verification and reset).

**Backend shape.**
- Pages read data on the server through one server-only data layer.
- Server actions handle the app's own changes: start a Consultation, "Show 2 more Outfits", change the Budget Tier or Photo Style, delete a Consultation, settings.
- Route handlers only for Better Auth's catch-all and the Styling status check. No public API.

**Photo intake.**
- The browser shrinks the photo to about 1600 px on its long side. The picker refuses files over 20 MB before shrinking.
- The "Get my Outfits" server action receives it and refuses anything over 2 MB, or anything that isn't a JPEG, PNG or WebP image that actually decodes. Raise `serverActions.bodySizeLimit` to fit.
- The photo check (which also reads the Photo Style) runs inside that action and relies on the AI SDK's own retries.
- Only an accepted photo is saved to Blob. **A rejected photo is never stored and creates no Consultation.**

**Pipeline.** One "build Outfits" Vercel Workflow. Each kind of run enters at a different stage:

| Run | Starts at | Outfits |
|---|---|---|
| New Consultation | Style Icons | new |
| Photo Style change | Style Icons | replaced |
| Budget Tier change | Brands | replaced |
| "Show 2 more Outfits" | Brands for the next Style Icons | added |

- Each Qloo and AI call is its own step with its own retries and its own 300 s.
- One run at a time per Consultation: the server refuses a second start.
- A single streaming request was the considered fallback; it shares the step code.

**Progress and saving.**
- The Consultation is saved with the status Styling when its run starts.
- Each step saves its output as it finishes (Style Icons, Outfits, Preview locations), so a retried step resumes and nothing relies on Workflow's run data, which Hobby keeps for 1 day.
- The Styling page polls the stored stage about once a second. Workflow's own progress stream is not used.
- The Outfit list appears when the run marks the Consultation ready.
- My Consultations shows a running Consultation as "Styling…", and opening it shows the checklist.

**AI provider seam ([ADR-0001](../../../docs/adr/0001-qloo-selects-ai-concretizes.md)).**
- Our own interface with three operations:
  - check a photo and read its Photo Style;
  - tailor one Outfit's Pieces;
  - render one Preview.
- The Gemini adapter implements it on the Vercel AI SDK and owns its prompts.
- A **fake adapter** returns canned checks and tailoring and a placeholder Preview. It is the default in local development and tests; Gemini runs only when explicitly switched on.
- Considered: treating the AI SDK itself as the seam. Rejected because the domain would then depend on it.

**Qloo.**
- Calls go through a client backed by a cache table in Neon: 30 days, keyed by the exact request, trimmed to the fields used.
- No shared rate limiter. One Consultation sends at most 3 calls at once; each Qloo call is a Workflow step that backs off and retries on "too many requests". Add Redis only if real concurrency shows up.
- Local development uses real Qloo through the cache.

**Outfit assembly.**
- A self-contained module with no framework code: Qloo results in, ranked Style Icons and Outfits out. It holds the filters, the config denylists, de-duplication, thin-pool widening and the Piece picks from "How does Qloo build and rank Outfits?".
- Workflow steps are thin wrappers that fetch, call it and save.
- Tested with small hand-written Qloo samples, never bulk responses.

**Images.**
- Photos are stored as the browser shrank them. Previews are re-encoded to WebP before storing.
- Steps pass only Blob pathnames to each other, never image bytes.
- Pages show photos and Previews through signed links valid for 1 hour, created when the page renders.

**Setup reminders for the spec.**
- Turn Fluid compute on.
- Opt out of Vercel AI training (Team Settings → Data Preferences) before storing any photo.
- Create the team Gmail account early.
- Apply the Better Auth gotchas from "Which auth, email and database options fit?": database rate-limit storage, username passed as `name`, account deletion and session revocation on reset turned on.
