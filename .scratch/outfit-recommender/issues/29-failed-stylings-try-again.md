# 29: Failed Stylings and Try again

**What to build:** When a new Consultation's first Styling can't build any Outfit, the Consultation is kept with a message suggesting another Budget Tier or Photo Style, so the user can try again from the same photo. When a Styling breaks, the user sees "Something went wrong while styling." with Try again, which picks up where it broke without re-checking the photo, so a passing outage doesn't force a retake.

**Blocked by:** [13 Styling progress checklist](13-styling-checklist.md), [22 Outfit Allowance, photo-check limit and the usage summary](22-outfit-allowance-usage-summary.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Stylings" (the Try again row; Finishing), "Server operations" (try again) and "User-facing copy" (Styling and results). Stories 116 and 117.

- [ ] A first Styling that failed with "nothing could be built" keeps the Consultation ("No Outfits") and shows "We couldn't build Outfits for this photo at <tier>. Try another Budget Tier or Photo Style." A Face Photo, which has no tier, gets a version that suggests only the Photo Style.
- [ ] A Styling that failed with "something broke" shows "Something went wrong while styling." with a Try again button.
- [ ] Try again starts a Styling of kind "try again" through the shared start check. It resumes from the stage that broke, or from Style Icons if there are none yet, makes Outfits as the kind that failed would have, and never re-runs the photo check.
- [ ] Try again is disabled with the time when the usage summary says no Styling can start.
- [ ] The Styling step returns with the finished stages already ticked.
- [ ] Tests cover a failed new Consultation, and Try again resuming without a photo check.
