// A team script: creates the Demo Account, the one account the judges share, the same way every
// time. It goes through the same sign-up as the app, at the team Gmail's +demo address, so its
// password resets reach the team. Its password comes from an environment variable, never a file.
// Run it once, against production, after the production database exists.
//
//   GMAIL_USER=<the team Gmail address> DEMO_ACCOUNT_PASSWORD=<its password> npm run team:create-demo-account

import { DEMO_ACCOUNT_PROFILE, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/config/accounts";
import { teamGmailAddress } from "@/server/email/gmail";
import { createDemoAccount } from "@/server/operations/team";

import { exitWithUsage, runTeamScript } from "./team-script";

const USAGE = "GMAIL_USER=<the team Gmail address> DEMO_ACCOUNT_PASSWORD=<its password> npm run team:create-demo-account";

const password = process.env.DEMO_ACCOUNT_PASSWORD;
// Without it, the account would get a placeholder address the app on Vercel wouldn't know as the Demo Account's.
if (!teamGmailAddress() || !password) exitWithUsage(USAGE);

await runTeamScript(async (ctx) => {
  const email = ctx.auth.demoAccountEmail;
  const result = await createDemoAccount(ctx, { password });
  if (!result.ok) {
    switch (result.refusal) {
      case "invalid-password":
        console.error(`DEMO_ACCOUNT_PASSWORD must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`);
        break;
      case "already-exists":
        console.error(`The Demo Account already exists, using ${email}. Nothing changed.`);
        break;
      case "username-taken":
        console.error(`Another account has the username ${DEMO_ACCOUNT_PROFILE.username}, so the Demo Account wasn't created.`);
        break;
    }
    return false;
  }
  console.log(
    `Created the Demo Account: username ${DEMO_ACCOUNT_PROFILE.username}, ${email}, already verified, with the password in DEMO_ACCOUNT_PASSWORD.`,
  );
  return true;
});
