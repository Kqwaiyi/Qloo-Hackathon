"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import type { PhotoStyle } from "@/config/consultations";
import { ROUTES } from "@/config/routes";
import { getOperationContext } from "@/server/app/context";
import { changePhotoStyle, photoStyleWordsSchema, showMoreOutfits } from "@/server/operations/stylings";

/**
 * "Show 2 more Outfits". The page then shows where things stand: the compact checklist once the
 * Styling has started, or, if it couldn't, why not, such as a limit reached since the page loaded,
 * or every Outfit already built.
 */
export async function showMoreOutfitsAction(consultationId: string): Promise<void> {
  const result = await showMoreOutfits(await getOperationContext(), z.string().parse(consultationId));
  if (!result.ok && result.refusal === "signed-out") redirect(ROUTES.signIn);
  refresh();
}

/**
 * Changes the Photo Style to the 1 or 2 words picked, strongest first. The page then shows where
 * things stand: the Styling step once the Styling has started, or, if it couldn't, why not, such as
 * a limit reached since the page loaded.
 */
export async function changePhotoStyleAction(consultationId: string, photoStyle: readonly PhotoStyle[]): Promise<void> {
  const result = await changePhotoStyle(
    await getOperationContext(),
    z.string().parse(consultationId),
    photoStyleWordsSchema.parse(photoStyle),
  );
  if (!result.ok && result.refusal === "signed-out") redirect(ROUTES.signIn);
  refresh();
}
