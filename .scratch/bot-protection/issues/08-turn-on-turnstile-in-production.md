# 08: Turn on Turnstile in Production

**What to build:** The team turns the Bot Check on for the live app and confirms the Privacy Policy is still true. Only a human can do this ticket: it means working in the Cloudflare and Vercel dashboards and checking a deployed site by hand. `/wizard` can turn these steps into a guided script.

**Blocked by:** 02 (Bot Check on sign-up), 03 (Bot Check on sign-in), 04 (Bot Check on forgot-password), 07 (Privacy Policy names Cloudflare)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) section "Further Notes" (steps only a human can take), "Implementation Decisions › Privacy Policy" (edit 4), and the hostname and testing notes in [research.md](../research.md). Stories 28 and 29.

- [ ] In the Cloudflare dashboard, a Turnstile widget exists for the Production hostname, in managed mode.
- [ ] On Vercel, Production has the real site key and secret, and Preview has Turnstile's always-pass test keys. The Production deploy starts, which proves the secret is set.
- [ ] On the Production site: sign-up, sign-in and forgot-password work, and most visits show no Turnstile box.
- [ ] In DevTools on the Production site, check whether Turnstile sets any cookie, local storage or session storage. If it sets none, the policy's "We use only the cookies the app needs" stays. If it sets any, reword that sentence (in its own small change) before going on.
- [ ] Sign up once from an IPv6 connection on Production, to confirm Better Auth's IPv6 handling doesn't refuse real visitors.
- [ ] Judges can still sign in to the Demo Account with no Turnstile box.
