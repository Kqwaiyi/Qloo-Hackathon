# Group Photos

Status: ready-for-agent

Every decision here comes from the grilling in this conversation. Use the vocabulary in [GLOSSARY.md](../../GLOSSARY.md), especially the new **Main Person**, along with **Photo Type**, **Consultation**, **Outfit**, **Preview** and **Photo Style**. Respect [ADR-0009](../../docs/adr/0009-only-the-main-person-is-styled.md), which this spec carries out, and [ADR-0005](../../docs/adr/0005-photos-edited-never-analysed.md), which it widens.

## Problem Statement

When a user sends a photo with more than one person in it, the photo check rejects it: "There's more than one person here. Use a photo of just you." That includes a lot of ordinary photos where the user is plainly the subject: a street photo with strangers walking behind, a holiday photo with a friend half out of frame, or a mirror selfie with someone in the background. The user has to go and find, or take, a different photo even though it's obvious who the app should style. It's friction at the very first step, and some users give up there.

## Solution

A photo with more than one person is accepted when one of them is clearly its **Main Person**: noticeably closer or larger than everyone else, and in focus. The app styles only the Main Person. Their Outfits are tailored to them, and each Preview dresses only them, leaving everyone else in the photo exactly as they are.

When it isn't clear who the Main Person is (a couple's selfie, two friends side by side, a group photo), the photo is rejected with: "It's not clear who the main person in this photo is. Retake it or use a different photo." When in doubt, the photo check treats the Main Person as unclear.

Other people in the photo are stored and sent to Google with it, but are never styled, read or identified. The photo notice says so and asks the user to make sure they have the consent of everyone else in the photo. The notice's version is raised, so every user, existing users included, sees the consent sheet again before their next Consultation. The Privacy Policy and Terms say the same.

## User Stories

1. As a user, I want to send a photo where I'm clearly the subject even though strangers are in the background, so that I don't have to find a photo with nobody else in it.
2. As a user, I want to send a photo with a friend partly out of frame beside me, so that a good photo of me isn't wasted because someone else is in it.
3. As a user sending a photo with other people in it, I want the app to work out which person is me, the Main Person, without my pointing at them, so that sending a photo stays one step.
4. As a user sending a couple's selfie or a group photo, I want to be told it isn't clear who the main person is, so that I know to retake it or pick another photo rather than get Outfits for the wrong person.
5. As a user whose photo is rejected for having no clear Main Person, I want the message "It's not clear who the main person in this photo is. Retake it or use a different photo.", so that I know exactly what to fix.
6. As a user whose photo is rejected for having no clear Main Person, I want to go back to the photo step with my photo and Photo Type kept, as with every other rejection, so that I can change it without starting again.
7. As a user whose photo is rejected for having no clear Main Person, I want nothing stored and no Consultation created, as with every other rejection, so that a rejected photo leaves nothing behind.
8. As a user sending a photo where it's borderline who the main person is, I want the app to reject it rather than guess, so that I never get Outfits and Previews of someone else.
9. As a user with a clear Main Person among others, I want the photo check to judge whether the Photo Type fits from me alone, so that someone else's feet in the frame don't make my Face Photo look like a Full-Body Photo.
10. As a user with a clear Main Person among others, I want "too unclear" judged on me alone, so that a blurry background person doesn't get my sharp photo rejected.
11. As a user with a clear Main Person among others, I want my Photo Style read from what I'm wearing, not from what the others wear, so that my Style Icons fit me.
12. As a user with a clear Main Person among others, I want "hair covered" and "hair visible" judged on my hair alone, so that my Hairstyle Piece depends on me.
13. As a user whose group photo shows nudity or sexual content anywhere, even on someone else, I want it rejected as not appropriate, so that the app never stores or edits such a photo.
14. As a user with a clear Main Person among others, I want each Outfit's Pieces tailored to me, so that colours are matched to what I'm wearing and not to someone beside me.
15. As a user with a clear Main Person among others, I want each Preview to dress only me, so that I see myself in the Outfit.
16. As a user with a clear Main Person among others, I want everyone else in my Preview left exactly as they were, so that the Preview stays true to my photo and nobody else is changed.
17. As a person who appears in someone else's photo, I want never to be styled, read or identified, so that being in the background of someone's photo doesn't make me part of their Consultation.
18. As a user, I want the consent sheet to tell me that anyone else in my photo is stored and sent to Google with it, but only the main person is styled, so that I know what happens to them before I send a group photo.
19. As a user, I want the consent sheet to ask me to make sure I have the consent of everyone else in my photo, so that I know it's my responsibility before I share a photo of them.
20. As an existing user who agreed to the old photo notice, I want to see the consent sheet again before my next Consultation, so that I agree to what now happens to other people in my photos.
21. As a user, I want the Privacy Policy to explain what happens to other people in my photos (stored and sent with the photo, never styled, read or identified, and deleted with the Consultation), so that I can check it before I use the app.
22. As a user, I want the Terms to say I only upload photos that the other people in them are fine with, so that my side of the agreement is clear.
23. As a visitor reading the landing page, I want its photo-check chapter to say the check looks for one clear main person, so that it describes what the app really does.
24. As the team using the Demo Account, I want group photos to behave the same way, so that judges see the same behaviour as every user.
25. As the team making a landing sample, I want a photo with no clear Main Person rejected with that same reason, styling nothing, so that the sample pipeline behaves like a real Consultation.
26. As a developer, I want a fake AI scenario with two people and no clear Main Person, so that I can reach the new rejection locally and in tests.
27. As a developer, I want a fake AI scenario with two people and a clear Main Person, so that I can see a group photo accepted locally and in tests.
28. As a user whose photo is rejected for having no clear Main Person, I want it to count towards the photo-check limit like every other rejection, so that the limit stays a limit.

## Implementation Decisions

- **The photo check report gains one field.** Besides how many people it counts, the model reports a yes/no on whether there's a clear Main Person. It's the photo check's only new output. Everything else the report holds (what is visible, whether the hair is covered, whether the photo is clear enough, the Photo Style) is about the Main Person. "Explicit" stays about the whole photo.
- **The model reports and our code decides,** as for every other rejection. The judgement is in our code: a photo with more than one person and no clear Main Person is rejected. A photo with more than one person and a clear Main Person goes on through the rest of the checks, exactly as a one-person photo does.
- **The rejection reason is renamed** from "more than one person" to "unclear main person", in the same place in the check order. In full, the order is: not appropriate (explicit, or blocked by Google); no person; unclear main person; too unclear; wrong Photo Type; hair not visible; any other rule failure as too unclear.
- **The rejection copy** is "It's not clear who the main person in this photo is. Retake it or use a different photo." It replaces "There's more than one person here. Use a photo of just you."
- **What counts as a clear Main Person,** as the photo check prompt says it: one person is clearly the photo's subject, noticeably closer or larger than everyone else and in focus, while the others are in the background, much smaller, blurred or partly cut off. Two or more people of similar prominence (a couple's selfie, friends side by side, a group photo, or two people of the same size where one faces away) mean no clear Main Person. When in doubt, no clear Main Person. With one person in the photo, the Main Person is clear; with nobody, it isn't. As today, people in pictures, posters or on screens don't count.
- **The photo check prompt** says that everything it reports except "explicit" is about the Main Person. This replaces today's "When there is more than one person, report on the most prominent one."
- **Tailoring and the Preview name the Main Person only in their prompts,** as "the most prominent person in the photo". Nothing is passed to them that picks the person out in any other way: no bounding box, no description, no crop.
- **The Preview instruction's keep list** gains "every other person in the photo, exactly as they are", next to the background, pose and lighting.
- **Nothing new is stored.** Whether the Main Person is clear is used only to judge the photo. What is stored from the check is unchanged: the Photo Style, what is visible, and whether the hair is covered. The photo itself is stored whole, other people included, because the Preview edits the original.
- **The photo notice** gains one line: "If anyone else is in your photo, it's stored and sent to Google with it, but only the main person is styled. Please make sure you have the consent of everyone else in it." No new tick box: the two existing boxes stay as they are.
- **The photo notice version is raised by one,** so every user, existing users included, sees the consent sheet again before their next Consultation. The existing mechanism handles this: a recorded agreement to an older version no longer stands.
- **The Privacy Policy** gains a short paragraph on other people in a photo: they're stored and sent to Google with it, never styled, read or identified, nothing about them is kept from the check, and they're deleted with the Consultation.
- **The Terms** gain one line in the photos section: you only upload photos that the other people in them are fine with.
- **The landing page's photo-check chapter** changes its wording only: the check chip reads "One main person", and the description asks "Is there one clear main person…". The frozen landing sample isn't remade.
- **The fake AI adapter's scenarios:** "more than one person" is renamed "unclear main person" (two people, no clear Main Person), and a new "clear main person" scenario (two people, a clear Main Person) passes the check and tailors and draws Previews as the pass scenario does. Both can be picked through the existing environment variable in local development.
- **The original outfit-recommender spec** gets a note on its rejection reason 3 and on its "more than one person" copy, pointing to this spec.

## Testing Decisions

- A good test drives the app through a seam a caller uses and checks what comes out: the operation's result, what is stored, and what was sent to the AI provider. It never reaches into the judging function or the prompt builders directly.
- **The "Get my Outfits" operation, on the fake AI adapter,** is the main seam. The existing photo-check table of rejections gets its "two people" row renamed to the unclear-main-person scenario and reason. New cases:
  - a photo with a clear Main Person among others is accepted, creating its Consultation and queueing its Styling as a one-person photo does;
  - a photo with no clear Main Person is rejected and stores nothing: no blob, no Consultation;
  - the rejection still counts towards the photo-check limit.
  Prior art: the "the photo check" table and the "stores nothing" assertions in the consultations operation tests.
- **The landing sample and the Demo Account** already have tests that assert the "more than one person" rejection. They move to the new scenario and reason. Prior art: the "says why when the photo check rejects the photo" landing test, and the Demo Account Consultations test.
- **The Gemini adapter, against a fake fetch,** is the seam for the prompts:
  - the photo check asks for whether there's a clear Main Person, and its report carries the model's answer;
  - the tailoring request and the Preview instruction name "the most prominent person";
  - the Preview instruction keeps every other person exactly as they are.
  Prior art: the existing Gemini tests that read the request's text, such as the one that tells the model to take only the garment from each Product photo, and the "reports what Gemini saw" photo check test.
- **The photo notice version bump** needs no new test. The existing photo consent test, which checks that the sheet comes back once the notice changes, already covers it.
- **Copy on the consent sheet, Privacy Policy, Terms and landing page** isn't tested automatically. The repo has no component tests. Check it by eye in the running app.

## Out of Scope

- Letting the user point at, tap or pick which person in the photo is them.
- Blurring, removing or cropping out the other people in a photo.
- Storing a bounding box, or any position or description, of the Main Person or anyone else.
- Checking that the Main Person is really the user: as before, the photo is never used to identify anyone.
- A separate consent from, or notice to, the other people in a photo, beyond asking the user to have their consent.
- Remaking the frozen landing sample.
- Any change to Outfits, Previews or Consultations made before this change.

## Further Notes

- ADR-0009 records why the other options (keep rejecting group photos, blur or remove the others, store a bounding box, crop to the Main Person) were turned down.
- The photo notice version bump means every active user meets the consent sheet once more after this ships. That's deliberate: the notice now covers other people's data.
- Naming the Main Person only in the prompt relies on the Preview model picking the same person the photo check did. "When in doubt, no clear Main Person" keeps the photos that get through to cases where that choice is obvious.
