# 25: Photo consent sheet and withdrawing consent

**What to build:** Before a user's first photo is sent, a consent sheet explains in plain English what happens to their photos and asks for two separate agreements: one for storing their photos and having AI process their face and body, and one for sending them to Google's Gemini. Nothing is sent until both are ticked, and the sheet comes back whenever the photo notice changes. In Settings, a user can withdraw consent, which deletes every Consultation but keeps the account.

**Blocked by:** [13 Styling progress checklist](13-styling-checklist.md), [17 My Consultations and deleting a Consultation](17-my-consultations-delete.md), [20 Settings: profile, password and signing out everywhere](20-settings-profile-password.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Consent", "Server operations" (Start a Consultation, check 3; Account: withdraw photo consent), "Pages" (Photo & budget step; Settings: Privacy), "Data model" (Users) and "User-facing copy" (the deletion promise; the withdraw-consent modal; Region and consent), plus "Testing Decisions" (browser smoke flow 2). Stories 57–64. [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md).

- [x] The photo-notice version lives in config. Each user's accepted version and the time they accepted it are stored.
- [x] Pressing "Get my Outfits" opens the consent sheet when the user has never accepted, or accepted an older version.
- [x] The sheet explains in plain English what happens to the photos. It tells the user to upload only photos of themselves, with no nudity, and that a Body-Only Photo can still show their face. It carries the deletion promise, "Your photos and Previews are deleted immediately. Leftover records in our providers' systems are gone within a day, and Google's abuse-monitoring copy within 55 days.", and links to `/privacy` and `/terms`.
- [x] It has two separate unticked boxes: one for storing photos and having AI process the face and body, and one for sending them to Google's Gemini. Continue stays disabled until both are ticked.
- [x] Closing the sheet returns to the photo step with the photo and Budget Tier kept and nothing sent, and shows the quiet line "To get Outfits, agree to both boxes on the consent sheet."
- [x] Start a Consultation, as its third check, refuses without a current acceptance or both ticks, and records the acceptance when the ticks arrive.
- [x] Settings → Privacy → "Withdraw photo consent" opens a confirmation modal, with no password, saying every Consultation, photo and Preview goes for good and that the consent sheet comes back before the next Consultation. Confirming cancels any running Styling, deletes every Consultation with its photos and Previews, and clears the acceptance. The account stays.
- [x] Tests cover consent recording, the sheet re-showing on a new version, the server refusal, and withdrawing consent.
- [x] The New Consultation smoke test from ticket 13 now passes through the consent sheet.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **Config and storage.**
  - `PHOTO_NOTICE_VERSION` (1) is in `src/config/accounts.ts`. Raise it whenever the consent sheet's wording changes, including the `COPY.contentRules` and `COPY.deletionPromise` lines it shows.
  - Migration `0012` adds `accepted_photo_notice_version` and `photo_notice_accepted_at` to the user table, with a check that they're set together.
  - Both are Better Auth additional fields with `input: false`, so `update-user` can't set them. The signed-in user carries them as `photoConsent: { noticeVersion, acceptedAt } | null`.
  - `src/server/accounts/photo-consent.ts` holds `needsPhotoConsent(user)` (the page and the operation both use it), `recordPhotoConsent`, `clearPhotoConsent` and `photoConsentStands`.
- **Start a Consultation.**
  - It takes `consent: { storeAndProcess, sendToGemini }`. Both ticked records the acceptance, whatever was on record before. Otherwise the user must already have agreed to the current version, or it refuses with `{ refusal: "photo-consent-needed" }`. One tick alone records nothing.
  - **Order of checks.** Ticket 24 offered two options; this takes neither. `startConsultation` runs the region gate itself, then consent, then `checkStylingStart`, which runs the region gate again at no cost. The spec's order holds: verified, region, consent, the limits, the photo-check limit, the file. `checkStylingStart` stays the one check for every other start.
  - The acceptance is recorded when the ticks arrive, even if a later check refuses or the photo is rejected. So the one-tap Photo Type switch needs no second sheet.
  - **Withdrawing mid-flight.** The transaction that creates the Consultation checks again that consent stands, holding the user's row (`for share`).
    - A withdrawal from another tab while the photo is checked makes it refuse with `photo-consent-needed` and delete the stored photo.
    - A withdrawal that starts during that transaction waits for it, then deletes the new Consultation with the rest.
- **Withdrawing consent** (`withdrawPhotoConsent` in `src/server/operations/account.ts`) clears the acceptance first, then deletes each of the user's Consultations.
  - Clearing first means no new Consultation can start meanwhile.
  - It can be run again to finish if a Blob delete fails.
  - The account and its sessions stay.
- **Shared deletion.** `deleteConsultation`'s body moved to `deleteConsultationOf(ctx, { userId, consultationId })` in `src/server/consultations/deletion.ts`. It stops any running Styling, then deletes the rows and the Blob folder together, and checks no sign-in. **For ticket 31:** account deletion can call it per Consultation, as withdrawal does.
- **UI.**
  - **The consent sheet** (`consultations/new/consent-sheet.tsx`) is a modal `<dialog>`. Focus starts on its title so the notice is read first, and the boxes are unticked each time it opens.
    - "Not now" or Escape close it, and the quiet line shows under the allowance line. The photo and Budget Tier stay.
    - The `/privacy` and `/terms` links open in a new tab, so the photo waiting on the step isn't lost.
  - **"Get my Outfits"** opens the sheet when the page said consent is needed, or when the server refuses with `photo-consent-needed` (a withdrawal or a new version since the page loaded). Ticket 23's refresh guard leaves that refusal out of `LimitRefusal`, and it has its own branch.
  - **Settings → Privacy** has "Withdraw photo consent". It confirms in a modal with no password, then says it's done through `NoticeLine`.
  - **`ConfirmDialog`** (`src/components/confirm-dialog.tsx`) is the confirmation modal, now shared by Delete on My Consultations and the withdrawal. **For ticket 31:** the account-deletion modal can use it too, with the password field in its body.
- **For ticket 38.**
  - The sheet's line "Only you can open them" isn't true on the Demo Account. Its shared-account note should go there.
  - Its per-Consultation consent needs `photoConsentStands` and the check in `startConsultation` to read the Consultation's own acceptance instead.
- **For ticket 36:** the Demo Account's withdrawal still needs refusing on the server, and the button shown as "Managed by the team".
- **Tests.**
  - `src/server/operations/photo-consent.test.ts` covers:
    - the refusal with no ticks, with one tick and with neither, storing nothing;
    - recording the version and time;
    - the sheet showing for a new user and not after agreeing;
    - asking again after a version change;
    - keeping the acceptance through a rejected photo;
    - the order against the region gate and the limits;
    - withdrawing: deleting everything and keeping the account, the sheet coming back, a running Styling cancelled, other users untouched, a signed-out visitor refused, and a withdrawal while the photo is checked leaving nothing behind.
  - The other suites pass `BOTH_CONSENT_BOXES_TICKED` from `src/test/harness.ts` when they start a Consultation.
  - **Smoke tests.** `e2e/new-consultation.spec.ts` closes the sheet once, checking the quiet line, the photo and the Budget Tier. It then shows Continue waiting for both boxes before going on. The other two flows that start a Consultation agree through `agreeOnConsentSheet` in `e2e/support.ts`, and the photo-check flow's switch shows that no second sheet appears.
- **Checked in the browser.** A throwaway Playwright run against local development showed:
  - the sheet at desktop and phone width, with no sideways scroll;
  - focus returning to "Get my Outfits" on Escape;
  - the withdrawal emptying My Consultations;
  - the sheet coming back afterwards.
- **Restart `npm run dev`:** PGlite applies migration `0012` only at start-up.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - A withdrawal racing a "Get my Outfits" could leave a Consultation behind. Now it can't, with a test.
    - The sheet now says what the check keeps (ADR-0005).
    - The notice version moved to the account config.
    - The shared deletion was renamed, and the start check's comment fixed.
    - The two modals share `ConfirmDialog`, and the withdrawal reports through `NoticeLine`.
    - The sheet's two boxes are one `ConsentBox`.
    - The copy lines that are part of the notice say to raise the version.
    - An inaccurate client comment was fixed.
  - **Left as known limits:**
    - `LimitRefusal` is still an `Exclude<…>` list, so each new refusal that isn't a limit must be added to it. That's ticket 23's guard working as meant.
    - The client sends the two ticks as one "agreed" flag, as literal form fields, as the other fields of that form are.
    - "Photo notice" and "photo consent" aren't in `GLOSSARY.md` yet. That's for `/domain-modeling`.
  - **For the team to approve:**
    - the sheet's wording;
    - the withdrawal's order (clear first, then delete);
    - recording the acceptance even when a later check refuses.
