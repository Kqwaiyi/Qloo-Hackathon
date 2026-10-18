import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether a request comes from Vercel Cron, which sends the project's CRON_SECRET as a bearer token
 * with every cron request. Without the secret set, no request does.
 */
export function isFromVercelCron(headers: Headers): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const sent = headers.get("authorization") ?? "";
  // Compared in constant time, as hashes of the same length.
  return timingSafeEqual(sha256(sent), sha256(`Bearer ${cronSecret}`));
}

function sha256(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}
