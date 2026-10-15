import "server-only";

import { type Auth, createAuth } from "@/server/auth/create-auth";
import { type Clock, systemClock } from "@/server/clock";
import { connectDatabase } from "@/server/db/connect";
import type { Database } from "@/server/db/database";

export interface Services {
  db: Database;
  auth: Auth;
  clock: Clock;
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
  return { db, auth, clock };
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
