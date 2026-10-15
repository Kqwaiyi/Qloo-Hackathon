# 32: Privacy Policy and Terms pages

**What to build:** Public `/privacy` and `/terms` pages that tell users, in plain English, everything the spec requires, including a Photos section with the retention and destruction schedule. Sign-up links to them now; the consent sheet, landing page and footer link to them in their own tickets.

**Blocked by:** [01 Walking skeleton: sign up, sign in and the app shell](01-walking-skeleton.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Privacy Policy and Terms (acceptance criteria; the implementation issue writes the text)" and "User-facing copy" (the deletion promise). Stories 136, 137 and 139. [ADR-0004](../../../docs/adr/0004-adults-only.md), [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md).

**Decided while slicing:** the team members' names stay a clearly marked placeholder for now; ticket 39 fills them in.

- [ ] `/privacy` discloses all 16 items in the spec's list:
  1. who we are: "the Outfit Recommender team", with the members named, and the team Gmail as the single contact for privacy requests and complaints;
  2. the GDPR Article 27(2) exemption from appointing an EU representative, with the reasoning;
  3. what we collect, exactly as the spec lists it;
  4. the purposes, and the legal basis for each;
  5. the recipients, including exactly what Qloo gets (the age group, the gender signal, the Country, Photo Style tags and entity IDs);
  6. international transfers and their safeguards;
  7. the retention list, item by item;
  8. the rights, with access and export by email answered within a month, self-serve deletion, and emailed deletions done within 30 days;
  9. the right to withdraw consent, and how;
  10. the right to complain to a supervisory authority, and our own email complaints route, answered within 30 days;
  11. that a photo is required to get Outfits;
  12. that recommendations are automated, including the Photo Style the AI reads, with no legal or similarly significant effect;
  13. the 18+ rule, and that an account found to belong to someone under 18 is deleted;
  14. the Photos section (next criterion);
  15. that Previews are AI-generated and labelled so;
  16. the content rules: only photos of yourself, which you have the rights to, and no nudity or intimate images.
- [ ] The Photos section has the biometric notice (AI processes face and body only to edit the image); no face templates, no age guessing and no sensitive inferences; the release; that photos are redrawn in the browser, which drops location metadata; and the public retention and destruction schedule with the deletion promise, worded exactly as in "User-facing copy".
- [ ] `/terms` states the 18+ rule, the content rules, and that this is a free hackathon project with no affiliation with Style Icons or Brands.
- [ ] Both pages are public and need no sign-in.
- [ ] The contact address comes from config, and the team members' names are a clearly marked placeholder.
