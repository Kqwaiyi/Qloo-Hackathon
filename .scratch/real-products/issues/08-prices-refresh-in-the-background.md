# 08: Prices refresh in the background

**What to build:** A user who reopens a Consultation sees its stored prices at once, and then, without waiting or reloading, any Product not checked today is checked again and its card updates in place. A Product that's no longer sold shows "No longer available", and comes back if a later check finds it again.

**Blocked by:** 03

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Price refresh", "Choosing the offer" (re-applied on every check), "Prices and currencies" (the total), "Pages and copy" (no longer available, the total), and "Testing Decisions" (Seam 1). Stories 31 and 39–45.

- [ ] The Consultation page renders its stored prices at once. When any of its Products wasn't checked today, the page then sends one background request to a route handler, like sign-in renewal, which runs a server operation for that Consultation, for its owner only (the Demo Account's shared visibility applies).
- [ ] The operation checks each such Product through the product search's free check, in the market it was found in, not the user's current Country's. It re-applies the offer rule and stores the new offer, price, currency and date, or marks the Product no longer available when the check finds no offer. A later check can make it available again. A check that errors changes nothing and is tried on the next visit. Older Pieces are never checked.
- [ ] When the request finishes, the page refreshes in place.
- [ ] A Product that's no longer available keeps its name, "why" and place in the Preview; its price and link are replaced by "No longer available". The Outfit's total leaves it out and adds "(leaves out 1 Piece no longer available)".
- [ ] Tests at Seam 1: only Products not checked today are checked; the check uses the market each was found in, after a Country change too; a new offer or price stored with today's date; "no longer available" and back again; an erroring check changing nothing; another user's Consultation refused; older Pieces never checked; the total leaving out an unavailable Product.
