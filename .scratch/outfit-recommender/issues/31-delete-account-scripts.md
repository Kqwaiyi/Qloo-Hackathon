# 31: Delete account and the team's account scripts

**What to build:** A user deletes their account, confirmed with their password, which removes every Consultation, photo and Preview at once and tells them what providers keep and for how long. The team can do the same for an emailed request, and can correct a user's birth year and month by hand, deleting the account if the correction shows the user is under 18.

**Blocked by:** [17 My Consultations and deleting a Consultation](17-my-consultations-delete.md), [20 Settings: profile, password and signing out everywhere](20-settings-profile-password.md), [22 Outfit Allowance, photo-check limit and the usage summary](22-outfit-allowance-usage-summary.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Accounts" (Account deletion), "Team scripts", "Pages" (Settings: Danger) and "User-facing copy" (Sign-in and account). Stories 138 and 141. [ADR-0004](../../../docs/adr/0004-adults-only.md).

- [ ] Settings → Danger → "Delete account" opens a modal saying "This deletes your account and every Consultation, with its photos and Previews, right away. Copies in our providers' systems are gone within a day, and Google's abuse-monitoring copy within 55 days. This can't be undone." It asks for the password only: `user.deleteUser.enabled`, without `sendDeleteAccountVerification`.
- [ ] Deleting cancels any running Styling, deletes every Consultation and its Blob objects, strips the user from usage and email-log records, and deletes leftover verification tokens in `afterDelete`.
- [ ] Afterwards the user is signed out and lands on the landing page with "Your account has been deleted."
- [ ] A team script deletes an account by email through the same path, for emailed requests and under-18 reports.
- [ ] A team script corrects a user's birth year and month by hand. If the correction shows the user is under 18, it deletes the account through the same path.
- [ ] Both scripts go through the same code paths as the app.
- [ ] Tests cover account deletion clearing Blob objects, Consultations, verification tokens and usage-record users, and the under-18 correction.
