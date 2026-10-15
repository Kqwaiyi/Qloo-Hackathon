# 06: Upload a photo to start a Consultation

**What to build:** A signed-in user opens New Consultation, picks a Photo Type, uploads a photo and presses "Get my Outfits". The browser shrinks the photo and strips its metadata. The server checks the file, has the AI check the photo through the fake adapter, stores it privately and creates a Consultation. The user lands on the Consultation's page, which shows the photo, Photo Type, date and the Photo Style the AI read. No Outfits are built yet: that starts in ticket 10.

**Blocked by:** [01 Walking skeleton: sign up, sign in and the app shell](01-walking-skeleton.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Server operations" (Start a Consultation), "Photo intake", "AI provider interface" (1. Check a photo; Fake adapter), "Pages" (New Consultation; Results page header) and "Data model" (Consultations). Stories 65, 66, 70–73, 91, 106 and 146.

**Decided while slicing:**
- Each Consultation stores the user's Style Preference, Country and age group when it is created, and every later Styling on it uses those stored values. That is how a changed profile affects only new Consultations (story 49). The spec's data model doesn't list these fields.
- The Photo Type examples are simple silhouettes that match the camera outlines (ticket 08), so the step shows no real-looking people.

- [ ] New Consultation shows a stepper: Photo Type → Photo & budget → Styling → Outfits.
- [ ] The Photo Type step offers Face Photo, Full-Body Photo and Body-Only Photo as three stacked choices, each with a silhouette example, a one-line hint and the Categories it unlocks. Full-Body Photo is selected by default.
- [ ] The Photo & budget step has an Upload tab (the Camera tab comes in ticket 08), Back and "Get my Outfits".
- [ ] The picker accepts any image the browser can open and redraws it as a JPEG of at most 1600 px on its long side, which drops metadata such as GPS location. A file over 20 MB shows "This file is over 20 MB.", and a file that won't open shows "We couldn't open this file. Try a JPEG, PNG or WebP photo." Both show at the picker before anything is sent.
- [ ] "Get my Outfits" calls the Start a Consultation server operation. This ticket gives it its last check, the file: anything over 2 MB, or anything that doesn't decode as a JPEG, PNG or WebP image, is refused with "Something went wrong with this photo. Try another." and never reaches the photo check. Later tickets slot the other checks in ahead of it, in the spec's order. `serverActions.bodySizeLimit` is raised to fit the photo.
- [ ] Our AI provider interface has its photo-check operation. In: the photo and the chosen Photo Type. Out: how many people; whether the face, hair, upper body, legs and feet are visible; whether the hair is covered, as yes or no only; whether the photo is clear enough; whether it is explicit; and the Photo Style as 1–2 words from the configured list, strongest first. The interface has nothing for age, ethnicity, skin tone, body measurements or health, and the domain never depends on the AI SDK or Gemini.
- [ ] The 11 Photo Style words live in config: casual, classic, elegant, streetwear, preppy, edgy, bohemian, chic, glamorous, sporty, rugged.
- [ ] The fake adapter is the default in local development and tests. Its photo check passes every photo with Photo Style casual. It waits about 1 s per call by default (adjustable) and 0 in tests. One environment variable selects its scenario in local development, and tests set the scenario in code; scenarios arrive in later tickets.
- [ ] An accepted photo is saved to the private Blob store exactly as the browser shrank it. A Consultation is created with the user, creation time, Photo Type, the photo's Blob pathname, what is visible, whether the hair is covered, the Photo Style, and the snapshot of Style Preference, Country and age group. Body-photo Consultations get the default Budget Tier, No Budget (the picker arrives in ticket 15), and a Face Photo Consultation has none. Nothing else from the check is stored.
- [ ] The Consultation's page shows a header with the photo (through a signed link valid for 1 hour, created when the page renders), Photo Type, date and Photo Style.
- [ ] A user can open only their own Consultations.
- [ ] Tests use the fake adapter and an in-memory Blob store, and cover an accepted photo creating one Consultation and one Blob object, and the server's file refusal storing nothing.
