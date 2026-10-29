# 06: Guest data is deleted

**What to build:** Trying the app leaves nothing behind. Once a Guest Consultation is an hour old, it is deleted with its guest user, photo and Previews, as an account's deletion deletes everything. This happens whenever any Guest opens the Guest Page, starts a Guest Consultation or reads one, and the daily sweep catches whatever a quiet day leaves, so deletion always happens within 24 hours. No Consultation is deleted while its Styling is running. A Guest who comes back after the hour is told their Guest Consultation has been deleted. Guest users are never treated as accounts anywhere else. Respect [ADR-0013](../../../docs/adr/0013-guest-consultations-are-kept-briefly-not-never.md).

**Blocked by:** 02 (A Guest gets two Outfits), 04 (One Guest Consultation per IP address a day)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Deletion", and "The throwaway guest user" (exclusions). Stories 39, 47 and 53–56.

- [ ] A guest cleanup deletes every guest user whose Guest Consultation is an hour old or more and has no running Styling, reusing the account deletion. A Styling stuck past the existing stuck threshold counts as not running. The cleanup also purges guest usage older than 24 hours.
- [ ] The cleanup runs in the background of every guest operation (opening the Guest Page, starting and reading a Guest Consultation), so it never slows the request, and in the daily sweep, whose report counts the guest users it deleted.
- [ ] A guest cookie whose guest user is gone is treated as absent and cleared. The Guest Page then says the Guest Consultation was deleted, and shows the New Consultation steps or the used-up message from 04.
- [ ] Guest users are left out of:
  - the inactivity warnings and deletions;
  - the unverified-account deletion;
  - every email;
  - the Gmail-inbox and Disposable Address rules;
  - any user count.
- [ ] Tests at the operation seam, on the test clock:
  - an hour-old Guest Consultation deleted with its photo and Previews (as the existing deletion test checks) when another Guest acts;
  - one whose Styling is running kept until it stops, and a stuck one deleted;
  - the daily sweep deletes leftovers and purges guest usage;
  - the expired cookie is cleared with the deleted message;
  - guest users get no inactivity warning, no unverified deletion and no email.
