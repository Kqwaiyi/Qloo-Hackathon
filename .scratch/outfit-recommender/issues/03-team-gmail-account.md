# 03: Set up the team Gmail account

**What to build:** The throwaway team Gmail account that sends every email the app sends (verification, password reset, email change, notices and inactivity warnings), set up so the app can send over SMTP and sent copies don't pile up.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) sections "Setup and operations" (Team Gmail), "Email" and "Privacy Policy and Terms" (retention: Gmail sent copies are purged daily).

- [x] Create the account early, with 2-Step Verification and an app password.
- [x] Store `GMAIL_USER` and `GMAIL_APP_PASSWORD` only in environment variables (the gitignored `.env.local` and Vercel). The app password stops working whenever the account's password changes.
- [x] Add an Apps Script trigger that runs daily and permanently deletes sent mail older than 1 day, using the Gmail API's delete with the full-mail scope.
- [x] Confirm mail to the account's `+demo` plus-address arrives, since the Demo Account uses it (ticket 36).

## Progress (2026-10-16)

Done: the team ran the wizard on 2026-10-16.

- **Wizard:** `bash scripts/setup-team-gmail.sh` walks through all four boxes in six stages: create the account, turn on 2-Step Verification, create the app password, send a test email over SMTP to the `+demo` address, add the variables to Vercel, and install the purge. It writes `GMAIL_USER` and `GMAIL_APP_PASSWORD` to `.env.local`. It's safe to rerun, for example to make a new app password after the account's password changes.
- **Vercel:** the two variables go on **Production only**, as Sensitive. Preview has no database yet, and a preview with its own database would keep its own email count, so together they could pass Gmail's 500 a day.
- **Purge:** `scripts/gmail-purge/Code.gs` and its `appsscript.json` manifest. `purgeSentMail` lists every `SENT` message from before 24 hours ago, Trash included, and permanently deletes them with the Gmail API's `batchDelete` under the `https://mail.google.com/` scope. `installTrigger` leaves exactly one daily trigger at about 03:00 UTC, so sent copies live at most about two days, which the Privacy Policy's "purged daily" should allow for. It deletes everything in Sent, so the team's own replies from Gmail, such as answers to privacy requests, go too. `scripts/gmail-purge/purge-sent-mail.test.ts` runs the script against a fake Gmail mailbox.
- **SMTP check:** the wizard sends through `smtps://smtp.gmail.com:465` with `curl`, the same sign-in Nodemailer will use in ticket 18. The test email goes from the account to its own `+demo` address, the way the Demo Account's resets will. If it lands only in Sent, the resets will too.
- **Checked:** `.env.local` holds `GMAIL_USER` and a 16-letter `GMAIL_APP_PASSWORD`, and git ignores it. Vercel has both on Production only, as Sensitive, which the API confirms without showing the values. The test email over SMTP went through once the wizard stripped two stray Ctrl+V characters from the address. The team reports that it reached the `+demo` Inbox and that the daily purge trigger is installed; neither can be checked from here.
