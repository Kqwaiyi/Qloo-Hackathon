# 08: Camera capture with Photo Type outlines

**What to build:** On the Photo & budget step, the user can take their photo with the browser's camera instead of uploading one, framed by an outline for their chosen Photo Type, and retake it before sending.

**Blocked by:** [06 Upload a photo to start a Consultation](06-upload-photo-start-consultation.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Photo intake" (Camera) and "Pages" (Photo & budget step). Stories 67–69.

- [x] The Photo & budget step has Camera and Upload tabs.
- [x] The camera view shows a dashed outline for the chosen Photo Type, matching the silhouette used as that type's example on the Photo Type step.
- [x] A Body-Only Photo adds a "keep your face above this line" guide.
- [x] The user can Retake before sending.
- [x] A captured photo goes through the same redraw as an upload (a JPEG of at most 1600 px on its long side, with metadata dropped) and the same "Get my Outfits" path.
- [x] Without camera access, the user can still upload.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **Camera is the default tab,** as in the prototype, so the camera starts (and the browser asks for access) when the user reaches the Photo & budget step. The photo-check smoke test now clicks Upload first.
- **Each tab shows its own photo.** The tabs stay visible, the Camera tab shows a photo taken there (with Retake) and the Upload tab one picked there (with "Choose another"), and "Get my Outfits" sends the one on screen. Switching tabs clears the problem message, including a "Use it as a <Photo Type>" offer, since it was about the other tab's photo. Going Back and on again reopens the tab the photo came from.
- **What's in the frame is what's sent.** The photo box is now 4:5 for both tabs, the same as the silhouette frames. The outline is the silhouette's own figure and frame, traced as a dashed line (`PhotoTypeOutline` in `src/components/photo-type-silhouette.tsx`), and a photo taken is cropped to the on-screen box the way `object-cover` crops the video. It then goes through the same `redrawAsJpeg` as an upload (`shrink-photo.ts`).
- **The view is mirrored, the photo isn't.** Like most camera apps, the live view is a mirror, but the photo taken shows the user as others see them, the same as an upload. So writing on their clothes reads the right way round in the photo and in Previews.
- **The camera asks for about 1920 px either way round** from the front camera, and stops whenever it isn't on screen: once a photo is taken, on the Upload tab, and on leaving the step.
- **Without the camera,** the box says why (no camera support on this page, access blocked, no camera found, or the camera couldn't start) with "Upload a photo instead", which opens the picker straight away, and "Try again" where retrying can help. These messages aren't spec copy, so they live in `camera.tsx`. "keep your face above this line" is spec wording, so it's in `COPY`.
- **Not tested automatically:** the spec fixes the smoke tests at four flows. The camera was checked by hand with Chrome's fake camera (`--use-fake-device-for-media-stream`): the outline for each Photo Type, the Body-Only guide on desktop and at 375 px, Take photo → Retake → Take photo, a 1281 × 1600 JPEG landing on the Consultation page, and the fallback with no camera access.
