# How do the account flows behave?

Type: grilling
Status: open
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
