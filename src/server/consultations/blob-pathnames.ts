import type { PhotoMediaType } from "@/server/ai/provider";

// Where a Consultation's photo and Previews are kept in the private Blob store. Everything of a
// Consultation's lives in its own folder, so deleting the Consultation deletes the folder, catching
// even a Preview that a Styling stored and never got to save. The landing page keeps its copies of
// a frozen sample Consultation's images in a folder of their own, which deleting it leaves alone.

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

/**
 * Where the landing page keeps its copies of a frozen sample Consultation's photo and Preview:
 * apart from the Consultation's own folder, so deleting the Consultation leaves the public page as
 * it is.
 */
export function landingSampleFolder(consultationId: string): string {
  return `landing/${consultationId}`;
}

/** The landing page's copy of a frozen sample Consultation's photo or Preview, in its folder. */
export function landingSamplePathname(consultationId: string, fileName: string): string {
  return `${landingSampleFolder(consultationId)}/${fileName}`;
}
