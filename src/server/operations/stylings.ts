import { and, eq } from "drizzle-orm";

import type { ConsultationState } from "@/config/consultations";
import type { StylingStage } from "@/config/stylings";
import { consultation, styling } from "@/server/db/schema";
import type { OperationContext } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";

/** What a page waiting on a Consultation's Styling polls. */
export interface StylingStatusView {
  state: ConsultationState;
  /** The running Styling's stage, or null when none is running. */
  stage: StylingStage | null;
}

/** The Styling status of one of the signed-in user's own Consultations, or null for anyone else's. */
export async function readStylingStatus(
  ctx: Pick<OperationContext, "auth" | "db" | "requestHeaders">,
  consultationId: string,
): Promise<StylingStatusView | null> {
  const user = await readSignedInUser(ctx);
  if (!user) return null;
  const [row] = await ctx.db
    .select({ state: consultation.state, stage: styling.stage })
    .from(consultation)
    .leftJoin(styling, and(eq(styling.consultationId, consultation.id), eq(styling.status, "running")))
    .where(and(eq(consultation.id, consultationId), eq(consultation.userId, user.id)));
  return row ?? null;
}
