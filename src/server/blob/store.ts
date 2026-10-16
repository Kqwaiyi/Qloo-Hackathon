export interface StoredBlob {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * The private store for photos and Previews. Vercel Blob in deployments; an in-memory store in
 * tests and an on-disk one in local development.
 */
export interface BlobStore {
  /** Saves the bytes at `pathname`. Never overwrites an existing object. */
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** The object at `pathname`, for the server's own use. Throws if there is none. */
  get(pathname: string): Promise<StoredBlob>;
  /** A link that shows the object until `validUntil`, and nobody can open after. */
  signedUrl(pathname: string, validUntil: Date): Promise<string>;
  /** Deletes the object, if there is one. */
  delete(pathname: string): Promise<void>;
  /** Deletes every object whose pathname starts with `folder/`, if there are any. */
  deleteFolder(folder: string): Promise<void>;
}
