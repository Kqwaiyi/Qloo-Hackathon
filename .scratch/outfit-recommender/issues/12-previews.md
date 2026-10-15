# 12: Previews of the user wearing each Outfit

**What to build:** Each Outfit gets a Preview: an AI-edited image of the user wearing the whole Outfit, badged "AI-generated" and shown only through short-lived private links. When the image model refuses or fails, the Outfit still shows, with a clear placeholder and all its Pieces. If every Preview was refused, the user gets a hint to try a different photo.

**Blocked by:** [11 Hairstyle Pieces tailored to the photo](11-hairstyle-pieces.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "AI provider interface" (3. Render one Preview; Fake adapter: Preview, Scenarios), "Photo intake" (Storage), "Stylings" (Stages; Previews; Finishing), "User-facing copy" (Styling and results) and "Data model" (Outfits). Stories 103–106.

- [ ] The AI provider interface gains its Preview operation. In: the photo, the Photo Type and each Piece's `details`, never the Style Icon's name or image. Out: an image, or a refusal with its reason category (a block reason, an image-safety finish reason, or text with no image).
- [ ] A refusal is final. Transient errors are thrown, so the Workflow step retries them. There's no automatic quality check.
- [ ] Previews are their own Workflow stage, rendered 2 at a time, each its own step. Steps pass Blob pathnames to each other, never image bytes.
- [ ] Each Preview is re-encoded to WebP on the server and saved to the private Blob store. The Outfit records its Preview's state (pending, ready, refused or failed), Blob pathname and refusal reason category.
- [ ] When a Styling finishes, any Preview not ready is marked failed.
- [ ] Each Outfit card shows its Preview beside "Outfit N · Inspired by <Style Icon>", through a signed link valid for 1 hour, created when the page renders, with an "AI-generated" badge.
- [ ] A refused Preview shows "No Preview for this Outfit: the image model declined to make one", and a failed one shows "No Preview for this Outfit: the image model couldn't make one". Either way the Outfit's Pieces still show.
- [ ] When every Preview on the page was refused, it also says "The image model declined this photo. A different photo may work better."
- [ ] The fake adapter's Preview is the user's own photo with a "Fake Preview" banner, re-encoded to WebP. New scenarios: a refused Preview, and a Preview that fails without being refused.
- [ ] Tests cover refused and failed Preview placeholders, and a finishing Styling marking unfinished Previews failed.
