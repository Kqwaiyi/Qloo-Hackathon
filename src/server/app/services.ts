import "server-only";

import path from "node:path";

import { fakeAiFromEnvironment } from "@/server/ai/fake";
import type { AiProvider } from "@/server/ai/provider";
import { type Auth, createAuth } from "@/server/auth/create-auth";
import { LocalBlobStore } from "@/server/blob/local";
import type { BlobStore } from "@/server/blob/store";
import { VercelBlobStore } from "@/server/blob/vercel";
import { type Clock, systemClock } from "@/server/clock";
import { connectDatabase } from "@/server/db/connect";
import type { Database } from "@/server/db/database";
import { gmailTransportFromEnvironment, teamGmailAddress } from "@/server/email/gmail";
import { InboxTransport, LOCAL_INBOX_FOLDER } from "@/server/email/inbox";
import { createEmailSender, type EmailSender, type EmailTransport } from "@/server/email/send-email";
import { type QlooClient, qlooClientFromEnvironment } from "@/server/qloo/client";
import type { StylingRunner } from "@/server/stylings/runner";
import { workflowStylingRunner } from "@/server/stylings/workflow-runner";

export interface Services {
  db: Database;
  auth: Auth;
  clock: Clock;
  ai: AiProvider;
  blob: BlobStore;
  /** Real Qloo everywhere, local development included, through the cache. */
  qloo: QlooClient;
  stylings: StylingRunner;
  /** The send-email function every email goes through. */
  emailSender: EmailSender;
  /** Where users write to the team: for a copy of their data, a correction, or a change they didn't make. */
  teamEmail: string;
}

/** The team's address where GMAIL_USER isn't set (previews, and local development without .env.local). It goes nowhere. */
const UNSET_TEAM_EMAIL = "team@outfit-recommender.invalid";

// One set per server process. Kept on globalThis so Next.js's module reloading in development
// doesn't open the database twice.
const globalStore = globalThis as typeof globalThis & { outfitRecommenderServices?: Promise<Services> };

export function getServices(): Promise<Services> {
  globalStore.outfitRecommenderServices ??= createServices().catch((error: unknown) => {
    globalStore.outfitRecommenderServices = undefined;
    throw error;
  });
  return globalStore.outfitRecommenderServices;
}

async function createServices(): Promise<Services> {
  const db = await connectDatabase();
  const clock = systemClock;
  const emailSender = createEmailSender({ db, clock, transport: emailTransport() });
  const teamEmail = teamGmailAddress() ?? UNSET_TEAM_EMAIL;
  const auth = createAuth({ db, clock, ...authUrls(), secret: authSecret(), emailSender, teamEmail });
  // The fake adapter until the Gemini adapter (ticket 34) can be switched on.
  const ai = fakeAiFromEnvironment();
  const qloo = qlooClientFromEnvironment({ db, clock });
  return { db, auth, clock, ai, blob: blobStore(), qloo, stylings: workflowStylingRunner, emailSender, teamEmail };
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
