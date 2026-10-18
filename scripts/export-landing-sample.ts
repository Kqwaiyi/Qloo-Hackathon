// A team script: freezes a Consultation made on the Demo Account as one of the landing page's
// sample Consultations, in the place for its Photo Type. It copies the Consultation's photo and
// first Preview into the landing page's own folder in the Blob store, and writes its text into
// src/server/landing-samples.ts, which ships with the page. Check the diff, then commit and deploy.
//
//   npm run team:export-landing-sample -- <demo-account-email> <consultation-id>

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PHOTO_TYPE_LABELS } from "@/config/consultations";
import { LANDING_SAMPLES } from "@/server/landing-samples";
import type { LandingSamples } from "@/server/operations/landing";
import { exportLandingSample, type ExportLandingSampleRefusal } from "@/server/operations/team";

import { exitWithUsage, runTeamScript } from "./team-script";

const SAMPLES_FILE = fileURLToPath(new URL("../src/server/landing-samples.ts", import.meta.url));

const [email, consultationId] = process.argv.slice(2);
if (!email || !consultationId) exitWithUsage("npm run team:export-landing-sample -- <demo-account-email> <consultation-id>");

await runTeamScript(async (ctx) => {
  const result = await exportLandingSample(ctx, { email, consultationId });
  if (!result.ok) {
    console.error(refusalText(result.refusal));
    return false;
  }
  const { sample } = result;
  await writeFile(SAMPLES_FILE, samplesSource({ ...LANDING_SAMPLES, [sample.photoType]: sample }));
  console.log(
    `Copied the photo and first Preview to the Blob store, and wrote the ${PHOTO_TYPE_LABELS[sample.photoType]} sample into ` +
      "src/server/landing-samples.ts. Check the diff, then commit and deploy it.",
  );
  return true;
});

function refusalText(refusal: ExportLandingSampleRefusal["refusal"]): string {
  switch (refusal) {
    case "no-such-account":
      return `No account uses ${email}.`;
    case "no-such-consultation":
      return `The account using ${email} has no Consultation ${consultationId}.`;
    case "no-outfit":
      return "That Consultation has no Outfit yet.";
    case "no-preview":
      return "That Consultation's first Outfit has no Preview. Pick one whose first Outfit has one.";
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
