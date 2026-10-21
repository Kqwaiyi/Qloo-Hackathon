# 11: Landing sample with real Products

**What to build:** A visitor's walkthrough on the landing page shows the sample Outfit with real Products, their shops and prices, and a Preview drawn from their photos, exactly as the app now makes them. The sample is made once by running the real pipeline and then frozen, so the landing page still calls nothing.

**Blocked by:** 04, 06, 07, 10

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Landing sample" and "Testing Decisions" (Seam 1, the landing page). Stories 59 and 61.

- [ ] A one-off team script runs the real pipeline once on the landing page's sample photos, with live Qloo, Channel3 and Gemini and the United States as the Country, and freezes the result (Products, offers, prices, dates and Previews) into the landing samples.
- [ ] The landing page shows the frozen sample through the same card as the app, with real Product names, "View at" links, dated prices and the photo credit.
- [ ] The frozen sample is never refreshed. A test asserts the landing page makes no Qloo, AI or product-search call.
- [ ] **Team step (costs money):** run the script with the team's go-ahead, check the result by eye, and commit the frozen sample.
