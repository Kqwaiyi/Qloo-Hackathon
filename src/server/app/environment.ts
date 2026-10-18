import path from "node:path";

import { botCheckFromEnvironment } from "@/server/auth/bot-check";
import { type Auth, createAuth } from "@/server/auth/create-auth";
import { LocalBlobStore } from "@/server/blob/local";
import type { BlobStore } from "@/server/blob/store";
import { VercelBlobStore } from "@/server/blob/vercel";
import { type Clock, systemClock } from "@/server/clock";
import { connectDatabase } from "@/server/db/connect";
import type { Database } from "@/server/db/database";
import { gmailTransportFromEnvironment, teamEmailAddress } from "@/server/email/gmail";
import { InboxTransport, LOCAL_INBOX_FOLDER } from "@/server/email/inbox";
import { createEmailSender, type EmailSender, type EmailTransport } from "@/server/email/send-email";
import type { StylingRunner } from "@/server/stylings/runner";

// Not server-only, unlike `services.ts`: the team's scripts build these too, outside Next.js, so
// they reach the same database, Blob store and Better Auth set-up as the app.

/** Every service but the AI and Qloo, which only the photo check and Stylings call. */
export interface BaseServices {
  db: Database;
  auth: Auth;
  clock: Clock;
  blob: BlobStore;
  stylings: StylingRunner;
  /** The send-email function every email goes through. */
  emailSender: EmailSender;
  /** Where users write to the team: for a copy of their data, a correction, or a change they didn't make. */
  teamEmail: string;
  /** The site key the forms' Bot Check widget needs, or null while the Bot Check is off. */
  botCheckSiteKey: string | null;
}

/** The base services as the environment sets them up, with this to run Stylings. */
export async function createBaseServices(stylings: StylingRunner): Promise<BaseServices> {
  const db = await connectDatabase();
  const clock = systemClock;
  const emailSender = createEmailSender({ db, clock, transport: emailTransport() });
  const teamEmail = teamEmailAddress();
  const blob = blobStore();
  const urls = authUrls();
  // On Production, a token must have been made on one of the app's own hostnames.
  const botCheck = botCheckFromEnvironment([urls.baseURL, ...urls.trustedOrigins].map((url) => new URL(url).hostname));
  const auth = createAuth({ db, clock, ...urls, secret: authSecret(), emailSender, teamEmail, blob, stylings, botCheck: botCheck?.options });
  return { db, auth, clock, blob, stylings, emailSender, teamEmail, botCheckSiteKey: botCheck?.siteKey ?? null };
}

/**
 * The team Gmail account on Vercel. Local development never sends real email, even with the
 * account's variables in .env.local: each message lands in .data/inbox instead.
 */
function emailTransport(): EmailTransport {
  if (process.env.VERCEL) return gmailTransportFromEnvironment();
  return new InboxTransport(LOCAL_INBOX_FOLDER);
}

/** The private Vercel Blob store when its token is set (always, on Vercel); otherwise a local folder. */
function blobStore(): BlobStore {
  if (process.env.BLOB_READ_WRITE_TOKEN) return new VercelBlobStore();
  if (process.env.VERCEL) throw new Error("BLOB_READ_WRITE_TOKEN is not set.");
  return new LocalBlobStore(path.join(process.cwd(), ".data", "blob"));
}

/** BETTER_AUTH_URL when set; otherwise the Vercel deployment's own URL, or localhost in development. */
function authUrls(): { baseURL: string; trustedOrigins: string[] } {
  const vercelUrls = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL]
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host}`);
  const productionUrl = process.env.VERCEL_ENV === "production" ? vercelUrls[0] : undefined;
  const baseURL = process.env.BETTER_AUTH_URL ?? productionUrl ?? vercelUrls.at(-1) ?? "http://localhost:3000";
  return { baseURL, trustedOrigins: vercelUrls };
}

function authSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.VERCEL) throw new Error("BETTER_AUTH_SECRET is not set.");
  return "local-development-secret-not-for-deployed-environments";
}
