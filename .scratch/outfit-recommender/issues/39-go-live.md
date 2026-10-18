# 39: Go live: Demo Account, landing samples and first real Consultations

**What to build:** The last steps before the public demo link goes to the judges: the Demo Account exists in production, the landing page shows real frozen Consultations, real Previews from phone photos have been checked, and the judges have the login.

**Blocked by:** [02 Provision Vercel, Neon and Blob](02-provision-vercel-neon-blob.md), [03 Set up the team Gmail account](03-team-gmail-account.md), [04 Set up the Gemini API project and spend caps](04-gemini-project-spend-caps.md), [05 Pick the landing page sample photos](05-landing-sample-photos.md), [33 Landing page walkthrough](33-landing-page.md), [35 Gemini adapter: Previews](35-gemini-previews.md), [37 Daily sweep](37-daily-sweep.md), [38 Demo Account: unlimited Consultations with per-Consultation consent](38-demo-account-consultations.md)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) sections "Setup and operations" (Vercel, Demo Account, Landing page images, First real Consultations) and "Further Notes" (Hobby Blob limits; Untested).

- [ ] Switch the Gemini adapter on in production.
- [ ] Set `CRON_SECRET` on Vercel for Production, since the daily sweep refuses every call without it (ticket 37). Then confirm the cron is active in production, and that the firewall's Bot Protection challenge doesn't block it (ticket 02).
- [ ] Run the Demo Account creation script once against the production database.
- [ ] Run the three frozen Consultations on the Demo Account with the photos from ticket 05, and save their text as the landing page's static data using ticket 33's capture procedure.
- [ ] Fill in the team members' names on `/privacy`.
- [ ] Check the first real Consultations on the Demo Account with phone photos, since the Preview bake-off used only small web images.
- [ ] Keep an eye on Blob usage: Hobby's 1 GB and 2,000 writes a month bind before the 750-Outfit monthly cap does.
- [ ] Delete the team's own test Consultations, then send the Demo Account's login to the judges privately.
