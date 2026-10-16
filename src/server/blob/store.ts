/**
 * The private store for photos and Previews. Vercel Blob in deployments; an in-memory store in
 * tests and an on-disk one in local development.
 */
export interface BlobStore {
  /** Saves the bytes at `pathname`. Never overwrites an existing object. */
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** A link that shows the object until `validUntil`, and nobody can open after. */
  signedUrl(pathname: string, validUntil: Date): Promise<string>;
  /** Deletes the object, if there is one. */
  delete(pathname: string): Promise<void>;
}
