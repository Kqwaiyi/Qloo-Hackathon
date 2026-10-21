# A photo may show other people; only its Main Person is styled

A photo with more than one person used to be rejected outright. Now it is accepted when one of them is clearly its Main Person: noticeably closer or larger than everyone else, and in focus. When in doubt, the photo is rejected as having no clear Main Person, because styling the wrong person costs an Outfit and a strange Preview, while a rejection costs only a retake. The photo check model reports whether the Main Person is clear and our code decides, as it does for every other rejection. Everyone else in the photo is stored and sent to Google with it, since the Preview edits the original photo, but they are never styled, read or identified, and the Preview keeps them exactly as they are. The Main Person is named only in the prompts, as "the most prominent person": nothing new is stored about anyone in the photo. This widens [ADR-0005](0005-photos-edited-never-analysed.md), which assumed a photo shows only the user. The user's release can't cover anyone else, so the photo notice asks the user to have the consent of the other people in it, and its version is bumped so existing users see it again.

## Considered Options

- **Keep rejecting every photo with more than one person**: no data about anyone else, but it turns away ordinary photos with strangers in the background.
- **Blur or remove the other people before storing the photo**: keeps no bystanders, but it is heavy, and it fights the Preview's promise to keep the background as it is.
- **Store the Main Person's bounding box and pass it to tailoring and the Preview**: picks out the person more precisely, but adds something new kept from the photo.
- **Crop the photo to the Main Person**: everything downstream sees one person, but it changes the framing, and anyone close by stays in the crop.

## Consequences

- Whether the Main Person is clear is used only to judge the photo, and is never stored. What is stored from the check is unchanged.
- The Privacy Policy and Terms say that other people in a photo are stored and sent with it, never styled, and that the user uploads only photos the others have agreed to.
