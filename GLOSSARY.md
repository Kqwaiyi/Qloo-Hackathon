# Style Recommendations

A webapp where a user submits a photo of themselves and receives age-appropriate, popular hairstyle and outfit recommendations, each shown as an AI-generated image of the user.

## Language

### The user

**Style Preference**:
The menswear / womenswear / no-preference choice a user makes at sign-up (editable later) that steers every Recommendation.
_Avoid_: gender, sex

**Country**:
The country a user gives at sign-up (editable later); their Style Icons and Brands lean towards what is popular with people there, wherever those people or Brands come from.
_Avoid_: market, region, location, nationality

**Bot Check**:
The check a visitor passes before signing up, signing in or asking for a password reset, so that scripted bots can't make accounts that use up the app-wide Outfit caps or the team's emails. When the check itself can't be reached, the step goes ahead without it.
_Avoid_: captcha, human verification, challenge

**Disposable Address**:
An email address at a throwaway-inbox service. No account may sign up with one or change to one; accounts that already have one keep it.
_Avoid_: temp mail, burner email, fake email

### Photos

**Photo Type**:
Which of the three kinds of photo a user submits: Face Photo, Full-Body Photo, or Body-Only Photo. Together with whether the user's hair is visible, it decides which Categories the user receives.
_Avoid_: photo mode, capture mode

**Face Photo**:
A photo of the user's face and hair. Unlocks only the Hairstyle Category, so the hair must be visible, not covered.
_Avoid_: selfie, headshot

**Full-Body Photo**:
A photo of the user's whole body, head to feet, face included. Unlocks all four Categories, or only Top, Bottom and Shoes when the hair is covered (a hijab, turban, cap…).

**Body-Only Photo**:
A photo of the user's body from the shoulders to the feet, meant to leave the face out. Unlocks Top, Bottom and Shoes; a face that does appear is allowed and left unchanged.
_Avoid_: faceless photo, headless photo

**Photo Style**:
The one or two style words (edgy, classic, sporty…) the AI reads from a Consultation's photo, which the user may change, and which steer which Style Icons Qloo picks.
_Avoid_: vibe, aesthetic, personal style (too close to Style Preference)

### Consultations

**Consultation**:
One submitted photo together with every Outfit and Preview generated from it; kept in the user's history until the user deletes it.
_Avoid_: session, analysis, scan

**Outfit**:
The unit the app recommends: one coordinated set of Pieces, one per Category the Photo Type unlocks (a One-Piece covers Top and Bottom together), inspired by a single Style Icon and shown with a single Preview, or none when the image model declines to make one.
_Avoid_: look, recommendation (ambiguous between an Outfit and one of its Pieces)

**Category**:
One of the four slots an Outfit can fill: Hairstyle, Top, Bottom, Shoes.
_Avoid_: upper-body clothing (say Top), lower-body clothing (say Bottom), footwear (say Shoes)

**Piece**:
The part of an Outfit in one Category (or in both Top and Bottom, for a One-Piece): a concrete item or haircut built on a Brand (Top, Bottom, Shoes) or a Style Icon (Hairstyle) that Qloo selected.
_Avoid_: item, component

**One-Piece**:
A Piece that fills both the Top and Bottom Categories with a single garment, such as a dress, jumpsuit or overalls, built on the Outfit's Top Brand.
_Avoid_: dress (only one kind), full outfit

**Brand**:
A fashion brand that Qloo links to an Outfit's Style Icon, within the user's Budget Tier and Country; the basis of every Top, Bottom and Shoes Piece.

**Style Icon**:
A well-known person that Qloo picks as popular with the user's demographic and Country and in tune with their Photo Style, who inspires an Outfit: their signature haircut inspires its Hairstyle Piece and the Brands their fans favour supply its other Pieces.
_Avoid_: celebrity, influencer

**Preview**:
The AI-generated image of the user wearing a whole Outfit.
_Avoid_: try-on, render, mockup

**Budget Tier**:
The price filter on Outfits: No Budget, Low, Medium or Expensive. Low, Medium and Expensive keep every Piece of an Outfit within that tier; No Budget applies no filter, so one Outfit may mix tiers. A Face Photo Consultation has no Budget Tier, since a Hairstyle has no price.
_Avoid_: price range, price level

**Styling**:
One pass that builds Outfits for a Consultation: its first, a "see more", or a change of Budget Tier or Photo Style. It fails only when it makes no Outfit; otherwise it keeps whatever Outfits it made.
_Avoid_: run, job, generation

**Outfit Allowance**:
How many Outfits a user may have made in any 24 hours. An Outfit counts once it is shown to the user, with or without its Preview, whichever Styling made it, and even if it is later replaced or deleted. The Demo Account has none.
_Avoid_: credits, quota, tokens

**Demo Account**:
The single shared account the team gives the judges privately and also tests with. No usage limit applies to it, it skips the Bot Check at sign-in, anyone with its login sees every Consultation made on it, and it asks for photo consent before every Consultation instead of once.
_Avoid_: test account, admin account, judge account
