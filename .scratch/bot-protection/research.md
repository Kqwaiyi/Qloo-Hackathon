# Which bot protection stops scripted sign-ups?

Type: research
Status: findings, not yet decided
Date: 2026-10-18
Versions checked: better-auth 1.7.10 (installed), botid 1.5.11 (latest on npm), next 16.4.1

## Question

Scripted sign-ups that use disposable inboxes can verify their emails and then use up the app-wide Outfit caps (100 per 24 h, 750 per month, `src/config/limits.ts`) and the team Gmail send quota. Near Gmail's limit, `beforeSignUp` in `src/server/auth/create-auth.ts` pauses sign-ups for everyone. The only existing barrier is Better Auth's limit of 3 sign-ups per IP per hour (`SIGN_UP_RATE_LIMIT`). Rotating IPs gets around it.

Which option best stops scripted sign-ups, and optionally sign-in, password reset and Consultation start?

1. Better Auth's captcha plugin with each provider it supports in 1.7.x.
2. Vercel BotID.
3. Disposable-email blocking, as a complement.

The token has to travel from the browser form to the server action, then through `postToAuthEndpoint` (`src/server/auth/endpoint.ts`), which builds a new `Request` to `auth.handler` with the browser's headers copied.

## TL;DR

- **Recommended:** Better Auth's captcha plugin with **Cloudflare Turnstile**, plus **disposable-domain blocking** in the existing `beforeSignUp` and `beforeChangeEmail` hooks.
  - Turnstile is free with no usage cap.
  - It has always-pass and always-fail test keys that work on `localhost`, so Playwright runs against `next dev` unchanged.
  - Its widget is invisible for most visitors and claims WCAG 2.2 AA.
  - The plugin checks the forwarded request, so it also guards a script that posts to `/api/auth/sign-up/email` directly, the path a bot would actually use.
- **Vercel BotID is not recommended as the main layer.**
  - On Hobby only the Basic check exists; Deep Analysis needs Pro at $1 per 1,000 checks.
  - Vercel's own docs say tools like Playwright are "hard to catch with integrity checks alone".
  - In development `checkBotId()` always answers "human", and there are no test keys.
  - It can't protect a form posted before JavaScript loads, which the sign-in and forgot-password forms can do.
- **Gaps to decide:**
  - Better Auth 1.7.10 protects `/sign-up/email`, `/sign-in/email` and `/request-password-reset` by default, **not `/sign-in/username`**.
  - Our sign-in calls `auth.api.*` directly, which skips both the plugin and Better Auth's rate limits.
  - Gmail dot and `+tag` aliases let one real inbox make unlimited accounts. No disposable list catches that.

## How the Better Auth captcha plugin works in 1.7.10

This comes from the installed `node_modules/better-auth/dist/plugins/captcha/*`, which matches the [v1.7.10 source](https://github.com/better-auth/better-auth/tree/v1.7.10/packages/better-auth/src/plugins/captcha).

- **Providers:** `cloudflare-turnstile`, `google-recaptcha`, `hcaptcha`, `captchafox` and `vercel-botid` ([constants.ts](https://github.com/better-auth/better-auth/blob/v1.7.10/packages/better-auth/src/plugins/captcha/constants.ts)). The brief's list didn't include BotID, but it is a plugin provider.
- **Default endpoints:** `/sign-up/email`, `/sign-in/email` and `/request-password-reset`. Setting `endpoints` replaces the defaults, and wildcards `/x/*` and `/x/**` are allowed ([docs](https://www.better-auth.com/docs/plugins/captcha)). `/sign-in/username` from the username plugin isn't covered unless it's listed.
- **Token:** read from the **`x-captcha-response` request header** only, never from the body. A missing header gets `400 {code: "MISSING_RESPONSE"}`.
- **Where it runs:** as a plugin `onRequest` hook inside Better Auth's router (`dist/api/index.mjs`, [src](https://github.com/better-auth/better-auth/blob/v1.7.10/packages/better-auth/src/api/index.ts)).
  - The router runs `onRequestRateLimit` first, then each plugin's `onRequest`, then the endpoint and its `hooks.before`.
  - Rate-limited requests (429) never reach the captcha vendor.
  - The captcha runs before our age, region and email-cap checks and before the username and email uniqueness checks. A refusal after a passing captcha still spends the token, so the widget has to reset after every failed submit.
  - `auth.api.*` calls don't go through the router, so neither the captcha nor the rate limits apply to them. Only `onRequestRateLimit` in the router calls the rate limiter; `to-auth-endpoints.mjs` doesn't.
- **Effect on this codebase:**
  - `postToAuthEndpoint` goes through `auth.handler`, so sign-up, password reset and the other operations that use it are covered once the header is set.
  - `signIn` (`src/server/operations/sign-in.ts`) calls `auth.api.signInEmail` and `auth.api.signInUsername`. It is covered by neither the captcha nor the per-IP rate limit, even though the Privacy Policy says IPs are kept "to limit repeated attempts at signing up, signing in".
  - `team.ts`'s `auth.api.signUpEmail`, which creates the Demo Account, also skips the captcha. That's good: team scripts keep working.
- **Remote IP:** `getIP(request, ctx.options)` reads `advanced.ipAddress.ipAddressHeaders`, which is `["x-forwarded-for"]` here ([core ip.ts](https://github.com/better-auth/better-auth/blob/v1.7.10/packages/core/src/utils/ip.ts)).
  - `postToAuthEndpoint` copies the browser's headers, so the forwarded request carries the same `x-forwarded-for`.
  - On Vercel that header is the client IP: Vercel overwrites it "and do[es] not forward external IPs" ([Vercel request headers](https://vercel.com/docs/headers/request-headers)).
  - Locally, Next.js fills it from the socket (`req.headers['x-forwarded-for'] ??= socket.remoteAddress`, `next/dist/server/base-server.js`). Without it, Better Auth falls back to `127.0.0.1` in development and test.
  - **Caveat:** `getIP` returns the *normalised* IP. IPv6 is masked to a /64 by default (`ipv6Subnet ?? 64`), so for an IPv6 visitor the plugin sends something like `2001:0db8:…:0000:0000:0000:0000` as `remoteip`, not the real address. Turnstile documents `remoteip` as optional and doesn't say what a mismatch does ([siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)). This isn't confirmed either way; see the open questions.
- **Vendor down:**
  - Every token-based provider is called through `betterFetch` with a 10 s timeout (`CAPTCHA_VERIFY_TIMEOUT_MS = 1e4`).
  - A network error, or a reply with no data, throws "CAPTCHA service unavailable". The plugin catches it, logs it and answers `500 {code: "UNKNOWN_ERROR"}`. It **fails closed**, and the plugin offers no option to fail open.
  - A rejected token answers `403 {code: "VERIFICATION_FAILED"}`.
  - Today `signUp` throws on any unmapped code, so these three codes need mapping to refusals.
- **Provider extras:**
  - Turnstile and reCAPTCHA take `expectedAction` and `allowedHostnames`.
  - reCAPTCHA takes `minScore`, default 0.5, applied only when the answer carries a `score`, meaning v3.
  - hCaptcha and CaptchaFox take `siteKey`.
  - `siteVerifyURLOverride` lets tests point verification at a stub.
  - `expectedAction` is one value per plugin instance, so it can't differ per form.

## Comparison

| | Cost / free tier | Data to vendor, cookies | Through `postToAuthEndpoint` | Local dev and tests | UX | Vendor down |
|---|---|---|---|---|---|---|
| **Turnstile** (plugin) | Free plan: "Unlimited challenges", 20 widgets, 10 hostnames each ([plans](https://developers.cloudflare.com/turnstile/plans/)) | IP, TLS fingerprint, User-Agent, sitekey and origin. Cloudflare is processor, and controller for improving Turnstile ([addendum](https://www.cloudflare.com/turnstile-privacy-policy/)). Cloudflare's 2022 launch post says it uses no cookies; current docs don't say | Yes: set `x-captcha-response` on the forwarded request | Test keys for pass, fail and forced interaction, valid on `localhost` ([testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)) | Managed, non-interactive or invisible modes; WCAG 2.2 AA claimed | No token, so 400; siteverify down, so 500 after ≤10 s |
| **reCAPTCHA v2/v3** (plugin) | 10,000 assessments/month free per organisation; billing account needed. Over quota, siteverify fails **open** (score 0.9) ([migration](https://docs.cloud.google.com/recaptcha/docs/migration-overview), [tiers](https://docs.cloud.google.com/recaptcha/docs/compare-tiers)) | Google; `_GRECAPTCHA` cookie, and www.google.com "may set other cookies" ([FAQ](https://docs.cloud.google.com/recaptcha/docs/faq)) | Yes, same header | v2 test keys only; v3 has none, so a separate key is needed ([FAQ](https://developers.google.com/recaptcha/docs/faq)) | v2 checkbox and images; v3 invisible, badge or "protected by reCAPTCHA" text required | Same plugin behaviour; quota exhaustion lets bots through |
| **hCaptcha** (plugin) | Basic free, limits not stated; Pro $139/mo or $99/mo yearly, 100k evals ([pricing](https://www.hcaptcha.com/pricing)) | IP, device, mouse and keypress signals; processor; US; cookies `hmt_id`, `hc_accessibility`, `__cf_bm` ([privacy](https://www.hcaptcha.com/privacy)) | Yes, same header | Test keys never challenge; but the API "does not accept `localhost` or `127.0.0.1`" ([docs](https://docs.hcaptcha.com/)) | Visible challenge on free tier; passive mode is Pro or Enterprise | Same plugin behaviour |
| **CaptchaFox** (plugin) | No free plan: €15/mo for 10k, 7-day trial ([pricing](https://captchafox.com/pricing)) | Processor; EU data centres; "sets no cookies" ([privacy](https://captchafox.com/privacy)) | Yes, same header | Pass and fail test keys ([testing](https://docs.captchafox.com/automated-testing)) | Not checked | Vendor advises failing open on non-200 ([docs](https://docs.captchafox.com/getting-started)); the plugin fails closed |
| **Vercel BotID** (plugin or `checkBotId`) | Basic free on all plans; Deep Analysis Pro only, $1/1,000 `checkBotId()` calls ([BotID](https://vercel.com/docs/botid)) | Request headers (cookies cut to `KP_*`, `authorization` dropped) and URL go to `api.vercel.com`; Deep Analysis uses Kasada | Yes, but it checks the **server action's** request, not the forwarded one (see below) | `checkBotId()` always answers human in development; `bypass` simulates a bot; no test keys | Fully invisible; no native-form support | Throws, so the plugin answers 500 |
| **Disposable-domain list** | Free (CC0 list) | Nothing leaves the app | Not needed: runs in `hooks.before` | Pure function, unit-testable | Only "use a permanent address" | No vendor |

## Option notes

### Cloudflare Turnstile (recommended)

- **Cost:** free plan, "Unlimited challenges (traffic or verification requests)". The limits are 20 widgets per account and 10 hostnames per widget ([plans](https://developers.cloudflare.com/turnstile/plans/)). The site doesn't need to be on Cloudflare's CDN ([overview](https://developers.cloudflare.com/turnstile/)).
- **Privacy:**
  - Signals collected include "client IP address, TLS Fingerprint, User-Agent Header and Sitekey and associated origin".
  - Cloudflare is the processor for providing the service and the controller for "improv[ing] Turnstile's bot detection capabilities" ([addendum](https://www.cloudflare.com/turnstile-privacy-policy/)).
  - Turnstile "does not access, store, or transmit … form entries" ([overview](https://developers.cloudflare.com/turnstile/)).
  - Cookies: the 2022 launch post says Turnstile never "uses cookies to collect or store information of any kind" ([blog](https://blog.cloudflare.com/turnstile-private-captcha-alternative/)). The current docs and Cloudflare's cookie page don't confirm this, so check DevTools on a deploy.
- **Privacy Policy changes:**
  - Add Cloudflare to "Who receives it": the bot check on sign-up, password reset and sign-in, the data above, and that Cloudflare also uses it as a controller to improve Turnstile.
  - Add a "Why" bullet: preventing automated sign-ups, legitimate interest (Art. 6(1)(f)).
  - Add a transfers note.
  - Revisit the cookie sentence ("We use only the cookies the app needs") if any Turnstile storage turns up.
- **Integration:** the token goes in `x-captcha-response` on the forwarded request, so `postToAuthEndpoint` has to set it explicitly.
  - It copies all browser headers today, so a header the browser sent itself would be forwarded too. That's harmless, since the token still has to verify, but `set` the form's token so it wins.
  - Tokens last 300 s and are single-use ([siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)). Use `refresh-expired: auto` and call `turnstile.reset()` after any refusal ([widget config](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)).
  - By default the widget adds a hidden `cf-turnstile-response` input ([widget config](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)). It therefore also works for the sign-in and forgot-password `<form action={formAction}>` forms if one is posted before hydration. Server actions receive `FormData` in that case.
- **Hostnames:**
  - Subdomains are included automatically, and wildcards aren't supported ([hostnames](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)).
  - Preview URLs are `*.vercel.app`, so Preview needs either the test keys or `vercel.app` as a hostname. The latter authorises every `vercel.app` site.
- **Local dev and tests:**
  - Test sitekeys: `1x00000000000000000000AA` passes (visible), `2x00000000000000000000AB` fails, `1x…BB` and `2x…BB` are the invisible pass and fail, and `3x…FF` forces an interaction.
  - Test secrets: `1x0000000000000000000000000000000AA` passes, `2x…AA` fails, and `3x…AA` returns `timeout-or-duplicate`.
  - Test keys produce `XXXX.DUMMY.TOKEN.XXXX` and "work on any domain, including `localhost`". Production secrets reject the dummy token ([testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)).
  - The widget script and siteverify both need internet access during e2e.
- **UX and accessibility:**
  - `appearance: interaction-only` shows the widget only when interaction is needed ([widget config](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)).
  - Cloudflare states "Turnstile is WCAG 2.2 AA compliant" ([overview](https://developers.cloudflare.com/turnstile/)).
  - Language follows the browser by default.
- **Vendor down:**
  - The client retries automatically (`retry: auto`, every 8 s). If no token ever arrives, the plugin answers 400.
  - If siteverify is down, the plugin answers 500 after up to 10 s.
  - Cloudflare says to "have fallback behavior", but leaves fail-open or fail-closed to the site ([siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)).
  - With the plugin, sign-up fails closed. That's acceptable for a free demo; the app already pauses sign-ups near the Gmail cap.

### Google reCAPTCHA (v2 / v3)

- **Cost:**
  - "All Google Cloud reCAPTCHA customers" get 10,000 free assessments a month, counted per organisation.
  - Classic keys were moved to Cloud projects automatically between Q4 2025 and Q1 2026 ([migration](https://docs.cloud.google.com/recaptcha/docs/migration-overview)).
  - Essentials "requires a valid billing instrument" ([tiers](https://docs.cloud.google.com/recaptcha/docs/compare-tiers)).
  - Over quota, SiteVerify "will fail open" with `success:true` and score 0.9. A flood could spend the quota and then pass freely.
- **Privacy:**
  - Sets a "necessary cookie (`_GRECAPTCHA`)", and www.google.com "may set other cookies" ([Cloud FAQ](https://docs.cloud.google.com/recaptcha/docs/faq)).
  - Google says to review end-user privacy disclosures.
  - Hiding the badge requires the visible text "This site is protected by reCAPTCHA." ([FAQ](https://developers.google.com/recaptcha/docs/faq)).
  - I couldn't find a current primary page for the older "inform visitors that the Google Privacy Policy and Terms apply" wording.
  - The policy would have to name Google as a recipient for a second purpose, next to Gemini.
- **Integration:**
  - The plugin calls the legacy `https://www.google.com/recaptcha/api/siteverify`, which migrated keys still support.
  - It detects v3 by the presence of `score`.
- **Tests:** v2 test keys exist (site `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI`, secret `6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe`). v3 has none: "create a separate key for testing environments" ([FAQ](https://developers.google.com/recaptcha/docs/faq)).
- **Verdict:** worse than Turnstile on privacy and cookies, on free-tier headroom, and in failing open over quota.

### hCaptcha

- **Cost:** a free Basic plan whose limits aren't published; passive (no-challenge) mode is Pro or Enterprise ([pricing](https://www.hcaptcha.com/pricing)).
- **Privacy:**
  - Collects IP, browser, device, and "mouse movements, scroll position, keypress events".
  - It is the processor for integrators, US-based, under the DPF and SCCs.
  - Sets strictly necessary cookies (`hmt_id`, `hc_accessibility`, `__cf_bm`) ([privacy](https://www.hcaptcha.com/privacy)).
- **Tests:** test sitekey `10000000-ffff-ffff-ffff-000000000001` with secret `0x0000000000000000000000000000000000000000` never challenges. But the API "does not accept `localhost` or `127.0.0.1`", and the suggested workaround is a hosts-file entry ([docs](https://docs.hcaptcha.com/)). That would break `npm run dev` and Playwright as they're set up today.
- **Verdict:** visible challenges on the free tier, plus friction in local development.

### CaptchaFox

- **Cost:** no free plan. Starter is €15/mo for 10k requests, after a one-time 7-day trial ([pricing](https://captchafox.com/pricing)).
- **Privacy:** best on paper. It is an Art. 28 processor in "EU data centers", "sets no cookies", and anonymises the IP early ([privacy](https://captchafox.com/privacy)). The page names the operator only as Scoria Labs GmbH.
- **Tests:** passing keys `sk_11111111000000001111111100000000` and `ok_11111111000000001111111100000000`, plus failing variants ([testing](https://docs.captchafox.com/automated-testing)).
- **Vendor down:** the vendor's guide says to bypass on non-200 and log ([getting started](https://docs.captchafox.com/getting-started)), but Better Auth's plugin fails closed.
- **Verdict:** worth it only if EU-only processing outweighs a monthly fee. UX and accessibility weren't checked.

### Vercel BotID

- **Cost:**
  - Basic is "free of charge for all plans" and "validates the integrity and correctness of the challenge response".
  - Deep Analysis (Kasada) is Pro only at $1 per 1,000 `checkBotId()` calls ([BotID](https://vercel.com/docs/botid)). Pro itself is $20/mo (see `04-vercel-limits.md`).
  - Vercel's comparison says Playwright and Puppeteer are "hard to catch with integrity checks alone" ([BotID vs Turnstile](https://vercel.com/kb/guide/vercel-botid-vs-cloudflare-turnstile)). On Hobby, Basic is the only level, which is weak against exactly this threat.
- **How it reads the request** (from the minified `botid@1.5.11` `dist/server/index.mjs`; the package names no repository or license):
  - `checkBotId()` reads headers and URL from Vercel's request context (`globalThis[Symbol.for("@vercel/request-context")]`), not from any `Request` you pass.
  - It sends them, with `authorization` removed and cookies cut to `KP_*`, to `https://api.vercel.com/bot-protection/v1/is-bot`.
  - It needs the OIDC token (`x-vercel-oidc-token`), and it throws "Must be deployed on Vercel…" outside Vercel.
  - The client (`dist/client/core`) patches `fetch` and XHR. On same-origin requests that match `protect`, it adds `x-is-human`, `x-path` and `x-method`.
- **Through `postToAuthEndpoint`:**
  - The plugin's `vercel-botid` provider calls `checkBotId()` while handling the forwarded request. Because the check reads the *incoming* request context, it judges the browser's **server-action POST to the page** (`/sign-up`), not `/api/auth/sign-up/email`.
  - So `initBotId` must protect `{ path: "/sign-up", method: "POST" }` and the other page paths, not the `/api/auth/...` paths Better Auth's docs suggest. Vercel documents protecting "Server actions invoked from a page (e.g., '/dashboard')" ([get started](https://vercel.com/docs/botid/get-started)).
  - A script posting straight to `/api/auth/sign-up/email` carries no BotID headers and so should be judged a bot. The source logs it as a "Possible misconfiguration … or malicious request" and still asks Vercel; what Vercel answers isn't documented.
  - "BotID does **not** support traditional HTML forms" ([forms](https://vercel.com/docs/botid/form-submissions)). Sign-up submits from JavaScript, but a sign-in or forgot-password form posted before hydration would be refused.
- **Local dev and tests:**
  - "In development mode, `checkBotId()` always returns `{ isBot: false }`". `developmentOptions.bypass: 'BAD-BOT'` simulates a bot ([local dev](https://vercel.com/docs/botid/local-development-behavior)).
  - In the source, "development" means `NODE_ENV !== "production"`, so Playwright against `next dev` always passes and never exercises a real check.
  - Vercel's testing guide says local `curl` "should be denied", which contradicts both the docs and the source ([KB](https://vercel.com/kb/guide/deploying-and-testing-botid)).
  - Preview deployments run real checks.
- **Privacy:**
  - Vercel already hosts the app and is in the policy. Deep Analysis "silently collect[s] thousands of signals" and streams "attack data to a global machine learning system" ([BotID](https://vercel.com/docs/botid)).
  - Kasada isn't named on the sub-processor page I could reach ([trust center](https://security.vercel.com/?itemName=legal&itemUid=e3fae2ca-94a9-416b-b577-5c90e382df57)). This isn't confirmed.
  - The source forwards `KP_*` cookies, which suggests Kasada sets cookies in Deep Analysis. The docs don't say.
- **Vendor down:** a failed call to `api.vercel.com` throws, and the plugin answers 500. A client script that fails to load means no `x-is-human` header, and the result isn't documented.
- **Verdict:** a possible second layer if the team moves to Pro. Not the main defence on Hobby.

### Disposable-email blocking (complement)

- **Lists:**
  - [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains) is CC0. It held 9,901 domains on 2026-10-18 (`mailinator.com` and `yopmail.com` are in it; `example.com` isn't, so the e2e addresses are safe). The maintainers "cannot guarantee all of these can still be considered disposable".
  - The README's example matches the address's domain and each parent domain.
  - npm wrappers: `disposable-email-domains-js` (CC0, v1.26.0, updated 2026-09-21, `isDisposableEmail()`; "Domain list updates and package publishing are also automated", [repo](https://github.com/mziyut/disposable-email-domains-js)). Also `mailchecker` (MIT, v6.0.21, "over 55 000" domains, about 1 MB unpacked, [repo](https://github.com/FGRibreau/mailchecker)).
  - The `disposable-email-domains` npm package was last modified in 2022, so avoid it.
  - Better Auth 1.7.10 has no built-in disposable check: nothing in `dist` matches "disposable".
- **Privacy:** nothing leaves the app. The policy could say addresses at throwaway email services are refused.
- **Limits:**
  - Easy to dodge with new or unlisted domains, and it does nothing about **Gmail aliases**.
  - Gmail ignores dots ([Gmail Help](https://support.google.com/mail/answer/7436150)) and delivers `name+anything@gmail.com` to the same inbox ([Gmail Help](https://support.google.com/mail/answer/22370)). So one real Gmail gives unlimited verified accounts.
  - Refusing or canonicalising `+` and dots for gmail.com would close that hole. It must exempt the Demo Account, which is itself the team address's `+demo` alias (`demoAccountEmailOf`).
  - `hooks.before` runs for `auth.api` calls too, so the team script would hit the check. That's a team decision.

## Integration sketch (Turnstile plus domain checks)

No code was changed. The files to touch:

1. **Config:**
   - `src/config/accounts.ts`: add `CAPTCHA_ENDPOINTS = ["/sign-up/email", "/request-password-reset", "/sign-in/email", "/sign-in/username"]`. Drop the sign-in pair if sign-in stays on `auth.api`.
   - Add the Turnstile test keys as named development defaults.
   - `.env.example`: document `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
2. **`src/server/app/environment.ts`:**
   - Read the secret, defaulting to the always-pass test secret off Vercel and throwing on Vercel when it's unset, as `authSecret()` does.
   - Pass it to `createAuth`.
   - Set Production to real keys and Preview to test keys, or a `vercel.app` hostname.
3. **`src/server/auth/create-auth.ts`:**
   - Add an `AuthOptions.captcha?: { secretKey: string }` option.
   - Register `captcha({ provider: "cloudflare-turnstile", secretKey, endpoints: CAPTCHA_ENDPOINTS })` from `better-auth/plugins` alongside `username()`.
   - Add a disposable or alias check to `beforeSignUp` and `beforeChangeEmail` that throws `APIError("BAD_REQUEST", { code: "DISPOSABLE_EMAIL" })`.
4. **`src/server/auth/endpoint.ts`:** add an optional `captchaToken` to `postToAuthEndpoint` that does `headers.set("x-captcha-response", token)`. Without one, `headers.delete(...)` it, so only the form's token counts.
5. **Operations:**
   - `src/server/operations/sign-up.ts`: add `captchaToken: z.string()` to `signUpInputSchema`.
   - Map `MISSING_RESPONSE` and `VERIFICATION_FAILED` to a new `"captcha-failed"` refusal, a 500 `UNKNOWN_ERROR` to `"captcha-unavailable"`, and `DISPOSABLE_EMAIL` to `invalid("email")` or its own refusal. Today unknown codes throw.
   - `src/server/operations/password-reset.ts`: do the same for `requestPasswordReset`.
   - Optionally, `src/server/operations/sign-in.ts`: move to `postToAuthEndpoint` for `/sign-in/email` and `/sign-in/username`. That also brings sign-in under Better Auth's rate limits.
6. **Client:**
   - Add a small `src/components/turnstile.tsx` that loads `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` and renders with `appearance: "interaction-only"`, `refresh-expired: "auto"` and the `action` set.
   - Use it on step 2 of `src/app/(auth)/sign-up/sign-up-flow.tsx`, reading the token into the `signUpAction` input and calling `reset()` after any non-ok result.
   - In `forgot-password-form.tsx` and, if covered, `sign-in-form.tsx`, read the hidden `cf-turnstile-response` from `FormData` in `actions.ts`.
   - Put the messages in `src/config/copy.ts`.
7. **Privacy Policy** (`src/app/(legal)/privacy/page.tsx`): add Cloudflare to recipients and transfers, add a bot-check purpose with its legal basis, and update the cookie line if needed.
8. **Unit tests:**
   - `src/test/harness.ts`: keep the plugin off by default so existing tests don't call the network.
   - Add a `createTestHarness({ captcha })` switch so a sign-up test can turn the plugin on with `siteVerifyURLOverride` or `vi.stubGlobal("fetch", …)`. `@better-fetch/fetch` resolves `globalThis.fetch` at call time.
   - Teach `TestBrowser` and `postToAuth` to send the token.
9. **E2E:**
   - Pass the test keys in `playwright.config.ts` `webServer.env`, so `e2e/support.ts` `signUpNewUser` needs no change apart from waiting for the token.
   - Add one spec that blocks `challenges.cloudflare.com` with `page.route` and checks the refusal message. That tests the fail-closed path.

## Open questions for the team

1. **Sign-in:** should it move from `auth.api` to `postToAuthEndpoint`? That's the only way the captcha (and Better Auth's rate limit, which the Privacy Policy already implies) covers it.
2. **Gmail aliases:** refuse `+` and dots for gmail.com, canonicalise them for uniqueness, or accept the hole? How should the `+demo` Demo Account be exempted?
3. **IPv6 `remoteip`:** keep the /64-masked IP the plugin sends, or set `advanced.ipAddress.ipv6Subnet: 128`? The latter sends the exact IP, but turns the 3-per-hour sign-up limit into a per-address limit, which is weaker against IPv6 rotation. Test sign-up from an IPv6 connection on Production before deciding.
4. **Turnstile storage:** confirm in DevTools on a deploy whether Turnstile sets any cookie or local storage, so the policy's cookie sentence stays true.
5. **Vendor down:** is fail-closed acceptable? Failing open needs our own siteverify call in the server action instead of the plugin, which would also leave `/api/auth/sign-up/email` unguarded.
6. **Consultation start:** add a check? It isn't a Better Auth endpoint, so the plugin can't cover it, and verified email plus per-user allowances already gate it. A second Turnstile check in `startConsultation` is possible but probably not needed.
7. **Preview keys:** test keys, which leave Preview unprotected, or a `vercel.app` hostname on the real widget?

## Sources

- Better Auth captcha plugin docs: https://www.better-auth.com/docs/plugins/captcha
- Better Auth v1.7.10 source: https://github.com/better-auth/better-auth/tree/v1.7.10/packages/better-auth/src/plugins/captcha · https://github.com/better-auth/better-auth/blob/v1.7.10/packages/better-auth/src/plugins/captcha/constants.ts · https://github.com/better-auth/better-auth/blob/v1.7.10/packages/better-auth/src/api/index.ts · https://github.com/better-auth/better-auth/blob/v1.7.10/packages/core/src/utils/ip.ts (also the installed `node_modules/better-auth@1.7.10/dist`)
- Next.js 16.4.1 `node_modules/next/dist/server/base-server.js` (the `x-forwarded-for` fallback)
- Vercel: https://vercel.com/docs/botid · https://vercel.com/docs/botid/get-started · https://vercel.com/docs/botid/local-development-behavior · https://vercel.com/docs/botid/advanced-configuration · https://vercel.com/docs/botid/form-submissions · https://vercel.com/kb/guide/vercel-botid-vs-cloudflare-turnstile · https://vercel.com/kb/guide/deploying-and-testing-botid · https://vercel.com/docs/headers/request-headers · https://vercel.com/docs/oidc · https://security.vercel.com/?itemName=legal&itemUid=e3fae2ca-94a9-416b-b577-5c90e382df57
- botid 1.5.11 npm tarball: https://registry.npmjs.org/botid/-/botid-1.5.11.tgz (`dist/server/index.mjs`, `dist/client/core/index.mjs`, `dist/next/config/index.mjs`)
- Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/ · https://developers.cloudflare.com/turnstile/plans/ · https://developers.cloudflare.com/turnstile/troubleshooting/testing/ · https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ · https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/ · https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/ · https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/ · https://www.cloudflare.com/turnstile-privacy-policy/ · https://blog.cloudflare.com/turnstile-private-captcha-alternative/ · https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/
- Google reCAPTCHA: https://developers.google.com/recaptcha/docs/faq · https://docs.cloud.google.com/recaptcha/docs/faq · https://docs.cloud.google.com/recaptcha/docs/compare-tiers · https://docs.cloud.google.com/recaptcha/docs/migration-overview
- hCaptcha: https://docs.hcaptcha.com/ · https://www.hcaptcha.com/pricing · https://www.hcaptcha.com/privacy
- CaptchaFox: https://docs.captchafox.com/getting-started · https://docs.captchafox.com/automated-testing · https://captchafox.com/pricing · https://captchafox.com/privacy
- Disposable lists: https://github.com/disposable-email-domains/disposable-email-domains (blocklist fetched 2026-10-18) · https://github.com/mziyut/disposable-email-domains-js · https://github.com/FGRibreau/mailchecker · npm registry metadata for `disposable-email-domains-js`, `mailchecker`, `disposable-email-domains`
- Gmail: https://support.google.com/mail/answer/7436150 · https://support.google.com/mail/answer/22370
