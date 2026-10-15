# 37: Daily sweep

**What to build:** One daily job keeps the retention promises: unverified accounts go after 7 days, inactive accounts are warned and then deleted, and old usage, email-log and Qloo cache rows are purged. The Demo Account is never swept.

**Blocked by:** [36 Demo Account: creation script and managed settings](36-demo-account-managed-settings.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Daily sweep", "Accounts" (Last active), "Email" (the inactivity warning; caps), "Server operations" (Daily sweep), "Backend shape" and "Data model" (Users: last active, inactivity warning sent at). Stories 37, 142 and 144.

- [ ] "Last active" is our own user field, set from session hooks whenever a session is created or refreshed.
- [ ] One daily Vercel cron job calls a route handler that runs one sweep operation, given the current time. The route refuses requests that don't come from Vercel Cron.
- [ ] It deletes unverified accounts 7 days after sign-up.
- [ ] It warns accounts whose last activity was 11 months ago (12 months minus 30 days) and that haven't been warned since, with the inactivity email: the account and its Consultations will be deleted on <date>, 30 days away, unless the user signs in. The 50-a-day cap applies, and the warning time is recorded only when the email was actually sent.
- [ ] It deletes an account 30 days after its warning was actually sent, if there has been no activity since. Activity after a warning clears it.
- [ ] It skips the Demo Account in both account sweeps.
- [ ] Deletions go through the same path as a user's own account deletion.
- [ ] It purges usage records and email-log rows older than 35 days, and Qloo cache entries older than 30 days.
- [ ] Tests cover the warn, delete and skip rules and the purges, using the injectable clock.
