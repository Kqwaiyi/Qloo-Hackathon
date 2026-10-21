import { PRODUCT_PHOTO_MAX_BYTES, PRODUCT_PHOTO_TIMEOUT_MS } from "@/config/product-search";
import { type Photo, PHOTO_MEDIA_TYPES, type PhotoMediaType } from "@/server/ai/provider";

// Product photos for Previews (spec: "Preview contract and Product photos", ADR-0008). Each Preview
// step fetches its Products' photos from their sellers itself, and they go to the image model
// inline: they're never stored, cached or logged.

/** Sends one HTTP request for a Product photo. `fetch` in deployments; a fake in tests and local development. */
export type ProductPhotoTransport = (request: Request) => Promise<Response>;

export interface ProductPhotoOptions {
  transport: ProductPhotoTransport;
  /** How long a photo may take to arrive in full. PRODUCT_PHOTO_TIMEOUT_MS unless tests say otherwise. */
  timeoutMs?: number;
}

/** Where Product photos are fetched from: their sellers' own servers. */
export class ProductPhotos {
  constructor(private readonly options: ProductPhotoOptions) {}

  /**
   * The photo at `url`, or throws saying why the fetch doesn't count. It counts only when it arrives
   * in full within the timeout, as a JPEG, PNG or WebP image, told by its first bytes whatever its
   * content type says, of at most PRODUCT_PHOTO_MAX_BYTES. The error never carries the photo.
   */
  async fetch(url: string): Promise<Photo> {
    const { transport, timeoutMs = PRODUCT_PHOTO_TIMEOUT_MS } = this.options;
    // Never kept in Next.js's Data Cache, or anywhere else.
    const response = await transport(new Request(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" }));
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`The Product photo's server answered ${response.status}.`);
    }
    const bytes = await readAtMost(response, PRODUCT_PHOTO_MAX_BYTES);
    const mediaType = imageMediaType(bytes);
    if (!mediaType) throw new Error("The Product photo isn't a JPEG, PNG or WebP image.");
    return { bytes, mediaType };
  }
}

/** The response's body, or throws once it's bigger than `maxBytes`, without reading the rest. */
async function readAtMost(response: Response, maxBytes: number): Promise<Uint8Array> {
  const tooBig = () => new Error(`The Product photo is bigger than ${maxBytes} bytes.`);
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw tooBig();
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooBig();
    }
    chunks.push(read.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Each image format's own first bytes, as runs of bytes at their offsets. */
const FIRST_BYTES: Record<PhotoMediaType, readonly (readonly [offset: number, bytes: readonly number[]])[]> = {
  "image/jpeg": [[0, [0xff, 0xd8, 0xff]]],
  "image/png": [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]],
  // "RIFF", the file's size, then "WEBP".
  "image/webp": [
    [0, [0x52, 0x49, 0x46, 0x46]],
    [8, [0x57, 0x45, 0x42, 0x50]],
  ],
};

/** The image's format, by its first bytes, or null when it isn't a JPEG, PNG or WebP image. */
function imageMediaType(bytes: Uint8Array): PhotoMediaType | null {
  const matches = (mediaType: PhotoMediaType) =>
    FIRST_BYTES[mediaType].every(([offset, expected]) => expected.every((byte, index) => bytes[offset + index] === byte));
  return PHOTO_MEDIA_TYPES.find(matches) ?? null;
}
