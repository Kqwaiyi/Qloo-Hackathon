import { and, asc, eq } from "drizzle-orm";

import { byCategoryOrder } from "@/config/consultations";
import { LANDING_STYLE_ICONS } from "@/config/landing";
import { judgeAge, parseIsoBirthDate } from "@/server/accounts/birth-date";
import { type AccountDeletionContext, deleteAccountOf } from "@/server/accounts/deletion";
import type { BlobStore } from "@/server/blob/store";
import { landingSampleFolder, landingSamplePathname } from "@/server/consultations/blob-pathnames";
import { consultation, outfit, piece, styleIcon } from "@/server/db/schema";
import { pieceView, pieceViewColumns } from "@/server/operations/consultations";
import type { OperationContext, Result } from "@/server/operations/context";
import type { LandingSample } from "@/server/operations/landing";

// The team's own operations, which its scripts run by hand. There's no request and no sign-in:
// whoever runs a script holds the production credentials.

/** What a team script's operations need. */
export type TeamContext = AccountDeletionContext & Pick<OperationContext, "auth">;

export type DeleteAccountByEmailRefusal = { refusal: "no-such-account" };

/**
 * Deletes the account using this email for good, for an emailed request or an under-18 report, as
 * the user's own deletion does: every Consultation with its photo and Previews, any Styling stopped.
 */
export async function deleteAccountByEmail(ctx: TeamContext, email: string): Promise<Result<object, DeleteAccountByEmailRefusal>> {
  const userId = await findUserIdByEmail(ctx, email);
  if (!userId) return { ok: false, refusal: "no-such-account" };
  await deleteAccountOf(ctx, userId);
  return { ok: true };
}

/** The date of birth the user emailed the team, for the account using this email. */
export interface BirthDateCorrection {
  email: string;
  /** "YYYY-MM-DD", as sign-up sends it. */
  birthDate: string;
}

export type CorrectBirthDateRefusal = { refusal: "no-such-account" | "invalid-birth-date" };

/**
 * Corrects the birth year and month of the account using this email, when its user writes in to say
 * they're wrong. It takes the whole date of birth and judges it as sign-up does: 18 to the day, in
 * every time zone. If the user isn't, the account is deleted instead, with everything in it
 * (ADR-0004), as `deleteAccountByEmail` does. Otherwise only the year and month are kept.
 */
export async function correctBirthDate(
  ctx: TeamContext,
  correction: BirthDateCorrection,
): Promise<Result<{ accountDeleted: boolean }, CorrectBirthDateRefusal>> {
  const now = ctx.clock.now();
  const birthDate = parseIsoBirthDate(correction.birthDate);
  // A date still to come is a typo, which would otherwise count as under 18 and delete the account.
  if (!birthDate || Date.UTC(birthDate.year, birthDate.month - 1, birthDate.day) > now.getTime()) {
    return { ok: false, refusal: "invalid-birth-date" };
  }
  const userId = await findUserIdByEmail(ctx, correction.email);
  if (!userId) return { ok: false, refusal: "no-such-account" };
  if (judgeAge(birthDate, now) !== "adult") {
    await deleteAccountOf(ctx, userId);
    return { ok: true, accountDeleted: true };
  }
  // Better Auth's update-user endpoint refuses the birth fields, but its own update doesn't.
  const { internalAdapter } = await ctx.auth.$context;
  await internalAdapter.updateUser(userId, { birthYear: birthDate.year, birthMonth: birthDate.month });
  return { ok: true, accountDeleted: false };
}

/** A Consultation made on the account using this email, to freeze as a landing page sample. */
export interface LandingSampleExport {
  email: string;
  consultationId: string;
}

export type ExportLandingSampleRefusal = { refusal: "no-such-account" | "no-such-consultation" | "no-outfit" | "no-preview" };

/**
 * Freezes a Consultation made on the Demo Account as a landing page sample: its text, from the
 * Photo Style to its first Outfit's Pieces, and copies of its photo and that Outfit's Preview in
 * the landing page's own Blob folder, which outlive the Consultation. It must be a Consultation of
 * the account using this email, the Demo Account's, so a mistyped ID can't put another user's
 * photo on the public page.
 */
export async function exportLandingSample(
  ctx: TeamContext,
  { email, consultationId }: LandingSampleExport,
): Promise<Result<{ sample: LandingSample }, ExportLandingSampleRefusal>> {
  const userId = await findUserIdByEmail(ctx, email);
  if (!userId) return { ok: false, refusal: "no-such-account" };
  const [row] = await ctx.db
    .select()
    .from(consultation)
    .where(and(eq(consultation.id, consultationId), eq(consultation.userId, userId)));
  if (!row) return { ok: false, refusal: "no-such-consultation" };
  const [first] = await ctx.db
    .select({
      id: outfit.id,
      previewState: outfit.previewState,
      previewPathname: outfit.previewPathname,
      styleIconName: styleIcon.name,
      styleIconRank: styleIcon.position,
      // The ranked list its Style Icon is on, by the Styling that ranked it.
      styleIconList: styleIcon.stylingId,
    })
    .from(outfit)
    .innerJoin(styleIcon, eq(styleIcon.id, outfit.styleIconId))
    .where(and(eq(outfit.consultationId, row.id), eq(outfit.current, true)))
    .orderBy(asc(outfit.position))
    .limit(1);
  if (!first) return { ok: false, refusal: "no-outfit" };
  if (first.previewState !== "ready" || !first.previewPathname) return { ok: false, refusal: "no-preview" };
  const styleIcons = await ctx.db
    .select({ name: styleIcon.name })
    .from(styleIcon)
    .where(eq(styleIcon.stylingId, first.styleIconList))
    .orderBy(asc(styleIcon.position))
    // Down to the first Outfit's Style Icon, when Style Icons passed over push it below the first few.
    .limit(Math.max(LANDING_STYLE_ICONS, first.styleIconRank));
  const pieces = await ctx.db.select(pieceViewColumns).from(piece).where(eq(piece.outfitId, first.id));
  const images = {
    // Named as the photo was stored, for its format.
    photoPathname: landingSamplePathname(row.id, row.photoPathname.split("/").at(-1)!),
    previewPathname: landingSamplePathname(row.id, "preview.webp"),
  };
  // The store never overwrites, so an export run again replaces its copies.
  await ctx.blob.deleteFolder(landingSampleFolder(row.id));
  await copyBlob(ctx.blob, row.photoPathname, images.photoPathname);
  await copyBlob(ctx.blob, first.previewPathname, images.previewPathname);
  return {
    ok: true,
    sample: {
      photoType: row.photoType,
      stylePreference: row.stylePreference,
      ageGroup: row.ageGroup,
      countryCode: row.countryCode,
      budgetTier: row.budgetTier,
      photoStyle: row.photoStyle,
      styleIcons: styleIcons.map(({ name }) => name),
      outfit: { styleIconName: first.styleIconName, pieces: pieces.toSorted(byCategoryOrder).map(pieceView) },
      images,
    },
  };
}

async function copyBlob(blob: BlobStore, from: string, to: string): Promise<void> {
  const { bytes, contentType } = await blob.get(from);
  await blob.put(to, bytes, contentType);
}

/** The account using this email, as Better Auth finds it at sign-in: ignoring case. */
async function findUserIdByEmail(ctx: Pick<TeamContext, "auth">, email: string): Promise<string | null> {
  const { internalAdapter } = await ctx.auth.$context;
  const found = await internalAdapter.findUserByEmail(email.trim());
  return found?.user.id ?? null;
}
