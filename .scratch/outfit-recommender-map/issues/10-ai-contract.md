# What do we ask the AI model at each step?

Type: grilling
Status: resolved
Blocked by: 03, 08
Map: [Outfit Recommender](../map.md)

## Question

What exactly does each AI step take in and return?

- **Photo check:** does the photo match the chosen Photo Type? Is there exactly one person? What rejection reasons are shown to the user?
- **Photo Style:** the photo check also returns 1–2 words from a fixed list of Qloo style values ("How does Qloo build and rank Outfits?" proposes edgy, classic, sporty, rugged, glamorous, bohemian, minimalist, preppy, streetwear, chic, casual, elegant). Settle the final list, and what happens when a photo shows no clear style.
- **Piece tailoring:** turning each Brand or Style Icon into a concrete item or haircut suited to the photo (colour, fit, cut), with a one-line "why it suits you". For the Hairstyle, does the model work from the Style Icon's name alone, or also from Qloo's image of them (whose licence isn't stated)? The model chooses the actual Top and Bottom garments, since one clothing Brand can supply both.
- **Preview:** the instruction for one image of the whole Outfit that keeps the person recognisable. A Face Photo changes the hairstyle only.
- **Bad results:** what happens when the model refuses or returns poor output.
- **Shape:** answer each step as one of the three operations of the AI provider interface decided in "What's the architecture?" (check a photo and read its Photo Style, tailor one Outfit's Pieces, render one Preview), and say what the fake adapter returns for each. The photo check runs inside the "Get my Outfits" server action before the photo is stored, so the user waits on it directly.

## Answer

Resolved with the user on 2026-10-15. A Qloo check of the Photo Style words took 42 read-only calls (findings: branch `research/photo-style-vocabulary`, file `.scratch/outfit-recommender-map/research/photo-style-vocabulary.md`). Each step below is one operation of the AI provider interface. A dress, jumpsuit or overalls can now fill Top and Bottom as one **One-Piece** ([ADR-0003](../../../docs/adr/0003-ai-may-merge-top-and-bottom.md)).

**1. Check a photo and read its Photo Style** (Gemini 3.5 Flash-Lite, inside "Get my Outfits", before anything is stored)
- **In:** the photo and the chosen Photo Type.
- **The model only reports what it sees:**
  - how many people;
  - whether the face, hair, upper body, legs and feet are visible, and whether the hair is covered (hijab, turban, cap…);
  - whether the photo is clear enough;
  - whether it is explicit.
- **Our code decides,** with a rule per Photo Type:
  - a Face Photo needs the face and visible hair;
  - a Full-Body Photo needs head to feet, face included; with covered hair its Outfits have no Hairstyle Piece;
  - a Body-Only Photo needs shoulders to feet. A visible face is allowed: it's stored and sent like the rest of the photo, and left unchanged.
  - Feet are required for both body types, because Shoes is a Category.
- **Six rejection reasons:**
  - wrong Photo Type, saying which type it looks like;
  - no person;
  - more than one person;
  - too unclear (blurry, dark, heavily filtered or badly cropped);
  - not appropriate (nudity or explicit content, or Google blocks the photo itself);
  - hair not visible (Face Photos only).
- **No age guessing** from the face. It's unreliable and edges toward biometric processing; the sign-up gate and Google's child filter cover age.
- **Photo Style:** always 1–2 words, strongest first, with no "none". A plain photo reads as casual.
  - The 11 words are casual, classic, elegant, streetwear, preppy, edgy, bohemian, chic, glamorous, sporty and rugged.
  - Minimalist is dropped: it barely changed the Style Icons in either pool tested. Rugged stays: it works strongly for menswear.
  - All 12 proposed words exist as Qloo `personal_style` tags. Qloo silently ignores a word that doesn't, so the list lives in config and one test checks it with a single Qloo tag call (`filter.type=urn:tag` with `filter.results.tags`).

**2. Tailor one Outfit's Pieces** (Gemini 3.5 Flash-Lite, structured output)
- **In:**
  - the photo itself (no stored text description of the person);
  - the Photo Type, the age group and the Photo Style;
  - the Outfit's line: the user's Style Preference, or for a no-preference user the list its Style Icon came from. The model never guesses gender from the photo.
  - the Style Icon's name;
  - for each Piece: its Category, the Brand, the Brand's Qloo category tags and its price range. No Country and no Budget Tier: the Brands already reflect them.
- **Out, per Piece:**
  - `item`: a card label of about 6 words, colour included ("Washed-black relaxed cargo trousers"). For the Hairstyle it's the cut;
  - `details`: one sentence on colour, fabric, fit and cut, used for the Preview and not shown;
  - `why`: one line of about 20 words, in English and second person. It may mention the garment, the Style Icon, the Photo Style, the user's hair and what they're already wearing, never body size or shape, weight, skin colour, ethnicity, gender or age.
- **Rules:** generic items, never product or model names. Never a price; prices come only from Qloo. Only an item the Brand plausibly makes.
- **Top:** one garment, the main visible upper layer.
- **One-Piece:**
  - The model may make an Outfit's Top and Bottom one garment, built on the Top Brand. Only if that Brand plausibly makes one and it fits the line: dresses for womenswear; jumpsuits and overalls for either.
  - The Bottom Brand is then left out but stays reserved for de-duplication.
  - The prompt prefers separates, with no cap. The card shows one "One-Piece" row.
- **Hairstyle:**
  - From the Style Icon's name alone, never Qloo's image of them (no stated licence, and a second real face invites the Preview to drift toward the celebrity).
  - If the model doesn't know the signature cut, it says so (a flag), bases the cut on the Outfit and Photo Style, and `why` doesn't claim it's the Style Icon's. The Style Icon is not skipped.
  - The cut must be achievable from the user's current hair: shorter or restyled, without adding much length or changing the texture. The hair colour stays the user's own.
- **Bad output:** checked against the schema and our rules (expected Categories, no prices, no empty fields), retried once, then "tailoring failed".

**3. Render one Preview** (Nano Banana 2 Lite, pending "Is Nano Banana 2 Lite good enough for Previews?")
- **In:** the photo, the Photo Type and each Piece's `details`. Never the Style Icon's name or image.
- **What changes:** only the Pieces.
- **What stays:**
  - face and identity;
  - body shape and size, with no slimming or beautifying;
  - skin tone, pose and background;
  - framing and aspect ratio (1K output);
  - glasses, jewellery, bags and head coverings. A Preview never removes a head covering.
- **By Photo Type:** a Face Photo changes the hair only. A Body-Only Preview keeps a visible face unchanged and never invents one.
- **Out:** a rendered image, or a refusal with its reason category (a block reason, an image-safety finish reason, or text with no image).
  - A refusal is final: AI SDK `maxRetries: 0`, because a refusal is billed and usually repeats.
  - Transient errors are retried by the Workflow step.
  - Bad-but-not-refused images get no automatic quality check, which would add a paid vision call to every Preview.

**Fake adapter** (the default in local development and tests)
- **Photo check:** passes every photo with Photo Style casual.
- **Tailoring:** deterministic and templated from its inputs. Generic items in the right Categories, a `why` naming the Style Icon, and the Style Icon marked as known.
- **Preview:** the user's own photo with a "Fake Preview" banner, re-encoded to WebP.
- **Scenarios** switch on every other outcome: each rejection reason, covered hair, a One-Piece, an unknown Style Icon, tailoring failure and a Preview refusal. Tests switch them in code; local development uses one environment variable.
- **Delay:** about 1 s per call, adjustable.

**Passed on.**
- "What does the user see when a Consultation step fails?": the six rejection reasons, tailoring failure and Preview refusal.
- "What consent, retention and minimum age do we commit to?": Body-Only photos may contain a face.
- "What limits keep AI and Qloo spend bounded?": whether there's a "regenerate Preview" button.
- "Is Nano Banana 2 Lite good enough for Previews?": test with this Preview instruction.
- **The spec:** add to the hand-kept Style Icon denylist from "How does Qloo build and rank Outfits?".
  - YouTubers that get past the narrow exclusions: KSI, Shane Dawson, Jeffree Star, Colleen Ballinger, Liza Koshy.
  - Sean Combs and 6ix9ine, who appear in men's pools, and Conor McGregor.
  - The odd entity "Rihanna Galliquio".
