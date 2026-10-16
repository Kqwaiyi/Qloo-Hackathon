import { PHOTO_MAX_LONG_SIDE_PX, PICKER_MAX_FILE_BYTES, SERVER_MAX_PHOTO_BYTES } from "@/config/consultations";

export type ShrinkResult = { ok: true; photo: Blob } | { ok: false; problem: "too-large" | "unreadable" };

// Lower qualities are tried only if a photo is still over the server's limit, which is rare at
// 1600 px.
const JPEG_QUALITIES = [0.85, 0.7, 0.55];

/** The part of a picture to keep, in its own pixels. */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Shrinks a picked file with `redrawAsJpeg`, refusing files over 20 MB and ones that won't open. */
export async function shrinkPhoto(file: File): Promise<ShrinkResult> {
  if (file.size > PICKER_MAX_FILE_BYTES) return { ok: false, problem: "too-large" };
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height) return { ok: false, problem: "unreadable" };
    const photo = await redrawAsJpeg(image, { x: 0, y: 0, width, height });
    return photo ? { ok: true, photo } : { ok: false, problem: "unreadable" };
  } catch {
    return { ok: false, problem: "unreadable" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Redraws `crop` of any picture the browser can draw, an uploaded image or a camera frame, as a
 * JPEG at most 1600 px on its long side. Redrawing drops metadata such as GPS location, and keeps
 * the photo the right way up.
 */
export async function redrawAsJpeg(source: CanvasImageSource, crop: Crop): Promise<Blob | null> {
  const scale = Math.min(1, PHOTO_MAX_LONG_SIDE_PX / Math.max(crop.width, crop.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width * scale));
  canvas.height = Math.max(1, Math.round(crop.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  // JPEG has no transparency: see-through parts turn white, not black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);

  let photo: Blob | null = null;
  for (const quality of JPEG_QUALITIES) {
    photo = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!photo || photo.size <= SERVER_MAX_PHOTO_BYTES) break;
  }
  return photo;
}
