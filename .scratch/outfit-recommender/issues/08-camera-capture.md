# 08: Camera capture with Photo Type outlines

**What to build:** On the Photo & budget step, the user can take their photo with the browser's camera instead of uploading one, framed by an outline for their chosen Photo Type, and retake it before sending.

**Blocked by:** [06 Upload a photo to start a Consultation](06-upload-photo-start-consultation.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Photo intake" (Camera) and "Pages" (Photo & budget step). Stories 67–69.

- [ ] The Photo & budget step has Camera and Upload tabs.
- [ ] The camera view shows a dashed outline for the chosen Photo Type, matching the silhouette used as that type's example on the Photo Type step.
- [ ] A Body-Only Photo adds a "keep your face above this line" guide.
- [ ] The user can Retake before sending.
- [ ] A captured photo goes through the same redraw as an upload (a JPEG of at most 1600 px on its long side, with metadata dropped) and the same "Get my Outfits" path.
- [ ] Without camera access, the user can still upload.
