# What consent, retention and minimum age do we commit to?

Type: grilling
Status: open
Blocked by: 06
Map: [Outfit Recommender](../map.md)

## Question

Given the rules found in "What privacy and age rules apply to stored face photos?", what do we commit to?

- What the consent screen says, and what the user must agree to.
- The minimum age. The 13+ decided while charting conflicts with Gemini's terms, which forbid apps likely used by under-18s (found by both "Which Google models fit Previews and photo checks?" and the privacy research). Options: gate the app to 18+, or route under-18s to a different AI provider whose terms allow them. Also, how age is checked. If under-18s stay, Outfit assembly keeps its teen age rows and excludes lingerie Brands for them (see "How does Qloo build and rank Outfits?"); otherwise those rules go.
- Illinois and Washington biometric-law handling (notice, release, retention schedule), or whether to treat every user that way.
- Retention and deletion of photos, Previews, Consultations and accounts.
- Any other notices or controls we owe users, including for the Country now collected at sign-up and the Photo Style the AI reads from each photo.
- Verification and reset emails go out through a team Gmail account (decided in "What's the architecture?"), so Google handles users' email addresses.
- A Body-Only Photo may still show the user's face, which is stored and sent to Google like the rest of the photo (decided in "What do we ask the AI model at each step?"). The consent wording can't promise that Body-Only keeps the face out.
