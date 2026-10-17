# 24: Region gate

**What to build:** Outfit Recommender only works where Gemini does. Someone whose request comes from an unsupported country is told the app isn't available where they are: at sign-up before they fill anything in, and on the Photo Type step. They can still sign in, read and delete their Consultations.

**Blocked by:** [22 Outfit Allowance, photo-check limit and the usage summary](22-outfit-allowance-usage-summary.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Region gate", "Accounts" (Sign-up: `hooks.before`), "Server operations" (Start a Consultation, check 2; the other operations that start a Styling) and "User-facing copy" (Region and consent). Stories 27 and 129.

- [x] The `x-vercel-ip-country` header is checked against the Country list when the sign-up page loads and again on submit (in the sign-up `hooks.before`), when New Consultation opens, and by every operation that starts a Styling, through the shared start check. A missing header counts as allowed, which covers local development.
- [x] The message is "Outfit Recommender isn't available where you are right now." It mentions neither the Country setting nor VPNs.
- [x] At sign-up it shows before any field is filled in. On New Consultation it shows on the Photo Type step through the usage summary, and the results actions that start Stylings are disabled.
- [x] Sign-in, reading and deleting are never region-checked.
- [x] Tests cover the gate at sign-up, in Start a Consultation and in the shared start check, and a missing header.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The gate.** `isFromSupportedRegion(requestHeaders)` in `src/server/region-gate.ts` reads `x-vercel-ip-country` and looks it up in the Country list (`findCountry`).
  - A missing or empty header is allowed, which covers local development.
  - A code not on the list is refused, and that includes any code Vercel might send for an unknown place.
  - It judges the request's IP country, never the user's own Country setting.
- **Sign-up.**
  - **On page load:** a new read, `readSignUpGate` (`src/server/operations/sign-up.ts`), returns `under-18` or `unsupported-region`. Pages read it through `getSignUpGate`, which replaces `isSignUpBlockedByAgeGate`.
    - The page then shows `SignUpClosed` (formerly `AgeGateMessage`) in place of step 1, before any field is filled in.
  - **On submit:** the sign-up `hooks.before` checks, in the spec's order:
    - 18+ (the blocked cookie first);
    - then the region, refused with 403 and the code `UNSUPPORTED_REGION`;
    - then the sign-up email cap.

    An `auth.api` call without request headers, such as a team script, skips the region check. `signUp` turns the code into `{ refusal: "unsupported-region" }`, and the flow replaces the form with the message, as the age gate does.
  - Step 1's date-of-birth check isn't region-checked, since the spec names only the page load and the submit.
- **The shared start check.** `checkStylingStart` now takes `requestHeaders`. It returns `{ refusal: "unsupported-region" }` first, before reading the database.
  - It returns early rather than joining the `inForce` list ticket 23 describes, because it never lifts at a time.
  - Start a Consultation's order is now:
    1. verified;
    2. region;
    3. the limits;
    4. the photo-check limit;
    5. the file.
  - **For ticket 25:** consent is check 3, between the region and the limits, but both sit inside `checkStylingStart`. Ticket 25 has two options:
    - pull the region check out of `checkStylingStart`, so `startConsultation` can run it before consent and the other start operations run it themselves;
    - accept consent after the limits. In practice, the Photo Type panel already stops anyone at a limit before the consent sheet could show.
  - **For ticket 30:** the locks (check 4) can go after the region check inside `checkStylingStart` without trouble.
  - **For tickets 26–29:** every operation that starts a Styling must call `checkStylingStart` with the request's headers, which the region gate needs. The summary's `stylingStart` already carries `unsupported-region`, so the results actions disable themselves with `<LimitMessage>` as ticket 22 describes. None exist yet, so that part of "the results actions that start Stylings are disabled" waits for them.
- **UI.**
  - **Copy.** `COPY.unsupportedRegion` holds the spec's line word for word.
  - **`LimitMessage`.** It words the refusal. It now has an explicit `: string` return type. Without it, `noImplicitReturns` being off meant a missing case did not fail typecheck, despite ticket 22's note. Now it does.
  - **New Consultation.** It shows the message on the Photo Type step through the usage summary's panel, with its line about My Consultations. "Get my Outfits" refreshes into that panel if the region changes after the page loads. An unverified user still sees the verify panel first, as in the spec's order of checks.
  - **The sign-up page's "Already have an account? Sign in" link** stays under the region message, since signing in is never region-checked. Under the age gate it stays hidden, as before.
- **Tests.**
  - `src/server/operations/region-gate.test.ts` covers:
    - **sign-up:** the page-load read, our `signUp`, a direct call to Better Auth's endpoint, and the age check coming first;
    - **Start a Consultation:** refusing before the photo check and storing nothing;
    - **the shared start check, through the usage summary:** coming before every limit, and after verification;
    - **a missing header and an allowed country:** both letting sign-up, the summary and "Get my Outfits" through;
    - **from an unsupported country:** sign-in, My Consultations, reading, the Styling status and deleting all still working.
  - `TestBrowser` takes an `ipCountry`, which a test may change to move the browser.
- **Checked in the browser.** A throwaway Playwright run against local development set the header with `setExtraHTTPHeaders`. It showed:
  - the sign-up page with only the message, and its sign-in link working;
  - a sign-up submitted after the header changed, which replaced the form with the message;
  - the under-18 page still hiding the sign-in link;
  - the New Consultation panel, with no sideways scroll at phone width.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - The gate's comment no longer calls the request's IP country a "Country".
    - `TestBrowser.country` became `ipCountry`.
    - Long lines were wrapped.
  - **Left as known limits:**
    - `LimitRefusal` and `LimitMessage` now carry a refusal that isn't a limit. The spec lists the region under "Where limits show", so the names stay.
    - The age-then-region order is written in both `readSignUpGate` and the hook.
    - `UNSUPPORTED_REGION` is a literal in two files, following `UNDER_18`.
    - The harness spells out the header name.
    - "Region gate" isn't in `GLOSSARY.md` yet. That's for `/domain-modeling`.
  - **For the team to approve:**
    - the sign-in link under the region message;
    - a header-less `auth.api` sign-up skipping the region check;
    - an unverified user seeing the verify panel rather than the region message.
