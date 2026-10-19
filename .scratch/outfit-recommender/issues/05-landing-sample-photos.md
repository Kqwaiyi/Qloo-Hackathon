# 05: Pick the landing page sample photos

**What to build:** The realistic AI-generated people the landing page walks through, chosen and checked by the team and stored privately, ready for the frozen sample Consultations in ticket 39.

**Blocked by:** [02 Provision Vercel, Neon and Blob](02-provision-vercel-neon-blob.md)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) sections "Setup and operations" (Landing page images) and "Landing page" (Content source, Captions).

- [ ] Pick clearly adult AI-generated images: one Full-Body person, plus a Face Photo and a Body-Only Photo that between them cover both Style Preferences.
- [ ] Run a reverse-image search on each, and drop any image that turns out to show a real person.
- [ ] ~~Upload them to the private Blob store. They are never committed to the repo.~~ Dropped on 2026-10-19: the export now writes each sample's images into `public/landing/samples/`, and they ship with the page.
- [ ] Credit Pixabay in the README, for any Pixabay image used.

## Progress (2026-10-19)

- **Full-Body Photo:** the team supplied its own AI-generated photo (it carries Gemini's ✦ mark), not a Pixabay one, so Pixabay's ban on distributing its images "on a Standalone basis", the reason they stayed out of the repo, doesn't apply to it. It ran on the Demo Account as Consultation `23291c2e-f957-4bcf-8490-04fdbef96666`, and the landing page shows its Outfit 2.
