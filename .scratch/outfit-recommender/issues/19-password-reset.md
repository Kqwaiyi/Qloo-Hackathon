# 19: Password reset

**What to build:** A user who forgot their password asks for a reset link by email and gets the same reply whether or not the address has an account, so nobody can probe for accounts. The link lasts an hour, and completing a reset really secures the account: every device is signed out and any other reset links stop working.

**Blocked by:** [18 Email sending and verification](18-email-verification.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Accounts" (Password reset), "Email" (the password reset email; caps), "Pages" (forgot password, reset password) and "User-facing copy" (Sign-in and account). Stories 44–47.

- [x] Sign-in links to a forgot-password page. Submitting any address shows "If an account uses that email, we've sent a link."
- [x] The reset email has the link, says it lasts 1 hour, and says nothing changes if the user didn't ask for it. Resets count towards the cap of 3 per account per day.
- [x] The reset-password page sets a new password of 8–128 characters.
- [x] A completed reset revokes every session, marks the email verified, and cancels the user's other outstanding reset links.
- [x] Tests cover the neutral reply for an unknown address and each reset side effect.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **Asking for a link.** `requestPasswordReset` (`src/server/operations/password-reset.ts`) posts to Better Auth's `/request-password-reset` through `postToAuthEndpoint`, so Better Auth's default limit of 3 a minute per IP applies in production.
  - Every well-formed address gets "If an account uses that email, we've sent a link." (`COPY.resetLinkSent`). Better Auth itself answers an unknown address the same way.
  - `passwordResetEmailSender` (`src/server/auth/emails.ts`) sends the email as `password-reset` through the send function, so the cap of 3 per account per day and the 450 cap apply. A refused email throws `emailRefusalError`, which Better Auth logs and swallows, so a fourth request in a day gets the same reply and no email.
  - The sender builds the link itself: `/api/auth/reset-password/<token>?callbackURL=/reset-password`. Better Auth checks the token, then lands on `/reset-password?token=…`, or `?error=INVALID_TOKEN` when it's expired, used or cancelled.
  - Links last 1 hour (`PASSWORD_RESET_LINK_LIFETIME_SECONDS` in `src/config/accounts.ts`).
- **Completing a reset.** `resetPassword` checks 8–128 characters (`isAllowedPassword`, now shared with sign-up), then posts to `/reset-password`. A refused password leaves the link working.
  - `revokeSessionsOnPasswordReset: true` signs out every session, the device used for the reset included, so the user lands on sign-in with "Your password has been reset. Sign in with your new password."
  - `onPasswordReset` is `passwordResetFinisher` (`src/server/auth/password-reset.ts`). In one transaction it marks the email verified and deletes the user's other `reset-password:` verification rows. It runs for direct Better Auth calls too.
  - **For ticket 20:** a reset sends no "password changed" email, as the spec says. `INVALID_PASSWORD` and `PASSWORD_HINT` in `src/components/messages.ts` are ready for the Settings password field.
  - **For ticket 31:** reset links are verification rows `reset-password:<token>` whose `value` is the user id. Account deletion's token cleanup should remove them too.
  - **For ticket 36:** the Demo Account's password must be refused on the server here too. A `hooks.before` on `/request-password-reset` or `/reset-password` is the place.
- **Pages.** Forgot password moved into the `(auth)` group with a real form. The reset page is `src/app/(auth)/reset-password/`, with `referrer: no-referrer` since the token is in its address. Both are open whether or not the visitor is signed in. Sign-in now links to "Forgot your password?".
- **Small refactors.** `NoticeLine` moved to `src/components/notice.tsx`. Wording shared by several forms moved to `src/components/messages.ts`. `COPY.badVerificationLink` is now `COPY.badLink`, used by both link pages. The success line on New Consultation and sign-in shares `successNotice` in `src/components/ui.ts`.
- **Tests.** `password-reset.test.ts` covers:
  - the neutral reply for an unknown address, through our form and Better Auth directly;
  - the email's link, 1 hour and "nothing changes";
  - the link working just before 1 hour and refused after it;
  - 3 reset emails per account per day, `auth.api` calls included, and emails paused;
  - malformed addresses and the per-IP rate limit;
  - the 8–128 rule;
  - each side effect: every device signed out, the email verified, the other links cancelled while other users' links still work, through our form and a direct call.
- **Checked in the browser.** A throwaway Playwright run against local development covered the whole flow: the sign-in link, the neutral reply for an unknown and a known address, the emailed link, the new password, both earlier devices signed out, signing in verified, and a used link showing "This link has expired or isn't valid" with "Ask for a new link".
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - The forgot-password form now turns the operation's refusal into copy, as the other forms do.
    - The password length rule and the success line are each defined once.
    - The reset side effects, and the knowledge of how Better Auth stores reset links, moved out of the auth config into one module.
    - Import order and test-helper placement were tidied.
  - **Left as known limits:**
    - Better Auth runs `onPasswordReset` after its own transaction. If our step fails, the new password and the sign-outs stand, but the email stays unverified, the other links keep working, and the user sees an error.
    - Cancelling links relies on Better Auth storing reset identifiers in plain text, its default. Setting `verification.storeIdentifier` would break it, and the tests would catch that.
    - A known address waits for the Gmail send and an unknown one doesn't, so response time can hint that an account exists. Sign-up already reveals taken addresses.
    - Two links used at the same moment can both succeed; the last password wins.
    - A request refused by the per-account cap still leaves an unused token, which expires in an hour.
    - Story 46 says "every other device", but the spec's Accounts section and this ticket say every session, so the device used for the reset is signed out too.
  - **For the team to approve:**
    - The checklist says any address shows the neutral reply. Two refusals depart from that: when every email is paused (450 in 24 hours), a reset request says "We can't send emails right now. Please try again tomorrow."; and Better Auth's per-IP limit says "Please wait a moment and try again." Both say the same for every address, so neither reveals accounts.
    - Wording the spec doesn't fix:
      - the forgot and reset page headings and intros, and "Send link", "Reset password" and "Ask for a new link";
      - the sign-in line after a reset;
      - the reset email's sentences, including "Resetting your password signs you out on every device.";
      - "This link has expired or isn't valid", which the spec gives for verification links, reused for reset links.
