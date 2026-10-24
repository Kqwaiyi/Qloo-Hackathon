// A one-off team script, which costs money: runs a real Styling once on one of the landing page's
// sample photos, with live Qloo, Channel3 and real AI and the United States as the Country, and
// freezes what it makes (its Products with their offers, prices and dates, and its Preview) as that
// Photo Type's sample, as `team:export-landing-sample` does. The sample keeps the Style Preference
// and Budget Tier it has in src/server/landing-samples.ts, and is never refreshed after.
//
// It runs on an app of its own that lives only while it runs, with its database and Blob store in
// memory, so it reads and writes no other database and sends no email. Get the team's go-ahead for
// the cost first; then check the Preview and the diff by eye, and commit them.
//
//   npm run team:make-landing-sample -- <photo-type> [outfit-number]
//
// It needs QLOO_API_URL, QLOO_API_KEY, CHANNEL3_API_KEY, ANTHROPIC_API_KEY and GEMINI_API_KEY in
// .env.local, whatever AI_PROVIDER and PRODUCT_SEARCH say.

import { readFile } from "node:fs/promises";

import { CATEGORY_LABELS, PHOTO_TYPE_LABELS, PHOTO_TYPES, type PhotoType } from "@/config/consultations";
import { aiFromEnvironment } from "@/server/ai/environment";
import { MemoryBlobStore } from "@/server/blob/memory";
import { closeDatabase } from "@/server/db/connect";
import { LANDING_SAMPLES } from "@/server/landing-samples";
import type { StoredPiece } from "@/server/operations/consultations";
import { makeLandingSample, type MakeLandingSampleRefusal } from "@/server/operations/team";

import { createFreshApp } from "./fresh-app";
import { publicFile, writeLandingSample } from "./landing-sample-files";
import { exitWithUsage } from "./team-script";

const USAGE = `npm run team:make-landing-sample -- <${PHOTO_TYPES.join(" | ")}> [outfit-number]`;

const [photoTypeArgument, outfitNumber = "1"] = process.argv.slice(2);
const outfitPosition = Number(outfitNumber);
if (!isPhotoType(photoTypeArgument) || !Number.isInteger(outfitPosition) || outfitPosition < 1) exitWithUsage(USAGE);
const photoType: PhotoType = photoTypeArgument;

const shipped = LANDING_SAMPLES[photoType];
if (!shipped.images) {
  console.error(`The ${PHOTO_TYPE_LABELS[photoType]} sample has no photo yet. Ship one with it first, as the README says.`);
  process.exit(1);
}
const photoPath = shipped.images.photoPath;
// Read before the sample's folder is replaced.
const photo = new Blob([await readFile(publicFile(photoPath))]);

console.log(`Running a Styling on public${photoPath}, with live Qloo, Channel3, Claude and Gemini. This costs money.`);
// The app the Styling runs on: a fresh one, on real AI.
const app = await createFreshApp({ ai: aiFromEnvironment("real"), blob: new MemoryBlobStore() });
try {
  const result = await makeLandingSample(app, {
    photoType,
    photo,
    stylePreference: shipped.stylePreference,
    budgetTier: shipped.budgetTier ?? undefined,
    outfitPosition,
  });
  if (!result.ok) {
    console.error(refusalText(result));
    process.exitCode = 1;
  } else {
    const { sample, images } = result;
    const folder = await writeLandingSample(sample, images);
    console.log(
      `Wrote the photo and Outfit ${outfitPosition}'s Preview into public${folder}/, and the ` +
        `${PHOTO_TYPE_LABELS[photoType]} sample into src/server/landing-samples.ts. Check the Preview and the diff by eye, then commit them.`,
    );
    // So whoever runs it can tell what was frozen.
    console.log(`Outfit ${outfitPosition}, inspired by ${sample.outfit.styleIconName}:`);
    for (const piece of sample.outfit.pieces) console.log(`  ${CATEGORY_LABELS[piece.category]}: ${pieceText(piece)}`);
  }
} finally {
  await closeDatabase(app.db);
}

/** A frozen Piece, as the team checks it: a Product by its title and Brand, with its price, date and shop. */
function pieceText({ item, brand, product }: StoredPiece): string {
  if (!product?.available) return brand ? `${item} (${brand.name})` : item;
  const { price, pricedOn, shopDomain } = product;
  return `${item} (${brand?.name}), ${price.amount} ${price.currency} on ${pricedOn} at ${shopDomain}`;
}

function refusalText(refusal: MakeLandingSampleRefusal): string {
  switch (refusal.refusal) {
    case "unusable-file":
      return `public${photoPath} isn't a JPEG, PNG or WebP photo of 2 MB or less. Nothing was written.`;
    case "check-errored":
      return "The photo check errored, as the log above may say. Nothing was written: try again later.";
    case "photo-rejected":
      return `The photo check rejected the photo (${refusal.rejection.reason}). Nothing was written.`;
    case "no-outfit":
      return `The Styling made no Outfit ${outfitPosition}, as the log above may say. Nothing was written.`;
    case "no-preview":
      return `Outfit ${outfitPosition} has no Preview: the image model refused it or kept failing. Nothing was written.`;
  }
}

function isPhotoType(value: string | undefined): value is PhotoType {
  return (PHOTO_TYPES as readonly (string | undefined)[]).includes(value);
}
