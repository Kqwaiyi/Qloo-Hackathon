# Style Recommendations

A webapp where a user submits a photo of themselves and receives age-appropriate, popular hairstyle and outfit recommendations, each shown as an AI-generated image of the user.

## Language

### The user

**Style Preference**:
The menswear / womenswear / no-preference choice a user makes at sign-up (editable later) that steers every Recommendation.
_Avoid_: gender, sex

### Photos

**Photo Type**:
Which of the three kinds of photo a user submits: Face Photo, Full-Body Photo, or Body-Only Photo. It decides which Categories the user receives.
_Avoid_: photo mode, capture mode

**Face Photo**:
A photo of the user's face and hair. Unlocks only the Hairstyle Category.
_Avoid_: selfie, headshot

**Full-Body Photo**:
A photo of the user's whole body, face included. Unlocks all four Categories.

**Body-Only Photo**:
A photo of the user's whole body with the face excluded. Unlocks Top, Bottom and Shoes.
_Avoid_: faceless photo, headless photo

### Consultations

**Consultation**:
One submitted photo together with every Outfit and Preview generated from it; kept in the user's history until the user deletes it.
_Avoid_: session, analysis, scan

**Outfit**:
The unit the app recommends: one coordinated set of Pieces, one per Category the Photo Type unlocks, inspired by a single Style Icon and shown with a single Preview.
_Avoid_: look, recommendation (ambiguous between an Outfit and one of its Pieces)

**Category**:
One of the four slots an Outfit can fill: Hairstyle, Top, Bottom, Shoes.
_Avoid_: upper-body clothing (say Top), lower-body clothing (say Bottom), footwear (say Shoes)

**Piece**:
The part of an Outfit in one Category: a concrete item or haircut built on a Brand (Top, Bottom, Shoes) or a Style Icon (Hairstyle) that Qloo selected.
_Avoid_: item, component

**Brand**:
A fashion brand that Qloo selects as a fit for the user; the basis of every Top, Bottom and Shoes Piece.

**Style Icon**:
A well-known person that Qloo reports as popular with the user's demographic, who inspires an Outfit: their signature haircut becomes its Hairstyle Piece and the Brands their fans favour supply its other Pieces.
_Avoid_: celebrity, influencer

**Preview**:
The AI-generated image of the user wearing a whole Outfit.
_Avoid_: try-on, render, mockup

**Budget Tier**:
The price filter on Outfits: No Budget, Low, Medium or Expensive. Low, Medium and Expensive keep every Piece of an Outfit within that tier; No Budget applies no filter, so one Outfit may mix tiers.
_Avoid_: price range, price level
