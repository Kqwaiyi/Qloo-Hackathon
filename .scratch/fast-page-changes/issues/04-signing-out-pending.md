# 04: Sign out and Sign out of all devices say "Signing out…"

**What to build:** Clicking Sign out in the header, or "Sign out of all devices" in Settings, shows "Signing out…" and stops accepting clicks until it's done, as every other action button already does. Today both show nothing while they work, so they feel dead and invite a second click.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Pending states". Stories 28, 29, 30 and 33.

- [x] Both buttons read their form's pending status. While pending they are disabled and labelled "Signing out…", in the style of the existing "Signing in…" and "Sending…".
- [x] The new label lives in the shared copy next to "Sign out of all devices".
- [x] The Demo Account's managed "Sign out of all devices" in Settings is unchanged.
- [x] Every other action button's existing pending state is untouched; a check found these two to be the only ones without one.
- [x] No test asserts "Signing out…" on screen: it shows only for a moment. Every existing Playwright spec, unit test and the type check still pass.
