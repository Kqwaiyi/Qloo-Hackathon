# How do the account flows behave?

Type: grilling
Status: resolved
Blocked by: 11
Map: [Outfit Recommender](../map.md)

## Question

"What's the architecture?" picked Better Auth (username plugin) and email sent from a team Gmail account. How do sign-up, email verification, sign-in, password reset, settings and account deletion behave?

- **Verification gate:** charting settled that email is verified by link before the first Consultation. Can an unverified user sign in and look around, with only the Consultation gated, or is sign-in blocked until they verify? How is an expired link resent? Better Auth's default link lifetime is 1 hour. Unverified accounts are deleted 7 days after sign-up (decided in "What consent, retention and minimum age do we commit to?"), so what does the user see about that?
- **Username rules:** length and allowed characters (Better Auth defaults to 3–30, compared case-insensitively), and whether it can be changed later.
- **Age:** how it's entered: a number, or a date of birth that ages with the user. "What consent, retention and minimum age do we commit to?" already set the gate:
  - 18+;
  - self-declared and neutral, with no default and no hint of the cut-off;
  - an under-18 entry creates no account and stores nothing;
  - a cookie blocks retries from that browser for 30 days.

  The format must fit that gate and store no more than the age group Outfit assembly needs, plus what keeps it accurate over time.
- **Sessions:** how long a sign-in lasts (Better Auth defaults to 7 days), and whether a password reset signs the user out everywhere.
- **Settings:** what can be edited (Style Preference, Country, email, username, password), and how a changed email is verified again. Settings also gets "Withdraw photo consent". It deletes every Consultation, keeps the account, and shows the consent sheet again. Country is limited to Gemini's supported regions.
- **Account deletion:** how it's confirmed, and what the user is told is deleted. Better Auth 1.7 offers a password, a session younger than `freshAge` (1 day by default), or an emailed single-use link that also needs a signed-in session. The deletion promise and the provider leftovers are in "What consent, retention and minimum age do we commit to?".
- **Email volume:** Gmail sends at most 500 emails a day. What sign-ups and resets do beyond that. Warnings 30 days before an inactive account's 12-month deletion add to the volume.
  - Accounts are free, so someone could script mass sign-ups to use up the day's sends and block real users' verification.
  - What limit does sign-up get, per IP or app-wide? Better Auth's rate limiter stores its counts in the database.
- **Demo Account** ("What limits keep AI and Qloo spend bounded?"):
  - Password, email, username, account deletion and "Withdraw photo consent" are locked as "Managed by the team".
  - Its email is a plus-address of the team Gmail.
  - How the team creates and verifies it.
  - What the locked settings look like.

## Answer

Resolved with the user on 2026-10-15. It's backed by a source check of Better Auth 1.7.9 and Google's Gmail limits (findings: branch `research/account-flows`, file `.scratch/outfit-recommender-map/research/account-flows.md`). No new glossary terms and no ADR: every choice here is cheap to reverse.

**1. Sign-up.** Two steps.
- **The region check** (from "What consent, retention and minimum age do we commit to?") runs when the sign-up page loads, before step 1.
- **Step 1** asks only "When were you born?": day, month and year, all blank.
  - An under-18 entry stops here, so a child never types an email address. It shows "You need to be 18 or older to use Outfit Recommender.", sets the 30-day cookie and stores nothing.
  - The cookie shows the same message on step 1 for 30 days.
- **Step 2** asks for username, email, password, Style Preference, Country and the "I agree to the Terms and Privacy Policy" box.
  - Style Preference has **no default**: the user must pick one.
  - Country is pre-filled from the browser's locale, as already settled.
  - Username availability is checked as the user types ("That username is taken").
  - A taken email says "An account with that email already exists. Sign in or reset your password." That reveals the email has an account, which we accept.
- **The server checks the date of birth again** on the final submit, in a Better Auth `hooks.before` on `/sign-up/email`. That runs before anything is read or written. A refusal there also sets the cookie.
- Signed-in users who open sign-up or sign-in are sent straight into the app.

**2. Age.**
- The server checks 18+ to the day, then **stores only the birth year and month**. The day is dropped.
- The age group for Outfit assembly is worked out fresh at each Consultation, so it keeps up as the user gets older.
- **Not editable** in Settings. It shows read-only as "Born March 1999 · Wrong? Email us", and the team corrects it by hand. A correction that shows someone is under 18 deletes the account.
- Better Auth makes an `input: true` additional field editable through `updateUser`, so updates must be guarded too.
- **The Demo Account is the exception:** its date of birth is editable in Settings, starting in the 25–29 age group (for example January 2000). The editor refuses any date under 18. Judges share the account, so one judge's change reshapes the next one's Outfits, and we accept that.

**3. Username and password.**
- **Username:** Better Auth's defaults. That's 3–30 characters of letters, digits, `_` and `.`, with uniqueness ignoring case, shown as typed.
  - It can be changed in Settings, and the old name is freed right away.
  - Send `displayUsername` along with `username`, because Better Auth doesn't sync it.
- **Password:** 8–128 characters, with no rules about symbols or digits and no breached-password check (that would add a third party). There's a show/hide toggle.

**4. Email verification: a soft gate.**
- Sign-up signs the user in straight away (`requireEmailVerification: false`, `sendOnSignUp: true`).
- **Only New Consultation is gated.** Its first step is replaced by a "verify your email first" panel, so nobody takes a photo and then gets blocked. Everything else, Settings included, works.
- **Banner:** "We sent a link to a@b.com. Verify it to start your first Consultation. Unverified accounts are deleted on 22 Oct." It offers "Resend link" and "Change email". If Gmail failed at sign-up, Better Auth still created the account without sending anything, and "Resend link" covers that.
- **Links last 24 hours** (`expiresIn: 86400`).
  - They're stateless, so a resend doesn't cancel earlier links.
  - Clicking one on another device signs the user in there too (`autoSignInAfterVerification`) and lands them on New Consultation with "Email verified".
  - A link clicked after the email is already verified goes straight into the app.
- **An expired or broken link** opens a page saying "This link has expired or isn't valid". It offers "Send a new link" to a signed-in user, or "Sign in to get a new one". Better Auth's error values differ in case between its docs and its code, so match them case-insensitively.
- **The verification email** gives the deletion date and says "Didn't sign up? Ignore this email. The account is removed on 22 Oct." No reminder email is sent before the 7-day sweep.

**5. Sign-in and sessions.**
- One "Username or email" field, routed on `@`, plus "Forgot password?".
- **Every failure** gets "That username or email and password don't match."
- **No account lockout**, because a lockout lets anyone lock a stranger out. Better Auth's sign-in rate limit, stored in the database, is the only brake.
- **Sign-ins last 30 days, rolling:** each day of use pushes the expiry out again (`updateAge` 1 day). There's no "remember me" box.
- **"Sign out of all devices"** sits in Settings.
- **Last active.** The inactivity sweep and its 30-day warning use **last active** instead of the last sign-in. It's the last time a session was created or refreshed, kept in our own field set from session hooks, because Better Auth has none.

**6. Password reset.**
- "Forgot password?" asks for an email address only. The reply is always "If an account uses that email, we've sent a link." Links last 1 hour.
- **A completed reset:**
  - signs the user out everywhere (already settled in "What's the architecture?");
  - **marks the email verified**, because the click proves the user has the inbox (Better Auth doesn't do this on its own);
  - **cancels the user's other outstanding reset links** (Better Auth only consumes the one used).
- **Edge case:** if someone else signed up with your email by mistake, you can reset the password, delete that account and sign up fresh. We accept that.

**7. Settings.** Four sections:
- **Profile:** username, Style Preference, Country and the read-only date of birth. These save in place. A changed Style Preference or Country only affects new Consultations.
- **Sign-in:** email, password and "Sign out of all devices".
  - **Changing a verified email:** the old address approves first (`sendChangeEmailConfirmation`), then the new address verifies. The email switches only after both. No password is needed, because the old inbox's approval is the security check, and it doubles as the "your email is changing" notice. Settings shows the pending step. Someone who has lost the old inbox emails the team.
  - **Changing an unverified email** (the typo fix): it switches immediately (`updateEmailWithoutVerification`) and a new link goes to the new address. The 7-day deletion date doesn't move.
  - **An address already in use:** Better Auth quietly does nothing, so the message reads "If that address isn't already in use, we've sent a link to it."
  - **Changing the password** needs the current one, signs out the user's other devices and sends a "Your password was changed" notice.
- **Privacy:** "Withdraw photo consent", links to `/privacy` and `/terms`, and "Email us for a copy of your data".
  - Withdrawing confirms in a modal **without a password**, since the account stays. The modal says every Consultation, photo and Preview goes for good, and that the consent sheet comes back before the next Consultation.
- **Danger:** "Delete account" (section 8).
- "Sign out of all devices" doesn't ask for confirmation.

**8. Account deletion.**
- A modal asks for the **password**. That needs no email, so it works even when the day's sends are used up. Don't configure `sendDeleteAccountVerification`, or Better Auth emails a link every time.
- **The modal says:** "This deletes your account and every Consultation, with its photos and Previews, right away. Copies in our providers' systems are gone within a day, and Google's abuse-monitoring copy within 55 days. This can't be undone."
- A run that's still Styling is cancelled first, the same rule as deleting a single Consultation.
- Afterwards the user is signed out and lands on the landing page with "Your account has been deleted." No email is sent.

**9. Emails and volume.**
- **The emails:**
  - verification;
  - password reset;
  - the two email-change emails (old-address approval, new-address verification);
  - the inactivity warning;
  - "Your password was changed", for a change made in Settings only. After a reset, it would land in the inbox that just did the reset.
- There's no welcome email and no "account deleted" email. Every email is plain text from "Outfit Recommender", and the spec lists what each must say.
- **Gmail's limit:** a free account may send 500 emails a day. Going over blocks sending for 1–24 hours, resets included. Google publishes no separate SMTP limit for consumer accounts.
- **Every cap is enforced inside the one send-email function.** That covers Better Auth's public resend endpoint, which anyone can call with just an email address, and `auth.api` calls, which skip Better Auth's rate limits. The function counts sends over the last 24 hours.
  - **Per IP:** 3 sign-ups an hour, as a Better Auth `customRules` entry. On Vercel the client IP comes from `x-forwarded-for`.
  - **Sign-ups stop app-wide** at 300 emails in 24 hours: "We can't take new sign-ups right now. Please try again tomorrow." Better Auth can't cap app-wide, so this is our own check.
  - **Everything stops at 450**, resets included, so we never trigger Gmail's block.
  - **Per account per day:** 5 verification resends, 3 resets and 3 email changes.
  - **Inactivity warnings:** at most 50 a day. An account is deleted only 30 days after its warning was actually sent.
- **No CAPTCHA.** Cloudflare Turnstile was considered and left out because it adds a third party. A scripted flood can block sign-ups for a day, but never resets.

**10. Demo Account.**
- **Creation:** a one-off script in the repo, run by the team against production. It creates the account through Better Auth's server API:
  - already verified;
  - username `demo`;
  - the team Gmail's `+demo` plus-address as its email;
  - the password from an environment variable, never a file;
  - a date of birth in the 25–29 age group.

  Config names the account by email.
- **Both sweeps skip it.**
- **Locked settings:** password, email, username, "Delete account", "Withdraw photo consent" and "Sign out of all devices" show their values but are disabled, with a lock icon and one line, "Managed by the team".
- **Still editable:** Style Preference, Country and the date of birth.
- **Password resets** reach the team through the plus-address.

**Setup reminders for the spec.**
- Better Auth:
  - `user.changeEmail.enabled` with `sendChangeEmailConfirmation` and `updateEmailWithoutVerification`;
  - `user.deleteUser.enabled` without `sendDeleteAccountVerification`;
  - `emailVerification.expiresIn: 86400` and `autoSignInAfterVerification: true`;
  - `session.expiresIn` 30 days;
  - the sign-up `customRules` entry.
- The team Gmail's app password stops working whenever that account's password changes.
- Run the Demo Account script once, after the production database exists.

**Passed on.**
- **The data model:**
  - users: the birth year and month (not an age), last active (replacing "the last sign-in"), and when the inactivity warning was sent;
  - the email send log behind the 24-hour counts.
- **The spec:**
  - what each email must say, listed as acceptance criteria like the `/privacy` page;
  - the sweeps use last active, skip the Demo Account and delete only 30 days after a sent warning.
