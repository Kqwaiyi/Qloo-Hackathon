import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EmailMessage, EmailTransport } from "./send-email";

/** Where local development's email goes. The browser smoke tests read their links here. */
export const LOCAL_INBOX_FOLDER = path.join(process.cwd(), ".data", "inbox");

/** A message in the capturing inbox, with when it arrived. */
export interface InboxMessage extends EmailMessage {
  sentAt: string;
}

/**
 * Local development's email transport: nothing is delivered, and each message is written to a
 * JSON file in a folder instead, where a developer, or a browser smoke test, can open its link.
 */
export class InboxTransport implements EmailTransport {
  constructor(private readonly folder: string) {}

  async send(message: EmailMessage): Promise<void> {
    await mkdir(this.folder, { recursive: true });
    const sentAt = new Date().toISOString();
    const name = `${sentAt.replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}.json`;
    const stored: InboxMessage = { ...message, sentAt };
    await writeFile(path.join(this.folder, name), JSON.stringify(stored, null, 2), { flag: "wx" });
  }
}

/** Every message in the inbox folder sent to this address, oldest first. */
export async function readInbox(folder: string, to: string): Promise<InboxMessage[]> {
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return [];
  }
  const messages = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => JSON.parse(await readFile(path.join(folder, name), "utf8")) as InboxMessage),
  );
  return messages
    .filter((message) => message.to.toLowerCase() === to.toLowerCase())
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}
