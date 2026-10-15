# 23: App-wide caps and the Qloo backstop

**What to build:** Whatever individual users do, the public demo can't run up costs. The app stops making Outfits after 100 in any 24 hours or 750 in a calendar month, and while Qloo's remaining calls are below 1,000. Users are told plainly that it isn't their fault, and when to come back.

**Blocked by:** [22 Outfit Allowance, photo-check limit and the usage summary](22-outfit-allowance-usage-summary.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Outfit Allowance, limits and backstops" (App-wide caps, Qloo backstop, Where limits show), "Qloo client and cache" (Quota tracking), "Data model" (Qloo limit state) and "User-facing copy" (Limits). Stories 128 and 143.

- [ ] Every live Qloo response's `X-Month-RateLimit-Remaining` header, and its reset date if a header gives one, are saved to a one-row limit-state table with when they were observed. If the header is missing, nothing is recorded and Stylings go ahead.
- [ ] No new Styling starts while Qloo's last reported remaining calls are below 1,000.
- [ ] No Styling starts once 100 Outfits have been made in any rolling 24 hours, or 750 in the UTC calendar month, counted from the usage records. A Styling's Outfits are also limited by what the caps leave. A small overshoot from simultaneous Stylings by different users is accepted.
- [ ] The 24-hour cap shows "Outfit Recommender has made all the Outfits it can for now. Please try again in a few hours." The monthly cap and the Qloo backstop show "Outfit Recommender has made all the Outfits it can for this month. Back on <date>.", where the backstop's date is Qloo's reset date if known.
- [ ] These show on the Photo Type step before any photo is taken, and disable the results actions that start Stylings, through the usage summary. There's no app-wide banner, and sign-up, the landing page, reading and deleting stay open.
- [ ] Every number lives in config.
- [ ] Tests cover both caps, and the Qloo backstop with and without the header.
