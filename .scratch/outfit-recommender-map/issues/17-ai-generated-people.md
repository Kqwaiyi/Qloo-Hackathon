# Where can we get realistic AI-generated people for the landing page?

Type: research
Status: resolved
Map: [Outfit Recommender](../map.md)

## Question

"Prototype the landing page" chose a walkthrough of one sample Consultation, built on a realistic photo of a **fully AI-generated person found online**: no real person appears, so nobody's consent is needed. The page shows that photo, its Preview (the photo edited by Gemini), and a Face Photo and a Body-Only Photo example. Which sources fit, and on what terms? Documentation only: **no Gemini calls**.

1. **Sources:** where can we get realistic AI-generated photos of adults? We need a full-body shot (head to feet, face included), a face-and-hair shot, and a shoulders-to-feet shot, ideally on a plain background, covering menswear and womenswear looks. Examples to check: Generated Photos ("Generated Humans" and faces), thispersondoesnotexist.com, AI-generated collections on Unsplash, Pexels or Adobe Stock, and anything else credible.
2. **Terms, for each source:**
   - (a) May we edit the image with a third-party AI model (Gemini) and publish the edit?
   - (b) May we show the original and the edit publicly, on a free hackathon webapp, in a Devpost submission and in a demo video?
   - (c) May we commit the files to a public GitHub repo?
   - (d) Is attribution required, and in what form?
   - (e) What does it cost?
   - (f) Does the provider promise that the person isn't real, and say anything about resemblance to real people or model releases?
3. **Rules around it:** does anything in Google's Gemini API terms or its Generative AI Prohibited Use Policy limit editing images of synthetic people? Does EU AI Act Article 50, or any deepfake-labelling rule, apply to showing a synthetic person as the "before" photo, and how should it be labelled?

Recommend one source.

## Answer

Resolved on 2026-10-15. The facts come from research (findings: branch `research/ai-generated-people`, commit `1ae0c3a`, file `.scratch/outfit-recommender-map/research/ai-generated-people.md`). The user chose the source. This is a summary of the sources, not legal advice.

**Source: Pixabay images tagged "AI generated".** The user chose it over the research's pick, Generated Photos on a paid licence.
- **Licence:** free. We may modify and adapt the images for any purpose, and no attribution is needed. We credit Pixabay in the README anyway.
- **Real people:** Pixabay's uploaders must label AI content and must not show real people, but Pixabay doesn't vouch for them. Before publishing, the team runs a reverse-image search on every chosen image.
- **Age:** pick clearly adult people, since Gemini is 18+ only.
- **What's needed:**
  - one person with a Full-Body Photo for the walkthrough;
  - a Face Photo and a Body-Only Photo for the two small examples (the Body-Only Photo may be cropped from a full-body image);
  - between them, both Style Preferences.
- **If nothing ideal turns up:** realistic full-body people on plain backgrounds are hard to find there. If none turns up, the team takes a less realistic image or a busier background, such as a lifestyle shot, rather than switching source.

**Image files stay out of the repo.** Pixabay forbids distributing unaltered content "on a Standalone basis".
- The originals and the frozen runs' Previews are uploaded to Vercel Blob, and the landing page loads them from there.
- The frozen runs' text (Photo Style, Style Icons, Brands, Pieces) can still ship with the page.

**Labels.**
- **Why:** EU AI Act Article 50(4) has applied since 2 August 2026. The Commission's FAQ counts a person who "can plausibly exist" as a possible deep fake, so the disclosure must be visible the first time someone sees the image. Gemini's SynthID watermark alone isn't enough.
- **Caption:** the "AI-generated person" badge from "Prototype the landing page" becomes a caption beside the photo: "AI-generated person: not a real person."
- **Alt text:** "AI-generated photo of a fictional person".
- **EU icon (optional):** the free "Fully AI-Generated" icon may sit beside the caption.
- **Previews** keep their "AI-generated" badge.
- **Elsewhere:** the same caption appears wherever the sample people appear in the demo video and on Devpost.

**Accepted risks.**
- **Sublicensing:** Google APIs Terms §5b says we must have the right to grant Google a sublicensable licence to every image we send. Pixabay's licence doesn't grant sublicensing, so taken literally there's a gap. Generating the people ourselves would avoid it.
- **"Not a real person":** this is only an uploader rule. The reverse-image check is the mitigation.
- **The uploader's generator:** Pixabay leaves the uploader responsible for their AI generator's terms, which we can't check.
- **Training:** Gemini's paid tier is already decided, so Google doesn't train on these images.

**Considered.**
- **Generated Photos, paid** (the research's pick):
  - $9 per photo;
  - the strongest promise that nobody real is shown;
  - but it needed a written OK for Gemini edits, and its files can't be committed either.
- **Generated Photos, free tier:** it forbids derivative copies, so no Preview.
- **Adobe Stock:** a subscription, a ban on using assets for AI training or testing, and only the contributor's promise that people are fictional.
- **Freepik (now Magnific):** it bans any artificial-intelligence use.
- **Unsplash and Pexels:** neither accepts AI-generated images.
- **thispersondoesnotexist.com:** now a domain for sale, and it only ever made faces.
- **Generating the people with Google's image model:** rejected as the source, as the fallback for Generated Photos, and as the fallback if Pixabay has nothing ideal.

**Passed on.**
- **The spec:**
  - setup reminders: pick the Pixabay images, run the reverse-image check, upload them to Blob, and add the README credit;
  - acceptance criteria: the caption and the alt text.
- **The hackathon submission:** the caption in the demo video and on Devpost.
