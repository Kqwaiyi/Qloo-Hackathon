# The Bot Check fails open, so it is our own auth hook rather than Better Auth's captcha plugin

The Bot Check guards sign-up, sign-in and password-reset requests so that scripted accounts can't use up the app-wide Outfit caps or the team's emails. When the check's provider can't be reached (a timeout, a network error or a 5xx), we let the step go ahead and log it, rather than lock every visitor out of signing up and signing in. Better Auth 1.7's captcha plugin always fails closed (a 500 after a 10-second timeout) and has no setting to change that. So the Bot Check is a `before` hook in our own auth config, next to the sign-up checks, which calls the provider itself. A missing, expired or rejected token is always refused: a bot can't fake an outage by sending none. As a hook, it still guards scripts that post straight to Better Auth's endpoints, and team scripts skip it because they send no browser headers, as they already skip the region gate.

The provider is Cloudflare Turnstile: free with no usage cap, usually invisible, and with test keys that work on `localhost`.

## Considered Options

- **Google reCAPTCHA**: over its free quota of 10,000 checks a month, Google passes every token, which a bot can trigger by spending the quota. It also needs a billing account, sets Google cookies the Privacy Policy rules out, and its invisible v3 has no test keys.
- **Vercel BotID**: its free Basic check misses tools like Playwright, the deeper check needs Vercel Pro, and it has no test keys.

- **Better Auth's captcha plugin**: no code of ours, but fails closed, so a provider outage would stop every sign-up, sign-in and password reset.
- **A check in each server action**: simplest, but leaves `/api/auth/sign-up/email` and the other endpoints unguarded, which is the route a bot would actually use.

## Consequences

- Sign-in goes through `postToAuthEndpoint` like sign-up, instead of `auth.api`, so the hook (and Better Auth's per-IP rate limit) sees it.
- A Guest's "Get my Outfits" is no Better Auth endpoint, so the start Guest Consultation operation asks the same Bot Check itself, with the token its form sends, and fails open the same way.
- During a provider outage, only the per-IP rate limits, the email caps and the app-wide Outfit caps stand between a bot and new accounts.
- One more exception to "always refused", for now: signing in to the Demo Account, by its email or the username `demo`, skips the Bot Check, so nothing gets between the judges and the demo. Only the per-IP sign-in rate limit guards its password, which matters because it's the one account with no usage limit. Revisit before the app reaches anyone beyond the judges.
