# Guest Page

Status: ready-for-agent

Every decision here comes from the grilling in this conversation. Use the vocabulary in [GLOSSARY.md](../../GLOSSARY.md) (**Guest**, **Guest Page**, **Guest Consultation**, **Consultation**, **Styling**, **Outfit Allowance**, **Bot Check**, **Demo Account**). Respect [ADR-0013](../../docs/adr/0013-guest-consultations-are-kept-briefly-not-never.md): a Guest Consultation is stored under a throwaway user and deleted soon after, not kept nowhere. Also respect [ADR-0004](../../docs/adr/0004-adults-only.md) for the age gate, [ADR-0005](../../docs/adr/0005-photos-edited-never-analysed.md) for photo consent and [ADR-0006](../../docs/adr/0006-bot-check-fails-open-in-our-own-hook.md) for the Bot Check.

## Problem Statement

A visitor who lands on Qurator and wants to see what it does for their own photo has to sign up first. That means a username, an email, a password and a verification email before they see a single Outfit. Many visitors won't give an email and a password to an app they haven't tried, so they leave without ever seeing it work.

The hackathon rules ask for the same thing: judges must be able to use the live demo with no private access. Today the only way in without signing up is the Demo Account, whose login the team hands out privately.

## Solution

The landing page's "Get started" button becomes **Try it as a Guest**. It opens the **Guest Page**: the app as a **Guest** sees it, headed by the Qurator wordmark with a "Guest" tag and a single **Create an account** button on the right. There is no New Consultation link, My Consultations, Settings or Sign out.

On the Guest Page the Guest goes through exactly the same New Consultation steps as a signed-in user. On the Budget Tier step, right before "Get my Outfits", they also give their birth date, Style Preference and Country, since they have no profile to take them from. "Get my Outfits" passes a Bot Check and opens the photo consent sheet, which for a Guest also asks them to agree to the Terms and Privacy Policy. The Styling then runs exactly as it does for anyone else, with its Stylist's Notes and Previews.

A Guest gets one **Guest Consultation**: one Styling's two Outfits. Where a signed-in user sees "Show 2 more Outfits", a Guest sees **Create an account to get more consultations**, and the Budget Tier and Photo Style can't be changed once the Outfits are shown. A Styling that makes no Outfit can be tried again until it does.

Nothing a Guest does is kept. Their Guest Consultation, photo and Previews belong to a throwaway user that can never sign in. They are deleted once they are an hour old, and always within 24 hours. A cookie lets the Guest come back to their results for that hour. To stop a Guest from simply closing the page and opening a new one, each internet address gets one Guest Consultation in any 24 hours, plus 5 photo checks. Only a salted hash of the address is kept, for 24 hours.

## User Stories

### Finding the Guest Page

1. As a visitor on the landing page, I want a **Try it as a Guest** button where "Get started" was, so that I can try the app on my own photo without signing up.
2. As a visitor on a phone, I want **Try it as a Guest** in the landing header too, so that the quickest way in isn't hidden on small screens.
3. As a visitor who wants an account, I want "Sign in" to stay where it is, so that I can sign in, or reach "Create a free account" from there.
4. As a visitor scrolling to the end of the landing page, I want "Create a free account" to stay, so that signing up is still offered to those who want it.
5. As a signed-in user on the landing page, I want "Open the app" as today and no guest button, so that I'm not tempted into a weaker mode by mistake.
6. As a judge, I want to reach a working demo from the public landing page with no login handed to me, so that I can judge the app as the rules require.

### The Guest Page itself

7. As a Guest, I want the page titled "Guest Page · Qurator" and the wordmark tagged "Guest", so that I know I'm using the app without an account.
8. As a Guest, I want only a **Create an account** button in the header, so that I'm never sent to pages that need an account.
9. As a Guest, I want no My Consultations, Settings or Sign out, since I have no history, settings or account, so that nothing on the page promises what guest mode doesn't keep.
10. As a Guest, I want the same New Consultation steps as a signed-in user (Photo Type, photo, photo check, Budget Tier), so that I see the real app, not a cut-down demo.
11. As a Guest, I want to take or upload my photo exactly as a signed-in user does, camera included, so that trying the app is as easy as using it.
12. As a Guest whose photo is rejected, I want the same rejection reasons as a signed-in user, so that I know how to take a better photo.
13. As a Guest, I want to choose my Budget Tier and adjust my Photo Style before "Get my Outfits", as a signed-in user does, so that my one Guest Consultation suits me.

### Giving my details on the spot

14. As a Guest, I want to give my birth date on the Budget Tier step, right before "Get my Outfits", so that I'm asked only once I've seen that my photo works.
15. As a Guest, I want the same birth-date fields as at sign-up, with no default and no hint of the age limit, so that the age gate is the same for everyone.
16. As a Guest under 18, I want to be refused as I would be at sign-up, with nothing about my entry stored, so that the app stays adults-only.
17. As a Guest, I want to choose menswear, womenswear or no preference, so that my Outfits are steered as a signed-in user's are.
18. As a Guest, I want my Country filled in from where I'm connecting from, so that I usually don't have to pick it.
19. As a Guest, I want to change that Country, so that a VPN or travel doesn't give me the wrong Style Icons, Brands or currency.
20. As a Guest, I want "Get my Outfits" to tell me what's missing if I skip a field, so that I'm not refused without knowing why.

### Getting my Outfits

21. As a Guest, I want "Get my Outfits" to open the photo consent sheet every time, as the Demo Account's does, so that I give my release for this photo.
22. As a Guest, I want the consent sheet to also ask me to agree to the Terms and Privacy Policy, so that I agree to them as a signed-up user does.
23. As a Guest, I want the line under "Get my Outfits" to say it uses my one Guest Consultation, so that I know what I'm spending.
24. As a Guest, I want a Bot Check I usually don't see, so that "Get my Outfits" stays one click.
25. As a Guest whose Bot Check fails, I want to be told and able to press "Get my Outfits" again, so that a hiccup doesn't cost me my Guest Consultation.
26. As a Guest during a Cloudflare outage, I want my Outfits anyway, so that an outage outside the app doesn't lock me out.
27. As a Guest, I want the Styling to run exactly as a signed-in user's does, with the Stylist's Notes as it goes, so that I see what Qurator really does.
28. As a Guest, I want two Outfits with their Previews, Products and prices in my Country's currency, so that I get the full result, not a sample.
29. As a Guest connecting from a country Gemini doesn't serve, I want the same message a signed-in user gets, so that I know why I can't start.
30. As a Guest when the app-wide Outfit caps are reached, I want the same message a signed-in user gets, saying when Outfits are available again, so that I know to come back.

### After my Outfits

31. As a Guest, I want "Create an account to get more consultations" where "Show 2 more Outfits" would be, so that I know how to get more.
32. As a Guest, I want to be told my guest results won't carry over to a new account, so that I'm not surprised when they're gone.
33. As a Guest, I want no Budget Tier dropdown or Photo Style editor once my Outfits are shown, since changing either makes more Outfits, so that the page doesn't offer what I can't have.
34. As a Guest whose Styling made no Outfit, I want **Try again** as a signed-in user has, so that a failure doesn't cost me my Guest Consultation.
35. As a Guest whose Styling got stuck, I want the same recovery a signed-in user gets, so that a stuck Styling doesn't cost me my Guest Consultation.
36. As a Guest, I want to open each Product's own page from my Outfits, so that I can go and buy what I like.
37. As a Guest, I want my Previews and Product prices to stay visible while I'm on the page, as a signed-in user's do, so that I can look them over.

### Coming back, and the daily limit

38. As a Guest who refreshes or accidentally closes the tab, I want to come back to my Guest Consultation, running or finished, within the hour, so that one slip doesn't cost me my results.
39. As a Guest coming back after the hour, I want to be told my Guest Consultation has been deleted, so that I know it's gone on purpose.
40. As a Guest whose address has had its Guest Consultation in the last 24 hours, I want to be told when I can have another and offered to create an account, so that I know what my options are.
41. As a Guest in a new browser on the same connection, I want the same answer as in my first browser, so that the limit is clear and consistent.
42. As a Guest whose photos keep being rejected, I want 5 photo checks in any 24 hours, then a message saying when I get more, so that I know why I've been stopped.
43. As a Guest, I want my Guest Consultation counted only once my first Outfit is shown, so that a rejected photo, failed Styling or app-wide cap never uses it up.
44. As a Guest on a shared network, I accept that one Guest Consultation a day is shared by everyone on my connection, so that the public demo stays affordable; creating an account gets me my own Outfit Allowance.

### Creating an account

45. As a Guest, I want **Create an account** in the header to take me to sign-up, so that I can get more consultations whenever I decide to.
46. As a Guest who creates an account, I want a normal new account with no trace of guest mode, so that my account starts clean.

### Privacy

47. As a Guest, I want my Guest Consultation, photo and Previews deleted soon after, and always within 24 hours, so that trying the app leaves nothing behind.
48. As a Guest, I want my internet address never stored, only a salted hash of it for 24 hours, so that the daily limit doesn't keep who I am.
49. As a Guest, I want the Privacy Policy to say what guest mode keeps, why and for how long, so that I can check the promise.
50. As a Guest, I want my birth date never kept, only the age group my Outfits are styled for, kept with the rest of the Guest Consultation until it's deleted, so that I give away as little as possible.

### The team

51. As the team, I want Guest Outfits to count toward the app-wide 24-hour and monthly caps, so that guests can't run up costs beyond what the caps allow.
52. As the team, I want a Guest's Stylist held to the same limits as everyone else's, not the Demo Account's, so that guests cost no more than users.
53. As the team, I want a Guest Consultation deleted with its photo and Previews whenever any Guest starts or opens a Guest Consultation, once it is an hour old, so that guest data goes away without a new cron.
54. As the team, I want the daily sweep to delete any Guest Consultation an hour old or more, so that a quiet day still keeps the 24-hour promise.
55. As the team, I want no Guest Consultation deleted while its Styling is running, so that deletion never breaks a running Workflow.
56. As the team, I want throwaway guest users never sent an email, warned of inactivity, listed or counted as accounts, so that guest mode doesn't disturb anything built around accounts.
57. As the team, I want the guest IP hashes purged after 24 hours, so that the Privacy Policy's promise holds.
58. As the team, I want the Demo Account untouched, so that judges who were given its login still have it.

## Implementation Decisions

### The throwaway guest user (ADR-0013)

- A Guest Consultation is a normal Consultation owned by a **guest user**: a user row marked as a guest, created when the Guest presses "Get my Outfits". It has no password or session and can never sign in. It satisfies the user table's required fields with a placeholder email and username at a reserved, never-mailed domain. It holds the Guest's Style Preference, Country and age, as a signed-in user's profile does, so the Styling, Stylist and outfit assembly read them unchanged.
- Guest users are excluded everywhere accounts are handled: inactivity warnings and deletions, unverified-account deletion, every email, the Gmail-inbox and Disposable Address rules, and any user count. Their deletion reuses the existing account deletion, which already removes every Consultation, photo and Preview.
- The guest user records the salted hash of the IP address it was made from, so the daily limit can find which address a Guest Consultation belongs to.
- A guest user's Stylist runs with everyone's Styling limits, not the Demo Account's.
- Photo consent for a Guest is recorded on the Consultation, through the same per-Consultation notice fields the Demo Account uses, together with the Terms and Privacy agreement. Nothing is recorded on any account.

### Who the Guest is: the guest cookie

- The Guest Page identifies a Guest by a **guest cookie**: signed, HTTP-only, valid for 1 hour, holding the guest user's id. The server's request context resolves either a signed-in session or a guest cookie, so the consultation, styling-status and price-refresh paths authorise a Guest for their own Guest Consultation exactly as they authorise an owner today.
- A guest cookie never grants anything else: no listing, no settings, no deletion, no other Consultation.
- If the guest user is gone (deleted after the hour), the cookie is treated as absent and cleared.

### The daily limit by IP

- A new **guest usage** store records, per salted IP hash, two kinds of use with their times: a Guest Consultation (recorded when its first Outfit is shown, in the same transaction that records Outfit usage today) and a photo check (recorded as photo checks are today). It counts over the same rolling 24-hour window as the Outfit Allowance.
- The IP is hashed with HMAC-SHA-256 under a secret salt from the environment. The raw IP is never stored or logged. Local development without the secret uses a fixed development salt.
- Limits live with the others in the limits config: 1 Guest Consultation and 5 photo checks per IP hash in any 24 hours.
- **One at a time:** a new Guest Consultation is refused while the same IP hash has a guest user whose Guest Consultation is running, or has made Outfits in the window. So two tabs racing on one connection can't both get Outfits before either is counted. A Guest Consultation whose Styling failed doesn't block a new one; it can be tried again or abandoned.
- Guest usage rows are purged once older than 24 hours, by the same opportunistic cleanup and by the daily sweep.
- The refusal carries when another Guest Consultation becomes available (the oldest counted use leaving the window), as the existing limit refusals do, and the Guest Page shows it with the existing limit-message component.

### Starting a Guest Consultation

- A new **start Guest Consultation** operation sits beside the existing start-a-Consultation operation and reuses its photo check, Photo Type and Budget Tier handling, and its creation of the Consultation and first Styling. Its input adds birth date, Style Preference, Country, the photo consent ticks, the Terms agreement and a Bot Check token.
- In order, it refuses on: the region gate; the Bot Check (failing open as ADR-0006 says); the IP's photo-check limit; the IP's daily limit and the one-at-a-time rule; the age gate (storing nothing for an under-18 entry); missing consent or Terms; and the app-wide caps and backstops, as the existing Styling start check does. Only then does it create the guest user, Consultation and Styling, and set the guest cookie.
- The photo check that runs before "Get my Outfits", as the user moves between steps, counts against the IP's photo-check limit in place of a user's.
- Country defaults on the page to the request's IP country when it's on the Country list.

### Restylings a Guest can't have

- The operations behind "Show 2 more Outfits", change Budget Tier and change Photo Style refuse a guest user with a new `guest` refusal, whatever the page shows. **Try again** on a failed Styling, and the existing stuck-Styling recovery, stay allowed.
- Reading a Guest Consultation returns the same view as for a signed-in owner, plus an "is a Guest" flag. The consultation page uses it to hide the Budget Tier dropdown and Photo Style editor after Outfits are shown, and to put "Create an account to get more consultations" (linking to sign-up, with the "won't carry over" line) where "Show 2 more Outfits" sits.

### Deletion

- A **guest cleanup** deletes every guest user whose Guest Consultation is an hour old or more and has no running Styling, and purges guest usage older than 24 hours. It runs at the start of every guest operation (opening the Guest Page, starting a Guest Consultation, reading one), in the background of the request so it never slows the Guest, and in the daily sweep.
- A Styling stuck past the existing stuck threshold counts as not running, so a stuck Guest Consultation is still deleted.

### Pages and routes

- The Guest Page is its own route group with its own layout: the header has the wordmark with a "Guest" tag and **Create an account** (to sign-up). It is not under the signed-in app layout and never redirects to sign-in. Its tab title is "Guest Page · Qurator", through the root layout's title template.
- Opening the Guest Page with a valid guest cookie shows that Guest Consultation (running or finished). Otherwise it shows the New Consultation steps, or the used-up message when the IP's limit or one-at-a-time rule refuses.
- The New Consultation step component and the consultation results components are reused, not copied. They gain a guest variant that adds the birth date, Style Preference and Country fields to the Budget Tier step, adds the Terms tick to the consent sheet, and swaps the allowance line for the Guest Consultation line.
- On the landing page, the header's "Get started" pill becomes **Try it as a Guest**, linking to the Guest Page and shown on every screen width. It is shown only to signed-out visitors. "Sign in" / "Open the app" is unchanged, and so is the closing chapter's "Create a free account".

### Copy and policy

- All new strings live in the existing copy config.
- The Privacy Policy gains a Guest section: what is kept (the Guest Consultation, its photo and Previews, age group, Style Preference, Country, consent, and a salted IP hash), why, and that the Consultation is deleted within 24 hours (usually about an hour) and the hash after 24 hours. The Terms cover use as a Guest.
- The landing page's photo line next to its sign-up button stays true for both; the Guest Page's consent sheet states the guest deletion promise.

## Testing Decisions

- **What a good test looks like here:** it acts as a visitor's browser would (with an IP address and cookies), runs the operation, and asserts what a Guest or the team can observe. That means the refusal and when it lifts, whether a Guest Consultation, guest user, photo or Preview exists, which cookie was set, how many Outfits were shown, and what was sent to Cloudflare. It never asserts how the IP was hashed or which helper ran, only that the raw IP isn't stored anywhere.
- **Seam 1, the server operations through the existing test harness.** It already has the test clock, the test browser with its IP, country and cookies, the fake AI, Qloo, Channel3 and Turnstile, and `stylings.runPending()`. No new fakes are needed; the harness only needs the guest salt configured. Cover:
  - Starting a Guest Consultation: accepted with all fields; each missing field, missing consent or missing Terms refused; an under-18 birth date refused, storing nothing; the Bot Check's pass, reject and fail-open; the region gate; the app-wide caps.
  - The Styling runs to two Outfits and the Guest can read it through the guest cookie; another browser without the cookie can't.
  - The daily limit: counted only once the first Outfit is shown; a second browser on the same IP refused with the right time; a different IP allowed; allowed again 24 hours later on the test clock; two starts from one IP before either Styling finishes refused by one-at-a-time.
  - A failed Styling can be tried again and doesn't use up the IP; a stuck Styling recovers as today.
  - 5 photo checks per IP, then refused with when more come.
  - "Show more", change Budget Tier and change Photo Style refused with the `guest` refusal; the read view carries the guest flag.
  - The guest cookie works within the hour and is cleared after it; a cookie for a deleted guest user is treated as absent.
  - Guest cleanup: a Guest Consultation an hour old is deleted with its photo and Previews (as the existing deletion test checks) when another Guest acts, but not while its Styling runs; the daily sweep deletes leftovers and purges guest usage after 24 hours.
  - Guest users get no inactivity warning or unverified-account deletion, and are never emailed.
  - Guest Outfits count toward the app-wide caps.
  - No guest row stores the raw IP.
- **Seam 2, Playwright e2e:** one happy path. Click **Try it as a Guest** on the landing page; see the Guest Page header with only the wordmark, "Guest" tag and **Create an account**; run one Guest Consultation with the fake AI; see two Outfits and "Create an account to get more consultations" where "Show 2 more Outfits" would be. The same test checks the landing button links to the Guest Page for a signed-out visitor.
- **Prior art:**
  - The consultation, styling, region-gate, bot-check, usage, daily-sweep, account-deletion and Demo Account consultation tests.
  - The new-consultation and app-pages e2e tests.

## Out of Scope

- Carrying a Guest Consultation over into an account created afterwards.
- Stopping VPNs, proxies or shared networks from affecting the daily limit; the Bot Check and app-wide caps are the cost protection.
- An hourly cron or any paid scheduling to delete guest data on the hour.
- Deleting a Guest Consultation by hand from the Guest Page; it is deleted on its own within the day.
- Any change to the Demo Account, the signed-in app, the Outfit Allowance or the Styling Workflow itself.
- More than one Guest Consultation per IP per day, or any other guest tier.

## Further Notes

- Submissions close 2026-10-30 at 11:45pm EDT. Guest mode is what lets judges use the live demo with no private access, so it's worth naming in the submission.
- Every number (1 Guest Consultation, 5 photo checks, 24 hours, 1 hour) lives in config, so it can change without hunting through code.
- The guest salt is a new production environment variable; add it to `.env.example` and to Vercel before going live. On Production a missing salt is a configuration error that keeps the Guest Page closed, never a silent fall-back to the development salt.
