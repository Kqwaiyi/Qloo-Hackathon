import type { BlobStore, StoredBlob } from "./store";

/** The Blob store in tests. Its signed links name the object and when they expire. */
export class MemoryBlobStore implements BlobStore {
  readonly objects = new Map<string, StoredBlob>();

  async put(pathname: string, bytes: Uint8Array, contentType: string): Promise<void> {
    if (this.objects.has(pathname)) throw new Error(`A blob already exists at ${pathname}.`);
    this.objects.set(pathname, { bytes: new Uint8Array(bytes), contentType });
  }

  async get(pathname: string): Promise<StoredBlob> {
    const stored = this.objects.get(pathname);
    if (!stored) throw new Error(`No blob exists at ${pathname}.`);
    return { bytes: new Uint8Array(stored.bytes), contentType: stored.contentType };
  }

  async signedUrl(pathname: string, validUntil: Date): Promise<string> {
    return `https://blob.test/${pathname}?validUntil=${validUntil.toISOString()}`;
  }

  async delete(pathname: string): Promise<void> {
    this.objects.delete(pathname);
  }
}
