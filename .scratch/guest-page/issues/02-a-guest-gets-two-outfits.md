# 02: A Guest gets two Outfits

**What to build:** The tracer bullet. A signed-out visitor presses **Try it as a Guest** on the landing page and lands on the **Guest Page**: the Qurator wordmark tagged "Guest", a **Create an account** button on the right, and nothing else in the header. They go through the same New Consultation steps as a signed-in user. On the Budget Tier step they also give their birth date, Style Preference and Country. "Get my Outfits" opens the consent sheet, which for a Guest also asks them to agree to the Terms and Privacy Policy. Their **Guest Consultation**'s Styling then runs exactly as anyone's does, and they see two Outfits with Previews. Refreshing within the hour brings them back to it. This lays everything later tickets reuse: the guest user, the guest cookie, the Guest Page layout and the guest variants of the New Consultation and results components. Respect [ADR-0013](../../../docs/adr/0013-guest-consultations-are-kept-briefly-not-never.md) (throwaway guest user), [ADR-0004](../../../docs/adr/0004-adults-only.md) (age gate) and [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md) (photo consent).

**Blocked by:** 01 (Operations accept a Guest as well as a signed-in user)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The throwaway guest user", "Who the Guest is: the guest cookie", "Starting a Guest Consultation" (except the Bot Check and the IP limits), "Pages and routes", and "Testing Decisions". Stories 1–23, 27–30, 36–38, 45–46, 50–52 and 58.

- [ ] The landing header's "Get started" becomes **Try it as a Guest**, linking to the Guest Page, on every screen width, for signed-out visitors only. "Sign in" / "Open the app" and the closing chapter's "Create a free account" are unchanged.
- [ ] The Guest Page has its own route group and layout, outside the signed-in app layout. It never redirects to sign-in. Its tab title is "Guest Page · Qurator", and its header has the wordmark with a "Guest" tag and **Create an account** (to sign-up) only.
- [ ] The guest user is a user row marked as a guest. It has a placeholder email and username at a reserved, never-mailed domain, and no password or session. It holds the Guest's Style Preference, Country and age, as a profile does. It's created only when "Get my Outfits" is accepted.
- [ ] A start Guest Consultation operation reuses the existing photo check, Photo Type, Budget Tier, Consultation and first-Styling creation. Its input adds birth date, Style Preference, Country, the consent ticks and the Terms agreement. It refuses on the region gate, the age gate (storing nothing for an under-18 entry), missing consent or Terms, and the app-wide caps and backstops.
- [ ] Photo consent and the Terms agreement are recorded on the Consultation, through the per-Consultation notice fields the Demo Account uses.
- [ ] The guest cookie is signed, HTTP-only and valid for 1 hour, and holds the guest user's id. The viewer resolution from 01 accepts it, for that Guest's own Guest Consultation only.
- [ ] Opening the Guest Page with a valid guest cookie shows that Guest Consultation, running or finished. Without one, it shows the New Consultation steps.
- [ ] On the Budget Tier step, the guest variant adds the birth-date fields (the sign-up component: no default, no hint of the cut-off), Style Preference and Country. Country is pre-filled from the IP country when it's on the Country list. Missing fields are named under "Get my Outfits".
- [ ] The consent sheet's guest variant opens every time and adds the Terms and Privacy tick. The line under "Get my Outfits" says it uses the Guest's one Guest Consultation.
- [ ] The guest's Stylist runs with everyone's Styling limits, and its Outfits are recorded as usage, so they count toward the app-wide caps.
- [ ] New strings live in the copy config.
- [ ] Tests at the operation seam through the harness:
  - accepted with every field;
  - each missing field, consent or Terms refused;
  - under-18 refused with nothing stored;
  - region gate and app-wide caps refused;
  - the Styling runs to two Outfits readable with the guest cookie, and not from another browser;
  - Guest Outfits counted toward the app-wide caps.
- [ ] Playwright happy path: **Try it as a Guest** from the landing page; the Guest Page header has only the wordmark, "Guest" tag and **Create an account**; a Guest Consultation with the fake AI shows two Outfits.
