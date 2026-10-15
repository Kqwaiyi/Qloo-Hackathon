# 22: Outfit Allowance, photo-check limit and the usage summary

**What to build:** Each user can have up to 10 Outfits made and 20 photos checked in any rolling 24 hours. "Get my Outfits" says how many Outfits it will use and how many are left today. A user who has used them all is told on the Photo Type step, before taking a photo, when more become available, and a Styling makes only as many Outfits as the user has left. One usage summary tells the UI whether a Styling can start and why not, so the later limits and results actions plug into it.

**Blocked by:** [07 Photo check rejections and the one-tap Photo Type switch](07-photo-check-rejections.md), [10 First Styling: Outfits inspired by ranked Style Icons](10-first-styling-style-icons.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Outfit Allowance, limits and backstops" (Outfit Allowance, Photo checks, Where limits show), "Stylings" (How many Outfits; Finishing), "Server operations" (Start a Consultation, checks 5 and 6; Read: the usage summary), "Data model" (Usage records; Deletion) and "User-facing copy" (Limits). Stories 76, 111, 123–126 and 144.

- [ ] Usage records hold a kind (Outfit or photo check), the user (nullable) and the time, kept apart from Consultations, with no photo and no Outfit content. Deleting a Consultation keeps its usage records.
- [ ] One usage record is written per Outfit switched in when a Styling finishes, with or without a Preview. Skipped Outfits and failed Stylings write none, and nothing is given back.
- [ ] Each photo check writes one, accepted or rejected. A check that errors, and the server's file refusal, write none.
- [ ] The Outfit Allowance is 10 Outfits in any rolling 24 hours, and the photo-check limit is 20. Both live in config.
- [ ] A Styling makes up to 2 Outfits, limited by the Outfit Allowance left.
- [ ] Start a Consultation, in the spec's check order, refuses when the allowance leaves no Outfit, and refuses at the photo-check limit with "You've checked 20 photos today. More from <time>."
- [ ] The usage summary reports the Outfits left, when more become available (the oldest counted Outfit's time plus 24 hours, shown in the user's local time), and whether a Styling can start, with the reason when it can't.
- [ ] "Get my Outfits" shows "Uses <n> of your <left> Outfits left today".
- [ ] With the allowance used up, the Photo Type step shows "You've made today's 10 Outfits. More from <time>." before any photo is taken. Results actions that start Stylings use the summary to disable themselves with the same time, while reading and deleting always work.
- [ ] Tests cover the allowance across a rolling window, including partial Stylings (one that makes 1 Outfit counts 1), a first Styling with one Outfit left making one, the photo-check limit, and an errored check not counting.
