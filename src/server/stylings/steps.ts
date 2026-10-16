import { and, asc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { StylingStage } from "@/config/stylings";
import type { Clock } from "@/server/clock";
import type { Database, Transaction } from "@/server/db/database";
import { consultation, outfit, styleIcon, styling } from "@/server/db/schema";
import { rankStyleIcons, styleIconLines, styleIconQuery } from "@/server/outfit-assembly/style-icons";
import type { QlooClient } from "@/server/qloo/client";

import type { BuildOutfitsSteps, StylingOutcome } from "./build-outfits";

/** What the steps run on. The Workflow gives them the app's services; tests give them fakes. */
export interface StylingContext {
  db: Database;
  clock: Clock;
  qloo: QlooClient;
}

/** The Styling has finished, been cancelled or deleted, so its steps stop without saving. */
export class StylingNotRunningError extends Error {
  constructor(stylingId: string) {
    super(`Styling ${stylingId} is no longer running.`);
    this.name = "StylingNotRunningError";
  }
}

/** The "build Outfits" steps, running on `ctx`. */
export function stylingSteps(ctx: StylingContext): BuildOutfitsSteps {
  return {
    async styleIconLines(stylingId) {
      const { stylePreference } = await readRunningStyling(ctx.db, stylingId);
      return styleIconLines(stylePreference);
    },

    // The search uses the profile stored on the Consultation, and the Photo Style the Styling builds for.
    async fetchStyleIcons(stylingId, line) {
      const { ageGroup, countryCode, photoStyle } = await readRunningStyling(ctx.db, stylingId);
      return ctx.qloo.people(styleIconQuery({ ageGroup, countryCode, photoStyle }, line));
    },

    async saveStyleIcons(stylingId, peopleByLine) {
      const ranked = rankStyleIcons(peopleByLine);
      await whileRunning(ctx.db, stylingId, async (tx, running) => {
        // A retry after the save went through has nothing left to do.
        const [saved] = await tx.select({ id: styleIcon.id }).from(styleIcon).where(eq(styleIcon.stylingId, stylingId)).limit(1);
        if (saved) return;
        if (ranked.length > 0) {
          await tx.insert(styleIcon).values(
            ranked.map((icon, index) => ({
              id: randomUUID(),
              consultationId: running.consultationId,
              stylingId,
              position: index + 1,
              qlooEntityId: icon.entityId,
              name: icon.name,
              line: icon.line,
              status: "unused" as const,
            })),
          );
        }
        await moveStage(tx, ctx.clock, stylingId, "building_outfits");
      });
    },

    async makeOutfits(stylingId) {
      await whileRunning(ctx.db, stylingId, async (tx, running) => {
        const [made] = await tx.select({ id: outfit.id }).from(outfit).where(eq(outfit.stylingId, stylingId)).limit(1);
        if (made) return;
        const icons = await tx
          .select({ id: styleIcon.id })
          .from(styleIcon)
          .where(and(eq(styleIcon.stylingId, stylingId), eq(styleIcon.status, "unused")))
          .orderBy(asc(styleIcon.position))
          .limit(running.outfitsWanted);
        if (icons.length === 0) return;
        await tx.insert(outfit).values(
          icons.map((icon, index) => ({
            id: randomUUID(),
            consultationId: running.consultationId,
            stylingId,
            position: index + 1,
            styleIconId: icon.id,
            current: false,
          })),
        );
        await tx
          .update(styleIcon)
          .set({ status: "used" })
          .where(
            inArray(
              styleIcon.id,
              icons.map((icon) => icon.id),
            ),
          );
        await tx.update(styling).set({ outfitsMade: icons.length }).where(eq(styling.id, stylingId));
      });
    },

    finish: (stylingId, outcome) => finishStyling(ctx, stylingId, outcome),
  };
}

/**
 * Finishes a running Styling. Whatever Outfits it made switch in at once and the Consultation is
 * ready. One that made none has failed: nothing switches, and the Consultation keeps whatever it
 * showed before, or shows No Outfits. A Styling that isn't running any more is left as it is.
 */
export async function finishStyling(ctx: Pick<StylingContext, "db" | "clock">, stylingId: string, outcome: StylingOutcome): Promise<void> {
  const finishedAt = ctx.clock.now();
  await ctx.db.transaction(async (tx) => {
    const running = await lockRunningStyling(tx, stylingId);
    if (!running) return;
    const made = await tx.select({ id: outfit.id }).from(outfit).where(eq(outfit.stylingId, stylingId));
    if (made.length > 0) {
      await tx.update(outfit).set({ current: true }).where(eq(outfit.stylingId, stylingId));
      await tx.update(styling).set({ status: "succeeded", outfitsMade: made.length, finishedAt }).where(eq(styling.id, stylingId));
      await tx.update(consultation).set({ state: "ready" }).where(eq(consultation.id, running.consultationId));
      return;
    }
    const failureReason = outcome === "broke" ? "something_broke" : "nothing_built";
    await tx.update(styling).set({ status: "failed", failureReason, finishedAt }).where(eq(styling.id, stylingId));
    const [shown] = await tx
      .select({ id: outfit.id })
      .from(outfit)
      .where(and(eq(outfit.consultationId, running.consultationId), eq(outfit.current, true)))
      .limit(1);
    await tx
      .update(consultation)
      .set({ state: shown ? "ready" : "no_outfits" })
      .where(eq(consultation.id, running.consultationId));
  });
}

/** The running Styling with what its steps build from, or throws if it isn't running. */
async function readRunningStyling(db: Database, stylingId: string) {
  const [row] = await db
    .select({
      photoStyle: styling.photoStyle,
      stylePreference: consultation.stylePreference,
      countryCode: consultation.countryCode,
      ageGroup: consultation.ageGroup,
    })
    .from(styling)
    .innerJoin(consultation, eq(consultation.id, styling.consultationId))
    .where(and(eq(styling.id, stylingId), eq(styling.status, "running")));
  if (!row) throw new StylingNotRunningError(stylingId);
  return row;
}

/** Saves in one transaction, holding the Styling so it can't finish meanwhile, and only while it runs. */
async function whileRunning(
  db: Database,
  stylingId: string,
  save: (tx: Transaction, running: { consultationId: string; outfitsWanted: number }) => Promise<void>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const running = await lockRunningStyling(tx, stylingId);
    if (!running) throw new StylingNotRunningError(stylingId);
    await save(tx, running);
  });
}

async function lockRunningStyling(tx: Transaction, stylingId: string) {
  const [row] = await tx
    .select({ consultationId: styling.consultationId, outfitsWanted: styling.outfitsWanted })
    .from(styling)
    .where(and(eq(styling.id, stylingId), eq(styling.status, "running")))
    .for("update");
  return row;
}

async function moveStage(tx: Transaction, clock: Clock, stylingId: string, stage: StylingStage): Promise<void> {
  await tx.update(styling).set({ stage, stageMovedAt: clock.now() }).where(eq(styling.id, stylingId));
}
