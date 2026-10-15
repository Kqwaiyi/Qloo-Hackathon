# Outfit Recommender

Label: wayfinder:map

## Destination

A build-ready spec for the Outfit Recommender webapp (`.scratch/outfit-recommender/spec.md` plus numbered implementation issues in `.scratch/outfit-recommender/issues/`) that an agent or the team can build one issue at a time and deploy to Vercel as a public demo. The map is done when nothing is left to decide before writing that spec.

## Notes

- **Domain:** consumer fashion webapp for the Qloo LLM Hackathon. Use the vocabulary in [GLOSSARY.md](../../GLOSSARY.md) (Consultation, Outfit, Piece, Category, Brand, Style Icon, Preview, Budget Tier, Photo Type, Style Preference) and respect [ADR-0001](../../docs/adr/0001-qloo-selects-ai-concretizes.md): Qloo decides what is recommended; the AI model only makes it concrete, behind a swappable provider seam (Gemini is just the first provider).
- **Skills:** grilling tickets call `grilling` + `domain-modeling`; prototype tickets call `prototype`; research tickets call `research` and land findings on a `research/<name>` branch at `.scratch/outfit-recommender-map/research/<name>.md`.
- **Secrets:** never write API keys into tracked files, tickets or research notes. Locally they live in a gitignored `.env.local` as `QLOO_API_KEY`, `QLOO_API_URL` (https://hackathon.api.qloo.com), `GEMINI_API_KEY`, and the team Gmail account's `GMAIL_USER` and `GMAIL_APP_PASSWORD`.
- **Spend:** no Gemini API calls during research or prototyping without the user's go-ahead (real money). Read-only Qloo calls are fine.
- **Qloo constraints** (charting scan, 2026-10-14): `X-Api-Key` header, GET only, 5 req/s and 10,000 req/month, `take` ≤ 50, invalid params silently ignored. Fashion exists only as `urn:entity:brand` (no products, no hairstyles); brands carry `product_category`, `target_age_group`, `target_gender` and `target_income_level` tags plus `price_range_usd_min/max`. `/v2/trending` returned nothing on the hackathon host. Brands and people can be localised with `signal.location.query`, and Brands carry `key_market` tags (corrected in "How does Qloo build and rank Outfits?"). Don't commit bulk Qloo response data; private caching is allowed.

### Settled while charting

- Destination is a spec plus implementation issues. No deadline. Deploy on Vercel with a public demo link. Use a cheaper Google image model.
- Stack: Next.js + React + TypeScript on Vercel.
- Production-grade: photos and Consultations are stored, kept until the user deletes a Consultation or their account. One-time consent screen before the first upload.
- Sign-up asks for username, email, password, age and Style Preference (menswear / womenswear / no preference, editable later). Email is verified by link before the first Consultation; sign in with username or email; password reset by email. Minimum age 13, blocked at sign-up (reopened: Gemini's terms require 18+; decided in "What consent, retention and minimum age do we commit to?"). Sign-up also asks for Country (added in "How does Qloo build and rank Outfits?").
- Photo Types → Categories: Face Photo → Hairstyle; Full-Body Photo → all four; Body-Only Photo → Top, Bottom, Shoes. The user picks the Photo Type; an AI check rejects mismatches, no person, or more than one person (refined in "What do we ask the AI model at each step?": covered hair drops the Hairstyle, and a Body-Only Photo may show a face). Photos come from the in-browser camera (with a Photo Type outline) or a file upload.
- The app recommends complete Outfits, each inspired by one Style Icon: the Hairstyle is their signature cut, and the Brands come from Qloo's taste links to that person. The fallback of Outfits themed on a shared Qloo style tag was dropped in "How does Qloo build and rank Outfits?". Face Photo Outfits are Hairstyle-only.
- Qloo ranks. The AI tailors each Piece to the photo (colour, fit, cut) and adds a one-line "why it suits you". Each Outfit gets one Preview. The AI may make Top and Bottom one One-Piece (decided in "What do we ask the AI model at each step?").
- Previews for the top 2 Outfits are generated right away; "see more" generates 2 more.
- Budget Tier is chosen on the upload screen (default No Budget) and changeable on the results page, which fetches different Outfits. Low, Medium and Expensive keep every Piece in that tier; No Budget may mix tiers within an Outfit. Face Photo Consultations have no Budget Tier.
- An Outfit card shows one Preview plus its Pieces: Category, item, Brand or Style Icon, price range, and a "Visit <Brand>" link to the official site.

## Decisions so far

<!-- one line per closed ticket: - [<ticket title>](issues/NN-slug.md): <one-line gist> -->

- [What limits does Vercel put on the Consultation pipeline?](issues/04-vercel-limits.md): fits on Hobby (300 s per function); recommended Vercel Workflow + private Vercel Blob with browser uploads; Hobby blocks collaborator/co-authored deploys from private repos.
- [Which auth, email and database options fit?](issues/05-auth-email-database.md): Better Auth (username plugin) + Drizzle + Neon + Resend; emailing arbitrary users requires a domain the team owns.
- [Which Google models fit Previews and photo checks?](issues/03-google-ai-models.md): Nano Banana 2 Lite for Previews (~$0.034/image, quality still to be checked) and Gemini 3.5 Flash-Lite for the photo check and tailoring; ~$0.08 per Consultation; paid tier only; Vercel AI SDK keeps the provider swappable.
- [What privacy and age rules apply to stored face photos?](issues/06-privacy-age-rules.md): Gemini's terms require an 18+ app; outfit editing isn't biometric processing under GDPR, but Illinois/Washington need BIPA-style notice and release; full must-disclose list and one-month deletion.
- [Can Style Icons drive whole Outfits in Qloo?](issues/01-qloo-style-icons.md): viable with caveats: cached person call per demographic + one Brand call per Outfit; the app must re-sort by affinity and diversify Style Icons; `fashion_segment` is a solid fallback.
- [How do Qloo filters turn Brands into Pieces?](issues/02-qloo-brand-filters.md): footwear vs apparel tags (no Top/Bottom split, so the AI picks garments); Budget Tiers map cleanly onto `target_income_level` tags; age via `target_age_group` filter, gender via signal; popularity floor instead of trends; ~2.2 calls per Consultation.
- [Prototype the Consultation flow](issues/07-consultation-flow-prototype.md): guided-steps wizard (Photo Type → photo & Budget Tier → progress checklist → Outfit list); results appear all at once at the end; a Budget Tier change replaces the Outfits; the Hairstyle shows no price or link; history is its own page.
- [How does Qloo build and rank Outfits?](issues/08-outfit-assembly.md): an editable, AI-read Photo Style and the user's new Country field steer one person call per Consultation ([ADR-0002](../../docs/adr/0002-photo-style-steers-style-icons.md)). Then one Brand call per Style Icon, de-duplicated by Category. "See more" fetches lazily, and there's no themed fallback.
- [What's the architecture?](issues/09-architecture.md): one Vercel Workflow entered at a different stage per kind of run, with progress polled from Postgres. The photo is checked before it's stored. Better Auth, Neon with Drizzle, and private Blob; email through a throwaway Gmail account with no domain. Our own AI interface with a fake adapter for development, and the Qloo cache in Neon.
- [What do we ask the AI model at each step?](issues/10-ai-contract.md): the photo check only reports what it sees and our code applies the Photo Type rules (six rejection reasons, no age guessing); 11 Photo Style words; tailoring works from the photo and the Style Icon's name and may make a One-Piece ([ADR-0003](../../docs/adr/0003-ai-may-merge-top-and-bottom.md)); a Preview changes only the Pieces and a refusal is final.

## Not yet specified

- **Data model**: what's stored for users (including Country), Consultations (including Photo Style and their Styling/ready status), Outfits, Pieces (including One-Pieces and the unknown-cut flag) and Previews (including refusals), and the Qloo response cache. The architecture and AI contract are settled; this now waits on the consent and retention, and failure-state tickets, and may fold into spec assembly.
- **Hackathon submission**: demo link, demo account or seed data, Devpost requirements and judging criteria (the Devpost page blocked the charting scan). Also which Vercel plan and repo setup deploys the team's co-authored commits (see the Vercel limits ticket). The user wants to revisit this later.
- **Spec assembly**: writing spec.md and slicing it into vertical implementation issues once the frontier clears.

## Out of scope

- **Swapping a single Piece inside an Outfit**: a natural follow-up feature, not part of this effort.
- **Finer-grained "popular near you"** (city or GPS): Country-level localisation is in scope (decided in "How does Qloo build and rank Outfits?"), but the app only collects a Country.
- **Product-level shopping, affiliate links or in-app purchase**: Qloo has no products; Pieces only link to the Brand's official site.
