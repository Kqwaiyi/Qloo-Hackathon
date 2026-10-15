// Applies the Drizzle migrations to the database in DATABASE_URL (Neon). Runs before every build,
// so a Vercel deploy migrates its own database first. Local development without DATABASE_URL uses
// PGlite, which migrates itself on start-up.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { MIGRATIONS_FOLDER } from "../src/server/db/database";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.log("No DATABASE_URL: skipping migrations.");
} else {
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}
