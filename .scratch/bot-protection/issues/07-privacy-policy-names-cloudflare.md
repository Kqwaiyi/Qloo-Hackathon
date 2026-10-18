# 07: Privacy Policy names Cloudflare

**What to build:** The Privacy Policy tells users that Cloudflare receives their data for the Bot Check, why, and that it may leave their country. It must be live before Production gets real Turnstile keys (08). The cookie sentence is left as it is here; 08 checks it on a deployment.

**Blocked by:** 02 (Bot Check on sign-up)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Privacy Policy" (edits 1–3), and the Turnstile privacy notes in [research.md](../research.md). Story 21.

- [ ] "Who receives it" adds Cloudflare. When you sign up, sign in or ask for a password reset, it receives your IP address, browser details (TLS fingerprint, user agent) and the site's address, never what you type in the form. It acts as our processor, and as a controller to improve its bot detection.
- [ ] "Why" adds "To stop automated sign-ups", legal basis legitimate interest (Article 6(1)(f)), in the style of the existing security bullet.
- [ ] The transfers section adds that Cloudflare may handle this data outside your country.
- [ ] The wording matches the policy's existing voice and the glossary's terms (Bot Check is the user-facing idea; "captcha" is avoided).
- [ ] The cookie sentence is unchanged; 08 decides whether it needs rewording.
