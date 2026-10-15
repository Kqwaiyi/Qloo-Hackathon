# 36: Demo Account: creation script and managed settings

**What to build:** The single shared Demo Account the judges use. A team script creates it the same way every time. Its sign-in details, and anything that could lock other judges out, are managed by the team: Settings shows them with a lock and "Managed by the team", and the server refuses them too. Judges can still change its date of birth (18 or over), Style Preference and Country to see how Outfits change.

**Blocked by:** [21 Verified email change](21-verified-email-change.md), [25 Photo consent sheet and withdrawing consent](25-photo-consent.md), [31 Delete account and the team's account scripts](31-delete-account-scripts.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Demo Account", "Accounts" (Sign-up: Updates; The Demo Account), "Server operations" (Account: change the Demo Account's date of birth), "Pages" (Settings) and "User-facing copy" (Sign-in and account). Stories 133, 134 and 149.

- [ ] Config names the Demo Account by email.
- [ ] A team script creates it against production through Better Auth's server API: already verified, username `demo`, the team Gmail's `+demo` plus-address as its email (so resets reach the team), the password from an environment variable and never a file, and a date of birth in the 25–29 age group, for example January 2000.
- [ ] Its password change, email change, username change, account deletion, consent withdrawal and "Sign out of all devices" show their values disabled, with a lock icon and "Managed by the team", and the server refuses each of them, including through Better Auth's own endpoints.
- [ ] Its date of birth, Style Preference and Country stay editable, and its date of birth must stay 18 or over.
- [ ] Tests cover each locked operation being refused on the server, and the date-of-birth change including the 18+ rule.
