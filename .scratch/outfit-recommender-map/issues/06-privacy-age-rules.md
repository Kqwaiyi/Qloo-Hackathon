# What privacy and age rules apply to stored face photos?

Type: research
Status: resolved
Map: [Outfit Recommender](../map.md)

## Question

We store users' face and body photos, send them to Google's AI for Previews, and allow sign-up from age 13. What do the primary sources require? (A summary of the sources, not legal advice.)

1. **Gemini API terms:** any developer age requirement, and any restriction on apps directed to or likely used by under-18s. This could reopen the 13+ minimum age decided while charting.
2. **Qloo hackathon terms:** anything on user data or demographics we send.
3. **Children and teens:** COPPA (US, under 13), GDPR Article 8 age of digital consent by country (13 to 16), UK Age Appropriate Design Code.
4. **Face photos:** when GDPR and laws such as Illinois BIPA treat face images as biometric or special-category data, and whether that applies when we only edit images rather than identify people.
5. **Obligations:** what a consent screen must disclose (storage, sharing with Google, retention, deletion), and what deletion requests require.

## Answer

A summary of primary sources, not legal advice.

- **Gemini requires an 18+ app.** The Gemini API Additional Terms (effective 2026-03-23) say developers "must be 18 years of age or older" and must not use the Services in an app "directed towards or is likely to be accessed by individuals under the age of 18". There is no parental-consent exception, so the 13+ plan conflicts with them.
  - Use the **paid tier** for all users. The free tier says not to send personal information, may use inputs for training and human review, and can't serve EEA, Swiss or UK users.
  - On the paid tier, Google is our processor and keeps prompts and outputs for 55 days.
  - Some countries (e.g. China, Hong Kong, Russia) are not served at all.
- **Qloo:** its terms bar under-18s, but that clause binds us as API users, not our end users. Send only anonymous demographic signals, because Qloo gets a permanent licence to what we send. Its youngest age bucket is `24_and_younger` anyway.
- **Biometric data:**
  - **EU/UK:** a photo is special-category data only after technical processing for unique identification. Editing outfits onto a photo is ordinary personal data, as long as we build no face templates and infer nothing sensitive (ethnicity, health).
  - **Illinois (and Washington):** BIPA excludes "photographs" but covers scans of face geometry, and courts have applied it to uploaded photos and to a virtual try-on tool. Treat Illinois and Washington users as needing written notice, an electronic-signature release, a public retention policy, and deletion within 3 years of last interaction.
- **Must disclose:**
  - who we are and how to contact us
  - what we collect and why, and the legal basis
  - recipients: Google as processor (photos), Qloo (anonymous signals)
  - international transfers
  - retention, including Google's 55-day log, which our delete can't reach
  - user rights (erasure, withdrawing consent) and how to complain
  - the 18+ rule
  - a biometric notice and release
  - an "AI-generated" label on Previews (EU AI Act, from 2026-08-02)
  - photo rules: only yourself, nothing intimate
- **Deletion:** act within one month (GDPR). Delete the originals, Previews and anything derived from them, and pass the deletion on to recipients.
- **Not fully checked:** EUR-Lex, ilga.gov and legislation.gov.uk blocked automated access, so equivalent official or archived copies were used. The two court opinions weren't read in full, and the per-country EU consent ages date from 2020.

Findings: branch `research/privacy-age-rules`, file `.scratch/outfit-recommender-map/research/privacy-age-rules.md`.
