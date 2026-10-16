import type { BlobStore, StoredBlob } from "./store";

/** The Blob store in tests. Its signed links name the object and when they expire. */
export class MemoryBlobStore implements BlobStore {
  readonly objects = new Map<string, StoredBlob>();
  /** Every pathname stored, oldest first, whether or not it has been deleted since. */
  readonly stored: string[] = [];
  /** Makes `deleteFolder` throw, as Blob storage does while it's down. */
  deleteFolderFails = false;

  async put(pathname: string, bytes: Uint8Array, contentType: string): Promise<void> {
    if (this.objects.has(pathname)) throw new Error(`A blob already exists at ${pathname}.`);
    this.stored.push(pathname);
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

  async deleteFolder(folder: string): Promise<void> {
    if (this.deleteFolderFails) throw new Error("Blob storage is down.");
    for (const pathname of this.objects.keys()) {
      if (pathname.startsWith(`${folder}/`)) this.objects.delete(pathname);
    }
  }
}
