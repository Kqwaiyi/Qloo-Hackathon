# 07: Privacy Policy names Cloudflare

**What to build:** The Privacy Policy tells users that Cloudflare receives their data for the Bot Check, why, and that it may leave their country. It must be live before Production gets real Turnstile keys (08). The cookie sentence is left as it is here; 08 checks it on a deployment.

**Blocked by:** 02 (Bot Check on sign-up)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Privacy Policy" (edits 1–3), and the Turnstile privacy notes in [research.md](../research.md). Story 21.

- [x] "Who receives it" adds Cloudflare. When you sign up, sign in or ask for a password reset, it receives your IP address, browser details (TLS fingerprint, user agent) and the site's address, never what you type in the form. It acts as our processor, and as a controller to improve its bot detection.
- [x] "Why" adds "To stop automated sign-ups", legal basis legitimate interest (Article 6(1)(f)), in the style of the existing security bullet.
- [x] The transfers section adds that Cloudflare may handle this data outside your country.
- [x] The wording matches the policy's existing voice and the glossary's terms (Bot Check is the user-facing idea; "captcha" is avoided).
- [x] The cookie sentence is unchanged; 08 decides whether it needs rewording.

**Notes from implementing:**

- All three edits are in `src/app/(legal)/privacy/page.tsx`.
  - **Who receives it:** Cloudflare comes last, after Gmail. It names Turnstile once, as the Gemini bullet names Gemini, and says "gets" like the bullets above it. The data and both roles are as the ticket says, plus "under its own privacy policy" for the controller part, which is what Cloudflare's Turnstile privacy addendum says.
    - One change from the ticket's words: Cloudflare gets the data "on the forms for signing up, signing in and asking for a password reset … even if you don't send the form", not "when you sign up". The widget makes a token as soon as the form shows, so Cloudflare already has the data before anything is sent.
  - **Why:** the new bullet follows the security one. Its data is your IP address and your browser's details, "which Cloudflare reads on the forms … (the Bot Check)". That makes clear it's Cloudflare that collects the browser details, which is why "What we collect" doesn't list them. The bullet cites Article 6(1)(f) again, as the ticket asks, though the bullets after the adults-only one don't.
  - **Transfers:** the first paragraph adds that Cloudflare may handle what it receives for the Bot Check outside your country. The second gets one more clause: Cloudflare's own privacy policy covers what it uses to improve its bot detection, as Google's covers Gmail. Its processor part was already covered by "each provider's data processing terms": Cloudflare's customer DPA uses the Standard Contractual Clauses and the UK addendum.
- The policy doesn't mention that judges skip the Bot Check on the Demo Account. The widget still loads on the sign-in form, so Cloudflare still gets their data there.
- "How long we keep it" has no Cloudflare line. The Turnstile addendum gives no retention period, and the spec asks for no edit there. Raise it with 08 if the team wants one.
- No test: the spec agrees no seam for the policy, and no test renders the legal pages. I checked the three sections' text on `/privacy` in a dev server instead. `npm run typecheck` is clean, and the whole unit suite passed.
