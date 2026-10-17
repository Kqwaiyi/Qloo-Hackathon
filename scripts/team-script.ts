// What the team's account scripts share: the app's own services, built from the environment as the
// app builds them, so each script runs the same operation the app would. With production's
// DATABASE_URL and BLOB_READ_WRITE_TOKEN set, a script works on production; without them, on local
// development's database and Blob folder.

import { getRun } from "workflow/api";

import { createBaseServices } from "@/server/app/environment";
import { closeDatabase } from "@/server/db/connect";
import type { TeamContext } from "@/server/operations/team";
import type { StylingRunner } from "@/server/stylings/runner";

/**
 * A script never starts a Styling. It cancels the Workflow run of any it stops, where it can reach
 * it; one it can't reach is logged and left, since its steps find their Styling gone.
 */
const scriptStylingRunner: StylingRunner = {
  async start() {
    throw new Error("A team script never starts a Styling.");
  },
  async cancel(runId) {
    await getRun(runId).cancel();
  },
};

/**
 * Runs a script's work against the database the environment names, which it says first, then
 * closes the database. The work returns false for a refusal it has already explained, which, like
 * an error, makes the script exit with status 1.
 */
export async function runTeamScript(work: (ctx: TeamContext) => Promise<boolean>): Promise<void> {
  console.log(process.env.DATABASE_URL ? "Using the database in DATABASE_URL." : "Using local development's PGlite database.");
  const ctx = await createBaseServices(scriptStylingRunner);
  try {
    if (!(await work(ctx))) process.exitCode = 1;
  } finally {
    await closeDatabase(ctx.db);
  }
}

/** Stops the script, saying how to run it. */
export function exitWithUsage(text: string): never {
  console.error(`Usage: ${text}`);
  process.exit(1);
}
