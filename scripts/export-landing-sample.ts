// A team script: freezes a Consultation made on the Demo Account as one of the landing page's
// sample Consultations, in the place for its Photo Type. It writes the Consultation's photo and
// one Outfit's Preview (the first, or the Outfit number given) into the page's own folder under
// public/, and its text into src/server/landing-samples.ts, both of which ship with the page. Check
// the diff, then commit and deploy.
//
//   npm run team:export-landing-sample -- <demo-account-email> <consultation-id> [outfit-number]

import { PHOTO_TYPE_LABELS } from "@/config/consultations";
import { exportLandingSample, type ExportLandingSampleRefusal } from "@/server/operations/team";

import { writeLandingSample } from "./landing-sample-files";
import { exitWithUsage, runTeamScript } from "./team-script";

const USAGE = "npm run team:export-landing-sample -- <demo-account-email> <consultation-id> [outfit-number]";

const [email, consultationId, outfitNumber = "1"] = process.argv.slice(2);
const outfitPosition = Number(outfitNumber);
if (!email || !consultationId || !Number.isInteger(outfitPosition) || outfitPosition < 1) exitWithUsage(USAGE);

await runTeamScript(async (ctx) => {
  const result = await exportLandingSample(ctx, { email, consultationId, outfitPosition });
  if (!result.ok) {
    console.error(refusalText(result.refusal));
    return false;
  }
  const { sample, images } = result;
  const folder = await writeLandingSample(sample, images);
  console.log(
    `Wrote the photo and Outfit ${outfitPosition}'s Preview into public${folder}/, and the ` +
      `${PHOTO_TYPE_LABELS[sample.photoType]} sample into src/server/landing-samples.ts. Check the diff, then commit and deploy it.`,
  );
  // So whoever runs it can tell it's the Outfit they meant.
  console.log(`Outfit ${outfitPosition}, inspired by ${sample.outfit.styleIconName}: ${sample.outfit.pieces.map(({ item }) => item).join("; ")}.`);
  return true;
});

function refusalText(refusal: ExportLandingSampleRefusal["refusal"]): string {
  switch (refusal) {
    case "no-such-account":
      return `No account uses ${email}.`;
    case "no-such-consultation":
      return `The account using ${email} has no Consultation ${consultationId}.`;
    case "no-outfit":
      return outfitPosition === 1 ? "That Consultation has no Outfit yet." : `That Consultation has no Outfit ${outfitPosition}.`;
    case "no-preview":
      return `That Consultation's Outfit ${outfitPosition} has no Preview. Pick an Outfit that has one.`;
  }
}
