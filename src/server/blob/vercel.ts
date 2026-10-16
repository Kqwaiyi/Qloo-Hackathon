import { del, get, issueSignedToken, list, presignUrl, put } from "@vercel/blob";

import type { BlobStore, StoredBlob } from "./store";

/** The private Vercel Blob store, through BLOB_READ_WRITE_TOKEN. */
export class VercelBlobStore implements BlobStore {
  async put(pathname: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await put(pathname, Buffer.from(bytes), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
  }

  async get(pathname: string): Promise<StoredBlob> {
    const result = await get(pathname, { access: "private", useCache: false });
    if (result?.statusCode !== 200) throw new Error(`No blob exists at ${pathname}.`);
    return { bytes: new Uint8Array(await new Response(result.stream).arrayBuffer()), contentType: result.blob.contentType };
  }

  async signedUrl(pathname: string, validUntil: Date): Promise<string> {
    // The token is scoped to this one object, for reading only.
    const token = await issueSignedToken({ pathname, operations: ["get"], validUntil: validUntil.getTime() });
    const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access: "private", validUntil: validUntil.getTime() });
    return presignedUrl;
  }

  async delete(pathname: string): Promise<void> {
    await del(pathname);
  }

  async deleteFolder(folder: string): Promise<void> {
    // Listing is an advanced operation, which the Hobby plan counts: one page holds a Consultation.
    const pathnames: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `${folder}/`, cursor });
      pathnames.push(...page.blobs.map((blob) => blob.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    if (pathnames.length > 0) await del(pathnames);
  }
}
