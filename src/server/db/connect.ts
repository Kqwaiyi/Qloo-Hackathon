import type { PGlite } from "@electric-sql/pglite";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

import type { Database } from "./database";
import * as schema from "./schema";

/**
 * Neon through DATABASE_URL when it is set (always, on Vercel). Without it, local development
 * runs on an on-disk PGlite with the migrations applied at start-up.
 */
export async function connectDatabase(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url });
    attachDatabasePool(pool);
    return drizzle(pool, { schema });
  }
  if (process.env.VERCEL) throw new Error("DATABASE_URL is not set.");
  const { openPgliteDatabase } = await import("./pglite");
  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (!dataDir.startsWith("memory://")) mkdirSync(dataDir, { recursive: true });
  return openPgliteDatabase(dataDir);
}

/** Closes the database's connections, for a script that's done with it. */
export async function closeDatabase(db: Database): Promise<void> {
  const client = (db as Database & { $client: Pool | PGlite }).$client;
  await (client instanceof Pool ? client.end() : client.close());
}
