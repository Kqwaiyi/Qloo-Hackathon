// What the landing sample scripts share: freezing a sample where it ships with the page. Its photo
// and Preview go into the page's own folder for its Photo Type under public/, and its text into
// src/server/landing-samples.ts, in the place for its Photo Type.

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LANDING_SAMPLES } from "@/server/landing-samples";
import type { LandingSample, LandingSamples } from "@/server/operations/landing";
import type { LandingSampleImage } from "@/server/operations/team";

const SAMPLES_FILE = fileURLToPath(new URL("../src/server/landing-samples.ts", import.meta.url));
const PUBLIC_FOLDER = fileURLToPath(new URL("../public", import.meta.url));

/** Where an image the page ships, by its path from the site's root, is in the repo. */
export function publicFile(sitePath: string): string {
  return path.join(PUBLIC_FOLDER, sitePath);
}

/**
 * Writes the sample's images and text, replacing its Photo Type's. Returns the folder its images went
 * into, from the site's root.
 */
export async function writeLandingSample(sample: LandingSample, images: readonly LandingSampleImage[]): Promise<string> {
  const folder = path.posix.dirname(images[0]!.path);
  // A sample frozen again replaces its images, whose photo may now have another format.
  await rm(publicFile(folder), { recursive: true, force: true });
  await mkdir(publicFile(folder), { recursive: true });
  for (const image of images) await writeFile(publicFile(image.path), image.bytes);
  await writeFile(SAMPLES_FILE, samplesSource({ ...LANDING_SAMPLES, [sample.photoType]: sample }));
  return folder;
}

/** The samples file, as these scripts write it. */
function samplesSource(samples: LandingSamples): string {
  return `// The landing page's frozen sample Consultations, one of each Photo Type. Written by
// \`npm run team:make-landing-sample\` or \`npm run team:export-landing-sample\` (see the README): edit
// by hand only to fix a typo. A sample whose \`images\` is null is a placeholder, shown with no pictures.

import type { LandingSamples } from "@/server/operations/landing";

export const LANDING_SAMPLES: LandingSamples = ${JSON.stringify(samples, null, 2)};
`;
}
