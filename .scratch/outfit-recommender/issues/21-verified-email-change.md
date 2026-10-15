# 21: Verified email change

**What to build:** A user with a verified email changes it safely: their old address approves the change first, then the new address verifies it, so someone holding only their sign-in can't take the account over. Settings shows which step is pending.

**Blocked by:** [20 Settings: profile, password and signing out everywhere](20-settings-profile-password.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Accounts" (Email change), "Email" (Email-change approval; Email-change verification; caps), "Pages" (Settings: Sign-in) and "User-facing copy" (Sign-in and account). Stories 51 and 52.

- [ ] `user.changeEmail.enabled` with `sendChangeEmailConfirmation`: the old address gets the approval email, saying a change to the new address was requested, with the approve link and a line to contact the team if it wasn't them. It doubles as the "your email is changing" notice. After approval, the new address gets the verify link.
- [ ] Settings shows which step of an email change is pending.
- [ ] An address already in use gets the neutral reply "If that address isn't already in use, we've sent a link to it."
- [ ] Email changes count towards the cap of 3 per account per day.
- [ ] An unverified user changing their email in Settings gets the immediate change from ticket 18.
- [ ] Tests cover the verified path end to end, including the neutral reply.
