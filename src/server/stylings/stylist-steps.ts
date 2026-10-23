import { and, asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { AGE_GROUP_LABELS, CATEGORY_LABELS, PHOTO_TYPE_LABELS } from "@/config/consultations";
import type { StyleIconStatus, StylingKind } from "@/config/stylings";
import { statesAPrice } from "@/server/ai/tailoring";
import type { Database, Transaction } from "@/server/db/database";
import { consultation, outfit, piece, styleIcon, styling } from "@/server/db/schema";
import { outfitCategories } from "@/server/outfit-assembly/categories";

import { readBuildingBeside } from "./current-outfits";
import type { StylingSteps } from "./run-styling";
import { moveStage, readPhoto, readRunningStyling, type StepTry, type StylingContext, StylingNotRunningError, stylingSteps, whileRunning } from "./steps";
import { type SaveOutfitInput, saveOutfitInputSchema, type StylistStepResult, type StylistSteps } from "./stylist";
import type { StylistBrief, StylistStyleIcon } from "./stylist-brief";

/** Every Styling step, on `ctx`, as this try of them: the "build Outfits" steps and the Stylist's. */
export function allStylingSteps(ctx: StylingContext, stepTry: StepTry = {}): StylingSteps {
  return { ...stylingSteps(ctx, stepTry), ...stylistSteps(ctx) };
}

/** What each kind of Styling is called in the Stylist's brief. */
const STYLING_KINDS_BRIEFED: Record<StylingKind, string> = {
  first: "First Styling",
  more: "Show 2 more Outfits",
  budget_tier_change: "Budget Tier change",
  photo_style_change: "Photo Style change",
  try_again: "Try again",
};

/** The Stylist's own steps, running on `ctx`. */
function stylistSteps(ctx: StylingContext): Omit<StylistSteps, keyof ReturnType<typeof stylingSteps>> {
  return {
    async usesStylist(stylingId) {
      const { photoType } = await readRunningStyling(ctx.db, stylingId);
      return photoType === "face";
    },

    // A Styling that ranks its own Style Icons finds them; any other is given its list, as it
    // stands: "Show 2 more Outfits" the current one, and Try again the copy of the broken one's.
    async readBrief(stylingId) {
      const running = await readRunningStyling(ctx.db, stylingId);
      const brief: StylistBrief = {
        styling: STYLING_KINDS_BRIEFED[running.kind],
        photo: PHOTO_TYPE_LABELS[running.photoType],
        pieces: outfitCategories(running).map((category) => CATEGORY_LABELS[category]),
        photoStyle: running.photoStyle,
        ageGroup: AGE_GROUP_LABELS[running.ageGroup],
        outfits: running.outfitsWanted,
      };
      if (running.stage === "style_icons") return brief;
      const list = await readStyleIconList(ctx.db, (await readBuildingBeside(ctx.db, { stylingId, ...running })).styleIconList);
      const used = withStatus(list, "used");
      const passedOver = withStatus(list, "skipped");
      return {
        ...brief,
        styleIcons: withStatus(list, "unused"),
        ...(used.length > 0 && { styleIconsUsed: used }),
        ...(passedOver.length > 0 && { styleIconsPassedOver: passedOver }),
      };
    },

    async readPhoto(stylingId) {
      const [row] = await ctx.db
        .select({ photoPathname: consultation.photoPathname })
        .from(styling)
        .innerJoin(consultation, eq(consultation.id, styling.consultationId))
        .where(and(eq(styling.id, stylingId), eq(styling.status, "running")));
      if (!row) throw new StylingNotRunningError(stylingId);
      return readPhoto(ctx.blob, row.photoPathname);
    },

    async readStyleIcons(stylingId) {
      const running = await readRunningStyling(ctx.db, stylingId);
      const { styleIconList } = await readBuildingBeside(ctx.db, { stylingId, ...running });
      return withStatus(await readStyleIconList(ctx.db, styleIconList), "unused");
    },

    async saveOutfit(stylingId, input) {
      const parsed = saveOutfitInputSchema.safeParse(input);
      if (!parsed.success) return refused("That isn't an Outfit: give the Style Icon's number and the Hairstyle's cut, details, cutKnown and why.");
      return whileRunning(ctx.db, stylingId, async (tx, running) => {
        const saving = await readSaving(tx, stylingId);
        if (saving.stage === "style_icons") return refused("Find this Styling's Style Icons first, with findStyleIcons.");
        if (saving.stage === "previews") return refused("You've started the Previews, so no more Outfits can be saved.");
        const made = await tx.select({ id: outfit.id }).from(outfit).where(eq(outfit.stylingId, stylingId));
        if (made.length >= running.outfitsWanted) {
          return refused(`This Styling makes at most ${running.outfitsWanted} Outfits, and you've saved them all: start the Previews.`);
        }
        const beside = await readBuildingBeside(tx, { stylingId, kind: saving.kind, consultationId: running.consultationId });
        const list = await readStyleIconList(tx, beside.styleIconList);
        const icon = list.find((listed) => listed.number === parsed.data.styleIcon);
        if (!icon) return refused(`There's no Style Icon ${parsed.data.styleIcon} on your list.`);
        if (icon.status !== "unused") {
          return refused(`${icon.name} has already ${icon.status === "used" ? "inspired an Outfit" : "been passed over"}: save the next Style Icon's.`);
        }
        // Qloo decides the order Style Icons are offered in (ADR-0010).
        const next = list.find((listed) => listed.status === "unused")!;
        if (next.id !== icon.id) return refused(`${next.name}, Style Icon ${next.number}, comes first: save their Outfit before ${icon.name}'s.`);
        const categories = outfitCategories(saving);
        if (categories.join() !== "hairstyle") throw new Error("Only a Face Photo's Outfits, a Hairstyle alone, are saved by the Stylist.");
        const hairstyle = checkedHairstyle(parsed.data.hairstyle);
        if ("refusal" in hairstyle) return refused(hairstyle.refusal);

        const outfitId = randomUUID();
        const position = beside.firstPosition + made.length;
        await tx.insert(outfit).values({
          id: outfitId,
          consultationId: running.consultationId,
          stylingId,
          position,
          styleIconId: icon.id,
          current: false,
          previewState: "pending",
        });
        await tx.insert(piece).values({ id: randomUUID(), outfitId, category: "hairstyle", ...hairstyle });
        await tx.update(styleIcon).set({ status: "used" }).where(eq(styleIcon.id, icon.id));
        await tx
          .update(styling)
          .set({ outfitsMade: sql`${styling.outfitsMade} + 1` })
          .where(eq(styling.id, stylingId));
        return { ok: true, outfit: position };
      });
    },

    async startPreviews(stylingId) {
      return whileRunning(ctx.db, stylingId, async (tx) => {
        const { stage } = await readSaving(tx, stylingId);
        const made = await tx.select({ position: outfit.position }).from(outfit).where(eq(outfit.stylingId, stylingId)).orderBy(asc(outfit.position));
        if (made.length === 0) return refused("You haven't saved an Outfit yet: save one first, or finish if you can't make any.");
        // A retry after the move went through has nothing left to move.
        if (stage !== "previews") await moveStage(tx, ctx.clock, stylingId, "previews");
        return { ok: true, outfits: made.map(({ position }) => position) };
      });
    },

    async openPreview(stylingId, outfitNumber) {
      const { stage } = await readRunningStyling(ctx.db, stylingId);
      if (stage !== "previews") return refused("Say you've saved every Outfit first, with startPreviews.");
      const [saved] = await ctx.db
        .select({ id: outfit.id, previewState: outfit.previewState })
        .from(outfit)
        .where(and(eq(outfit.stylingId, stylingId), eq(outfit.position, outfitNumber)));
      if (!saved) return refused(`You haven't saved an Outfit ${outfitNumber}.`);
      if (saved.previewState !== "pending") return refused(`Outfit ${outfitNumber}'s Preview is already done.`);
      return { ok: true, outfitId: saved.id };
    },
  };
}

function refused(refusal: string): { ok: false; refusal: string } {
  return { ok: false, refusal };
}

/** A Style Icon on a Styling's list, as the Stylist is told it, with its ID and whether it was used. */
interface ListedStyleIcon extends StylistStyleIcon {
  id: string;
  status: StyleIconStatus;
}

/** The Style Icons with this status, as the Stylist is told them. */
function withStatus(list: readonly ListedStyleIcon[], status: StyleIconStatus): StylistStyleIcon[] {
  return list.filter((icon) => icon.status === status).map(({ number, name, line }) => ({ number, name, line }));
}

/**
 * A Style Icon list, by the Styling it belongs to, as a Styling builds beside it
 * (`readBuildingBeside`): in Qloo's order, each Style Icon numbered by its place on it. None when
 * there's no list.
 */
async function readStyleIconList(db: Database | Transaction, styleIconList: string | null): Promise<ListedStyleIcon[]> {
  if (!styleIconList) return [];
  return db
    .select({ id: styleIcon.id, number: styleIcon.position, name: styleIcon.name, line: styleIcon.line, status: styleIcon.status })
    .from(styleIcon)
    .where(eq(styleIcon.stylingId, styleIconList))
    .orderBy(asc(styleIcon.position));
}

/** What saving an Outfit checks the Styling against: where it is, its kind and the photo's Categories. */
async function readSaving(tx: Transaction, stylingId: string) {
  const [row] = await tx
    .select({ stage: styling.stage, kind: styling.kind, photoType: consultation.photoType, hairCovered: consultation.hairCovered })
    .from(styling)
    .innerJoin(consultation, eq(consultation.id, styling.consultationId))
    .where(eq(styling.id, stylingId));
  return row!;
}

/**
 * The Hairstyle as it's saved, trimmed, when every field is there and none states a price, as
 * tailoring's replies were checked, or why it's refused.
 */
function checkedHairstyle({
  cut,
  details,
  cutKnown,
  why,
}: SaveOutfitInput["hairstyle"]): { item: string; details: string; why: string; unknownCut: boolean } | { refusal: string } {
  const fields = { cut: cut.trim(), details: details.trim(), why: why.trim() };
  const missing = Object.entries(fields).flatMap(([name, text]) => (text ? [] : [name]));
  if (missing.length > 0) return { refusal: `The Hairstyle's ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} empty.` };
  const priced = Object.entries(fields).flatMap(([name, text]) => (statesAPrice(text) ? [name] : []));
  if (priced.length > 0) return { refusal: `The Hairstyle's ${priced.join(" and ")} must not state a price.` };
  return { item: fields.cut, details: fields.details, why: fields.why, unknownCut: !cutKnown };
}
