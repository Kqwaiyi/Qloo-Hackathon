# How do the account flows behave?

Type: grilling
Status: open
Blocked by: 11
Map: [Outfit Recommender](../map.md)

## Question

"What's the architecture?" picked Better Auth (username plugin) and email sent from a team Gmail account. How do sign-up, email verification, sign-in, password reset, settings and account deletion behave?

- **Verification gate:** charting settled that email is verified by link before the first Consultation. Can an unverified user sign in and look around, with only the Consultation gated, or is sign-in blocked until they verify? How is an expired link resent? Better Auth's default link lifetime is 1 hour.
- **Username rules:** length and allowed characters (Better Auth defaults to 3–30, compared case-insensitively), and whether it can be changed later.
- **Age:** how it's entered (a number, or a date of birth that ages with the user) and checked, given the minimum age decided in "What consent, retention and minimum age do we commit to?".
- **Sessions:** how long a sign-in lasts (Better Auth defaults to 7 days), and whether a password reset signs the user out everywhere.
- **Settings:** what can be edited (Style Preference, Country, email, username, password), and how a changed email is verified again.
- **Account deletion:** how it's confirmed (password, a recent sign-in, or an emailed link), and what the user is told is deleted.
- **Email volume:** Gmail sends at most 500 emails a day. What sign-ups and resets do beyond that.
