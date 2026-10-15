# 05: Pick the landing page sample photos

**What to build:** The realistic AI-generated people the landing page walks through, chosen and checked by the team and stored privately, ready for the frozen sample Consultations in ticket 39.

**Blocked by:** [02 Provision Vercel, Neon and Blob](02-provision-vercel-neon-blob.md)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) sections "Setup and operations" (Landing page images) and "Landing page" (Content source, Captions).

- [ ] Pick clearly adult Pixabay images tagged "AI generated": one Full-Body person, plus a Face Photo and a Body-Only Photo that between them cover both Style Preferences.
- [ ] Run a reverse-image search on each, and drop any image that turns out to show a real person.
- [ ] Upload them to the private Blob store. They are never committed to the repo.
- [ ] Credit Pixabay in the README.
