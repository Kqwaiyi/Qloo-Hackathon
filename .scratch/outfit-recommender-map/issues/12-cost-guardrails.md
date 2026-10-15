# What limits keep AI and Qloo spend bounded?

Type: grilling
Status: resolved
Blocked by: 03, 08
Map: [Outfit Recommender](../map.md)

## Question

Every Consultation and every "see more" costs real money in Previews, and Qloo allows 10,000 requests a month. What limits do we set?

- Consultations per user per day.
- "See more" presses per Consultation.
- Re-running when the Budget Tier changes.
- Re-running when the user changes the Photo Style: each change re-picks the Style Icons and makes new Previews.
- Qloo use: about 4–5 calls per uncached Consultation (1–2 person calls and 3 Brand calls, see "How does Qloo build and rank Outfits?"), plus about 2 per "see more" and per Budget Tier change, all cached for 30 days.
- Reusing results for identical requests.
- Whether a user can have two Consultations styling at once. "What's the architecture?" already allows only one run at a time per Consultation.
- Whether there's a "regenerate Preview" button, and how often it can be pressed. "What do we ask the AI model at each step?" adds no automatic quality check and makes a refused Preview final.
- What users see when they hit a limit.

## Answer

Resolved with the user on 2026-10-15. It's backed by a documentation check of Google's spend caps and one read-only Qloo call (findings: branch `research/spend-caps`, file `.scratch/outfit-recommender-map/research/spend-caps.md`). Users now have an **Outfit Allowance**, and there's one unlimited **Demo Account**. Both are in [GLOSSARY.md](../../../GLOSSARY.md).

**Costs this works from** (estimates from "Which Google models fit Previews and photo checks?"):
- a new Consultation: about $0.08;
- each later run: about $0.07;
- one Outfit, including its share of the photo check and tailoring: about $0.04;
- a photo check: a fraction of a cent.

**1. Per user.** Every limit is a value in config.
- **Outfit Allowance:** 10 Outfits in any rolling 24 hours.
  - Every run uses it: a new Consultation, "Show 2 more Outfits", a Budget Tier change and a Photo Style change. "See more" and re-runs have no separate caps.
  - A run makes up to 2 Outfits, as many as the allowance has left. With 1 left it makes 1, and the Styling checklist shows "Generating Previews (1 of 1)".
  - Outfits replaced by a re-run, or deleted with their Consultation, still count.
- **Photo checks:** 20 in any rolling 24 hours, accepted or rejected. It guards against scripts and isn't a cost control.
- **One run at a time per user.** The server refuses to start a run while any of the user's Consultations is Styling, which keeps the allowance check free of races. The one-run-per-Consultation lock from "What's the architecture?" stays.
- **No "regenerate Preview" button.** A refused Preview is final. For a Preview the user doesn't like, "Show 2 more Outfits" is the way forward.
- **No reuse beyond the Qloo cache.**
  - Replaced Outfits stay thrown away, as in "Prototype the Consultation flow". Switching back to an earlier Budget Tier or Photo Style makes new Outfits and uses allowance.
  - A photo submitted twice makes a new Consultation. Photos aren't fingerprinted.

**2. App-wide.**
- **Outfit cap in our own code:** 750 Outfits per UTC calendar month, and at most 100 in any rolling 24 hours. That's about $30 a month. Per-user limits alone don't bound spend, because accounts are free.
- **Qloo backstop:**
  - Every Qloo response carries an `X-Month-RateLimit-Remaining` header. Once it drops below 1,000, no new runs start app-wide.
  - The header is undocumented. If it's missing, runs go ahead and the Outfit caps bound Qloo use.
  - Qloo's month is a 30-day window tied to the key, not the calendar month. The current window resets on 2026-11-13; on 2026-10-15, 296 of the 10,000 calls were used.
- **Google backstop:** a Cloud Billing spend cap budget on the Gemini API at **$50**, plus alert budgets.
  - It pauses the API for the project until the 1st of the month.
  - It lags about 10 minutes and any overage is billed, so it covers a bug in our counter. It isn't the main limit.
  - Tier 1's own limits sit above it: $250 a month per billing account, and $10 per 10 minutes.
  - The Pub/Sub recipe that disables billing isn't used. It's slow, and it drops the project to the free tier, where Google trains on inputs.

**3. Usage records.**
- One row per Outfit made and per photo check, holding the user and the time. They're kept apart from Consultations, so deleting a Consultation gives nothing back.
- Deleting the account strips the user from its rows. The app-wide count stays right without keeping who it was.
- Rows older than about 35 days are purged.
- The rows hold no photo and no Outfit content, so the deletion promise in "What consent, retention and minimum age do we commit to?" still holds.

**4. What users see.**
- **Always:** a small line beside each action that uses the allowance ("Get my Outfits", "Show 2 more Outfits", the Budget Tier dropdown and the Photo Style editor), for example "Uses 2 of your 8 Outfits left today".
- **Allowance used up:** the user is stopped up front.
  - Opening New Consultation shows "You've made today's 10 Outfits. More from 14:32." on the Photo Type step, before any photo is taken.
  - On the results, the three actions that use Outfits are disabled with the same time.
  - Reading and deleting Consultations still work.
  - The server checks again before every run.
- **Photo-check limit:** shown only at "Get my Outfits".
- **App-wide cap or Qloo backstop:** shown in the same places, with wording that doesn't blame the user.
  - Daily cap: "Outfit Recommender has made all the Outfits it can for now. Please try again in a few hours."
  - Monthly cap or Qloo: "…for this month. Back on <date>." For Qloo, the date comes from its reset header.
  - There's no app-wide banner. Sign-up and the landing page stay open.

**5. Demo Account.** One shared account, sent privately to the judges and also used by the team for testing. Our config names it.
- **No usage limits:** no Outfit Allowance, no photo-check limit, no one-run-per-user rule (two judges can style at once), no app-wide cap and no Qloo backstop. Its Outfits don't count towards the public cap.
- **What bounds it:** about $20 of the Google spend cap (about 500 Outfits) is above the public $30, and only the Demo Account can reach it. The last 1,000 Qloo calls are effectively its reserve. A leaked login can cost at most that.
- **Consent before every Consultation.** Each judge is a different person, so the two-box consent sheet appears before every Consultation, and the acceptance is stored on that Consultation.
- **Shared history, said plainly.** The consent sheet and My Consultations carry this note: "Shared demo account: anyone with this login can see Consultations made here. Delete yours when you're done." The team deletes its test Consultations before submitting.
- **Locked account settings.**
  - Password, email, username, account deletion and "Withdraw photo consent" are disabled and marked "Managed by the team".
  - Deleting a single Consultation still works, and Style Preference and Country stay editable.
  - Its email is a plus-address of the team Gmail, so password resets reach the team.
- **Still applies:**
  - the one-run lock per Consultation;
  - the photo check's six rejection reasons;
  - the supported-countries IP check (Google's terms);
  - 18+ (the account's age is the team's);
  - Google's and Qloo's own hard limits.
- **Considered:**
  - A config list that exempts team accounts from per-user limits only.
  - A private sign-up code that gives each judge their own unlimited account. Rejected because of the sign-up friction.

**Setup reminders for the spec.**
- Create the Cloud Billing spend cap budget on the Gemini API at $50, and the alert budgets.
- If the billing account is on Prepay, keep its auto-reload able to cover $50, or the balance runs out before the cap.
- Read the Tier 1 rate limits for the three models at `aistudio.google.com/rate-limit`. They aren't public. Workflow steps already back off on "too many requests".
- Create the Demo Account and name it in config.

**Passed on.**
- **"What does the user see when a Consultation step fails?":** whether a failed run still uses allowance. The usage records make a refund possible. The limit messages are settled here.
- **"How do the account flows behave?":**
  - the Demo Account's locked settings and its plus-address email;
  - mass sign-ups could use up Gmail's 500 sends a day, so sign-up needs its own limit.
- **The data model:** the usage records, and the Demo Account's consent acceptance on each Consultation.
- **The hackathon submission:** the Demo Account is decided, and its login goes to the judges privately.
