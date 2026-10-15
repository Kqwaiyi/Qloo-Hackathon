# Photos are edited, never analysed for identity or sensitive traits

Under GDPR a face photo is ordinary personal data until it is processed to identify someone, or used to infer special-category traits such as ethnicity, religion or health. Then it needs explicit consent and much heavier care. So a photo is only ever used to check it, read its Photo Style, tailor Pieces and render a Preview. We build no face templates or embeddings, never guess age, and never infer or store ethnicity, skin tone, body measurements, health, or what covers someone's hair (only whether it is covered). The only things kept from a photo are the photo, its Photo Style, what is visible in it, and whether the hair is covered. Because Illinois and Washington law may still treat AI editing as collecting face geometry, every user also gives a written release and gets a public retention and destruction schedule.

## Considered Options

- **Analyse skin tone or body shape for better colour and fit advice**: common in style apps and more personal, but it turns photos into special-category data under GDPR and adds risk under biometric laws.
- **Release for Illinois and Washington users only**: less friction elsewhere, but needs a US state field and a second consent path.

## Consequences

- The photo check's head-covering answer is a yes/no, even though its prompt names hijabs and turbans as examples.
- Tailoring may still use the photo to match colours, but its output never describes the user's body, skin or ethnicity, and nothing of that kind is stored.
