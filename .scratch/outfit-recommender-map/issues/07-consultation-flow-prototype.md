# Prototype the Consultation flow

Type: prototype
Status: resolved
Map: [Outfit Recommender](../map.md)

## Question

How should a Consultation look and behave, from choosing a Photo Type to browsing Outfits? Build a throwaway UI with fake data (no Qloo or Gemini calls) to react to:

- Photo Type picker; in-browser camera with an outline for the chosen Photo Type, or file upload.
- Budget Tier selector (default No Budget) on the upload screen and on the results page.
- Progress while the photo check, Outfit assembly and Previews run.
- Results: 2 Outfit cards, each with one Preview and its Pieces (Category, item, Brand or Style Icon, price range, "Visit <Brand>" link); "see more" adds 2.
- Consultation history, and deleting a Consultation.

## Answer

Resolved with the user on 2026-10-15. The prototype offered three variants of the whole flow: A "Guided steps", B "Studio" and C "Lookbook". They live on the throwaway branch `prototype/consultation-flow` (commit `f652288`, folder `prototypes/consultation-flow/`, with run instructions in its README). **Variant A, "Guided steps", won as built.**

- **Shape:** a linear wizard with a four-step stepper (Photo Type → Photo & budget → Styling → Outfits) under a top nav with "New Consultation" and "My Consultations".
- **Photo Type step:** three stacked choices, each with an example photo, a one-line hint and the Categories it unlocks. Full-Body Photo is the default.
- **Photo & budget step:** Camera and Upload tabs. The live camera shows a dashed outline for the chosen Photo Type, and Body-Only adds a "keep your face above this line" guide. After capturing, the user can Retake. Budget Tier is four buttons below the photo, default No Budget, with a note that it can be changed on the results. The step ends with Back and "Get my Outfits".
- **Consent:** the one-time consent sheet appears the first time the user presses "Get my Outfits", not when the camera opens. Its wording belongs to "What consent, retention and minimum age do we commit to?".
- **Styling step:** a checklist of Checking your photo → Finding Style Icons → Building Outfits → Generating Previews (n of 2).
- **Results appear all at once, at the end.** The user stays on the checklist until both Previews are ready, then lands on the Outfit list. Nothing streams in.
- **Outfits step:** a header with the photo, Photo Type, date and a Budget Tier dropdown, then a vertical list of Outfit cards. Each card has its Preview beside "Outfit N · Inspired by <Style Icon>", the whole Outfit's price range, and one row per Piece: Category, item, Brand (Style Icon for the Hairstyle), "why it suits you", price range and "Visit <Brand>". "Show 2 more Outfits" sits under the list.
- **The Hairstyle Piece shows no price and no link:** only the haircut, its Style Icon and why it suits.
- **Changing the Budget Tier** on the results sends the user back to the Styling checklist (photo check and Style Icons already ticked) and **replaces** the Outfits. The previous tier's Outfits are thrown away, not kept in the Consultation.
- **History:** "My Consultations" is its own page. Each row shows the photo, Photo Type, Outfit count, date and Budget Tier, with Open and Delete. Delete confirms in a modal that says the photo, Outfits and Previews are gone for good.
- **Unconfirmed reading:** "all at once, at the end" is taken to cover "see more" too, so the 2 extra Outfits appear together once both their Previews are ready. The prototype showed them early as placeholder cards. Settle this when the spec is written if it matters.
