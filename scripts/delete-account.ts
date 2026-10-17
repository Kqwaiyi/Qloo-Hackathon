// A team script: deletes an account for good, with every Consultation, photo and Preview, for a
// user's emailed request or an under-18 report. It goes through the same deletion as a user's own.
//
//   npm run team:delete-account -- <email>

import { deleteAccountByEmail } from "@/server/operations/team";

import { exitWithUsage, runTeamScript } from "./team-script";

const [email] = process.argv.slice(2);
if (!email) exitWithUsage("npm run team:delete-account -- <email>");

await runTeamScript(async (ctx) => {
  const result = await deleteAccountByEmail(ctx, email);
  if (!result.ok) {
    console.error(`No account uses ${email}.`);
    return false;
  }
  console.log(`Deleted the account using ${email}, with every Consultation, photo and Preview.`);
  return true;
});
