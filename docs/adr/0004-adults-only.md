# Outfit Recommender is for adults only

Charting allowed sign-up from 13, but the Gemini API terms forbid any app "directed towards or is likely to be accessed by individuals under the age of 18", with no parental-consent exception, and the hackathon rules require following each tool's terms. So every user must be 18 or older, everywhere, behind a self-declared, neutral age gate (no default, no hint of the cut-off, nothing stored for an under-18 entry). An account found to belong to an under-18 is deleted with everything in it. This also takes the app out of COPPA, GDPR Article 8 and the UK Children's Code: we prevent access rather than design for children, and this record is the documented reasoning the ICO asks for.

## Considered Options

- **Keep 13–17 on a second AI provider whose terms allow teens**: keeps the teen audience, but needs a second adapter behind the AI seam and the Children's Code's 15 standards. Google's child-image filter also refuses most teen Previews, so the main image model couldn't serve them anyway.

## Consequences

- Outfit assembly loses its teen age rows. The youngest group is Qloo's `24_and_younger`.
- Lowering the age later means another provider and a full children's-privacy review, not a config change.
