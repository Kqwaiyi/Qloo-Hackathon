# 38: Demo Account: unlimited Consultations with per-Consultation consent

**What to build:** Judges can try the app freely on the Demo Account: no usage limits, and one judge's Styling never blocks another's. Each judge gives their own consent before every Consultation, and the consent sheet and My Consultations tell them plainly that anyone with this login can see the Consultations made there.

**Blocked by:** [23 App-wide caps and the Qloo backstop](23-app-wide-caps-qloo-backstop.md), [30 Styling locks and stuck Stylings](30-styling-locks-stuck.md), [36 Demo Account: creation script and managed settings](36-demo-account-managed-settings.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Demo Account" (Exemptions; Still applies), "Consent" (The Demo Account), "Outfit Allowance, limits and backstops" (The Demo Account), "Stylings" (How many Outfits; Locks) and "User-facing copy" (Demo Account). Stories 130–132 and 135.

- [x] The Demo Account is exempt from the Outfit Allowance, the photo-check limit, the app-wide caps and the Qloo backstop. No usage records are written for it, so its Outfits don't count towards the app-wide caps, and its Stylings always make up to 2 Outfits.
- [x] It has no per-user Styling lock, so two judges can style different Consultations at the same time. The per-Consultation lock still applies.
- [x] The consent sheet appears before every Consultation on it, and the acceptance (version and time) is stored on that Consultation instead of on the user.
- [x] The consent sheet and My Consultations show "Shared demo account: anyone with this login can see Consultations made here. Delete yours when you're done."
- [x] The photo check, the region gate and 18+ on its date of birth still apply.
- [x] Tests cover the Demo Account's exemptions, per-Consultation consent, and two simultaneous Stylings on different Consultations.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **Exemptions, in one place each.**
  - **The shared start check.** `checkStylingStart` (`src/server/stylings/start.ts`) runs the region gate and the stuck check for the Demo Account as for anyone. Then it returns `{ ok: true, outfitsWanted: OUTFITS_PER_STYLING }`, skipping the user's lock, the Outfit Allowance, both app-wide caps and the Qloo backstop. So every operation that starts a Styling, and the usage summary, treat it alike.
  - **The photo-check limit.** `startConsultation` skips it for the Demo Account and records no photo check.
  - **Usage records.** Migration `0015_demo_account_consultations` adds `styling.on_demo_account`, which `createStyling` sets from `user.isDemoAccount` (a required field of `NewStyling`). `finishStyling` writes no usage records for a Styling that has it. The Demo Account writes no usage record of either kind, so its Outfits never count towards the app-wide caps.
- **The locks.** The same migration rebuilds `styling_running_per_user_unique` as `where status = 'running' and not on_demo_account`. Ticket 30 suggested a nullable copy of the user ID; a flag on the Styling does the same job and also tells `finishStyling` to skip the usage records. The per-Consultation index is unchanged, and so is `startStylingOn`'s check on the Consultation's row.
  - **Migration:** it drops and rebuilds the per-user index in one transaction. Existing Stylings get `false`. A Demo Account Styling still running when it lands would write usage records when it finishes. That's harmless, since the Demo Account's records count against nothing it does.
- **Per-Consultation consent.**
  - `needsPhotoConsent` is always true for the Demo Account, so New Consultation always opens the sheet first.
  - `startConsultation` needs both ticks on every Demo Account request. It records nothing on the user, and skips `photoConsentStands`: the agreement came with this request, and the Demo Account can't withdraw. The same migration adds `consultation.accepted_photo_notice_version` and `photo_notice_accepted_at`, with a check that they're set together. They hold the version and the time the ticks arrived, and stay null for everyone else.
  - **The one-tap Photo Type switch** still needs no second sheet. On the Demo Account the page keeps the judge's agreement, given on that page, and sends both ticks with each later photo from it. A Consultation then moves the page on, and a fresh page asks again. So the sheet comes before every Consultation, as the spec says, and a rejected photo, which makes none, doesn't ask twice.
- **The usage summary.** `outfitsLeft` is `null` on the Demo Account, which has no Outfit Allowance, so `AllowanceLine` and New Consultation show no allowance line.
  - `readUsageSummary` now runs the shared start check before reading the allowance, so the Outfits of a stuck Styling it finishes count in what's left. Before, they counted only in `outfitsWanted`.
- **UI.**
  - **The shared note:** `COPY.sharedDemoAccount` (the spec's line), shown by `SharedDemoAccountNote` (`src/components/shared-demo-account-note.tsx`). It sits at the top of the consent sheet, and under the heading of My Consultations.
  - **The consent sheet** takes `isDemoAccount`. Its first point, on the Demo Account, says the photo is kept until that Consultation or the account is deleted, and that anyone signed in to the account can open it, in place of "Only you can open them".
  - **My Consultations** says "Every photo submitted on this account" on the Demo Account.
  - **`PHOTO_NOTICE_VERSION`** stays at 1. Nobody else's wording changed, and the Demo Account sees the sheet every time anyway. Its comment now says the Demo Account's lines are part of the notice too.
- **Tests.** `src/server/operations/demo-account-consultations.test.ts` covers:
  - **Each limit not applying:**
    - the 24-hour cap, the monthly cap and the Qloo backstop, each one stopping another user while the Demo Account's summary shows no allowance and its Styling makes 2 Outfits;
    - 2 Outfits when the 24-hour cap would leave 1, with none of them counting towards it;
    - 6 Stylings in a day, past the 10-Outfit allowance;
    - 21 photo checks, past the photo-check limit, with no usage record of either kind written.
  - **What still holds:** the region gate, on the summary, "Get my Outfits" and "Show 2 more Outfits", and the photo check, which stores nothing for a rejected photo.
  - **Consent:**
    - refused without both ticks, or with one, even after a judge agreed earlier, with no photo check and nothing stored;
    - each Consultation keeping its own version and time;
    - the account itself keeping none.
  - **Locks:**
    - a judge starting a Consultation while another's Styling runs, both finishing;
    - "Show 2 more Outfits" and a Photo Style change on two Consultations at once, both starting;
    - one Styling at a time on each Consultation, also when two judges press at once.
  - **Checked against the code:** with the Demo Account's early return removed from the shared start check, 7 of them fail, the lock tests included, since the database index then refuses too.
  - **Other test files:** `consultations.test.ts` and `stylings.test.ts` compare whole rows, so they now include the new columns.
- **Checked in the browser.** I used a throwaway PGlite and a dev server on it, with the fake AI, signed in to a Demo Account the creation script made. It showed:
  - no allowance line beside "Get my Outfits";
  - the consent sheet with the shared note, and its first point reworded;
  - a rejected photo (the `no-person` cookie scenario), after which "Get my Outfits" opened the sheet again (that was before the one-tap change above);
  - My Consultations with the note, and no sideways scroll at phone width.

  A second run, to check the switch after the change, accepted the photo: the cookie scenario didn't take. The Styling ran until I stopped the server. It used **5 live Qloo calls** (Qloo then reported 9,506 left). It confirmed on real rows that the Consultation kept the consent version and time, the Styling had `on_demo_account`, the user kept no consent, and no usage records were written. The one-tap switch itself is checked by typecheck only. The Consultation's photo is left in local development's `.data/blob/consultations/97e7310d-c027-4994-b0b3-5f27eac722b3/`.
- **Restart `npm run dev`:** PGlite applies migration `0015` only at start-up.
- **The smoke tests weren't run.** Their New Consultation flow makes a Styling, and in local development Qloo is live.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - On the Demo Account, the one-tap Photo Type switch first opened the sheet again (strictly "every photo sent"). It now keeps the agreement given on the page, as described above.
    - The caps and the backstop were tested only together, and only through the summary. Now each has its own test, through a real Styling.
    - One name for the flag in the UI, `isDemoAccount`, as on the signed-in user.
    - The consent sheet's two versions of its first point, and My Consultations' two subtitles, no longer repeat their shared words.
    - The lock index's comment and `NewStyling.onDemoAccount`'s doc now say what they do.
  - **Left as known limits:**
    - The Demo Account checks sit where each limit is enforced: the shared start check, the photo-check limit and `finishStyling`. They aren't gathered behind one "counts usage" seam.
    - The Consultation's consent columns repeat the user's pair.
    - As after ticket 30, dropping the per-Consultation index fails no test. `startStylingOn`'s row lock stops a second Styling first, and a new Consultation can't clash.
    - The stored version doesn't say whether a judge saw the Demo Account's wording, since both share `PHOTO_NOTICE_VERSION`.
  - **For the team to approve:**
    - no allowance line at all on the Demo Account;
    - the consent sheet's reworded first point there, and the note's place at the top;
    - My Consultations' subtitle there;
    - one agreement on the page covering every photo sent from it until a Consultation is made;
    - the usage summary's new order.
