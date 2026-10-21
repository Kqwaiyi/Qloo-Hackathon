# 03: Accept photos with a clear Main Person

**What to build:** A photo with more than one person is no longer rejected outright. When one person is clearly its Main Person, the photo passes the check and goes on to its Styling, the same as a one-person photo. When it isn't clear who the Main Person is, the user goes back to the photo step, with their photo kept and nothing stored, and sees: "It's not clear who the main person in this photo is. Retake it or use a different photo." The landing page's photo-check chapter describes the new check. See [the spec](../spec.md) and [ADR-0009](../../../docs/adr/0009-only-the-main-person-is-styled.md).

**Blocked by:** 01 (Tell users about other people in their photos), 02 (Style only the Main Person in tailoring and Previews). These gate the release, not the code: group photos mustn't start passing before the notice tells users about other people, or before Previews dress only the Main Person.

**Status:** ready-for-agent

- [x] The photo check reports, besides how many people it counts, whether there's a clear Main Person. Its prompt defines it:
  - one person is clearly the subject, noticeably closer or larger than everyone else and in focus;
  - two or more of similar prominence (a couple's selfie, friends side by side, a group photo, or two of the same size where one faces away) mean no clear Main Person;
  - when in doubt, no clear Main Person;
  - people in pictures, posters or on screens still don't count.
- [x] The photo check prompt says that everything it reports except "explicit" is about the Main Person, replacing "report on the most prominent one".
- [x] Our code decides. A photo with more than one person and no clear Main Person is rejected as "unclear main person", in the old "more than one person" place in the check order. One with a clear Main Person goes through the rest of the checks on the Main Person alone.
- [x] "Explicit" stays about the whole photo: an explicit group photo is rejected as not appropriate.
- [x] The rejection reason "more than one person" is gone everywhere, replaced by "unclear main person". Its message at the photo step is "It's not clear who the main person in this photo is. Retake it or use a different photo."
- [x] Whether the Main Person is clear is never stored. What is stored from the check is unchanged.
- [x] The fake AI adapter's "more than one person" scenario is renamed "unclear main person" (two people, no clear Main Person). A new "clear main person" scenario (two people, a clear Main Person) passes the check and tailors and draws Previews as "pass" does. Both can be picked in local development.
- [x] Operation tests on "Get my Outfits":
  - the photo-check table's row moves to the new scenario and reason;
  - a clear-Main-Person photo creates its Consultation and queues its Styling;
  - an unclear one stores nothing and counts towards the photo-check limit.
- [x] The landing sample and Demo Account tests that asserted "more than one person" assert "unclear main person" instead.
- [x] A Gemini adapter test checks that the photo check asks whether there's a clear Main Person, and that its report carries the answer.
- [x] The landing page's photo-check chapter reads "One main person" on its chip, and its description asks "Is there one clear main person…". The frozen landing sample isn't remade.
- [x] The original outfit-recommender spec's rejection reason 3 and its "more than one person" copy each carry a note pointing to the Group Photos spec.

## Comments

- 2026-10-22: The photo check now reports `clearMainPerson`, defined in its prompt, and reports everything but "explicit" about the Main Person; "explicit" covers anyone in the photo. Our code rejects a photo with more than one person and no clear Main Person as "unclear main person", in the old "more than one person" place; it isn't stored. The fake adapter has `unclear-main-person` and `clear-main-person` scenarios. The outfit-recommender spec's notes were already in place. Typecheck is clean and all 915 tests pass. Not checked: the landing chapter's new copy by eye in the running app (the dev server here has no Qloo keys), and how reliably real Gemini judges a clear Main Person, which needs a live run on group photos. Older planning issues under `.scratch/outfit-recommender*` still say "more than one person" as history.
