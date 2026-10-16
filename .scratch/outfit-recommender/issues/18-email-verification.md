# 18: Email sending and verification

**What to build:** A new user is signed in straight after sign-up and gets a verification email. Until they verify, a banner says where the link went, that verifying unlocks their first Consultation and when an unverified account is deleted, with ways to resend the link or fix the address. New Consultation shows a "verify your email first" panel instead of the first step, and the server refuses too. The link works for 24 hours, on any device. Every email goes through one send function that keeps the app under Gmail's limits, and sign-ups are limited so a script can't use up the emails real users need.

**Blocked by:** [06 Upload a photo to start a Consultation](06-upload-photo-start-consultation.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Email", "Accounts" (Sign-up: `hooks.before`; Verification; Sessions: rate limits; Email change: unverified users), "Server operations" (Start a Consultation, check 1) and "User-facing copy" (Age and sign-up; Verification), plus "Testing Decisions" (every email cap; browser smoke flow 1). Stories 28–36, 53 and 145.

- [x] One send-email function sends plain-text mail from "Outfit Recommender" through the team Gmail account over SMTP with Nodemailer. It awaits each send and logs it with the kind, the user if any, and the time, never the address. Its transport is injectable: tests use a capturing transport, and local development uses a capturing inbox the browser smoke tests can read.
- [x] Every cap is enforced inside that function, so Better Auth's public endpoints and `auth.api` calls can't get around them: new sign-ups stop at 300 emails sent in 24 hours, app-wide; every send stops at 450 in 24 hours, resets included; per account per day, 5 verification resends, 3 resets and 3 email changes; at most 50 inactivity warnings a day. All numbers live in config.
- [x] The sign-up `hooks.before` refuses new sign-ups at the sign-up email cap with "We can't take new sign-ups right now. Please try again tomorrow."
- [x] Better Auth keeps its rate-limit storage in the database, with a sign-up `customRules` entry of 3 per IP per hour. The client IP comes from `x-forwarded-for`.
- [x] Verification is a soft gate: `requireEmailVerification: false` with `sendOnSignUp: true`; links last 24 hours (`expiresIn: 86400`), with `autoSignInAfterVerification: true`. The user is signed in right after sign-up. There's no welcome email.
- [x] The verification email has the link, says it lasts 24 hours, gives the unverified-account deletion date (7 days after sign-up), and says "Didn't sign up? Ignore this email. The account is removed on <date>."
- [x] An unverified user sees the banner "We sent a link to <email>. Verify it to start your first Consultation. Unverified accounts are deleted on <date>.", with "Resend link" and "Change email".
- [x] "Change email" changes an unverified user's address at once (`updateEmailWithoutVerification`), sends a new link and keeps the 7-day deletion date. An address already in use gets "If that address isn't already in use, we've sent a link to it."
- [x] An unverified user who opens New Consultation sees a "verify your email first" panel instead of the Photo Type step, and Start a Consultation refuses an unverified user as its first check.
- [x] Clicking the link on any device signs the user in there and lands on New Consultation with "Email verified". A link clicked after the email is already verified goes straight into the app.
- [x] An expired or broken link shows "This link has expired or isn't valid", with "Send a new link" when signed in, or "Sign in to get a new one" when not.
- [x] Better Auth's error values are matched case-insensitively, since their case differs between its docs and its code.
- [x] Tests cover every email cap, the soft gate including the server refusal, and the unverified email change.
- [x] The sign-up smoke test from ticket 01 now verifies by link from the capturing inbox.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The send function** is `createEmailSender` in `src/server/email/send-email.ts`. It's built once in `getServices` as `emailSender` and handed to `createAuth`, so every email Better Auth sends goes through it.
  - `send({ kind, userId, to, subject, text })` returns `{ sent: true }` or `{ sent: false, refusal }`, with one refusal per cap:
    - `emails-paused`: 450 emails of any kind;
    - `sign-ups-paused`: 300 emails, for the sign-up `verification` email only;
    - `account-limit`: per account, 5 `verification-resend`, 3 `password-reset` and 3 `email-change`;
    - `warnings-paused`: 50 `inactivity-warning`.
  - `refusalFor(kind, userId)` answers the same question without sending, for checks made before something changes.
  - The kinds and caps live in `src/config/email.ts`. Each cap counts the rolling 24 hours up to the injected clock.
  - The email log (`email_log`: kind, user and time, never the address) is the log the caps count.
    - Each email is logged before it goes, inside a transaction holding an advisory lock, so emails sent side by side can't all pass the same check. If the transport fails, the row is deleted again.
    - A failed send throws an error naming only its kind and the transport's error code, never the address.
    - The row's user is `on delete set null`, which strips a deleted account from the log.
  - **For tickets 19, 20 and 37:** send `password-reset`, `password-changed` and `inactivity-warning` emails through it. Their kinds and caps are already there and tested.
    - Better Auth's `sendResetPassword` should turn a refusal into an error with `emailRefusalError` (`src/server/auth/emails.ts`), the way `verificationEmailSender` does.
    - Ticket 37's purge of email-log rows older than 35 days isn't here.
- **Transports.**
  - On Vercel only: `gmailTransportFromEnvironment` (Nodemailer, `service: "gmail"`). A deployment without `GMAIL_USER` and `GMAIL_APP_PASSWORD` fails each send, not the whole app.
  - Local development always uses `InboxTransport`, which writes each email as JSON to `.data/inbox`, even when `.env.local` holds the Gmail variables.
  - Tests use `CapturingEmailTransport` (`harness.emails`, with `failWith` to make sends fail).
- **Which kind an email is.** Better Auth calls one `sendVerificationEmail` for sign-up, "Resend link" and the unverified email change. `verificationEmailSender` tells them apart by the endpoint that sent it, which a caller can't disguise.
  - A request through the HTTP handler names its endpoint in its URL.
  - An `auth.api` call gets no request from Better Auth, so `trackApiEndpoints` wraps every `auth.api` function to carry its endpoint path in an `AsyncLocalStorage`.
  - The sender also builds the link itself, so the link always lands on `/verify-email`, whatever `callbackURL` the request named.
  - **For ticket 21:** the approval email and the new address's verification email need their own kinds, or one change will use up the 3 `email-change` emails twice as fast. Add `/verify-email` to `VERIFICATION_EMAIL_KINDS`, since that endpoint sends the new address's link after approval.
- **Our forms post to Better Auth's HTTP endpoints.** Better Auth applies its rate limits only to requests through its handler, never to `auth.api` calls. So `signUp`, `resendVerificationEmail` and `changeUnverifiedEmail` go through `postToAuthEndpoint` (`src/server/auth/endpoint.ts`).
  - It forwards the browser's own headers (cookies, origin, `x-forwarded-for`) with a JSON body, and passes cookies back.
  - It upper-cases Better Auth's error codes, which is where the case-insensitive matching now lives. `src/server/auth/errors.ts` is gone.
  - The endpoint paths are `AUTH_ENDPOINTS` in `src/config/routes.ts`. Our own error codes are `AUTH_ERROR_CODES` in `src/server/auth/emails.ts`.
  - Rate limits are kept in the database (`rate_limit`), with the sign-up rule of 3 per IP per hour (`SIGN_UP_RATE_LIMIT`).
    - As with Better Auth's default, they're on in production only. `createTestHarness({ rateLimit: true })` turns them on in a test, and `new TestBrowser({ ip })` sets the browser's address.
    - In production, Better Auth's default rules now also limit our resends (3 a minute) and email changes (3 in 10 seconds).
- **Sign-up** checks the sign-up email cap in its `hooks.before`, after the age check, and refuses with `SIGN_UPS_PAUSED`.
  - The user's `createdAt` now comes from our clock rather than Better Auth's, because the 7-day deletion date counts from it.
  - **For ticket 37:** the rule is `unverifiedAccountDeletionDate` (`src/server/accounts/verification.ts`). The account rules `VERIFICATION_LINK_LIFETIME_SECONDS`, `UNVERIFIED_ACCOUNT_LIFETIME_DAYS` and `SIGN_UP_RATE_LIMIT` are in `src/config/accounts.ts`.
- **Email change.** `user.changeEmail` is enabled with `updateEmailWithoutVerification`.
  - Better Auth changes the address before it sends, and ignores a refusal from the send. So the `/change-email` `before` hook checks the `email-change` cap first, and a refused change keeps the old address.
  - The hook also refuses a verified user's change outright (`EMAIL_CHANGE_NEEDS_APPROVAL`). Without `sendChangeEmailConfirmation`, Better Auth would let one through on the new address's link alone.
  - **For ticket 21:** replace that refusal with the approval flow.
- **The gate.** `startConsultation` refuses `unverified` straight after `signed-out`.
  - The (app) layout shows `VerifyEmailBanner`, and New Consultation shows "Verify your email first" instead of the Photo Type step.
  - Both read `getEmailVerification`, the per-request cache of `readEmailVerification`.
  - The banner writes the deletion date in UTC with `deletionDateText`, as the email does, so the two always agree.
- **The link.** It lands on `/verify-email`, the verification result page.
  - With no `error`, the page redirects to `/consultations/new?email-verified=1`, which says "Email verified".
  - With an `error`, it says "This link has expired or isn't valid", with "Send a new link" when signed in or "Sign in to get a new one" when not. A verified user there goes into the app.
  - The shared pieces are in `src/components/email-verification/`: the server actions, `useResendLink`, `NoticeLine`, and the refusal wording.
- **Tests.**
  - `send-email.test.ts` covers every cap, the log, and a failing transport.
  - `email-verification.test.ts` covers:
    - the email sent at sign-up;
    - the link opened on another device, its 24 hours, and broken or repeated links;
    - resends, and the unverified change, including the neutral reply and the cap;
    - the banner's read, and the sign-up pause, through our form and direct;
    - `auth.api` calls counting as the right kind.
  - `sign-up.test.ts` covers the rate limit, and `consultations.test.ts` covers the server refusal.
  - The test users in the Consultation and Styling tests now verify by their emailed link (`harness.openEmailedLink`).
- **Smoke tests.**
  - `e2e/sign-up.spec.ts` now sees the banner and the panel, then verifies by the link it reads from `.data/inbox` and lands on "Email verified".
  - The other flows use `signUpVerifiedUser`.
  - All five pass, and `next build` bundles Nodemailer.
- **Checked in the browser.** Throwaway Playwright runs against local development covered:
  - Resend link;
  - Change email, after which the banner shows the new address and the same date as the email;
  - a broken link, both signed in and signed out;
  - the link opened in a second browser, and again after verifying.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - `auth.api` calls now count as the right kind of email.
    - The banner tests now go through the read the app uses.
    - The banner and the email give the same date.
    - The resend UI is shared.
    - Endpoint paths, error codes and the context type are each named once.
    - The spec's button labels moved into `COPY`, and no copy states a rate-limit window.
  - **Left as known limits:**
    - Sign-ups racing past the 300 check in the hook at the same moment can each get an account without an email; the send itself still stops at the cap, and those users can resend later. An email change racing past its cap check can change the address without sending. Both are accepted as small overshoots, as the spec accepts for the Outfit caps.
    - A link opened after the email is already verified redirects into the app and shows "Email verified" again. On a device that isn't signed in, it ends at sign-in, because Better Auth creates no session for an already-verified link.
    - Changing to an address already in use gets the neutral reply, but the banner then still shows the old address, which shows it was taken. That's inherent to an immediate change. Sign-up already reveals taken addresses.
  - **For the team to approve:** wording the spec doesn't fix.
    - In `src/components/email-verification/messages.ts`: the resend and change limits, emails paused, "wait a moment", the same and invalid email.
    - "We sent a new link to <email>."
    - The "Verify your email first" panel text.
    - The sign-up rate-limit line.
    - The verification email's own sentences, in `src/server/email/messages.ts`.
