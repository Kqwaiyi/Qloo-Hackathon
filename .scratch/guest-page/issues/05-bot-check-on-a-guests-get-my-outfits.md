# 05: Bot Check on a Guest's "Get my Outfits"

**What to build:** A Guest skips sign-up, so they skip its Bot Check, and a script rotating IP addresses could otherwise use up the public demo's app-wide Outfit caps. A Guest's "Get my Outfits" now passes the same Cloudflare Turnstile Bot Check as sign-up, which most people never see. A failed check lets them press "Get my Outfits" again without using up their Guest Consultation. When Cloudflare can't be reached, it goes ahead anyway. Respect [ADR-0006](../../../docs/adr/0006-bot-check-fails-open-in-our-own-hook.md).

**Blocked by:** 02 (A Guest gets two Outfits)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Starting a Guest Consultation" (the Bot Check). Stories 24–26.

- [ ] The start Guest Consultation operation takes a Bot Check token and checks it right after the region gate, through the same Turnstile transport and verdicts as sign-up: a missing or rejected token is refused, and only an unreachable or slow Cloudflare fails open, writing its log line.
- [ ] A new `bot-check-failed` refusal is shown with the sign-up form's wording, and the widget resets. Nothing is created and nothing is counted against the IP.
- [ ] The guest variant of the Budget Tier step renders the existing Bot Check component, waiting for its token on submit as the sign-up form does.
- [ ] With no Turnstile secret configured, the check is off, as it is for sign-up.
- [ ] Signed-in users' "Get my Outfits" stays without a Bot Check.
- [ ] Tests at the operation seam: pass, rejected, missing, unreachable and slow past 5 seconds, the fail-open log line, the visitor's IP reaching Cloudflare, and nothing stored on a refusal.
