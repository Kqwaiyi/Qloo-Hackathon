import type { ProductPhotoTransport } from "./photos";

/** The image formats a Product photo may come in, by their first bytes. */
export type ProductPhotoFormat = "jpeg" | "png" | "webp";

/** Each format's own first bytes, which tell its images apart whatever their content type says. */
const FIRST_BYTES: Record<ProductPhotoFormat, readonly number[]> = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  // "RIFF", the file's size, then "WEBP".
  webp: [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
};

/**
 * The sellers' servers Product photos come from, in tests: every request is answered by `respond`,
 * which serves each photo as a PNG until a test says otherwise, and recorded, so tests can see which
 * photos were fetched.
 */
export class FakeProductPhotoTransport {
  /** The URL of every photo asked for, oldest first. */
  readonly requests: URL[] = [];
  /**
   * Answers a request for the photo at `url`. A fetch that's given up on, as when it times out,
   * aborts `signal`.
   */
  respond: (url: URL, signal: AbortSignal) => Response | Promise<Response> = (url) => productPhoto(url);

  readonly send: ProductPhotoTransport = async (request) => {
    const url = new URL(request.url);
    this.requests.push(url);
    return this.respond(url, request.signal);
  };
}

/**
 * The bytes the Product photo at `url` stands in for: its format's own first bytes, then words naming
 * the photo, so each one is told apart. Nothing reads them as an image but the image model.
 */
export function productPhotoBytes(url: string | URL, format: ProductPhotoFormat = "png"): Uint8Array<ArrayBuffer> {
  const words = new TextEncoder().encode(`the bytes of the Product photo at ${String(url)}`);
  return new Uint8Array([...FIRST_BYTES[format], ...words]);
}

/** A seller's server answering with the Product photo at `url`, labelled with its format's content type unless `contentType` says otherwise. */
export function productPhoto(
  url: string | URL,
  { format = "png", contentType = `image/${format}` }: { format?: ProductPhotoFormat; contentType?: string } = {},
): Response {
  return new Response(productPhotoBytes(url, format), { headers: { "content-type": contentType } });
}

/** A server that never answers: it waits until the fetch gives up, then fails as `fetch` does. */
export function neverAnswering(signal: AbortSignal): Promise<Response> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason as Error);
    signal.addEventListener("abort", () => reject(signal.reason as Error), { once: true });
  });
}
