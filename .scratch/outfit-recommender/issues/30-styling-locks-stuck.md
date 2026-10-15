# 30: Styling locks and stuck Stylings

**What to build:** Only one Styling runs at a time per Consultation and per user, so the Outfit Allowance count stays right. A Styling that gets stuck ends on its own after 10 minutes instead of locking its Consultation forever.

**Blocked by:** [17 My Consultations and deleting a Consultation](17-my-consultations-delete.md), [22 Outfit Allowance, photo-check limit and the usage summary](22-outfit-allowance-usage-summary.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Stylings" (Locks; Stuck Stylings; Finishing), "Server operations" (Start a Consultation, check 4; Read: the Styling status) and "Data model" (Stylings: unique constraints). Stories 90 and 127.

- [ ] The database enforces one running Styling per Consultation and one per user, so two simultaneous requests can't both start one. Ticket 38 exempts the Demo Account from the per-user lock.
- [ ] Start a Consultation (as its fourth check) and the shared start check refuse while a Styling is already running, with a plain message; the spec doesn't fix its wording.
- [ ] A Styling whose stage hasn't moved for 10 minutes is finished whenever something reads its status: the poll, My Consultations, or an operation that would start a Styling. It finishes like any other Styling: whatever it made switches in, Previews not ready are marked failed and usage records are written, or it fails if it made nothing. Its Workflow run is cancelled if still alive, and both locks are released. There's no cron job for this.
- [ ] Tests cover both locks and the stuck-Styling check, using the injectable clock.
