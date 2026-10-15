import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { type Database, MIGRATIONS_FOLDER } from "./database";
import * as schema from "./schema";

/**
 * An in-process Postgres (PGlite) with every migration applied. Tests use a fresh in-memory one
 * per file; local development keeps one on disk when no DATABASE_URL is set.
 */
export async function openPgliteDatabase(dataDir = "memory://"): Promise<Database> {
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}
