# 20: Settings: profile, password and signing out everywhere

**What to build:** A Settings page where users keep their profile right and secure their account. They can change their username, Style Preference and Country, which affect only new Consultations; see their date of birth read-only, with a way to report a mistake; change their password; and sign out of every device. The Privacy section links the policies and says how to ask for a copy of their data.

**Blocked by:** [18 Email sending and verification](18-email-verification.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Pages" (Settings: Profile, Sign-in, Privacy), "Server operations" (Account: update the profile, sign out of all devices), "Accounts" (Sign-up: Updates; Username and password; Password change), "Email" (Password changed) and "User-facing copy" (Sign-in and account). Stories 42, 48–50, 54–56 and 139.

- [ ] Profile: change the username (Better Auth's rules apply, and the old name is freed at once), the Style Preference and the Country. Changes affect only new Consultations, because each Consultation keeps the values it was made with.
- [ ] The date of birth shows read-only as "Born <Month YYYY> · Wrong? Email us", linking to the team's contact address from config. The server refuses changes to the birth fields through `updateUser`.
- [ ] Sign-in section: the email address, a password change that asks for the current password, and "Sign out of all devices", which needs no confirmation.
- [ ] Changing the password signs out the user's other devices and sends the password-changed email, which says to reset the password and contact the team if it wasn't them. This email goes only for changes made in Settings.
- [ ] "Sign out of all devices" ends every sign-in, this one included.
- [ ] Privacy section: links to `/privacy` and `/terms`, and "Email us for a copy of your data".
- [ ] Tests cover profile updates, the refused birth-field update, and the password change's side effects.
