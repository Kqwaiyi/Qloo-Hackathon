# 19: Password reset

**What to build:** A user who forgot their password asks for a reset link by email and gets the same reply whether or not the address has an account, so nobody can probe for accounts. The link lasts an hour, and completing a reset really secures the account: every device is signed out and any other reset links stop working.

**Blocked by:** [18 Email sending and verification](18-email-verification.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Accounts" (Password reset), "Email" (the password reset email; caps), "Pages" (forgot password, reset password) and "User-facing copy" (Sign-in and account). Stories 44–47.

- [ ] Sign-in links to a forgot-password page. Submitting any address shows "If an account uses that email, we've sent a link."
- [ ] The reset email has the link, says it lasts 1 hour, and says nothing changes if the user didn't ask for it. Resets count towards the cap of 3 per account per day.
- [ ] The reset-password page sets a new password of 8–128 characters.
- [ ] A completed reset revokes every session, marks the email verified, and cancels the user's other outstanding reset links.
- [ ] Tests cover the neutral reply for an unknown address and each reset side effect.
