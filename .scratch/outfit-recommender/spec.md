# Outfit Recommender

Status: ready-for-agent
Map: [Outfit Recommender](../outfit-recommender-map/map.md)

Every decision here comes from the map's resolved tickets. Use the vocabulary in [GLOSSARY.md](../../GLOSSARY.md) and respect the ADRs in `docs/adr/`. [ADR-0001](../../docs/adr/0001-qloo-selects-ai-concretizes.md) is the core rule: Qloo decides what is recommended, and the AI only makes it concrete.

## Problem Statement

People who want to change how they look get generic fashion advice: trend lists, celebrity looks and shops' own picks. None of it takes into account who they are, what they look like now, what they can spend, or what people like them in their country love. And even when they find an idea they like, they can't picture it on themselves before they buy the clothes or cut their hair.

For the Qloo LLM Hackathon, the team also needs a public, working demo where Qloo's taste data visibly does the deciding and generative AI only makes those choices concrete. It must handle real people's face photos safely, keep spending on Gemini and Qloo bounded, and let judges try it with no friction.

## Solution

Outfit Recommender is a webapp for adults. A user signs up, takes or uploads one photo of themselves, and gets complete Outfits shown on them.

- The user picks a Photo Type: Face Photo, Full-Body Photo or Body-Only Photo. They take the photo in the browser or upload one, and for a body photo they choose a Budget Tier.
- AI checks the photo and reads its Photo Style.
- Qloo picks Style Icons popular with people of the user's age, Style Preference and Country, in tune with the Photo Style. It then picks the Brands each Style Icon's fans favour, within the Budget Tier.
- AI turns each pick into a concrete Piece tailored to the photo, with a one-line "why it suits you", and makes one Preview of the user wearing the whole Outfit.
- Two Outfits arrive together. "Show 2 more Outfits" adds more. Changing the Budget Tier or the Photo Style builds different Outfits.
- Every Consultation stays in the user's history until they delete it.
- A public landing page walks through one sample Consultation, tagging each step Qloo, AI or You.
- Guardrails keep it safe and affordable: adults only, a consent sheet before the first photo, a published deletion promise, a per-user Outfit Allowance, app-wide caps, and one unlimited Demo Account for the judges.

## User Stories

### Visitors and the landing page

1. As a visitor, I want the landing page to walk me through one sample Consultation as I scroll, so that I understand what the app does before I sign up.
2. As a visitor, I want each walkthrough step tagged Qloo, AI or You, so that I can see who decides what.
3. As a visitor, I want to see the sample photo's Photo Style, ranked Style Icons, Brands and tailored Pieces, so that I can see how a recommendation is built.
4. As a visitor, I want a before/after slider between the sample photo and its Preview, so that I can judge the result.
5. As a visitor, I want a Face Photo example and a Body-Only Photo example, so that I know I don't need a full-body shot.
6. As a visitor, I want every sample person captioned "AI-generated person: not a real person.", so that I don't mistake them for a real user.
7. As a visitor, I want every sample Preview to carry an "AI-generated" badge, so that I know the image was edited.
8. As a visitor, I want to be told before I sign up that photos go to Google's Gemini to make Previews, so that I can decide whether to go ahead.
9. As a visitor, I want to see "Free · Up to 10 Outfits a day" by the sign-up button, so that I know what I get.
10. As a visitor, I want links to Privacy and Terms on the landing page, so that I can read them before signing up.
11. As a visitor, I want the footer to say the app is for adults 18+, that it was built for the Qloo LLM Hackathon, and that Style Icons and Brands aren't affiliated with it, so that I'm not misled.
12. As a visitor on a phone, I want each walkthrough picture above its step's text, so that the page reads well on a narrow screen.
13. As a signed-in user, I want the landing page header to show "Open the app" instead of "Sign in", so that I can go straight in.
14. As a hackathon judge, I want the public demo link to open on the landing page, so that the first screen explains the project.
15. As a visitor, I want the landing page to work without triggering any AI or Qloo call, so that it loads fast and costs nothing.

### Sign-up

16. As a visitor, I want sign-up to ask only for my date of birth first, so that I find out straight away whether I can use the app.
17. As a visitor, I want the date of birth fields to be blank with no hint of the age cut-off, so that the question is neutral.
18. As a visitor under 18, I want a plain message that I need to be 18 or older, so that I know why I can't continue.
19. As the team, we want an under-18 entry to store nothing and block another attempt from that browser for 30 days, so that the app stays adults-only as Gemini's terms require.
20. As a visitor, I want the second step to ask for my username, email, password, Style Preference and Country, so that my Outfits suit me.
21. As a visitor, I want my Country pre-filled from my browser's language settings, so that sign-up is quick.
22. As a visitor, I want Style Preference to have no default, so that I choose menswear, womenswear or no preference deliberately.
23. As a visitor, I want to know as I type whether my username is taken, so that I don't fail at the end.
24. As a visitor, I want a clear message if my email already has an account, with ways to sign in or reset my password, so that I'm not stuck.
25. As a visitor, I want a show/hide toggle on the password field, so that I can check what I typed.
26. As a visitor, I want to agree to the Terms and Privacy Policy with one unticked checkbox, so that I know what I'm accepting.
27. As a visitor in a country Gemini doesn't serve, I want to be told the app isn't available where I am, before I fill anything in, so that I don't make a useless account.
28. As the team, we want sign-ups limited per IP address and paused app-wide when email sending nears Gmail's daily limit, so that a script can't use up the emails real users need.

### Email verification

29. As a new user, I want to be signed in right after sign-up, so that I can look around before I verify.
30. As an unverified user, I want a banner saying where the link went, that verifying unlocks my first Consultation, and the date my unverified account will be deleted, so that I know what to do and by when.
31. As an unverified user, I want "Resend link" and "Change email" in the banner, so that I can recover from a lost email or a typo.
32. As an unverified user who opens New Consultation, I want a "verify your email first" panel instead of the first step, so that I don't take a photo and then get blocked.
33. As a new user, I want the verification link to work for 24 hours, on any device, so that I can open it from my phone.
34. As a new user who clicks the link, I want to land on New Consultation with "Email verified", signed in on that device, so that I can start straight away.
35. As a user who clicks an expired or broken link, I want a page that says so and offers a new link, so that I can still verify.
36. As someone who didn't sign up, I want the verification email to tell me to ignore it and when the account will be removed, so that I'm not worried.
37. As the team, we want unverified accounts deleted 7 days after sign-up, so that we don't keep data for people who never started.

### Sign-in and sign-out

38. As a user, I want to sign in with my username or my email in one field, so that I don't have to remember which one I used.
39. As a user, I want every failed sign-in to give the same message, so that strangers can't find out which accounts exist.
40. As a user, I don't want my account locked by someone else's failed attempts, so that nobody can lock me out on purpose.
41. As a regular user, I want my sign-in to last 30 days and renew as I use the app, so that I'm not asked to sign in all the time.
42. As a user, I want "Sign out of all devices" in Settings, so that I can end sign-ins I don't trust.
43. As a signed-in user who opens the sign-in or sign-up page, I want to be taken into the app, so that I don't sign up twice.

### Password reset

44. As a user who forgot my password, I want to ask for a reset link by email and get the same reply whether or not the address has an account, so that nobody can probe for accounts.
45. As a user resetting my password, I want the link to last 1 hour, so that an old email can't be used later.
46. As a user who reset my password, I want every other device signed out and my other reset links cancelled, so that the reset really secures my account.
47. As an unverified user who resets my password, I want my email marked verified, so that I don't need a second link.

### Settings

48. As a user, I want to change my username, Style Preference and Country in Settings, so that my profile stays right.
49. As a user, I want a changed Style Preference or Country to affect only new Consultations, so that my history stays as it was.
50. As a user, I want my date of birth shown read-only as "Born March 1999 · Wrong? Email us", so that I know what we hold and how to fix it.
51. As a user changing a verified email, I want my old address to approve the change before my new address verifies it, so that someone with my sign-in alone can't take over my account.
52. As a user, I want Settings to show which step of an email change is pending, so that I know what to do next.
53. As an unverified user who typed the wrong email, I want to change it at once and get a new link, so that I can still verify.
54. As a user, I want to change my password by giving my current one, so that nobody at my unlocked screen can change it.
55. As a user who changed my password, I want my other devices signed out and a notice email, so that I hear about a change I didn't make.
56. As a user, I want links to the Privacy Policy and Terms, and a way to ask for a copy of my data by email, so that I can use my rights.

### Consent and photo rules

57. As a user starting my first Consultation, I want a consent sheet explaining in plain English what happens to my photos, so that I agree knowing the facts.
58. As a user, I want two separate unticked boxes, one for storing my photos and having AI process my face and body, and one for sending them to Google's Gemini, so that I agree to each on its own.
59. As a user, I want the consent sheet to tell me to upload only photos of myself with no nudity, and that a Body-Only Photo can still show my face, so that I know the rules.
60. As a user, I want the sheet's Continue button disabled until both boxes are ticked, so that I can't half-agree by mistake.
61. As a user who closes the consent sheet, I want to return to my photo with my Budget Tier kept and nothing sent, so that I can think it over.
62. As a user who closed the sheet, I want a quiet line telling me I need to agree to both boxes, so that I know why nothing happened.
63. As a user, I want to see the consent sheet again when the photo notice changes, so that I agree to the current terms.
64. As a user, I want to withdraw photo consent in Settings, deleting every Consultation but keeping my account, so that I can stop without leaving.

### Starting a Consultation

65. As a user, I want to choose between a Face Photo, a Full-Body Photo and a Body-Only Photo, each with an example, a hint and the Categories it unlocks, so that I know what I'll get.
66. As a user, I want Full-Body Photo selected by default, so that the most complete option is the easy one.
67. As a user, I want to take my photo with my browser's camera, with an outline for my chosen Photo Type, so that I frame it correctly.
68. As a user taking a Body-Only Photo, I want a "keep your face above this line" guide, so that I can leave my face out.
69. As a user, I want to retake my photo before sending it, so that I can fix a bad shot.
70. As a user, I want to upload a photo instead of using the camera, so that I can use one I already have.
71. As a user, I want any photo my browser can open to be accepted and shrunk before it is sent, so that uploads are quick.
72. As a user, I want my photo's hidden metadata, such as GPS location, dropped before it leaves my device, so that I don't share where I took it.
73. As a user, I want a clear message at the picker for a file over 20 MB or one that won't open, so that I know to pick another before anything is sent.
74. As a user sending a Full-Body or Body-Only Photo, I want to pick a Budget Tier (No Budget, Low, Medium or Expensive), with No Budget as the default and a note that I can change it later, so that the Outfits fit what I can spend.
75. As a user sending a Face Photo, I want no Budget Tier picker, since a Hairstyle has no price.
76. As a user, I want "Get my Outfits" to show how many of my Outfits it will use, so that I can manage my allowance.

### Photo check

77. As a user whose photo looks like a different Photo Type, I want to be told which type it looks like and switch with one tap, so that I don't have to start again.
78. As a user, I want a specific message when my photo shows no person, more than one person, is too unclear, or is not appropriate, so that I know what to fix.
79. As a user sending a Face Photo with my hair hidden, I want to be told you need to see my hair to suggest a Hairstyle, so that I can retake it.
80. As a user whose photo check fails for a technical reason, I want to be asked to try again, without it counting against my daily photo checks.
81. As a user whose photo is rejected, I want to return to the photo step with my photo and Budget Tier kept, so that I can retake or choose another quickly.
82. As a user whose photo is rejected, I want it never stored and no Consultation created, so that a bad photo leaves nothing behind.
83. As a user who wears a head covering, I want my Full-Body Photo accepted and Outfits without a Hairstyle, so that I'm never asked to change it.
84. As a user whose Body-Only Photo shows my face, I want it accepted and my face left unchanged, so that I don't have to crop it.
85. As a user, I want the app never to guess my age, ethnicity, skin tone, body measurements or health from my photo, so that my photo is only used to dress me.

### Styling

86. As a user, I want a checklist (Checking your photo, Finding Style Icons, Building Outfits, Generating Previews n of 2) while my Outfits are built, so that I know it's working.
87. As a user, I want my Outfits to appear all at once when they're ready, so that I'm not shown half-finished cards.
88. As a user, I want to be told when a step is taking longer than usual, so that I know it hasn't frozen.
89. As a user who leaves during Styling, I want My Consultations to show the Consultation as "Styling…" and to see the checklist again when I open it, so that I can come back.
90. As a user, I want a Styling that is stuck for 10 minutes to end on its own, so that my Consultation isn't locked forever.

### Results

91. As a user, I want the results header to show my photo, Photo Type, date, Budget Tier and Photo Style, so that I know what the Outfits were built from.
92. As a user, I want each Outfit card to show its Preview beside "Outfit N · Inspired by <Style Icon>" and the whole Outfit's price range, so that I see the Outfit at a glance.
93. As a user, I want one row per Piece showing its Category, the item, its Brand, why it suits me, its price range and a "Visit <Brand>" link, so that I can follow up.
94. As a user, I want the Hairstyle row to show the cut, its Style Icon and why it suits me, with no price or link, so that it isn't presented as something to buy.
95. As a womenswear or menswear user, I want an Outfit's Top and Bottom sometimes to be one One-Piece (a dress, jumpsuit or overalls), so that my Outfits aren't all separates.
96. As a user, I want prices to come only from Qloo's Brand data and items to be generic, never invented products, so that what I see is honest.
    > **Replaced** by the [Real Products spec](../real-products/spec.md) and [ADR-0008](../../docs/adr/0008-pieces-are-real-products.md): every Top, Bottom, Shoes and One-Piece Piece is a real Product the AI picks from its Brand's range, priced by its seller. Older Pieces keep their generic items and Brand price ranges.
97. As a user, I want my Hairstyle to be something my current hair can achieve, in my own hair colour, so that the suggestion is realistic.
98. As a user, I want a Hairstyle whose Style Icon's signature cut the AI doesn't know to be based on the Outfit instead, without claiming to be that Style Icon's cut.
99. As a user, I want "why it suits you" never to mention my body size or shape, weight, skin colour, ethnicity, gender or age, so that the advice stays respectful.
100. As a user, I want each Preview to change only the Pieces, keeping my face, body, skin tone, pose, background, glasses, jewellery, bags and head covering, so that it still looks like me.
101. As a user sending a Face Photo, I want the Preview to change only my hair.
102. As a user sending a Body-Only Photo without my face, I want the Preview never to invent a face.
103. As a user, I want every Preview to carry an "AI-generated" badge, so that nobody takes it for a real photo.
104. As a user whose Preview the image model refused or failed to make, I want the Outfit shown with a clear placeholder and all its Pieces, so that I still get the recommendation.
105. As a user whose Previews were all refused, I want a hint that a different photo may work better.
106. As a user, I want photos and Previews shown only through short-lived private links, so that nobody else can open them.

### More Outfits and re-styling

107. As a user, I want "Show 2 more Outfits" to add two new Outfits below my current ones, so that I can explore further.
108. As a user, I want my current Outfits to stay visible while more are built, and the new ones to appear together, so that I can keep browsing.
109. As a user, I want no Brand repeated in the same Category across my current Outfits, so that each Outfit is different.
110. As a user, I want to be told when there are no more Outfits for this photo, with a suggestion to try another Budget Tier or Photo Style, so that I know what else to try.
111. As a user with one Outfit left in my allowance, I want "Show 2 more Outfits" to make one, so that I can still use it.
112. As a user, I want to change the Budget Tier on the results page and get new Outfits from the same Style Icons, so that I can see other price points.
113. As a user, I want to change the Photo Style by picking 1–2 words from the list, so that I get Style Icons that suit the style I want.
114. As a user, I want my old Outfits kept if a Budget Tier or Photo Style change can't build any new ones, with a message saying so, so that I never end up with nothing.
115. As a user sending a Face Photo, I want each Outfit to be the next Style Icon's Hairstyle, and to change only the Photo Style.

### Failures

116. As a user whose first Styling built nothing at my Budget Tier, I want my Consultation kept with a message suggesting another Budget Tier or Photo Style, so that I can try again from the same photo.
117. As a user whose first Styling broke, I want "Something went wrong while styling." with a Try again button that doesn't re-check my photo, so that a passing outage doesn't force a retake.
118. As a user, I want an Outfit the AI failed to tailor to be replaced quietly by the next Style Icon, so that I still get two Outfits.

### History

119. As a user, I want My Consultations to list each Consultation with its photo, Photo Type, Outfit count, date and Budget Tier (or "Styling…" or "No Outfits"), so that I can find past ones.
120. As a user, I want to open a past Consultation and see its Outfits, so that I can come back to them.
121. As a user, I want to delete a Consultation after a confirmation saying its photo, Outfits and Previews are gone for good, so that I control my data.
122. As a user deleting a Consultation that's still Styling, I want the Styling cancelled and everything removed at once, so that nothing is left running.

### Limits

123. As a user, I want a line beside every action that uses Outfits saying how many it uses and how many I have left today, so that I'm never surprised.
124. As a user who has used today's 10 Outfits, I want to be told on the Photo Type step, with the time more become available, before I take a photo, so that I don't waste effort.
125. As a user who has used today's Outfits, I want the results actions that use Outfits disabled with the same time, while reading and deleting still work.
126. As a user who has checked 20 photos today, I want to be told at "Get my Outfits" when I can check more.
127. As a user, I want only one Styling at a time across my Consultations, so that my allowance count stays right.
128. As a user, I want app-wide limits explained without blaming me, with when to come back, so that I understand it isn't my fault.
129. As a user in a country Gemini doesn't serve, I want to be told on the Photo Type step that the app isn't available where I am, while I can still read and delete my Consultations.

### Demo Account

130. As a hackathon judge, I want to sign in to a shared Demo Account with no usage limits, so that I can try the app freely.
131. As a judge, I want the consent sheet before every Consultation on the Demo Account, so that my consent is my own.
132. As a judge, I want the consent sheet and My Consultations to tell me plainly that anyone with this login can see Consultations made here, so that I can delete mine.
133. As a judge, I want to change the Demo Account's date of birth (18 or over), Style Preference and Country, so that I can see how Outfits change.
134. As a judge, I want the account's password, email, username, deletion, consent withdrawal and "Sign out of all devices" shown as "Managed by the team", so that I can't lock other judges out.
135. As a judge, I want to style a Consultation while another judge is styling theirs, so that we don't block each other.

### Privacy and rights

136. As a user, I want a public Privacy Policy listing everything required, including a Photos section with the retention and destruction schedule, so that I know how my data is handled.
137. As a user, I want public Terms stating the 18+ rule, the content rules and that this is a free hackathon project.
138. As a user, I want deleting my account (confirmed with my password) to remove every Consultation, photo and Preview right away, and to be told what providers keep and for how long, so that I can leave cleanly.
139. As a user, I want to be able to ask the team by email for a copy of my data or a correction, and get an answer within a month.
140. As a user, I want Qloo never to receive my username, email, user ID or photo, or anything that links two requests to me.
141. As the team, we want an account found to belong to someone under 18 deleted with everything in it.

### The team

142. As the team, we want inactive accounts warned by email 30 days before deletion and deleted after 12 months without activity.
143. As the team, we want the app to stop making Outfits at 100 in any 24 hours and 750 a calendar month, and when Qloo's remaining calls drop below 1,000, so that a public demo can't run up costs.
144. As the team, we want usage records kept apart from Consultations and purged after about 35 days, so that limits work without keeping personal data.
145. As the team, we want every email to go through one send function that enforces Gmail-safe caps, so that we never trigger Gmail's sending block.
146. As a developer, I want a fake AI adapter by default in local development and tests, with switchable scenarios, so that I can build without spending money.
147. As a developer, I want local development to use real Qloo through the cache, so that results are realistic and calls are few.
148. As the team, we want the Style Icon, retailer and off-category denylists in config, so that we can curate without code changes.
149. As the team, we want a script that creates the Demo Account, so that it's set up the same way every time.
150. As the team, we want a documented way to capture the landing page's frozen sample Consultations from the built app, so that the page shows real output.
151. As the team, we want a check that every Photo Style word is a real Qloo `personal_style` tag, so that none is silently ignored.

## Implementation Decisions

### Stack and platform

- Next.js App Router, React and TypeScript, deployed on Vercel. Everything is designed to fit the Hobby plan's limits, with Fluid compute on (300 s per function).
- Better Auth 1.7.x with the `username` plugin, keeping users in our own Postgres.
- Neon Postgres through the Vercel Marketplace, with Drizzle 0.45.x as the ORM and migrations.
- One private Vercel Blob store for photos and Previews.
- Vercel Workflow for Stylings.
- The Vercel AI SDK (`ai@7`, `@ai-sdk/google@4`) inside the Gemini adapter only.
- Nodemailer over Gmail SMTP from a throwaway team Gmail account, inside one send-email function.
- One daily Vercel cron job for the sweeps.
- Secrets live only in environment variables: `QLOO_API_KEY`, `QLOO_API_URL`, `GEMINI_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, the database and Blob credentials, and the Demo Account's password for its script.

### Backend shape

- Pages read data on the server through one server-only data layer.
- Server actions handle every change the app makes. Each one is a thin wrapper over a **server operation** (below), which holds the rules and is the main test seam.
- Route handlers exist only for Better Auth's catch-all, the Styling status poll and the daily sweep cron. There is no public API.

### Server operations (the main seam)

Each operation takes the signed-in user and its inputs, enforces every rule that applies, and returns either a result or a typed refusal that the UI turns into the copy listed under "User-facing copy". The edges are injected: the AI provider, the Qloo transport, the email transport, Blob storage and the clock.

- **Start a Consultation** ("Get my Outfits"): the photo, the Photo Type, the Budget Tier (body photos only) and, when the consent sheet was shown, both consent ticks. It checks, in order:
  1. the user is verified;
  2. the request's IP country is supported;
  3. photo consent is current, or both ticks were sent (which records the acceptance);
  4. no Styling is running for the user, unless it's the Demo Account;
  5. the Outfit Allowance, the app-wide caps and the Qloo backstop leave at least one Outfit;
  6. the photo-check limit;
  7. the file is at most 2 MB and decodes as a JPEG, PNG or WebP image.

  It then runs the photo check (counted) and applies the Photo Type rules. A rejected photo returns the rejection and stores nothing. An accepted photo is saved to Blob, the Consultation is created, and its first Styling starts.
- **Show more Outfits**, **change the Budget Tier**, **change the Photo Style** and **try again**: each checks the region, the Styling locks and the limits, then starts a Styling of that kind.
- **Delete a Consultation**: cancels its running Workflow run if there is one, then deletes its rows and Blob objects in the same operation.
- **Read**: a Consultation's results, the list for My Consultations, the Styling status (which also runs the stuck check), and a usage summary. The usage summary covers the Outfits left, when more become available, whether an app-wide cap or the Qloo backstop is in force, whether the request's IP country is supported, and whether the user is verified.
- **Account**: update the profile, withdraw photo consent, sign out of all devices, change the Demo Account's date of birth. Better Auth's own endpoints handle sign-up, sign-in, verification, reset, email change, password change and deletion, and our hooks and settings (below) shape them.
- **Daily sweep**: one operation, given the current time, that runs every sweep.

### Photo intake

- **In the browser:** the picker accepts any image the browser can open, refuses files over 20 MB, and redraws every photo as a JPEG of at most 1600 px on its long side. Redrawing also drops metadata such as GPS location. Errors show at the picker before anything is sent.
- **On the server:** the "Get my Outfits" server action refuses anything over 2 MB or anything that isn't a decodable JPEG, PNG or WebP. That refusal only catches requests that skipped the browser, and it doesn't count as a photo check. Raise `serverActions.bodySizeLimit` to fit the photo.
- **Camera:** in-browser capture shows a dashed outline for the chosen Photo Type. A Body-Only Photo adds a "keep your face above this line" guide. The user can Retake.
- **Storage:** only an accepted photo is stored, exactly as the browser shrank it. Previews are re-encoded to WebP on the server before storing. Steps pass Blob pathnames to each other, never image bytes. Pages show photos and Previews through signed links valid for 1 hour, created when the page renders.

### AI provider interface ([ADR-0001](../../docs/adr/0001-qloo-selects-ai-concretizes.md))

Our own interface with three operations. The domain depends only on this interface, never on the AI SDK or Gemini.

**1. Check a photo and read its Photo Style.**
- In: the photo and the chosen Photo Type.
- The model only reports what it sees:
  - how many people;
  - whether the face, hair, upper body, legs and feet are visible;
  - whether the hair is covered, as yes or no. The prompt may name hijabs, turbans and caps as examples, but what covers the hair is never returned or stored ([ADR-0005](../../docs/adr/0005-photos-edited-never-analysed.md)).
  - whether the photo is clear enough;
  - whether it is explicit;
  - the Photo Style: 1–2 words from the configured list, strongest first. There is no "none": a plain photo reads as casual.
- No age guessing, and no inference of ethnicity, skin tone, body measurements or health.
- **Our code decides**, checking in this order:
  1. explicit, or Google blocked the photo: **not appropriate**;
  2. no people: **no person**;
  3. more than one person: **more than one person**; superseded by [Group Photos](../group-photos/spec.md), which accepts a photo with a clear Main Person;
  4. not clear enough: **too unclear**;
  5. the chosen Photo Type's rule fails but another type's rule passes: **wrong Photo Type**, naming that type;
  6. a Face Photo with covered or hidden hair: **hair not visible**;
  7. any other rule failure, such as a badly cropped photo: **too unclear**.
- **Photo Type rules:**
  - A Face Photo needs the face and visible, uncovered hair. A Face Photo that shows the whole body is accepted.
  - A Full-Body Photo needs head to feet, face included. With covered hair it is accepted, and its Outfits have no Hairstyle Piece.
  - A Body-Only Photo needs shoulders to feet. A visible face is allowed, stored and sent like the rest of the photo, and left unchanged.
  - Both body types need the feet, because Shoes is a Category.
- **Stored from the check:** the Photo Style, what is visible, and whether the hair is covered. Nothing else.
- The check relies on the AI SDK's own retries. If it still errors, that's a separate "check errored" outcome that doesn't count towards the photo-check limit.

**2. Tailor one Outfit's Pieces** (structured output).

> **Replaced** by the [Agentic Stylist spec](../agentic-stylist/spec.md) ("The Stylist and its tools") and [ADR-0011](../../docs/adr/0011-claude-runs-every-model-but-the-image-model.md): the tailoring operation is gone. The AI Stylist, the AI SDK's Workflow agent on Claude, makes every Outfit through its tools, its "save an Outfit" tool checking every rule this section sets, and the AI interface supplies the Stylist's model in its place.
- **In:**
  - the photo itself (never a stored text description of the person);
  - the Photo Type, the age group and the Photo Style;
  - the Outfit's line: menswear or womenswear (see "Outfit assembly");
  - the Style Icon's name;
  - for each Piece: its Category, and for Brand Pieces the Brand, its Qloo category tags and its price range.
  - It never receives the Country or the Budget Tier: the Brands already reflect them.
- **Out, per Piece:**
  - `item`: a card label of about 6 words, colour included ("Washed-black relaxed cargo trousers"). For the Hairstyle it's the cut.
  - `details`: one sentence on colour, fabric, fit and cut. It's used for the Preview and not shown.
  - `why`: one line of about 20 words, in English and second person. It may mention the garment, the Style Icon, the Photo Style, the user's hair and what they're already wearing. It never mentions body size or shape, weight, skin colour, ethnicity, gender or age.
- **Rules:**
  - Items are generic, never product or model names.
    > **Replaced** by the [Real Products spec](../real-products/spec.md) ("Tailoring contract") and [ADR-0008](../../docs/adr/0008-pieces-are-real-products.md): each Brand Piece is one of its Brand's real Products, picked from the candidates a product search found, and its item is the Product's own title.
  - Never a price.
  - Only an item the Brand plausibly makes.
  - The Top is one garment, the main visible upper layer.
- **One-Piece ([ADR-0003](../../docs/adr/0003-ai-may-merge-top-and-bottom.md)):**
  - The model may turn the Top and Bottom into one garment built on the Top Brand, only when that Brand plausibly makes one and it fits the line: dresses for womenswear, jumpsuits and overalls for either.
  - The prompt prefers separates, with no cap.
  - The Bottom Brand is then left out, but stays reserved for de-duplication.
- **Hairstyle:**
  - Built from the Style Icon's name alone, never from Qloo's image of them.
  - If the model doesn't know the signature cut, it sets an "unknown cut" flag, bases the cut on the Outfit and Photo Style, and `why` doesn't claim it's the Style Icon's cut. The Style Icon is still used.
  - The cut must be achievable from the user's current hair: shorter or restyled, without adding much length or changing the texture. The hair colour stays the user's own.
- **Bad output** is checked against the schema and our rules (the expected Categories, no prices, no empty fields), retried once, then reported as "tailoring failed".

**3. Render one Preview.**
- **In:** the photo, the Photo Type and each Piece's `details`. Never the Style Icon's name or image.
- **Only the Pieces change.** Everything else stays:
  - face and identity;
  - body shape and size, with no slimming or beautifying;
  - skin tone, pose and background;
  - framing and aspect ratio;
  - glasses, jewellery, bags and head coverings. A Preview never removes a head covering.
- **By Photo Type:** a Face Photo changes only the hair. A Body-Only Preview keeps a visible face unchanged and never invents one.
- **Out:** an image, or a refusal with its reason category (a block reason, an image-safety finish reason, or text with no image).
  - A refusal is final: the adapter sets `maxRetries: 0`.
  - Transient errors are thrown, so the Workflow step retries them.
  - There's no automatic quality check.

**Gemini adapter.**
- It implements the interface on the AI SDK and owns its prompts.
- **Models** (all in config):
  - `gemini-3.5-flash-lite` for the photo check and tailoring;
  - `gemini-nano-banana-2.1` for Previews, with `responseModalities: ["IMAGE"]`, thinking level `minimal` set explicitly, and no `imageConfig`. The output keeps the photo's aspect ratio at about 1K.
  - `gemini-3.1-flash-lite-image` is a config-only fallback for Previews.
- Images are always sent inline, never through the Files API.
- It runs only when explicitly switched on.

**Fake adapter** (the default in local development and tests).
- **Photo check:** passes every photo, with Photo Style casual.
- **Tailoring:** deterministic and built from its inputs: generic items in the right Categories, a `why` naming the Style Icon, and the cut marked as known.
  > **Replaced** by the [Real Products spec](../real-products/spec.md) ("Removing the generic path") and [ADR-0008](../../docs/adr/0008-pieces-are-real-products.md): the fake adapter picks the first candidate Product in each Category instead of inventing an item.
- **Preview:** the user's own photo with a "Fake Preview" banner, re-encoded to WebP.
- **Scenarios** switch on every other outcome:
  - each of the six rejection reasons;
  - covered hair;
  - a photo check that errors;
  - a One-Piece;
  - an unknown signature cut;
  - tailoring failure;
  - a refused Preview;
  - a Preview that fails without being refused.

  Tests switch scenarios in code, and local development uses one environment variable.
- **Delay:** about 1 s per call by default, adjustable, and 0 in tests. A real Preview takes about 11 s.

### Qloo client and cache

- **Requests:** `GET` with the `X-Api-Key` header against `QLOO_API_URL`, with the transport injectable for tests.
- **What Qloo may receive.** The request type has fields only for:
  - the age group;
  - the gender signal;
  - the Country (location query and `key_market` tag);
  - Photo Style tags;
  - entity IDs;
  - filter, exclusion, popularity, operator and `take` parameters.

  It has no user ID, username, email, photo, or anything that links two calls to one user.
- **Cache:** every response is cached in a Neon table for 30 days.
  - The key is the canonical request: parameters sorted and values normalised.
  - The stored body is trimmed to the fields used:
    - people: entity ID, name, whether `date_of_death` is set, and `query.affinity`;
    - Brands: entity ID, name, the tags the rules read, `target_gender`, `price_range_usd_min/max`, `official_site` and `query.affinity`.
  - Descriptions and images are never kept or shown.
  - There's no pre-warming.
- **Rate limits:** each Qloo call is its own Workflow step, which backs off and retries on "too many requests". A Styling sends at most 3 Qloo calls at once. There's no shared rate limiter.
- **Quota tracking:** every live response's `X-Month-RateLimit-Remaining` header, and its reset date if a header gives one, are saved to a one-row limit-state table. That table feeds the Qloo backstop. If the header is missing, nothing is recorded and Stylings go ahead.

### Outfit assembly (pure module)

A self-contained module with no framework or I/O code. It builds every Qloo query and interprets every Qloo result. Workflow steps fetch, call it, and save. It holds:
- the filters and the config denylists;
- de-duplication and thin-pool widening;
- the Piece picks from "How does Qloo build and rank Outfits?".

**Inputs:**
- the user's age group (worked out from the birth year and month at each Consultation), Style Preference and Country;
- the Consultation's Photo Type, whether the hair is covered, the Budget Tier and the Photo Style;
- the Qloo results;
- the Brands already used in each Category.

**Age groups** (18+ only, [ADR-0004](../../docs/adr/0004-adults-only.md)):

| User age | `signal.demographics.age` | `target_age_group` tag (then widen to) |
|---|---|---|
| 18–24 | `24_and_younger` | `young_adults`, then `adults` |
| 25–29 | `25_to_29` | `young_adults`, then `adults` |
| 30–34 | `30_to_34` | `adults` |
| 35–44 | `35_to_44` | `adults` |
| 45–54 | `45_to_54` | `middle_aged`, then `adults` |
| 55–64 | `55_and_older` | `middle_aged`, then `adults` |
| 65+ | `55_and_older` | `seniors`, then `middle_aged` |

**Style Icons:** one person call per Consultation, or two for a no-preference user (one womenswear, one menswear).
- **Query:**
  - `filter.type=urn:entity:person`;
  - `filter.tags` = the occupation union: model, fashion_model, singer, rapper, actor, athlete, influencer;
  - `filter.gender` and `signal.demographics.gender` from the line;
  - `signal.demographics.age`;
  - `signal.location.query=<Country>`;
  - `signal.interests.tags` = the Photo Style's `personal_style` tags;
  - `filter.popularity.min=0.995`;
  - `take=50`.
- **Exclusions:** `filter.exclude.tags` for the politician, stand_up_comedian and astronomer occupations, plus the `genre:person` comedian, academic, journalist and youtuber tags.
- **In the module:**
  - Drop anyone with a death date, and anyone on the Style Icon denylist.
  - Keep Qloo's affinity order.
  - For a no-preference user, interleave the womenswear and menswear lists (W1, M1, W2, M2…).
- Each Style Icon keeps its **line** (menswear or womenswear). For a no-preference user, it's the list the Style Icon came from.
- One page of 50 is enough. Exclusions backfill from Qloo.

**Brands:** one merged call per Style Icon, for body photos only.
- **Query:**
  - `filter.type=urn:entity:brand`;
  - `signal.interests.entities=<Style Icon>`;
  - `signal.demographics.age`, and `signal.demographics.gender` from the Outfit's line;
  - `signal.location.query=<Country>`;
  - `operator.filter.tags=intersection`, with `filter.tags` = `genre:brand:fashion`, the `target_age_group` tag, `key_market:qloo:<Country>` when Qloo has one for that Country, and the Budget Tier's required tags;
  - `filter.exclude.tags` = the Budget Tier's excluded tags;
  - `filter.popularity.min=0.98`;
  - `take=50`.
- The Photo Style is never sent on Brand calls ([ADR-0002](../../docs/adr/0002-photo-style-steers-style-icons.md)).
- **Budget Tier tags and price guard:**

  | Tier | Required `target_income_level` | Excluded | Price guard |
  |---|---|---|---|
  | Low | `low_to_medium` | `medium_to_high`, `high` | max ≤ $300 |
  | Medium | `medium`, `medium_to_high` | `low` | min ≤ $150 |
  | Expensive | `high` | `low`, `low_to_medium`, `medium` | min ≥ $100 |
  | No Budget | none | none | none |

- **The Style Preference rule**, applied to `target_gender`:
  - menswear keeps a Brand that includes Male or doesn't include Female;
  - womenswear keeps a Brand that includes Female or doesn't include Male.
- **Usable Brands:** only those tagged apparel, or footwear/shoes/sneakers. That drops watches, jewellery, eyewear and lingerie.
  - Then apply the retailer denylist, the off-category denylist (merch shops, shapewear, bridal labels, flip-flop Brands) and the price guard.
- **Thin pools:** fewer than 10 usable Brands widen quietly, one step at a time:
  1. the next age group;
  2. drop the `key_market` tag but keep the location signal;
  3. floor 0.95;
  4. drop the age tag.

  The module returns these as an ordered list of query variants. The caller tries them until one gives at least 10 usable Brands, or the list ends.
- **Pieces,** picked in this order:
  1. Shoes: the highest-affinity unused footwear Brand.
  2. Top: the highest-affinity unused apparel Brand.
  3. Bottom: the next apparel Brand, preferring a denim Brand in the raw top 10. It may be the Top's Brand.

  Shoes never share a Brand with the Top or Bottom of the same Outfit. A Style Icon that can't complete an Outfit is skipped.
- **De-duplication:** no Brand repeats within a Category across the Outfits that will be current together. For "Show 2 more Outfits", that's the existing current Outfits. For a re-styling that replaces them, it's the Outfits it is building. A left-out Bottom Brand stays reserved.
- **Categories by photo:**
  - Full-Body Photo: Hairstyle, Top, Bottom and Shoes; with covered hair, no Hairstyle.
  - Body-Only Photo: Top, Bottom and Shoes.
  - Face Photo: Hairstyle only. There are no Brand calls and no Budget Tier, and each Outfit is the next Style Icon's Hairstyle.
- **Price range:** a Brand Piece shows the Brand's `price_range_usd_min`–`max`. The Outfit's range sums its Brand Pieces' minimums and maximums, and a Piece with no price data is left out of the sum. The Hairstyle has no price.
- **"Visit <Brand>":** links to the Brand's `official_site` when it's an https URL. Otherwise the row has no link.
  > **Replaced** by the [Real Products spec](../real-products/spec.md) ("Choosing the offer", "Pages and copy") and [ADR-0008](../../docs/adr/0008-pieces-are-real-products.md): a Product Piece links to its Product's own page, "View at <shop domain>", at the Brand's own store when it sells it there. Older Pieces keep their "Visit <Brand>" link.
- **Config** holds:
  - the 11 Photo Style words: casual, classic, elegant, streetwear, preppy, edgy, bohemian, chic, glamorous, sporty, rugged;
  - the occupation and exclusion tags;
  - the popularity floors and the widening order;
  - the three denylists.
- **Seed values for the denylists:**
  - **Style Icons:** Liam Payne; KSI, Shane Dawson, Jeffree Star, Colleen Ballinger, Liza Koshy; Sean Combs, 6ix9ine, Conor McGregor; and the odd entity "Rihanna Galliquio". Also anyone the team finds with an adult-film background, a political role, no fashion relevance, or a serious legal or hate-speech controversy. The research notes name more candidates.
  - **Retailers:** Farfetch, Net-a-Porter, MR PORTER, Mytheresa, Neiman Marcus, Harvey Nichols, Foot Locker, Champs Sports, Flight Club, END. Clothing, Zumiez, Tillys, Selfridges, Lojas Renner, Zattini.
  - **Off-category:** merch shops (such as Kylie Jenner Shop), shapewear, bridal labels and flip-flop Brands.

  Denylists match by Qloo entity ID, with the name kept for readability.

### Stylings

- **One "build Outfits" Vercel Workflow.** Each kind of Styling enters at a different stage:

  | Styling | Starts at | Outfits |
  |---|---|---|
  | New Consultation | Style Icons | new |
  | Photo Style change | Style Icons | replace the current ones on success |
  | Budget Tier change | Brands, from the top of the current Style Icons | replace the current ones on success |
  | "Show 2 more Outfits" | Brands, for the next unused Style Icons | added |
  | Try again | the stage that broke, or Style Icons if there are none yet | as for the kind that failed |

- **Stages:** Style Icons → Brands → Building Outfits (Piece picks and tailoring) → Previews → finish.
  - Each Qloo call and each AI call is its own Workflow step, with its own retries and its own 300 s.
  - Each step saves its output as it finishes, so a retried step resumes and nothing relies on Workflow's run data (kept 1 day on Hobby).
  - Every step checks that its Styling is still running before it saves, so a cancelled or timed-out Styling can't write late results.
- **How many Outfits:** a Styling makes up to 2, limited by the Outfit Allowance left and the app-wide caps (the Demo Account always gets 2).
  - The first Styling fetches Brands for the first 3 Style Icons in parallel. Later fetches happen as needed.
  - A Styling fetches Brands for at most 6 Style Icons. Widening retries happen within one fetch.
- **Tailoring failures:** a Style Icon whose tailoring fails after its retry is skipped, and the next Style Icon is tried. A Styling makes at most 2 such substitutes, so a broken model can't burn through the Style Icons.
  > **Replaced** by the [Agentic Stylist spec](../agentic-stylist/spec.md) ("The loop"): there's no tailoring to fail. The AI Stylist's turn cap bounds a Stylist that keeps getting an Outfit wrong instead.
- **Previews:** rendered 2 at a time. A refused or failed Preview leaves its Outfit with a placeholder.
- **Finishing.** When a Styling finishes (normally, after something breaks, or as stuck):
  - The Outfits it made switch in at once. Re-stylings replace the current Outfits, the Budget Tier and the Photo Style together. "Show 2 more Outfits" adds to them.
  - Any Preview not ready is marked failed.
  - One usage record is written per Outfit switched in.
  - A Styling that made no Outfit has **failed**: nothing switches, and the reason is recorded as either "nothing could be built" or "something broke".
- **Locks:**
  - One running Styling per Consultation.
  - One running Styling per user, except the Demo Account.
  - Both are enforced in the database, so two simultaneous requests can't both start one.
- **Progress:**
  - The Consultation shows "Styling…" while a Styling runs.
  - The Styling page polls the status route about once a second. Workflow's own progress stream isn't used.
  - The stage and the time it last moved are stored.
  - If one step has taken over 60 s, the checklist adds "This is taking longer than usual."
- **Stuck Stylings:** a Styling whose stage hasn't moved for 10 minutes is finished as described above. The check runs whenever something reads the status: the poll, My Consultations, or a server operation that would start a Styling. Its Workflow run is cancelled if it's still alive, and both locks are released. There's no cron job for this.
- **Deletion:** deleting a Consultation, withdrawing consent or deleting the account cancels any running Workflow run first.

### Outfit Allowance, limits and backstops

Every number below lives in config.
- **Outfit Allowance:** 10 Outfits in any rolling 24 hours, counted from usage records.
  - An Outfit counts once it's switched in for the user to see, with or without a Preview. Nothing is given back.
  - Skipped Outfits and failed Stylings never count.
  - "More from <time>" is the oldest counted Outfit's time plus 24 hours, in the user's local time.
- **Photo checks:** 20 in any rolling 24 hours, accepted or rejected. A check that errors doesn't count.
- **App-wide caps:** at most 100 Outfits in any rolling 24 hours and 750 per UTC calendar month, counted from the same usage records.
  - A small overshoot from simultaneous Stylings by different users is accepted.
- **Qloo backstop:** no new Styling starts while Qloo's last reported remaining calls are below 1,000.
- **The Demo Account** is exempt from every limit in this section. No usage records are written for it, so its Outfits don't count towards the app-wide caps.
- **No "regenerate Preview" button and no reuse beyond the Qloo cache.** Switching back to an earlier Budget Tier or Photo Style builds new Outfits. Photos aren't fingerprinted.
- **Where limits show:**
  - The allowance line sits beside "Get my Outfits", "Show 2 more Outfits", the Budget Tier dropdown and the Photo Style editor.
  - A used-up allowance, an app-wide cap, the Qloo backstop or an unsupported region shows on the Photo Type step before any photo is taken, and disables the results actions that start Stylings.
  - Reading and deleting always work.
  - There's no app-wide banner, and sign-up and the landing page stay open.

### Region gate

- **The Country list:** only countries Gemini serves. That leaves out mainland China, Hong Kong, Macao, Russia, Iran, Cuba, Belarus, North Korea and Syria.
  - Each Country in config carries its ISO code, display name, Qloo location query and `key_market` tag if Qloo has one.
  - Country is pre-filled from the browser's locale region.
- **The `x-vercel-ip-country` header** is checked:
  - when the sign-up page loads, and again on submit;
  - when New Consultation opens;
  - by every server operation that starts a Styling. This spec extends the check from "Get my Outfits" to all of them, since every Styling calls Gemini.
- A missing header counts as allowed, which covers local development.
- Sign-in, reading and deleting are never region-checked.

### Consent

- A **photo-notice version** lives in config.
- Each user's accepted version and the time they accepted it are stored. The consent sheet appears at the first "Get my Outfits", or whenever the accepted version isn't the current one.
- The server refuses to start a Consultation without a current acceptance or both ticks, and it records the acceptance when the ticks arrive.
- **The Demo Account** sees the sheet before every Consultation, and the acceptance (version and time) is stored on that Consultation instead.
- **Withdrawing consent** clears the acceptance and deletes every Consultation, with its photos and Previews. The account stays.

### Accounts (Better Auth configuration and hooks)

**Sign-up** is two steps.
- **Step 1:** date of birth only (day, month and year, all blank).
  - An under-18 date stops there with the age message, sets a 30-day cookie and stores nothing.
  - The cookie shows the same message on step 1.
- **Step 2:** username, email, password, Style Preference (no default), Country (pre-filled) and the Terms checkbox.
- **On the server:** a `hooks.before` on email sign-up runs before anything is read or written. It checks 18+ to the day (setting the cookie on refusal), the region, and the app-wide sign-up email cap.
- **Stored:** only the birth year and month, with the day dropped. Pass the username as `name`, and send `displayUsername` along with `username`.
- **Updates:** the birth fields can't be changed through `updateUser`, except on the Demo Account, which must stay 18+.

**Username and password.**
- Usernames use Better Auth's defaults: 3–30 characters of letters, digits, `_` and `.`, unique ignoring case, shown as typed. They can be changed, and the old name is freed at once.
- Passwords are 8–128 characters, with no composition rules and no breached-password check.

**Verification** is a soft gate.
- `requireEmailVerification: false`, with `sendOnSignUp: true`.
- Links last 24 hours (`expiresIn: 86400`), with `autoSignInAfterVerification: true`. A link clicked after the email is already verified goes straight into the app.
- Only New Consultation is gated.
- Better Auth's error values differ in case between its docs and its code, so match them case-insensitively.

**Sessions.**
- 30 days, rolling, with `updateAge` set to 1 day.
- Rate-limit storage in the database, plus a sign-up `customRules` entry of 3 per IP per hour. The client IP comes from `x-forwarded-for`.
- No account lockout.

**Last active** is our own user field, set from session hooks whenever a session is created or refreshed.

**Password reset.**
- Links last 1 hour.
- A completed reset revokes every session, marks the email verified, and cancels the user's other outstanding reset links.

**Email change.**
- `user.changeEmail.enabled`, with `sendChangeEmailConfirmation`: the old address approves, then the new one verifies.
- `updateEmailWithoutVerification` for unverified users: the change happens at once, a new link goes out, and the 7-day deletion date stays.
- An address already in use gets the neutral reply.

**Password change** needs the current password, signs out the user's other devices, and sends the notice email.

**Account deletion.**
- `user.deleteUser.enabled`, confirmed with the password only. Don't configure `sendDeleteAccountVerification`.
- It cancels any running Styling, then deletes every Consultation and its Blob objects, strips the user from usage and email-log records, and deletes leftover verification tokens in `afterDelete`.
- Afterwards the user is signed out and lands on the landing page with the deleted message.

**Redirects:** signed-in users who open sign-in or sign-up go to the app.

**The Demo Account:**
- Its password, email, username, deletion, consent withdrawal and "Sign out of all devices" are refused on the server too, not just disabled in the UI.
- Its Style Preference, Country and date of birth stay editable.

### Email

- **One send-email function** sends plain-text mail from "Outfit Recommender" through the team Gmail account. It awaits each send and logs it: the kind, the user if any, and the time. It never logs the address.
- **Every cap is enforced inside it,** so Better Auth's public endpoints and `auth.api` calls can't get around them:
  - new sign-ups stop at 300 emails sent in 24 hours, app-wide;
  - every send stops at 450 in 24 hours, resets included;
  - per account per day: 5 verification resends, 3 resets and 3 email changes;
  - at most 50 inactivity warnings a day.
- **The emails and what each must say:**
  - **Verification:** the link, that it lasts 24 hours, and the unverified-account deletion date. Also "Didn't sign up? Ignore this email. The account is removed on <date>."
  - **Password reset:** the link, that it lasts 1 hour, and that nothing changes if the user didn't ask for it.
  - **Email-change approval** (to the old address): that a change to the new address was requested, the approve link, and to contact the team if it wasn't them. It doubles as the "your email is changing" notice.
  - **Email-change verification** (to the new address): the verify link.
  - **Inactivity warning:** the account and its Consultations will be deleted on <date>, 30 days away, unless the user signs in.
  - **Password changed:** sent only for changes made in Settings. It says to reset the password and contact the team if it wasn't them.
- There's no welcome email and no account-deleted email.
- Moving to a domain and an HTTP email provider later only changes this function's transport.

### Daily sweep

One Vercel cron job a day runs one operation that:
- deletes unverified accounts 7 days after sign-up;
- warns accounts whose last activity was 11 months ago (12 months minus 30 days) and that haven't been warned since;
- deletes an account 30 days after its warning was actually sent, if it has had no activity since the warning. Activity after a warning clears it.
- skips the Demo Account in both sweeps;
- purges usage records and email-log rows older than 35 days, and Qloo cache entries older than 30 days.

Deletions go through the same path as a user's own account deletion.

### Pages

- **Landing page:** the "Walkthrough" variant from the landing page prototype, described under "Landing page" below.
- **Sign-up** (two steps), **sign-in**, **verification result**, **forgot password** and **reset password**.
- **New Consultation:** the "Guided steps" wizard from the Consultation flow prototype. A top nav holds New Consultation, My Consultations, Settings and Sign out.
  - **Stepper:** Photo Type → Photo & budget → Styling → Outfits.
  - **Photo Type step:** three stacked choices, each with an example photo, a one-line hint and the Categories it unlocks. Full-Body is the default.
    - An unverified user sees the verify panel instead.
    - A used-up allowance, an app-wide cap, the Qloo backstop or an unsupported region shows here.
  - **Photo & budget step:** Camera and Upload tabs, Retake, and the four Budget Tier buttons (hidden for a Face Photo). It ends with Back and "Get my Outfits", with the allowance line.
    - The consent sheet opens on press when needed.
    - Rejections show here, with the photo and Budget Tier kept.
  - **Styling step:** the checklist. Its last item reads "Generating Previews (n of N)", where N is the number of Outfits the Styling will make. Re-stylings return here with the photo check ticked, and a Budget Tier change also ticks the Style Icons.
  - **Outfits step:** the results page.
- **Results page:**
  - **Header:** the photo, Photo Type, date, the Budget Tier dropdown (body photos only) and the Photo Style editor (1–2 words from the list).
  - **Outfit cards** as described in the user stories, with the "AI-generated" badge on every Preview. Style Icons are shown by name, never with Qloo's image.
  - **"Show 2 more Outfits"** stays on the results page: the current Outfits stay, the button becomes a compact progress checklist, and the new Outfits appear together once both are ready. This settles the prototype's open question in favour of "all at once".
  - **Empty states and messages** as listed under "User-facing copy".
  - **The Demo Account's** shared-history note.
- **My Consultations:** one row per Consultation with the photo, Photo Type, Outfit count, date and Budget Tier, or "Styling…" or "No Outfits". Each row has Open and Delete, and Delete confirms in a modal. The Demo Account's shared-history note shows here too.
- **Settings:** four sections.
  - **Profile:** username, Style Preference, Country, and the date of birth, read-only except on the Demo Account.
  - **Sign-in:** email (with any pending change step), password, and "Sign out of all devices", which needs no confirmation.
  - **Privacy:** "Withdraw photo consent" (a confirmation modal with no password), links to `/privacy` and `/terms`, and "Email us for a copy of your data".
  - **Danger:** "Delete account".
  - On the Demo Account, locked items show their values, disabled, with a lock icon and "Managed by the team".
- **`/privacy` and `/terms`** are public. They're linked from sign-up, the consent sheet, the landing page and the footer.

### Privacy Policy and Terms (acceptance criteria; the implementation issue writes the text)

**`/privacy` must disclose:**
1. Who we are: "the Outfit Recommender team", with the members named, and the team Gmail as the single contact for privacy requests and complaints.
2. Our GDPR Article 27(2) exemption from appointing an EU representative, with the reasoning.
3. What we collect:
   - username, email and the hashed password;
   - birth year and month;
   - Style Preference and Country;
   - photos and Previews;
   - the Photo Style, what's visible in a photo, and whether the hair is covered;
   - usage records.
4. Purposes and the legal basis for each.
5. Recipients:
   - Google's Gemini, as our processor, gets the photos;
   - Qloo gets only the age group, the gender signal, the Country, Photo Style tags and entity IDs;
   - our hosting, database and storage providers;
   - email addresses pass through Gmail under Google's own privacy policy.
6. International transfers and their safeguards.
7. Retention:
   - Consultations are kept until the user deletes them, withdraws consent or deletes the account;
   - inactive accounts are deleted after 12 months, with a warning 30 days before;
   - unverified accounts are deleted after 7 days;
   - usage records last about 35 days;
   - Google's abuse-monitoring copy lasts 55 days;
   - Workflow run data (which holds Blob pathnames, Style Icons and Piece text, never images) lasts 1 day;
   - Neon's restore window is 6 hours;
   - runtime logs last 1 hour;
   - Gmail sent copies are purged daily.
8. Rights: access, rectification, erasure, restriction, objection and portability. Access and export are by email and answered within a month. Deletion is self-serve, and deletions asked for by email are done within 30 days.
9. The right to withdraw consent, and how.
10. The right to complain to a supervisory authority, and our own email complaints route, answered within 30 days.
11. That a photo is required to get Outfits.
12. That recommendations are automated, including the Photo Style the AI reads, with no legal or similarly significant effect.
13. The 18+ rule, and that an account found to belong to someone under 18 is deleted.
14. A **Photos** section with:
    - the biometric notice: AI processes face and body only to edit the image;
    - no face templates, no age guessing and no sensitive inferences;
    - the release;
    - that photos are redrawn in the browser, which drops location metadata;
    - the public retention and destruction schedule, with the deletion promise (see "User-facing copy").
15. That Previews are AI-generated and labelled so.
16. The content rules: only photos of yourself, which you have the rights to, and no nudity or intimate images.

**`/terms` must state:**
- the 18+ rule;
- the content rules;
- that this is a free hackathon project, with no affiliation with Style Icons or Brands.

### Landing page

- **The "Walkthrough" layout:**
  - On wide screens the picture sticks on the left and changes with each step. On phones it sits above each step's text.
  - **Header:** the logo, plus "Sign in" (or "Open the app" when signed in).
  - **Opener:**
    - the line "One photo, start to finish";
    - a headline that doesn't call the person real;
    - the legend "Qloo decides what to recommend" and "AI makes it concrete and shows it on you";
    - "Scroll to follow along", plus a way to skip ahead to sign-up.
- **The 7 steps:**
  1. **You:** the Full-Body Photo.
  2. **AI:** the photo check, and the Photo Style it reads, which the user can edit.
  3. **Qloo:** the ranked Style Icons, with the example's Style Preference, age group, Country and Photo Style.
  4. **Qloo:** the Brands for the first Style Icon, within the example's Budget Tier.
  5. **AI:** the tailored Pieces, each with why it suits.
  6. **AI:** a before/after slider between the photo and its Preview.
  7. **You:** the finished Outfit card.
- **Then:**
  - "Not after a whole Outfit?", with a Face Photo example and a Body-Only Photo example, each as photo → Preview, covering the other Style Preference between them.
  - **The final call to action:** "Now try it on your own photo", a "Create a free account" button with "Free · Up to 10 Outfits a day" under it, one line saying photos go to Google's Gemini to make Previews, and links to Privacy and Terms.
  - **Footer:** "Built for the Qloo LLM Hackathon", "For adults 18+", "Style Icons and Brands aren't affiliated with Outfit Recommender", and links to Privacy and Terms.
- **Labels and naming:**
  - The AI steps just say "AI". Gemini is named only in the line by the final button.
  - Style Icons are shown by name with initials, never with photos.
  - The 18+ rule appears in the footer only.
- **Content source: frozen Consultations.**
  - The text of three real Consultations made on the Demo Account ships with the page as static data: the Photo Style, Style Icons, Brands and Pieces.
  - The images (the AI-generated photos and their Previews) ship with the page under `public/landing/samples/`. This replaced the private Blob store on 2026-10-19, when the team chose an AI-generated photo it supplied itself over the Pixabay images, whose licence was why they stayed out of the repo.
  - Visitors never trigger a Qloo or Gemini call.
- **Captions:** every sample person gets "AI-generated person: not a real person." beside the photo, with alt text "AI-generated photo of a fictional person". Every Preview gets the "AI-generated" badge.

### Demo Account

- **Creation:** a one-off team script creates it against production through Better Auth's server API:
  - already verified;
  - username `demo`;
  - the team Gmail's `+demo` plus-address as its email, so resets reach the team;
  - the password from an environment variable, never a file;
  - a date of birth in the 25–29 age group (for example January 2000).

  Config names the account by email.
- **Exemptions:** no usage limits, no per-user Styling lock, and both sweeps skip it.
- **Still applies:**
  - the per-Consultation Styling lock;
  - the photo check;
  - the region gate;
  - 18+ on its date of birth;
  - consent before every Consultation.

### Team scripts

All three go through the same code paths as the app:
- create the Demo Account;
- correct a user's birth year and month by hand, which deletes the account if the correction shows the user is under 18;
- delete an account by email, for emailed requests and under-18 reports.

Data exports are assembled by hand.

### Data model

**Users** (Better Auth's user table plus our fields):
- username and display username;
- email and email verified;
- Style Preference (menswear, womenswear or no preference);
- Country code;
- birth year and month;
- accepted photo-notice version and time;
- last active;
- inactivity warning sent at.

Better Auth also keeps its session, account, verification and rate-limit tables.

**Consultations:**
- user, creation time, Photo Type, the photo's Blob pathname;
- what's visible, and whether the hair is covered;
- the current Photo Style (1–2 words) and the current Budget Tier (none for a Face Photo);
- state: Styling, ready, or No Outfits;
- the Demo Account's consent version and time.

**Stylings:**
- Consultation and user;
- kind: first, more, Budget Tier change, Photo Style change, or try again;
- the target Budget Tier and Photo Style;
- status: running, succeeded or failed;
- stage, and when the stage last moved;
- Outfits wanted and Outfits made;
- failure reason: nothing could be built, or something broke;
- the Workflow run ID;
- start and finish times.

Unique constraints enforce one running Styling per Consultation and one per non-Demo user.

**Style Icons:** one row per ranked Style Icon of a Consultation:
- the Styling that picked it, and its position;
- Qloo entity ID and name;
- line;
- status: unused, used or skipped.

A Photo Style change's list becomes current only when its Styling succeeds.

**Outfits:**
- Consultation, the Styling that made it, and its position;
- Style Icon;
- whether it's current;
- the Brand picks, including a left-out Bottom Brand that stays reserved;
- the Preview's state (pending, ready, refused or failed), Blob pathname and refusal reason category.

**Pieces:**
- Outfit;
- Category: Hairstyle, Top, Bottom, Shoes or One-Piece;
- for Brand Pieces: Brand entity ID, name, official site, and price minimum and maximum;
- item, details and why;
- the unknown-cut flag (Hairstyle only).

**Usage records:** kind (Outfit or photo check), the user (nullable, cleared when the account is deleted) and the time. They hold no photo and no Outfit content.

**Email log:** kind, the user (nullable) and the time. No address.

**Qloo cache:** the canonical request key, the trimmed body and the time fetched.

**Qloo limit state:** remaining calls, reset date if known, and when it was observed.

**Deletion:** deleting a Consultation deletes its Stylings, Style Icons, Outfits and Pieces, plus its photo and Preview Blob objects. Usage records are kept.

### User-facing copy (acceptance criteria)

**Age and sign-up:**
- "You need to be 18 or older to use Outfit Recommender."
- "That username is taken"
- "An account with that email already exists. Sign in or reset your password."
- "We can't take new sign-ups right now. Please try again tomorrow."

**Verification:**
- The banner: "We sent a link to <email>. Verify it to start your first Consultation. Unverified accounts are deleted on <date>." with "Resend link" and "Change email".
- After clicking the link: "Email verified".
- A bad link: "This link has expired or isn't valid", with "Send a new link" or "Sign in to get a new one".

**Sign-in and account:**
- "That username or email and password don't match."
- "If an account uses that email, we've sent a link."
- "If that address isn't already in use, we've sent a link to it."
- "Born <Month YYYY> · Wrong? Email us"
- "Managed by the team"
- After deletion: "Your account has been deleted."
- The account-deletion modal: "This deletes your account and every Consultation, with its photos and Previews, right away. Copies in our providers' systems are gone within a day, and Google's abuse-monitoring copy within 55 days. This can't be undone."
- The deletion promise, on `/privacy` and the consent sheet: "Your photos and Previews are deleted immediately. Leftover records in our providers' systems are gone within a day, and Google's abuse-monitoring copy within 55 days."
- The withdraw-consent modal says every Consultation, photo and Preview goes for good, and that the consent sheet comes back before the next Consultation.
- The delete-Consultation modal says its photo, Outfits and Previews are gone for good.

**Photo intake and check:**
- "This file is over 20 MB."
- "We couldn't open this file. Try a JPEG, PNG or WebP photo."
- "Something went wrong with this photo. Try another."
- "This looks like a <Photo Type>.", with the button "Use it as a <Photo Type>". The switch sends the same photo again as a fresh check.
- "We couldn't find a person in this photo."
- "There's more than one person here. Use a photo of just you." (superseded by [Group Photos](../group-photos/spec.md))
- "This photo is too blurry, dark or tightly cropped to work with."
- "We can't use this photo.", with the content rule beneath it.
- "We need to see your hair to suggest a Hairstyle."
- "We couldn't check your photo just now. Try again in a moment."

**Region and consent:**
- "Outfit Recommender isn't available where you are right now." It mentions neither the Country setting nor VPNs.
- "To get Outfits, agree to both boxes on the consent sheet."

**Limits:**
- "Uses <n> of your <left> Outfits left today"
- "You've made today's 10 Outfits. More from <time>."
- The photo-check limit (new wording, settled here): "You've checked 20 photos today. More from <time>."
- "Outfit Recommender has made all the Outfits it can for now. Please try again in a few hours."
- "Outfit Recommender has made all the Outfits it can for this month. Back on <date>." For the Qloo backstop, the date is Qloo's reset date if known.

**Styling and results:**
- "This is taking longer than usual."
- A Preview placeholder: "No Preview for this Outfit: the image model declined to make one" (a refusal) or "…couldn't make one" (a failure).
- When every Preview was refused: "The image model declined this photo. A different photo may work better."
- When the Style Icons run out: "That's every Outfit we can build for this photo. Try another Budget Tier or Photo Style for more." A Face Photo suggests only the Photo Style.
- A failed re-styling: "We couldn't build Outfits at <tier> for this photo. Your <previous tier> Outfits are still here." A Photo Style change gets the equivalent wording.
- A failed "Show 2 more Outfits" keeps the Outfits, and the button is replaced by the run-out line.
- A new Consultation that couldn't be built: "We couldn't build Outfits for this photo at <tier>. Try another Budget Tier or Photo Style."
- A new Consultation that broke: "Something went wrong while styling.", with "Try again".

**Demo Account:** "Shared demo account: anyone with this login can see Consultations made here. Delete yours when you're done."

### Setup and operations (one-off steps for the team; each needs its own issue or checklist)

- **Vercel:**
  - turn Fluid compute on;
  - opt out of Vercel AI training (Team Settings → Data Preferences) before storing any photo;
  - add the daily sweep cron.
- **Neon:** create it through the Marketplace. Preview branches start from an empty or seed branch, never from production. Keep the default 6-hour restore window.
- **Blob:** create the private store.
- **Gemini:**
  - a billing-enabled project;
  - API logging off and no dataset sharing;
  - a Cloud Billing spend-cap budget of $50 on the Gemini API, plus alert budgets;
  - on Prepay, keep auto-reload able to cover $50;
  - read the Tier 1 rate limits for the three models at `aistudio.google.com/rate-limit`.
- **Team Gmail:**
  - create the account early, with 2-Step Verification and an app password. The app password stops working whenever the account's password changes.
  - add an Apps Script trigger that runs daily and permanently deletes sent mail older than 1 day, using the Gmail API's delete with the full-mail scope.
- **Demo Account:** run the creation script once, after the production database exists. Send its login to the judges privately. The team deletes its own test Consultations before submitting.
- **Landing page images:**
  - pick clearly adult AI-generated images: one Full-Body person, plus a Face Photo and a Body-Only Photo between them covering both Style Preferences;
  - run a reverse-image search on each;
  - after the app works, run the three frozen Consultations on the Demo Account and export each, which writes its text and images into the repo for the page to ship with.
- **First real Consultations:** check them on the Demo Account with phone photos, since the Preview test used only small web images.

## Testing Decisions

**What makes a good test here:** it exercises behaviour through a seam the rest of the app also uses, and asserts on what a user or the team could observe. That means what the server operations return, what ends up in the database and Blob, which emails were sent, and which Qloo requests went out. Tests never assert on internal call order or private helpers, so the internals can be refactored freely. No test calls Gemini, and no fixture holds bulk Qloo data.

**Seam 1: server operations (most tests).**
- **Real database:** Postgres in-process (PGlite) with the real Drizzle migrations, fresh per test file.
- **Fakes, only at the edges:**
  - the fake AI adapter, with scenarios set in code and zero delay;
  - a fake Qloo transport serving small hand-written responses and recording every request;
  - a capturing email transport;
  - an in-memory Blob store;
  - an injectable clock.
- **Better Auth** runs for real against the same database, driven through its server API.
- **Stylings** run through an inline runner that calls the same step functions in order. The Workflow function is a thin shell over those steps and isn't itself under test.
- **Behaviours to cover:**
  - each of the six photo rejections and the check error;
  - rejected photos storing nothing;
  - the wrong-type switch;
  - covered hair dropping the Hairstyle;
  - Face Photo Outfits being Hairstyle-only;
  - One-Piece cards;
  - unknown-cut Hairstyles;
  - tailoring substitutes and their cap;
  - refused and failed Preview placeholders;
  - "Show 2 more Outfits" de-duplication and running out;
  - Budget Tier and Photo Style changes switching in only on success;
  - failed new Consultations and Try again;
  - the stuck-Styling check;
  - both Styling locks;
  - the Outfit Allowance across a rolling window, including partial Stylings;
  - the photo-check limit;
  - the app-wide caps;
  - the Qloo backstop, with and without the header;
  - the region gate;
  - consent recording, re-showing on a new version, and Demo Account per-Consultation consent;
  - withdrawing consent;
  - deleting a Consultation mid-Styling;
  - account deletion clearing Blob, Consultations, tokens and usage-record users;
  - the age gate and the cookie;
  - the stored birth year and month;
  - every email cap;
  - password reset side effects;
  - both email-change paths;
  - the daily sweep's warn, delete and skip rules;
  - Demo Account exemptions and its locked operations refused on the server.
- **The Qloo privacy commitment:** a test asserts that recorded Qloo requests contain no user identifiers. A type-level test asserts that the Qloo request type has no user fields.

**Seam 2: Outfit assembly (pure).**
- Small hand-written Qloo samples in; queries, ranked Style Icons, Pieces and Outfits out.
- **Covers:**
  - the query parameters for each Photo Type, Budget Tier, age group, Country with and without a `key_market` tag, and Style Preference, including the no-preference interleave and per-line gender signal;
  - the death-date and denylist filters;
  - the Style Preference rule;
  - the apparel and footwear filter;
  - the retailer and off-category denylists;
  - the price guard;
  - thin-pool widening order;
  - the Piece pick order, the denim preference and Shoes never sharing a Brand with the Top or Bottom;
  - de-duplication across Outfits, including a reserved Bottom Brand;
  - skipping a Style Icon that can't complete an Outfit;
  - price-range sums;
  - the `official_site` link rule.

**Browser smoke tests (thin).** Playwright against local development with the fake adapter and a capturing email inbox. Four flows:
1. sign up through both steps and verify by link;
2. New Consultation → consent sheet → Styling checklist → two Outfit cards;
3. a wrong-Photo-Type rejection and the one-tap switch;
4. deleting a Consultation from My Consultations.

Everything else in the UI is checked by hand before submission.

**Live checks (opt-in, never in CI):**
- one read-only Qloo tag call confirming that all 11 Photo Style words are real `personal_style` tags;
- a manual Gemini adapter smoke run, which costs money and needs the user's go-ahead.

**Prior art:** none in the code yet. The repo has no application code. The throwaway prototype and research branches aren't test prior art, but the Preview bake-off harness records the Gemini request settings that worked.

## Out of Scope

- **Swapping a single Piece** inside an Outfit.
- **Finer-grained "popular near you"** (city or GPS). Only a Country is collected.
- **Product-level shopping,** affiliate links or in-app purchase. Pieces link only to the Brand's official site.
  > **Replaced** by the [Real Products spec](../real-products/spec.md) and [ADR-0008](../../docs/adr/0008-pieces-are-real-products.md): Pieces are real Products, each linked to its own page. Affiliate links and in-app purchase stay out of scope.
- **Users under 18,** and a second AI provider for them.
- **A "regenerate Preview" button,** automatic Preview quality checks, and reusing Outfits across Budget Tiers, Photo Styles or repeated photos.
- **CAPTCHA,** a breached-password check, account lockout, a "remember me" box, and welcome or account-deleted emails.
- **A custom domain** and an HTTP email provider such as Resend (the send function keeps the door open).
- **Self-serve data export.** Exports are by email request.
- **Languages other than English.**
- **Analytics** and marketing.
- **The hackathon submission itself:** the Devpost entry, the demo video, judging criteria, and which Vercel plan and repo setup deploys the team's co-authored commits. The map leaves these open. The only parts in scope are the landing page as the demo link's first screen and the Demo Account.
- **A review by someone legally qualified.** It's a known gap, not a blocker.

## Further Notes

- **Deadline:** the map says there's no deadline, but the privacy research quotes the hackathon rules: the submission period ends **2026-10-30**. Hobby's block on deploying co-authored commits from a private repo is unresolved and sits on the critical path for a public demo link.
- **Settled while writing this spec:**
  - "Show 2 more Outfits" shows its new Outfits together once both are ready, with the current Outfits staying visible meanwhile.
  - A no-preference user's Brand calls and tailoring use the line of the Outfit's Style Icon.
  - The region check runs on every Styling, not just the first.
  - A Styling fetches Brands for at most 6 Style Icons.
  - Landing page images ship with the page as static files.
  - The photo-check limit has its own message.
  - Team scripts handle birth-date corrections and emailed deletions.
- **Checked while writing:** one read-only Qloo call on 2026-10-15 confirmed that Brands carry `properties.official_site`, and showed 9,703 calls left in the window that resets on 2026-11-13.
- **Untested:**
  - Preview refusal handling against real responses (none of the 32 bake-off calls was refused). The fake adapter covers it.
  - Previews from phone photos.
- **Hobby Blob limits** (1 GB, 2,000 writes a month) bind before the 750-Outfit monthly cap does. Each Consultation writes one photo and up to two Previews per Styling. Watch this on the Demo Account.
- **Source detail lives in the map's resolved tickets and their research notes,** on the `research/*` branches under `.scratch/outfit-recommender-map/research/`: the Qloo request logs, the full age, tier and denylist reasoning, the Better Auth source check, and Gmail's limits. The throwaway prototypes are on `prototype/consultation-flow`, `prototype/landing-page` and `prototype/preview-bakeoff`.
- **Next step:** slice this spec into numbered vertical implementation issues under `.scratch/outfit-recommender/issues/`, as the map's destination requires.
