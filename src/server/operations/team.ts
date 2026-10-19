import { isAPIError } from "better-auth/api";
import { and, asc, eq } from "drizzle-orm";

import { DEMO_ACCOUNT_BIRTH_DATE, DEMO_ACCOUNT_PROFILE, isAllowedPassword } from "@/config/accounts";
import { byCategoryOrder } from "@/config/consultations";
import { LANDING_SAMPLES_FOLDER, LANDING_STYLE_ICONS } from "@/config/landing";
import { judgeAge, parseIsoBirthDate, storeBirthYearAndMonth } from "@/server/accounts/birth-date";
import { type AccountDeletionContext, deleteAccountOf } from "@/server/accounts/deletion";
import { checkProfile, usernameProblem } from "@/server/accounts/profile";
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
  await storeBirthYearAndMonth(ctx.auth, userId, birthDate);
  return { ok: true, accountDeleted: false };
}

/** The password the team chose for the Demo Account, which reaches the script from an environment variable. */
export interface DemoAccountCreation {
  password: string;
}

export type CreateDemoAccountRefusal = { refusal: "invalid-password" | "already-exists" | "username-taken" };

/**
 * Creates the Demo Account the same way every time: through Better Auth's sign-up, as every account
 * is made, with the username, profile and date of birth config gives it, at the address config names
 * it by, and with the team's password. Its address is the team's own, so it's marked verified at
 * once, and the session sign-up opens, which nobody holds, is ended.
 */
export async function createDemoAccount(
  ctx: Pick<TeamContext, "auth">,
  { password }: DemoAccountCreation,
): Promise<Result<object, CreateDemoAccountRefusal>> {
  if (!isAllowedPassword(password)) return { ok: false, refusal: "invalid-password" };
  const email = ctx.auth.demoAccountEmail;
  if (await findUserIdByEmail(ctx, email)) return { ok: false, refusal: "already-exists" };
  const profile = checkProfile(DEMO_ACCOUNT_PROFILE);
  if (!profile.ok) throw new Error(`The Demo Account's ${profile.field} in config isn't valid.`);

  // The date of birth isn't a user field: the sign-up hooks check it and keep only its year and month.
  const body = { ...profile.body, email, password, birthDate: DEMO_ACCOUNT_BIRTH_DATE };
  let userId: string;
  try {
    userId = (await ctx.auth.api.signUpEmail({ body })).user.id;
  } catch (error) {
    if (isAPIError(error) && usernameProblem(error.body?.code?.toUpperCase()) === "taken") return { ok: false, refusal: "username-taken" };
    throw error;
  }
  const { internalAdapter } = await ctx.auth.$context;
  await internalAdapter.updateUser(userId, { emailVerified: true });
  await internalAdapter.deleteUserSessions(userId);
  return { ok: true };
}

/** A Consultation made on the account using this email, to freeze as a landing page sample. */
export interface LandingSampleExport {
  email: string;
  consultationId: string;
  /** Which of its current Outfits the sample shows, as "Outfit N" numbers it. The first unless given. */
  outfitPosition?: number;
}

export type ExportLandingSampleRefusal = { refusal: "no-such-account" | "no-such-consultation" | "no-outfit" | "no-preview" };

/** One of a frozen sample's images, for the script to ship with the page: its path from the site's root, and its bytes. */
export interface LandingSampleImage {
  path: string;
  bytes: Uint8Array;
}

/**
 * Freezes a Consultation made on the Demo Account as a landing page sample: its text, from the
 * Photo Style to one Outfit's Pieces (the first, unless the team picks another), and its photo and
 * that Outfit's Preview, for the script to ship with the page so the sample outlives the
 * Consultation. It writes nothing itself. It must be a Consultation of the account using this
 * email, the Demo Account's, so a mistyped ID can't put another user's photo on the public page.
 */
export async function exportLandingSample(
  ctx: TeamContext,
  { email, consultationId, outfitPosition = 1 }: LandingSampleExport,
): Promise<Result<{ sample: LandingSample; images: LandingSampleImage[] }, ExportLandingSampleRefusal>> {
  const userId = await findUserIdByEmail(ctx, email);
  if (!userId) return { ok: false, refusal: "no-such-account" };
  const [row] = await ctx.db
    .select()
    .from(consultation)
    .where(and(eq(consultation.id, consultationId), eq(consultation.userId, userId)));
  if (!row) return { ok: false, refusal: "no-such-consultation" };
  const [shown] = await ctx.db
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
    .where(and(eq(outfit.consultationId, row.id), eq(outfit.current, true), eq(outfit.position, outfitPosition)));
  if (!shown) return { ok: false, refusal: "no-outfit" };
  if (shown.previewState !== "ready" || !shown.previewPathname) return { ok: false, refusal: "no-preview" };
  const styleIcons = await ctx.db
    .select({ name: styleIcon.name })
    .from(styleIcon)
    .where(eq(styleIcon.stylingId, shown.styleIconList))
    .orderBy(asc(styleIcon.position))
    // Down to the shown Outfit's Style Icon, when it ranks below the first few.
    .limit(Math.max(LANDING_STYLE_ICONS, shown.styleIconRank));
  const pieces = await ctx.db.select(pieceViewColumns).from(piece).where(eq(piece.outfitId, shown.id));
  const folder = `${LANDING_SAMPLES_FOLDER}/${row.photoType}`;
  // The photo keeps the name it was stored under, for its format.
  const photo = { path: `${folder}/${row.photoPathname.split("/").at(-1)!}`, bytes: (await ctx.blob.get(row.photoPathname)).bytes };
  const preview = { path: `${folder}/preview.webp`, bytes: (await ctx.blob.get(shown.previewPathname)).bytes };
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
      outfit: { styleIconName: shown.styleIconName, pieces: pieces.toSorted(byCategoryOrder).map(pieceView) },
      images: { photoPath: photo.path, previewPath: preview.path },
    },
    images: [photo, preview],
  };
}

/** The account using this email, as Better Auth finds it at sign-in: ignoring case. */
async function findUserIdByEmail(ctx: Pick<TeamContext, "auth">, email: string): Promise<string | null> {
  const { internalAdapter } = await ctx.auth.$context;
  const found = await internalAdapter.findUserByEmail(email.trim());
  return found?.user.id ?? null;
}
