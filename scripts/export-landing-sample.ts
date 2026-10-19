// A team script: freezes a Consultation made on the Demo Account as one of the landing page's
// sample Consultations, in the place for its Photo Type. It writes the Consultation's photo and
// one Outfit's Preview (the first, or the Outfit number given) into the page's own folder under
// public/, and its text into src/server/landing-samples.ts, both of which ship with the page. Check
// the diff, then commit and deploy.
//
//   npm run team:export-landing-sample -- <demo-account-email> <consultation-id> [outfit-number]

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PHOTO_TYPE_LABELS } from "@/config/consultations";
import { LANDING_SAMPLES } from "@/server/landing-samples";
import type { LandingSamples } from "@/server/operations/landing";
import { exportLandingSample, type ExportLandingSampleRefusal } from "@/server/operations/team";

import { exitWithUsage, runTeamScript } from "./team-script";

const SAMPLES_FILE = fileURLToPath(new URL("../src/server/landing-samples.ts", import.meta.url));
const PUBLIC_FOLDER = fileURLToPath(new URL("../public", import.meta.url));
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
  // A sample exported again replaces its images, whose photo may now have another format.
  const folder = path.join(PUBLIC_FOLDER, path.dirname(images[0]!.path));
  await rm(folder, { recursive: true, force: true });
  await mkdir(folder, { recursive: true });
  for (const image of images) await writeFile(path.join(PUBLIC_FOLDER, image.path), image.bytes);
  await writeFile(SAMPLES_FILE, samplesSource({ ...LANDING_SAMPLES, [sample.photoType]: sample }));
  console.log(
    `Wrote the photo and Outfit ${outfitPosition}'s Preview into public${path.posix.dirname(images[0]!.path)}/, and the ` +
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

/** The samples file, as this script writes it. */
function samplesSource(samples: LandingSamples): string {
  return `// The landing page's frozen sample Consultations, one of each Photo Type. Written by
// \`npm run team:export-landing-sample\` (see the README): edit by hand only to fix a typo. A sample
// whose \`images\` is null is a placeholder, shown with no pictures.

import type { LandingSamples } from "@/server/operations/landing";

export const LANDING_SAMPLES: LandingSamples = ${JSON.stringify(samples, null, 2)};
`;
}
