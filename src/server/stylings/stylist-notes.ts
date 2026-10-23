import { and, asc, eq, gt, inArray, max, ne, notInArray } from "drizzle-orm";

import { type PhotoStyleWords, photoStyleText, type ProductCategory } from "@/config/consultations";
import { countryInSentence } from "@/config/countries";
import { STYLIST_NOTE_MAX_LENGTH, type StylistNoteKind } from "@/config/stylings";
import type { Database, Transaction } from "@/server/db/database";
import { outfit, styling, stylistNote } from "@/server/db/schema";

import { readLatestFailedStyling } from "./failed";
import { statesAPrice } from "./prices-in-text";

// The Stylist's Notes (spec: "Storage" and "The loop"): what the Stylist tells the user as it carries
// out a Styling. Each entry is a note the Stylist wrote, checked like a "why" line, or a step our code
// wrote for one of its tool calls and what came of it. Steps are written here from the data (Qloo's
// names, the Brand, the Category and counts), so no name in one comes from the model, and neither
// the product search nor the image model is named by its provider. Like everything the Stylist
// writes, nothing here describes the user's body, skin, ethnicity or age (ADR-0005).

/** One entry of the Stylist's Notes. */
export interface StylistNoteEntry {
  kind: StylistNoteKind;
  text: string;
}

/**
 * Adds entries after the Styling's last, in order: a turn's notes, given its number, or steps. Only
 * ever inside a transaction that holds the running Styling's row (`whileRunning`), so entries are
 * numbered one after another and commit in that order: a page that has seen one has seen every one
 * before it.
 */
export async function addStylistNotes(tx: Transaction, stylingId: string, entries: readonly (StylistNoteEntry & { turn?: number })[]): Promise<void> {
  if (entries.length === 0) return;
  const [last] = await tx.select({ position: max(stylistNote.position) }).from(stylistNote).where(eq(stylistNote.stylingId, stylingId));
  const after = last?.position ?? 0;
  await tx.insert(stylistNote).values(entries.map(({ kind, text, turn }, index) => ({ stylingId, position: after + index + 1, kind, text, turn: turn ?? null })));
}

/** Adds steps after the Styling's last, as `addStylistNotes` does. */
export async function addSteps(tx: Transaction, stylingId: string, ...texts: string[]): Promise<void> {
  await addStylistNotes(tx, stylingId, texts.map((text) => ({ kind: "step" as const, text })));
}

/**
 * Deletes the entries of each of the Consultation's finished Stylings that no longer explain anything
 * it shows (spec: "Which notes are kept"). Kept are those of each Styling with a current Outfit, and
 * of the latest Styling if it failed, whose line the Consultation shows. So a Styling whose Outfits
 * replace the current ones deletes the notes of the Stylings that made them, and a Styling that takes
 * a failed one's line away deletes that one's. Run in the transaction that finishes a Styling, once
 * its Outfits, if any, have switched in.
 */
export async function deleteStylistNotesNoLongerShown(tx: Transaction, consultationId: string): Promise<void> {
  const shown = await tx
    .selectDistinct({ stylingId: outfit.stylingId })
    .from(outfit)
    .where(and(eq(outfit.consultationId, consultationId), eq(outfit.current, true)));
  const failed = await readLatestFailedStyling(tx, consultationId);
  const finished = tx
    .select({ id: styling.id })
    .from(styling)
    .where(and(eq(styling.consultationId, consultationId), ne(styling.status, "running")));
  await tx
    .delete(stylistNote)
    .where(
      and(
        inArray(stylistNote.stylingId, finished),
        notInArray(stylistNote.stylingId, [...shown.map(({ stylingId }) => stylingId), ...(failed ? [failed.stylingId] : [])]),
      ),
    );
}

/** Whether the Styling has saved notes from this turn of the Stylist's already. */
export async function hasNotesFromTurn(tx: Transaction, stylingId: string, turn: number): Promise<boolean> {
  const [saved] = await tx
    .select({ position: stylistNote.position })
    .from(stylistNote)
    .where(and(eq(stylistNote.stylingId, stylingId), eq(stylistNote.turn, turn)))
    .limit(1);
  return saved !== undefined;
}

/** Each of these Stylings' entries, in order, by the Styling. A Styling with none has no entry in the map. */
export async function readStylistNotesOf(db: Database | Transaction, stylingIds: readonly string[]): Promise<Map<string, StylistNoteEntry[]>> {
  const byStyling = new Map<string, StylistNoteEntry[]>();
  if (stylingIds.length === 0) return byStyling;
  const rows = await db
    .select({ stylingId: stylistNote.stylingId, kind: stylistNote.kind, text: stylistNote.text })
    .from(stylistNote)
    .where(inArray(stylistNote.stylingId, [...stylingIds]))
    .orderBy(asc(stylistNote.position));
  for (const { stylingId, ...entry } of rows) byStyling.set(stylingId, [...(byStyling.get(stylingId) ?? []), entry]);
  return byStyling;
}

/** The Styling's entries after its first `after`, in order. */
export async function readStylistNotes(db: Database | Transaction, stylingId: string, after: number): Promise<StylistNoteEntry[]> {
  return db
    .select({ kind: stylistNote.kind, text: stylistNote.text })
    .from(stylistNote)
    .where(and(eq(stylistNote.stylingId, stylingId), gt(stylistNote.position, after)))
    .orderBy(asc(stylistNote.position));
}

/**
 * The notes in what the Stylist wrote in one turn: each line of it, trimmed, that's checked like a
 * "why" line. One that's empty, states a price, or runs past STYLIST_NOTE_MAX_LENGTH is dropped
 * silently.
 */
export function notesIn(texts: readonly string[]): string[] {
  return texts
    .flatMap((text) => text.split(/\r?\n/))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0 && line.length <= STYLIST_NOTE_MAX_LENGTH && !statesAPrice(line));
}

/**
 * What a search for each kind of Product finds, as a step names it: garments as plain words, as the
 * spec's "Searched Uniqlo's tops" has them, and One-Pieces by their own name, which no plain word covers.
 */
const SEARCHED_FOR: Record<ProductCategory, string> = {
  top: "tops",
  bottom: "bottoms",
  one_piece: "One-Pieces",
  shoes: "shoes",
};

/** The steps our code writes, each for one of the Stylist's tool calls and what came of it. */
export const STEPS = {
  /** Finding Style Icons: Qloo's person calls, for the Consultation's Country and the Photo Style the Styling builds for. */
  styleIconsFound: ({ countryCode, photoStyle, found }: { countryCode: string; photoStyle: PhotoStyleWords; found: number }) => {
    const style = photoStyleText(photoStyle);
    return `Asked Qloo for Style Icons popular in ${countryInSentence(countryCode)} with ${/^[aeiou]/.test(style) ? "an" : "a"} ${style} Photo Style: ${found === 0 ? "none" : found} found`;
  },
  /** One Style Icon's Brand call. */
  brandsFetched: (styleIconName: string) => `Asked Qloo for the Brands ${styleIconName}'s fans favour`,
  /** A Style Icon passed over, as its Brands can't complete an Outfit. */
  passedOver: (styleIconName: string) => `Passed over ${styleIconName}: the Brands their fans favour can't complete an Outfit`,
  /** One Piece's search, by how many Products qualified, or null when it never answered. */
  searched: (brandName: string, category: ProductCategory, found: number | null) =>
    `Searched ${brandName}'s ${SEARCHED_FOR[category]}: ${found === null ? "no answer" : `${found === 0 ? "none" : found} in stock`}`,
  /** One Outfit saved, by its number as the user sees it. */
  outfitSaved: (outfit: number, styleIconName: string) => `Saved Outfit ${outfit}, inspired by ${styleIconName}`,
  /** One Preview, drawn or declined by the image model. */
  previewDrawn: (outfit: number, drawn: boolean) => (drawn ? `Drew Outfit ${outfit}'s Preview` : `The image model declined to draw Outfit ${outfit}'s Preview`),
  /** One Preview not drawn by the time its Styling finished, as when the image model kept failing. */
  previewFailed: (outfit: number) => `Couldn't draw Outfit ${outfit}'s Preview`,
};
