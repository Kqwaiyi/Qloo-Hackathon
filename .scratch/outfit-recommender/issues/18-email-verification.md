# 18: Email sending and verification

**What to build:** A new user is signed in straight after sign-up and gets a verification email. Until they verify, a banner says where the link went, that verifying unlocks their first Consultation and when an unverified account is deleted, with ways to resend the link or fix the address. New Consultation shows a "verify your email first" panel instead of the first step, and the server refuses too. The link works for 24 hours, on any device. Every email goes through one send function that keeps the app under Gmail's limits, and sign-ups are limited so a script can't use up the emails real users need.

**Blocked by:** [06 Upload a photo to start a Consultation](06-upload-photo-start-consultation.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Email", "Accounts" (Sign-up: `hooks.before`; Verification; Sessions: rate limits; Email change: unverified users), "Server operations" (Start a Consultation, check 1) and "User-facing copy" (Age and sign-up; Verification), plus "Testing Decisions" (every email cap; browser smoke flow 1). Stories 28–36, 53 and 145.

- [ ] One send-email function sends plain-text mail from "Outfit Recommender" through the team Gmail account over SMTP with Nodemailer. It awaits each send and logs it with the kind, the user if any, and the time, never the address. Its transport is injectable: tests use a capturing transport, and local development uses a capturing inbox the browser smoke tests can read.
- [ ] Every cap is enforced inside that function, so Better Auth's public endpoints and `auth.api` calls can't get around them: new sign-ups stop at 300 emails sent in 24 hours, app-wide; every send stops at 450 in 24 hours, resets included; per account per day, 5 verification resends, 3 resets and 3 email changes; at most 50 inactivity warnings a day. All numbers live in config.
- [ ] The sign-up `hooks.before` refuses new sign-ups at the sign-up email cap with "We can't take new sign-ups right now. Please try again tomorrow."
- [ ] Better Auth keeps its rate-limit storage in the database, with a sign-up `customRules` entry of 3 per IP per hour. The client IP comes from `x-forwarded-for`.
- [ ] Verification is a soft gate: `requireEmailVerification: false` with `sendOnSignUp: true`; links last 24 hours (`expiresIn: 86400`), with `autoSignInAfterVerification: true`. The user is signed in right after sign-up. There's no welcome email.
- [ ] The verification email has the link, says it lasts 24 hours, gives the unverified-account deletion date (7 days after sign-up), and says "Didn't sign up? Ignore this email. The account is removed on <date>."
- [ ] An unverified user sees the banner "We sent a link to <email>. Verify it to start your first Consultation. Unverified accounts are deleted on <date>.", with "Resend link" and "Change email".
- [ ] "Change email" changes an unverified user's address at once (`updateEmailWithoutVerification`), sends a new link and keeps the 7-day deletion date. An address already in use gets "If that address isn't already in use, we've sent a link to it."
- [ ] An unverified user who opens New Consultation sees a "verify your email first" panel instead of the Photo Type step, and Start a Consultation refuses an unverified user as its first check.
- [ ] Clicking the link on any device signs the user in there and lands on New Consultation with "Email verified". A link clicked after the email is already verified goes straight into the app.
- [ ] An expired or broken link shows "This link has expired or isn't valid", with "Send a new link" when signed in, or "Sign in to get a new one" when not.
- [ ] Better Auth's error values are matched case-insensitively, since their case differs between its docs and its code.
- [ ] Tests cover every email cap, the soft gate including the server refusal, and the unverified email change.
- [ ] The sign-up smoke test from ticket 01 now verifies by link from the capturing inbox.
