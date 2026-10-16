# 12: Previews of the user wearing each Outfit

**What to build:** Each Outfit gets a Preview: an AI-edited image of the user wearing the whole Outfit, badged "AI-generated" and shown only through short-lived private links. When the image model refuses or fails, the Outfit still shows, with a clear placeholder and all its Pieces. If every Preview was refused, the user gets a hint to try a different photo.

**Blocked by:** [11 Hairstyle Pieces tailored to the photo](11-hairstyle-pieces.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "AI provider interface" (3. Render one Preview; Fake adapter: Preview, Scenarios), "Photo intake" (Storage), "Stylings" (Stages; Previews; Finishing), "User-facing copy" (Styling and results) and "Data model" (Outfits). Stories 103–106.

- [x] The AI provider interface gains its Preview operation. In: the photo, the Photo Type and each Piece's `details`, never the Style Icon's name or image. Out: an image, or a refusal with its reason category (a block reason, an image-safety finish reason, or text with no image).
- [x] A refusal is final. Transient errors are thrown, so the Workflow step retries them. There's no automatic quality check.
- [x] Previews are their own Workflow stage, rendered 2 at a time, each its own step. Steps pass Blob pathnames to each other, never image bytes.
- [x] Each Preview is re-encoded to WebP on the server and saved to the private Blob store. The Outfit records its Preview's state (pending, ready, refused or failed), Blob pathname and refusal reason category.
- [x] When a Styling finishes, any Preview not ready is marked failed.
- [x] Each Outfit card shows its Preview beside "Outfit N · Inspired by <Style Icon>", through a signed link valid for 1 hour, created when the page renders, with an "AI-generated" badge.
- [x] A refused Preview shows "No Preview for this Outfit: the image model declined to make one", and a failed one shows "No Preview for this Outfit: the image model couldn't make one". Either way the Outfit's Pieces still show.
- [x] When every Preview on the page was refused, it also says "The image model declined this photo. A different photo may work better."
- [x] The fake adapter's Preview is the user's own photo with a "Fake Preview" banner, re-encoded to WebP. New scenarios: a refused Preview, and a Preview that fails without being refused.
- [x] Tests cover refused and failed Preview placeholders, and a finishing Styling marking unfinished Previews failed.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The interface.** `AiProvider.renderPreview(input)` (`src/server/ai/provider.ts`) takes the photo, the Photo Type and each Piece's Category and `details`, sorted in Category order. It returns `{ refused: false, image }`, with the image in whatever format the model sent, or `{ refused: true, reason }`.
  - The reason categories are `blocked` (a block reason), `image_safety` (an image-safety finish reason) and `no_image` (text with no image), in `PREVIEW_REFUSAL_REASONS` (`src/config/stylings.ts`).
  - **For ticket 35:** the Gemini adapter maps each refusal to one of those three and throws everything else, so the Workflow step retries it. The step does all the retrying, so the adapter sets the AI SDK's `maxRetries: 0`.
- **The steps.** Previews are their own stage, `previews`, after Building Outfits.
  - `planPreviews(stylingId)` returns the IDs of the Styling's Outfits whose Previews are pending and that have at least one Piece, in position order. It moves the stage to `previews` when there are any. An Outfit with no Pieces would have the image model change nothing, so it never gets an AI call and finishing marks its Preview failed.
  - **For ticket 14:** until then, Body-Only Outfits and covered-hair Full-Body Outfits have no Pieces, so their Previews fail. The test "isn't asked for when the Outfit has no Pieces to put on" uses a Body-Only Photo, so it needs a different Outfit with no Pieces, or removing, once Brand Pieces land.
  - `renderPreview(stylingId, outfitId)` is one AI call. It reads the photo by its Blob pathname, re-encodes the image to WebP with sharp, and stores it at `consultations/<consultationId>/previews/<outfitId>.webp`, beside the photo. It saves the Outfit's Preview as ready with that pathname, or as refused with its reason.
  - The Workflow renders `PREVIEWS_AT_ONCE` (2) at a time. A `renderPreview` step that still throws after the Workflow's default 3 retries is caught in `buildOutfits`, so the Styling still completes. The Preview stays pending until finishing marks it failed.
  - A retried `renderPreview` whose Preview isn't pending does nothing. A retry deletes anything an interrupted try stored at the pathname before storing again. If the save finds the Styling no longer running, the step deletes the WebP it stored. Any other save failure leaves the WebP alone, since the save may have committed anyway, and the retry either finds it ready or stores it afresh.
- **Finishing.** `finishStyling` marks the Styling's pending Previews failed, whatever the outcome. A Styling that breaks while Building Outfits never reaches the Previews stage, so the Outfits it made switch in with failed Previews. The spec's "Any Preview not ready is marked failed" is read as pending: a refused Preview stays refused, so its card says the image model declined, and the all-refused hint can show. Ticket 30's stuck Stylings go through the same `finishStyling`.
- **Data.** The `outfit` table gains `preview_state` (pending, ready, refused or failed), `preview_pathname` and `preview_refusal_reason`. CHECKs set the pathname exactly when the Preview is ready, and the reason exactly when it was refused. Migration 0005 backfills existing Outfits as failed.
  - **For ticket 17:** delete a Consultation's Blob objects by its `consultations/<id>/` prefix, not just its `photo_pathname` and each `preview_pathname`. A try cut short between storing a Preview and saving it, followed by the Styling stopping, leaves a WebP no row records.
- **The read.** Pieces sort by the new `byCategoryOrder` (`src/config/consultations.ts`), in the read and in the Preview request. `OutfitView.preview` is `{ state: "ready", url }`, a signed link valid for 1 hour (`SIGNED_LINK_LIFETIME_SECONDS`, renamed from `PHOTO_LINK_LIFETIME_SECONDS`), or `{ state: "refused" | "failed" }`. A current Outfit is never pending, since finishing marks it failed first. `ConsultationView.everyPreviewRefused` drives the "different photo" hint.
- **The card.** It follows the Guided steps prototype: the Preview at 3:4 beside the title on wide screens and above it on phones, with an "AI-generated" badge in its corner. A refused or failed Preview shows its placeholder copy in the image's place, and the Pieces show either way. The hint sits above the Outfits.
- **The fake adapter.** A Preview is the user's photo with a "Fake Preview" banner across its foot, sent as PNG like an image model's, which the step re-encodes to WebP. `preview-refused` refuses every Preview for image safety. `preview-fails` throws on every Preview. Tests can set `previewScenarios`, a queue used in the order Previews are asked for, and read `previewRequests`, which holds only each photo's SHA-256.
  - The `fake_ai_scenario` cookie reaches only the photo check, because Stylings run in the Workflow. To see a Preview scenario locally, set `FAKE_AI_SCENARIO`. `.env.example` now says so.
- **Checked in the browser.** Three throwaway Playwright runs against local development went through the Workflow Local World, one each for `pass`, `preview-refused` and `preview-fails`, at desktop and phone widths. They used a scratch database, so they shared one live Qloo call on 2026-10-17. In `preview-fails`, the step was retried before the placeholder showed.
