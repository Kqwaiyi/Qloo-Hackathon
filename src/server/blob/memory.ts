import type { BlobStore } from "./store";

export interface StoredBlob {
  bytes: Uint8Array;
  contentType: string;
}

/** The Blob store in tests. Its signed links name the object and when they expire. */
export class MemoryBlobStore implements BlobStore {
  readonly objects = new Map<string, StoredBlob>();

  async put(pathname: string, bytes: Uint8Array, contentType: string): Promise<void> {
    if (this.objects.has(pathname)) throw new Error(`A blob already exists at ${pathname}.`);
    this.objects.set(pathname, { bytes: new Uint8Array(bytes), contentType });
  }

  async signedUrl(pathname: string, validUntil: Date): Promise<string> {
    return `https://blob.test/${pathname}?validUntil=${validUntil.toISOString()}`;
  }

  async delete(pathname: string): Promise<void> {
    this.objects.delete(pathname);
  }
}
