# What does the user see when a Consultation step fails?

Type: grilling
Status: resolved
Blocked by: 08, 10, 12
Map: [Outfit Recommender](../map.md)

## Question

In the guided-steps flow chosen in "Prototype the Consultation flow", what does the user see, and what can they do next, when a step fails?

- The photo check rejects the photo for one of the six reasons decided in "What do we ask the AI model at each step?": wrong Photo Type (with the type it looks like, so a switch could be offered), no person, more than one person, too unclear, not appropriate, or hair not visible (Face Photos only). The check runs in the "Get my Outfits" server action before anything is stored, so a rejected photo creates no Consultation (decided in "What's the architecture?").
- The photo is over the size limit or isn't a JPEG, PNG or WebP image (limits in "What's the architecture?").
- "Get my Outfits" is refused because Vercel's IP-country header names a region Gemini doesn't serve. The same check refuses sign-up (decided in "What consent, retention and minimum age do we commit to?").
- The user closes the one-time consent sheet without ticking both of its boxes.
- Qloo returns too few Style Icons or Brands, even after the quiet widening in "How does Qloo build and rank Outfits?", including when the Style Icons run out and "Show 2 more Outfits" disappears.
- Tailoring fails for an Outfit after its one retry.
- The image model refuses a Preview (final, never retried) or fails it.
- Whether a failed run still uses the Outfit Allowance, and whether its Consultation is kept in history.
  - Usage is recorded separately from Consultations, one row per Outfit made, so a refund is possible.
  - "What limits keep AI and Qloo spend bounded?" already settles what the user sees when a limit is hit. This ticket decides only what a failure does to the count.
  - The Demo Account has no allowance.

## Answer

Resolved with the user on 2026-10-15. One pass that builds Outfits (a new Consultation, "Show 2 more Outfits", or a change of Budget Tier or Photo Style) is now a **Styling** in [GLOSSARY.md](../../../GLOSSARY.md). The **Outfit Allowance** entry now says when an Outfit counts, and an **Outfit** may have no Preview. No ADR: all of this is cheap to change.

**1. Photo check rejections.** The user goes back to the Photo & budget step with their photo and Budget Tier kept. They see one specific message and can Retake or Choose another photo. A rejected photo still creates no Consultation.
- **Wrong Photo Type:** "This looks like a Full-Body Photo." A "Use it as a Full-Body Photo" button switches the type and sends the same photo again. That's a fresh check, and it counts towards the 20 a day.
- **No person:** "We couldn't find a person in this photo."
- **More than one person:** "There's more than one person here. Use a photo of just you."
- **Too unclear:** "This photo is too blurry, dark or tightly cropped to work with."
- **Not appropriate:** "We can't use this photo," with the content rule beneath it. No further reason and no account penalty: the 20-check limit handles repeats.
- **Hair not visible** (Face Photos): "We need to see your hair to suggest a Hairstyle."
- **The check itself errors** after the AI SDK's retries: "We couldn't check your photo just now. Try again in a moment." This one doesn't count towards the 20.
- **A Face Photo that shows the whole body is accepted.** It meets the Face Photo rule, and a head too small to work with is "too unclear".

**2. File intake.**
- The picker accepts any image the browser can open. The browser always redraws it as a JPEG of at most 1600 px on its long side, which also drops hidden metadata such as GPS location.
- Errors show at the picker, before anything is sent: "This file is over 20 MB." or "We couldn't open this file. Try a JPEG, PNG or WebP photo."
- The server's 2 MB and file-type refusal only catches requests that skipped the browser. It shows "Something went wrong with this photo. Try another." and doesn't count as a photo check.

**3. Unsupported region.**
- Checked as soon as the user opens New Consultation, and shown on the Photo Type step before any photo is taken, like a used-up allowance. "Get my Outfits" checks again.
- "Outfit Recommender isn't available where you are right now." It mentions neither the Country setting nor VPNs.
- Reading and deleting Consultations still work. No photo check is counted.

**4. Consent sheet.**
- Its Continue button stays disabled until both boxes are ticked.
- Closing it (✕, Escape or tapping outside) returns to the Photo & budget step with the photo and Budget Tier kept. Nothing is sent, stored or counted.
- A quiet line under "Get my Outfits" says "To get Outfits, agree to both boxes on the consent sheet."
- The sheet always reopens with both boxes unticked. The Demo Account behaves the same way, per Consultation.

**5. Inside a Styling.**
- **Tailoring fails** after its retry: that Outfit is skipped and the next Style Icon is tried, like a Style Icon that can't complete an Outfit. The user never sees it. At most 2 substitutes per Styling, so a broken model can't burn through the Style Icons.
- **A Preview is refused or fails:** the Outfit is shown with a placeholder where the Preview goes: "No Preview for this Outfit: the image model declined to make one" (or "couldn't make one").
  - Its Pieces, links and reasons stay.
  - There's no retry button. The Workflow step has already retried transient errors.
  - If every Preview in a Consultation is refused, one line under the list says "The image model declined this photo. A different photo may work better."
- **"Show 2 more Outfits"** keeps going down the Style Icon list until it has 2 Outfits or the list runs out, with at most 6 Brand calls per Styling.
- **When the Style Icons run out,** the button is replaced by "That's every Outfit we can build for this photo. Try another Budget Tier or Photo Style for more." For a Face Photo it suggests only the Photo Style.

**6. When a Styling fails.** A Styling fails **only when it ends with no Outfit**. One that makes an Outfit and then breaks has succeeded with what it made. The checklist never shows a red step: every Styling, failed or not, ends on the results page.
- **Budget Tier or Photo Style change:** the old Outfits, Budget Tier and Photo Style stay until the Styling ends, then switch in one go if it made anything.
  - If it failed, the user lands on the old Outfits with a message: "We couldn't build Outfits at Low for this photo. Your No Budget Outfits are still here."
  - This refines "Prototype the Consultation flow" and "What's the architecture?": the old Outfits are replaced only by a Styling that succeeds.
- **"Show 2 more Outfits":** the existing Outfits stay, with a message, and the button is replaced by the line from section 5.
- **A new Consultation is kept.** Its results page shows the usual header (photo, Photo Type, Budget Tier, Photo Style) and an empty state in place of the cards.
  - Nothing could be built: "We couldn't build Outfits for this photo at Low. Try another Budget Tier or Photo Style." The header's own controls do that.
  - Something broke: "Something went wrong while styling." with **Try again**. It restarts from the stage that broke, with no new photo check, and goes through the usual allowance check.
  - A Consultation that has no Style Icons yet starts any Styling from the Style Icons.
  - My Consultations lists it as "No Outfits", with the usual Delete.
  - Deleting it automatically was rejected: a Consultation would silently vanish for a user who left during Styling, and a passing outage would force a retake.
- **Stuck Styling:** a Styling whose stage hasn't moved for 10 minutes counts as failed.
  - The check runs whenever something reads the status: the Styling poll, My Consultations, or starting a Styling. No cron job is needed.
  - A stale Workflow run is cancelled if it's still alive, both locks are released, and the user gets the outcome above.
  - If one step takes over 60 s, the checklist adds "This is taking longer than usual."

**7. Outfit Allowance.** An Outfit counts once it's saved for the user to see, with or without a Preview. Nothing is given back.
- Giving back Outfits whose Preview was refused was rejected. Refusals are billed and tend to follow the photo, so a refusal-prone photo and repeated "see more" could make many uncounted, paid Previews and use up the app-wide 100 a day on its own.
- Outfits skipped after a tailoring failure, and failed Stylings (which make nothing), never count.
- The app-wide caps count the same rows. Every paid Preview belongs to a shown Outfit, so they still track spend.
- The Demo Account still has no allowance.

**Passed on.**
- **The spec:**
  - fake-adapter scenarios for a photo check that errors and a Preview that fails without being refused, alongside the existing ones;
  - `/privacy` says photos are redrawn in the browser, which drops location metadata.
- **The data model:**
  - a Consultation's "No Outfits" state and its failed Styling's reason;
  - when the current Styling's stage last moved, for the stuck check;
  - which Outfits are current, so a re-run's Outfits switch in only when it succeeds.
