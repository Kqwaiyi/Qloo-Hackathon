# Bot Protection

Status: ready-for-agent
Research: [research.md](research.md)

Every decision here comes from the grilling recorded in this conversation's summary and the research note. Use the vocabulary in [GLOSSARY.md](../../GLOSSARY.md) (**Bot Check**, **Disposable Address**, **Demo Account**, **Outfit Allowance**) and respect [ADR-0006](../../docs/adr/0006-bot-check-fails-open-in-our-own-hook.md): the Bot Check fails open, so it's our own auth hook rather than Better Auth's captcha plugin.

## Problem Statement

The app's spending on Gemini is already bounded: only a verified account can start a Consultation, each user has an Outfit Allowance, and every user together shares an app-wide cap of 100 Outfits a day and 750 a month. The team's Gmail is bounded the same way, by daily email caps.

Those shared caps are exactly what a bot can take. A script that signs up accounts with throwaway inboxes, or with Gmail aliases of one real inbox, can verify a handful of accounts and use up the app-wide Outfit cap. Every real visitor then sees that the app is out of Outfits for the day. The same script can push the email caps until sign-ups pause, or send password-reset emails to real users' addresses until every email stops for a day. Today the only barrier is Better Auth's limit of 3 sign-ups per IP address per hour, which rotating IP addresses defeats. Sign-in has no limit at all, because it skips Better Auth's HTTP endpoints.

## Solution

Before anyone signs up, signs in or asks for a password reset, they pass a **Bot Check**: Cloudflare Turnstile, which most visitors never see. A script that posts straight to the app's auth endpoints, skipping the forms, meets the same check. The check fails open only when Cloudflare can't be reached, so an outage never locks real people out, while a missing, expired or rejected token is always refused.

Sign-ups and email changes also refuse **Disposable Addresses**, and any address that reaches the same Gmail inbox as an existing account, so one person can't turn one inbox into many accounts. Sign-in moves onto the same path as sign-up, so it gets Better Auth's per-IP rate limit too.

Judges on the Demo Account skip the Bot Check at sign-in. The Privacy Policy names Cloudflare and the new purpose.

## User Stories

### Real visitors

1. As a visitor signing up, I want the Bot Check to happen without a puzzle, so that creating an account takes no more effort than it does today.
2. As a visitor signing up, I want Turnstile's box to appear only when Cloudflare needs me to click it, so that I'm only interrupted when it's really needed.
3. As a visitor whose Bot Check failed or expired, I want to be told "We couldn't check that you're not a bot. Please try again." and have the check reset itself, so that I can simply submit again.
4. As a visitor who left the sign-up form open for a long time, I want an expired check to renew on its own, so that I'm not refused for being slow.
5. As a visitor signing up with a throwaway inbox, I want to be told "This email provider isn't accepted. Please use a different address.", so that I know to use a real one.
6. As a visitor whose Gmail address is an alias (dots or a `+tag`) of an inbox that already has an account, I want the usual "An account already uses this email" message, so that the refusal matches the one I'd get for the exact address.
7. As a visitor signing in, I want the Bot Check to be invisible too, so that signing in feels the same as today.
8. As a visitor signing in with my username, I want the same Bot Check as signing in with my email, so that neither form is a back door.
9. As a visitor who forgot their password, I want the Bot Check before the reset email goes, so that bots can't use the reset form to exhaust the emails I depend on.
10. As a visitor asking for a password reset, I want every address to get the same answer whether or not it has an account, as today, so that the Bot Check doesn't reveal who has an account.
11. As a visitor trying sign-in many times from one IP address, I want Better Auth's per-IP limit to slow me down with a clear "too many tries, wait a little" message, so that I know why I'm refused.
12. As a visitor during a Cloudflare outage, I want to sign up, sign in and reset my password anyway, so that an outage outside the app doesn't lock me out.
13. As a visitor relying on a screen reader or keyboard, I want the Bot Check to be accessible (Turnstile states WCAG 2.2 AA), so that it doesn't shut me out.
14. As a visitor whose browser language isn't English, I want Turnstile's text in my browser's language, so that a rare challenge is understandable.

### Existing users

15. As an existing user who already has a Disposable Address, I want to keep my account and its address, so that the new rule doesn't lock me out.
16. As an existing user changing my email, I want to be refused a Disposable Address with the same message as at sign-up, so that the rule is the same everywhere.
17. As an existing user changing my email to a Gmail alias of another account's inbox, I want it refused the same way as an address already in use, so that I learn nothing about the other account.
18. As an existing user changing my email, I want no Bot Check, since I'm already signed in to a verified account, so that settings stay quick.
19. As an unverified user resending my verification email, I want no Bot Check, since I passed one at sign-up, so that resending stays one click.
20. As a user starting a Consultation, I want no Bot Check, since my account already passed one and my Outfit Allowance limits me, so that "Get my Outfits" stays one click.
21. As a user, I want the Privacy Policy to say that Cloudflare receives my IP address and browser details when I sign up, sign in or reset my password, and why, so that I know where my data goes.

### Judges and the team

22. As a judge signing in to the Demo Account, by its email or its username, I want no Bot Check, so that nothing gets between me and the demo.
23. As a judge signing in to the Demo Account, I want Better Auth's per-IP sign-in limit to still apply, so that the account's password is still protected against guessing.
24. As the team, I want the Demo Account's `+demo` address exempt from the Gmail-inbox rule, so that it doesn't block, and isn't blocked by, the team's own address or other aliases.
25. As the team, I want our scripts (creating the Demo Account, deleting an account, correcting a date of birth, and others) to keep working with no Bot Check, since they don't come from a browser, so that team tasks stay one command.
26. As the team, I want each fail-open written to the runtime log with its reason, so that we can see whether Cloudflare outages are frequent.
27. As the team, I want the Bot Check off in local development unless its keys are set, as the AI provider is fake unless switched on, so that `npm run dev` needs no Cloudflare account.
28. As the team, I want Preview deployments to use Turnstile's always-pass test keys, so that Previews work without authorising every `vercel.app` site to use our key.
29. As the team, I want Production to use the real Turnstile keys, so that the live app is protected.
30. As the team, I want the Bot Check to wait at most 5 seconds for Cloudflare before failing open, so that a slow Cloudflare never makes sign-up feel broken.
31. As the team, I want the list of Disposable Address domains kept with our other curated lists, so that we can add a domain without hunting through code.

### Against bots

32. As the team, I want a script that posts straight to the sign-up, sign-in or password-reset endpoints with no token refused, so that skipping the forms gains a bot nothing.
33. As the team, I want a junk, expired or already-used token refused, so that a bot can't fake one.
34. As the team, I want a bot unable to trigger fail-open by sending something odd, since only Cloudflare being unreachable counts, so that fail-open isn't a back door.
35. As the team, I want the visitor's own IP address sent to Cloudflare with each check, so that Cloudflare judges the visitor rather than our server.
36. As the team, I want one real Gmail inbox to be able to hold only one account, so that aliases can't multiply a bot's Outfit Allowances.
37. As the team, I want sign-in rate-limited per IP like sign-up, so that password guessing, including against the Demo Account, is slow.

## Implementation Decisions

### The Bot Check

- **Provider:** Cloudflare Turnstile, verified through its server-side verify call. Not Better Auth's captcha plugin, which always fails closed (ADR-0006).
- **Where it lives:** one Better Auth `before` hook, alongside the existing sign-up hooks, matching the sign-up-by-email, sign-in-by-email, sign-in-by-username and request-password-reset endpoints. Because it's a hook, it guards both the app's forms and direct posts to the auth endpoints.
- **Requests from no browser skip it:** a call with no request headers (a team script's) skips it, the same way it skips the region gate today.
- **The token's path:** the forms' Turnstile widget makes the token. Each form sends it to its server action as part of the input. The shared helper that forwards a server action's request to Better Auth gains an optional Bot Check token and sets it as the `x-captcha-response` header, overriding any header the browser sent. A direct post must carry the same header.
- **Verdicts:**
  - Cloudflare says the token is good → the request goes on.
  - The token is missing, or Cloudflare rejects it (invalid, expired, already used, wrong hostname) → refused with a Bot Check error code.
  - Cloudflare can't be reached (network error, a 5xx answer, or no answer within 5 seconds) → the request goes on, and one runtime-log line records the endpoint and the reason. This is the **only** fail-open.
- **What's sent to Cloudflare:** the secret, the token, and the visitor's IP address as Better Auth reads it from `x-forwarded-for`. On Production, the verify answer's hostname must be the app's own.
- **The Demo Account exemption:** at sign-in only, when the identifier is the Demo Account's email or the username `demo` (compared the way Better Auth compares them), the Bot Check is skipped. Its other protections, including the per-IP rate limit, still apply.
- **The provider call is a seam:** the Turnstile verify call is a transport passed into the auth setup, the same way the Qloo client takes its transport. The real one calls Cloudflare, and tests pass a fake.
- **Configuration:**
  - Two environment variables: the Turnstile site key, which reaches the forms, and the Turnstile secret, which stays on the server.
  - With no secret set, the Bot Check is off and the forms render no widget, which is the local-development default.
  - On Production, a missing secret is an error at startup rather than a silently unprotected app.
  - Preview gets the always-pass test keys, and Production the real ones.
  - Document both in the example env file next to the AI provider's.
- **Rules in config:** the 5-second timeout and the endpoint list live with the other account rules, so they can change without hunting through code.

### Sign-in

- The sign-in operation stops calling Better Auth's server API directly. It posts to the sign-in-by-email or sign-in-by-username endpoint through the same forwarding helper sign-up and password reset use, so that the Bot Check and Better Auth's per-IP rate limit both apply.
- Its refusals grow from one to three:
  - `credentials-mismatch`, unchanged: every wrong-credentials failure still looks the same, and nothing locks the account.
  - `bot-check-failed`.
  - `too-many-sign-ins`, for the rate limit's 429.
- The sign-in rate limit is stated in the account rules next to the sign-up limit, with the number taken from Better Auth's sign-in default unless there's reason to change it.

### Sign-up and password reset refusals

- Sign-up gains a `bot-check-failed` refusal and a `disposable-address` refusal. A Gmail address whose inbox already has an account maps to the existing `email-taken` refusal.
- Password reset gains `bot-check-failed`. It is checked before any address is looked up, so every address still gets the same answer.

### Disposable Addresses

- A list of throwaway-inbox domains is bundled into the app, kept with the team's other curated lists, and seeded from a maintained open-source list.
- An address matches when its domain, or any parent domain, is on the list.
- Checked in the existing sign-up hook and the existing email-change hook, so direct posts are refused too.
- Accounts that already have a Disposable Address are untouched.

### One Gmail inbox, one account

- Addresses at `gmail.com` and `googlemail.com` reduce to one inbox: lower-case, drop everything from the first `+` in the local part, remove dots from the local part, and treat `googlemail.com` as `gmail.com`.
- At sign-up and email change, the hooks refuse an address whose inbox matches an existing account's, as if the address were already in use. The Demo Account's address is left out of the comparison on both sides.
- **No schema change:** the comparison reduces stored addresses in the query itself, which is fine at this app's scale.

### Forms and copy

- The sign-up, sign-in and forgot-password forms render the Turnstile widget with `appearance: interaction-only` and `refresh-expired: auto`, and reset it after any refusal.
- The widget's hidden input is how the token reaches the server action; these forms now need JavaScript.
- New messages live with the app's other copy:
  - Bot Check failed: "We couldn't check that you're not a bot. Please try again."
  - Disposable Address: "This email provider isn't accepted. Please use a different address."
  - Too many sign-ins: a "too many tries, wait a little" message in the style of the existing too-many-sign-ups one.

### Privacy Policy

Four edits:

1. **"Who receives it":** add Cloudflare. When you sign up, sign in or ask for a password reset, it receives your IP address, browser details (TLS fingerprint, user agent) and the site's address, never what you type in the form. It does so as our processor, and as a controller to improve its bot detection.
2. **"Why":** add "To stop automated sign-ups", legal basis legitimate interest (Article 6(1)(f)).
3. **Transfers:** add that Cloudflare may handle this data outside your country.
4. **Cookies:** keep "We use only the cookies the app needs" unless a check on a deployment shows Turnstile stores anything, in which case reword it. The runtime-log retention line already covers the fail-open log.

## Testing Decisions

- **What a good test looks like here:** it drives an operation or a direct post as a visitor would, then asserts what a visitor or the team can observe. For example: the refusal returned, whether an account now exists, whether an email was sent, whether a session cookie was set, and what was sent to Cloudflare. It never asserts which hook ran or how the token was threaded.
- **Seam 1, the server operations through the test harness:** sign-up, sign-in, request password reset and change email, each from a test browser. Also the harness's direct post to Better Auth, playing a script that skips the forms. Cover:
  - Each Bot Check verdict (pass, rejected, missing, unreachable, slow past 5 seconds) on each guarded endpoint, by form and by direct post.
  - Fail-open happens only for unreachable or slow, and writes its log line.
  - The visitor's IP address reaches Cloudflare.
  - The Demo Account skips the check at sign-in by email and by username, and still meets the rate limit.
  - Team scripts' header-less calls skip it.
  - Disposable Addresses, including subdomains, are refused at sign-up and email change, and existing holders are untouched.
  - Gmail aliases are refused at sign-up and email change, the Demo Account exemption works, and non-Gmail addresses with `+` or dots are unaffected.
  - Sign-in's new rate limit: a harness with rate limits on, as the sign-up rate-limit tests do.
  - Password reset still answers every address the same.
  - The check is off when no secret is configured.
- **Seam 2, the Turnstile transport, new:** the harness gains a fake Turnstile transport, modelled on the fake Qloo transport. It answers pass, reject (with an error code), unreachable or slow as a test sets, and records each request's token and IP. The harness turns the Bot Check on with it by default; a test can turn it off. Existing tests send a pass token through the test browser so they keep passing.
- **Seam 3, Playwright e2e:** the dev server runs with Turnstile's always-pass test keys, so the existing sign-up smoke test proves the widget produces a token and it reaches Better Auth. There's no always-fail e2e test: Playwright runs one dev server with fixed keys, and Seam 1 covers refusals deterministically. E2E now needs internet access for Turnstile's script and verify call.
- **Prior art:**
  - The sign-up and sign-in operation tests, and the sign-up rate-limit tests.
  - The email-cap tests through the email sender.
  - The fake Qloo transport and its recorded requests.
  - The test browser's IP and country, already used for the region gate.

## Out of Scope

- A Bot Check on starting a Consultation, changing email, or resending the verification email.
- Vercel BotID, reCAPTCHA, hCaptcha and CaptchaFox (see ADR-0006 and the research).
- Alerts on fail-open. It's logged only.
- Changing how IPv6 addresses are grouped for rate limits. Keep Better Auth's current handling, and test sign-up from an IPv6 connection on Production before launch.
- Cleaning up existing accounts that have a Disposable Address or share a Gmail inbox.
- Forms working without JavaScript.
- Real Turnstile keys on Preview deployments.
- Reducing addresses to one inbox for providers other than Gmail.

## Further Notes

- **The Demo Account exemption is "for now".** The Demo Account has no usage limit, so it's the account a bot most wants. With the exemption, only the per-IP sign-in limit protects its password. Revisit before the app is promoted beyond the judges.
- **Steps only a human can take:**
  - Create the Turnstile widget in the Cloudflare dashboard with the Production hostname.
  - Set the site key and secret on Vercel: real keys for Production, test keys for Preview.
  - After the first deploy, check in DevTools that Turnstile sets no cookie or storage before the Privacy Policy's cookie sentence ships unchanged.
  - Test sign-up once from an IPv6 connection on Production.
- **Missing secret on Production:** the startup error is an addition beyond the grilling, so a forgotten secret can't leave Production unprotected. Drop it if the team prefers the CRON_SECRET style, where an unset secret just means the feature doesn't run.
