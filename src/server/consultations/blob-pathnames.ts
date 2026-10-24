import type { PhotoMediaType } from "@/server/ai/provider";

// Where a Consultation's photo and Previews are kept in the private Blob store. Everything of a
// Consultation's lives in its own folder, so deleting the Consultation deletes the folder, catching
// even a Preview that a Styling stored and never got to save.

const PHOTO_EXTENSIONS: Record<PhotoMediaType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** The Consultation's folder. */
export function consultationFolder(consultationId: string): string {
  return `consultations/${consultationId}`;
}

/** The Consultation's photo, stored as it was sent, named for its format. */
export function photoPathnameFor(consultationId: string, mediaType: PhotoMediaType): string {
  return `${consultationFolder(consultationId)}/photo.${PHOTO_EXTENSIONS[mediaType]}`;
}

/** An Outfit's Preview, beside its Consultation's photo. */
export function previewPathnameFor(consultationId: string, outfitId: string): string {
  return `${consultationFolder(consultationId)}/previews/${outfitId}.webp`;
}

/** The redraw of an Outfit's Preview, beside it: the Outfit's Preview once the Preview phase keeps it. */
export function previewRedrawPathnameFor(consultationId: string, outfitId: string): string {
  return `${consultationFolder(consultationId)}/previews/${outfitId}-redraw.webp`;
}
