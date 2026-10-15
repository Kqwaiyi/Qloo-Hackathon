# 03: Set up the team Gmail account

**What to build:** The throwaway team Gmail account that sends every email the app sends (verification, password reset, email change, notices and inactivity warnings), set up so the app can send over SMTP and sent copies don't pile up.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) sections "Setup and operations" (Team Gmail), "Email" and "Privacy Policy and Terms" (retention: Gmail sent copies are purged daily).

- [ ] Create the account early, with 2-Step Verification and an app password.
- [ ] Store `GMAIL_USER` and `GMAIL_APP_PASSWORD` only in environment variables (the gitignored `.env.local` and Vercel). The app password stops working whenever the account's password changes.
- [ ] Add an Apps Script trigger that runs daily and permanently deletes sent mail older than 1 day, using the Gmail API's delete with the full-mail scope.
- [ ] Confirm mail to the account's `+demo` plus-address arrives, since the Demo Account uses it (ticket 36).
