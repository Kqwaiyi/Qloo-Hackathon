# 08: Go live: guest salt in Vercel

**What to build:** Guest mode works on the live site. Someone with access to the Vercel project adds the guest IP salt to Production, redeploys, and checks guest mode end to end there. Without the salt, Production keeps the Guest Page closed (ticket 04).

**Blocked by:** 04 (One Guest Consultation per IP address a day)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) section "Further Notes".

- [x] A long random salt is generated and set in Vercel's Production environment, under the name the example env file documents. It is never committed.
- [x] Production is redeployed with tickets 02–07 merged.
- [ ] On the live site, signed out:
  - **Try it as a Guest** opens the Guest Page;
  - a Guest Consultation makes two Outfits with Previews;
  - a second try from the same connection, in another browser, is refused with when the next one opens.
- [x] The live Privacy Policy shows the Guest section.
- [ ] The hackathon submission mentions that judges can try the live demo as a Guest, with no login.
