# 06: One Gmail inbox, one account

**What to build:** One real Gmail inbox can hold only one account. A sign-up, or an email change, whose Gmail address reaches the same inbox as an existing account's (ignoring dots and a `+tag`, and treating `googlemail.com` as `gmail.com`) is refused exactly as if the address were already in use. The Demo Account's `+demo` address is left out of the comparison on both sides. Addresses at other providers are unaffected.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › One Gmail inbox, one account", and "Sign-up and password reset refusals" (the `email-taken` mapping). Stories 6, 17, 24 and 36.

Note: 02 and 05 also edit the sign-up hook. Run this ticket one after another with them, not in parallel.

- [x] Addresses at `gmail.com` and `googlemail.com` reduce to one inbox: lower-case, drop everything from the first `+` in the local part, remove dots from the local part, and treat `googlemail.com` as `gmail.com`.
- [x] The existing sign-up hook refuses an address whose inbox matches an existing account's, and sign-up returns the existing `email-taken` refusal.
- [x] The existing email-change hook refuses such a new address the same way it refuses an address already in use, so the other account stays unseen.
- [x] The Demo Account's address is left out of the comparison: it neither blocks nor is blocked by the team's own address or other aliases.
- [x] No schema change: the comparison reduces stored addresses in the query itself.
- [x] Tests at the operation seam and by direct post: dotted, `+tag` and `googlemail.com` variants of an existing account's Gmail are refused at sign-up and at email change, and a different Gmail inbox goes through.
- [x] Tests: non-Gmail addresses with dots or `+` are unaffected, and the Demo Account exemption holds.

**Notes from implementing:**

- The check is `gmailInboxCheck` in `src/server/auth/gmail-inbox.ts`. Postgres reduces both the address sent and every stored address with one SQL expression, so the rule is written once. An address at any other provider reduces to null, which never matches.
  - There's no schema change. Each check scans `user`, which is fine at this scale.
- **Sign-up:** the sign-up hook checks the address last, after the sign-ups-paused cap, since Better Auth only gets to an exact address in use after the hook's other checks. The hook throws Better Auth's own 422 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` (`emailTaken`, now exported from `demo-account.ts`), and the operation maps that to `email-taken`. A direct post gets the same status and body as the exact address.
  - One difference I left as it is: our hook runs before the username plugin's hook and before Better Auth's own body checks. An alias that also has a taken username, or (by direct post) a too-short password, gets `email-taken`, where the exact address would get that other refusal first. That tells a visitor nothing more than the alias refusal itself does.
- **Email change:** the email-change hook checks the address after the Disposable Address check and the cap. A match gets `{ status: true }`, which is what better-auth 1.7 answers for an address in use, with nothing changed or sent. So the form answers as it does for an address in use: it awaits approval, or verification for an unverified user, and at the cap it's `change-limit`.
  - The user's own account is left out of the comparison. Changing to another address at your own Gmail inbox goes ahead (Story 17 is about "another account's inbox").
- **The email-change links:** once another account reaches the new address's inbox, opening either link stops with `INVALID_TOKEN`, as both already did for the exact address. Without this, a change asked for before the inbox had an account could finish into a shared inbox.
- **Demo Account:** its address is never compared as the address sent, and its row is left out of the stored ones. For the tests, `createTestHarness` gained a `teamEmail` option, so the Demo Account's address can be at Gmail.
- **Tests,** in `src/server/operations/gmail-inbox.test.ts`:
  - Sign-up by form, and by direct post against the exact address's own answer. Dotted, `+tag`, `googlemail.com` and mixed-case variants are refused, in both directions between gmail.com and googlemail.com, and nothing is created or sent. A different inbox goes through.
  - Email change by form, for verified and unverified users and at the cap, and by direct post against the exact address's own answer. Nothing is sent or left pending. A different inbox, or another address at the user's own inbox, goes ahead through both links.
  - Both email-change links stop once another account has the inbox.
  - Dots and `+tag`s at example.com and outlook.com are unaffected, at sign-up and at email change.
  - The Demo Account doesn't stop the team's own address, or another address at its inbox, by sign-up or email change. An account at either doesn't stop the team's script from creating the Demo Account.
- Accounts that already share an inbox are untouched (Out of Scope).
- The whole suite passed (689/689) with `npx vitest run --maxWorkers=4`, and `npm run typecheck` is clean. I didn't run e2e: no form or copy changed, and the e2e tests use `example.com`.
