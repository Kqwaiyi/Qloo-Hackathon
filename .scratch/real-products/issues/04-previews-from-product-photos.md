# 04: Previews drawn from Product photos

**What to build:** The Preview shows the user wearing the exact Products on their card, drawn from their sellers' own photos rather than from text. A Product whose photo can't be fetched is drawn from its title, and the Product itself stays real. No Product photo is ever stored. Respect the safeguards in [ADR-0008](../../../docs/adr/0008-pieces-are-real-products.md).

**Blocked by:** 03

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Preview contract and Product photos" and "Testing Decisions" (Seam 1's photo fetch, the Gemini adapter). Stories 14–18 and 67.

- [ ] The Preview step fetches each Product Piece's chosen photo by its saved URL, inside the step, so no image bytes pass between steps. The bytes go to the model inline and are never written to Blob, the database or logs.
- [ ] A fetch counts only if it answers within a short timeout with a JPEG, PNG or WebP image, checked by its first bytes and not just its content type, under a size limit (timeout and limit in config). After the step's retries, a Piece whose photo still fails is drawn from its title.
- [ ] The Preview input carries the user's photo, the Photo Type, and for each Piece its Category and either its Product's title and photo or, for the Hairstyle, its details as today.
- [ ] One Gemini request carries the user's photo first, then the Product photos. The instruction names each image by its position and Category, repeats each Product's title, tells the model to take only the garment from each Product photo and ignore any person, mannequin or other clothing in it, and keeps today's "keep everything else exactly as it is" list and the Face Photo and Body-Only rules.
- [ ] Refusals and failures behave as today. The "AI-generated" badge is unchanged.
- [ ] The test harness gains a fake Product-photo fetch that can answer with an image, with something that isn't an image, or fail.
- [ ] Tests at Seam 1: the Preview getting the user's photo plus each Product's photo; a Piece whose photo fails, times out or isn't an image drawn from its title; no Product photo bytes in Blob or the database.
- [ ] Gemini adapter tests: the Preview request carries several images in order, the user's photo first, and the instruction labels each one.
- [ ] **Team step (optional, costs money):** a manual Gemini Preview smoke run with real Product photos, with the team's go-ahead.
