import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import path from "node:path";

import type * as schema from "./schema";

/** The app's database, whichever Postgres driver is behind it. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** A transaction on the app's database. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");
