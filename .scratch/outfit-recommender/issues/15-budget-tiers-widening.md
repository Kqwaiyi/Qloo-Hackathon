# 15: Budget Tiers with thin-pool widening

**What to build:** A user sending a Full-Body or Body-Only Photo picks a Budget Tier (No Budget, Low, Medium or Expensive) and gets Outfits whose Brands fit it. When a tier leaves too few Brands, the query quietly widens one step at a time instead of giving up.

**Blocked by:** [14 Body-photo Outfits: Brands become Pieces](14-body-photo-brands.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Outfit assembly" (Age groups' widen-to column; Budget Tier tags and price guard; Thin pools; Config) and "Pages" (Photo & budget step; Results page header). Stories 74, 75 and 81.

- [ ] The Photo & budget step shows the four Budget Tier buttons for a Full-Body or Body-Only Photo, with No Budget selected by default and a note that it can be changed later. A Face Photo shows no picker, and its Consultation has no Budget Tier.
- [ ] The chosen tier is stored as the Consultation's current Budget Tier and shown in the results header.
- [ ] A rejected photo returns to the photo step with the Budget Tier kept, as well as the photo.
- [ ] Brand queries apply the tier's required and excluded `target_income_level` tags, and usable Brands must pass its price guard, exactly as the spec's Budget Tier table sets out: Low (max ≤ $300), Medium (min ≤ $150), Expensive (min ≥ $100); No Budget adds no tags and no guard.
- [ ] Fewer than 10 usable Brands widen quietly, one step at a time:
  1. the next age group, per the age-group table's widen-to column;
  2. drop the `key_market` tag but keep the location signal;
  3. a popularity floor of 0.95;
  4. drop the age tag.
- [ ] The module returns these as an ordered list of query variants. The caller tries them in order, within one Brand fetch, until one gives at least 10 usable Brands or the list ends.
- [ ] The popularity floors and the widening order live in config.
- [ ] Pure tests cover the query parameters for each Budget Tier, the price guard, and the widening order.
