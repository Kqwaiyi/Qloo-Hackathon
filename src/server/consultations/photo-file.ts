import sharp from "sharp";

import { SERVER_MAX_PHOTO_BYTES } from "@/config/consultations";
import type { Photo, PhotoMediaType } from "@/server/ai/provider";

const MEDIA_TYPES: Partial<Record<string, PhotoMediaType>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const PHOTO_EXTENSIONS: Record<PhotoMediaType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Far above any photo the browser sends (1600 px on its long side), but low enough that a small
// file can't expand into a huge image when decoded.
const MAX_PIXELS = 50_000_000;

/**
 * The uploaded file as a Photo, or null when it is over 2 MB or doesn't decode as a JPEG, PNG or
 * WebP image. The bytes are kept exactly as uploaded.
 */
export async function readPhotoFile(file: Blob): Promise<Photo | null> {
  if (file.size > SERVER_MAX_PHOTO_BYTES) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_PIXELS });
    const mediaType = MEDIA_TYPES[(await image.metadata()).format];
    if (!mediaType) return null;
    // Decodes the whole image (shrunk on load, so it stays cheap): a cut-off file fails here.
    await image.resize(256, 256, { fit: "inside" }).raw().toBuffer();
    return { bytes, mediaType };
  } catch {
    return null;
  }
}
