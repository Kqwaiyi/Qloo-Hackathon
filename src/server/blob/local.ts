import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BlobStore, StoredBlob } from "./store";

/**
 * Local development's Blob store when no BLOB_READ_WRITE_TOKEN is set: files in a folder, shown
 * through data URLs. The links never expire, which is fine on a developer's own machine.
 */
export class LocalBlobStore implements BlobStore {
  constructor(private readonly folder: string) {}

  async put(pathname: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const file = this.fileFor(pathname);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes, { flag: "wx" });
    await writeFile(`${file}.content-type`, contentType);
  }

  async get(pathname: string): Promise<StoredBlob> {
    const file = this.fileFor(pathname);
    const [bytes, contentType] = await Promise.all([readFile(file), readFile(`${file}.content-type`, "utf8")]);
    return { bytes: new Uint8Array(bytes), contentType };
  }

  async signedUrl(pathname: string): Promise<string> {
    const { bytes, contentType } = await this.get(pathname);
    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  async delete(pathname: string): Promise<void> {
    const file = this.fileFor(pathname);
    await Promise.all([rm(file, { force: true }), rm(`${file}.content-type`, { force: true })]);
  }

  async deleteFolder(folder: string): Promise<void> {
    await rm(this.fileFor(folder), { recursive: true, force: true });
  }

  private fileFor(pathname: string): string {
    const file = path.resolve(this.folder, pathname);
    if (!file.startsWith(path.resolve(this.folder) + path.sep)) throw new Error(`Bad blob pathname: ${pathname}`);
    return file;
  }
}
