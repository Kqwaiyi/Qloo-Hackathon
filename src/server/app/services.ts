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

export interface Services {
  db: Database;
  auth: Auth;
  clock: Clock;
  ai: AiProvider;
  blob: BlobStore;
}

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
  const auth = createAuth({ db, clock, ...authUrls(), secret: authSecret() });
  // The fake adapter until the Gemini adapter (ticket 34) can be switched on.
  const ai = fakeAiFromEnvironment();
  return { db, auth, clock, ai, blob: blobStore() };
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
