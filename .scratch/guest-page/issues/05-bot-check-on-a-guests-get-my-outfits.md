# 05: Bot Check on a Guest's "Get my Outfits"

**What to build:** A Guest skips sign-up, so they skip its Bot Check, and a script rotating IP addresses could otherwise use up the public demo's app-wide Outfit caps. A Guest's "Get my Outfits" now passes the same Cloudflare Turnstile Bot Check as sign-up, which most people never see. A failed check lets them press "Get my Outfits" again without using up their Guest Consultation. When Cloudflare can't be reached, it goes ahead anyway. Respect [ADR-0006](../../../docs/adr/0006-bot-check-fails-open-in-our-own-hook.md).

**Blocked by:** 02 (A Guest gets two Outfits)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Starting a Guest Consultation" (the Bot Check). Stories 24–26.

- [x] The start Guest Consultation operation takes a Bot Check token and checks it right after the region gate, through the same Turnstile transport and verdicts as sign-up: a missing or rejected token is refused, and only an unreachable or slow Cloudflare fails open, writing its log line.
- [x] A new `bot-check-failed` refusal is shown with the sign-up form's wording, and the widget resets. Nothing is created and nothing is counted against the IP.
- [x] The guest variant of the Budget Tier step renders the existing Bot Check component, waiting for its token on submit as the sign-up form does.
- [x] With no Turnstile secret configured, the check is off, as it is for sign-up.
- [x] Signed-in users' "Get my Outfits" stays without a Bot Check.
- [x] Tests at the operation seam: pass, rejected, missing, unreachable and slow past 5 seconds, the fail-open log line, the visitor's IP reaching Cloudflare, and nothing stored on a refusal.

## Comments

- 2026-10-30: A Guest's "Get my Outfits" passes the Bot Check.
  - **One Bot Check, two callers** (`src/server/auth/bot-check.ts`). The hook's judgement moved into `passes()`, which the sign-up hook and the new `botCheckForOperations` both call. So the Guest's check uses the same transport, 5-second timeout, 2048-character token cap, Production hostname check and secret-error log as sign-up. `createAuth` hangs it on the auth object as `auth.passesBotCheck`, built from the same options as the hook. No Turnstile secret means no options, so both are off together.
  - **The operation** (`startGuestConsultation`). The input gains `botCheckToken`, as sign-up's does. The check runs right after the region gate, before the salt and the address's limits. A refusal is `bot-check-failed`, before anything is created or counted. When Cloudflare can't be reached it logs "The Bot Check let a request to start a Guest Consultation through: …". It reads the token from its input only, never the browser's `x-captcha-response` header, since it isn't one of Better Auth's endpoints.
  - **The page.** The Guest Page reads the site key and passes it in the guest variant. `PhotoStep` calls `useBotCheck` (null for a signed-in user, so no widget and no script) and sends through `botCheck.send`, which waits for the token and resets the widget afterwards. The refusal shows `COPY.botCheckFailed` over the photo, as the photo-check failure does. The widget sits after the step rather than in it. The early `return <StylingStep>` became a branch of one fragment, with the widget as its last child, so it stays mounted while the Styling step shows. Moving or remounting Cloudflare's frame would reload it, and the send may be waiting on it.
  - **Docs.** `GLOSSARY.md`'s Bot Check, `.env.example`, `docs/operations.md` (local development and e2e) and a new Consequences line in ADR-0006 now name the Guest's "Get my Outfits".
  - **Tests.**
    - `guest-consultations.test.ts` covers:
      - pass, with the secret, the form's token and the IP sent to Cloudflare;
      - rejected and missing (none, and ""), storing nothing;
      - unreachable and 5xx, each with its log line;
      - slow past 5 seconds;
      - off with no secret;
      - right after the region gate;
      - before the address's daily limit;
      - pressing again 6 times without using up a photo check, then getting the two Outfits.
    - `consultations.test.ts` checks a signed-in user's "Get my Outfits" never asks Cloudflare.
    - The full Vitest suite and the Guest Page e2e pass. The e2e now goes through the real widget on Turnstile's always-pass test keys.
    - A throwaway Playwright spec, not committed, ran the Guest Page with Turnstile's always-fail test secret. It saw the refusal message twice in a row, so the widget's reset gives the next press a new token.
- 2026-10-30: Choices the ticket left open:
  - **Before the salt check.** "Right after the region gate" is taken literally. On a deployment with no salt, the Guest Page is already closed, so the order there only matters to a direct call.
  - **While the token is awaited, the Styling step says "Checking your photo".** It does this even when Cloudflare wants a click and nothing has been sent yet, with the widget shown under it. This matches sign-up, whose button says "Creating your account…" while it waits. Interactive challenges should be rare.
- 2026-10-30: For later tickets:
  - **07:** the Privacy Policy still says Cloudflare reads the forms "for signing up, signing in and asking for a password reset" (the Purposes list and the Cloudflare recipient). It should add the Guest Page's "Get my Outfits".
