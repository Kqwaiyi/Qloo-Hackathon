// A team script: corrects an account's birth year and month by hand, given the date of birth its
// user emailed. It judges the date as sign-up does, and if the user is under 18, it deletes the
// account instead, with every Consultation, photo and Preview, through the same deletion as a
// user's own.
//
//   npm run team:correct-birth-date -- <email> <YYYY-MM-DD>

import { birthMonthAndYearText, parseIsoBirthDate } from "@/server/accounts/birth-date";
import { correctBirthDate } from "@/server/operations/team";

import { exitWithUsage, runTeamScript } from "./team-script";

const [email, birthDate] = process.argv.slice(2);
if (!email || !birthDate) exitWithUsage("npm run team:correct-birth-date -- <email> <YYYY-MM-DD>");

await runTeamScript(async (ctx) => {
  const result = await correctBirthDate(ctx, { email, birthDate });
  if (!result.ok) {
    console.error(result.refusal === "no-such-account" ? `No account uses ${email}.` : `${birthDate} isn't a date of birth in YYYY-MM-DD.`);
    return false;
  }
  if (result.accountDeleted) {
    console.log(`Born ${birthDate}, the user is under 18, so the account using ${email} is deleted, with every Consultation, photo and Preview.`);
  } else {
    // The operation took the date, so it parses.
    const { year, month } = parseIsoBirthDate(birthDate)!;
    console.log(`The account using ${email} now says born ${birthMonthAndYearText(year, month)}.`);
  }
  return true;
});
