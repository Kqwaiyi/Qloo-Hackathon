import { isAPIError } from "better-auth/api";
import { and, asc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { DEMO_ACCOUNT_BIRTH_DATE, DEMO_ACCOUNT_PROFILE, isAllowedPassword, type StylePreference } from "@/config/accounts";
import { type BudgetTier, byCategoryOrder, type PhotoType } from "@/config/consultations";
import { LANDING_SAMPLE_COUNTRY_CODE, LANDING_SAMPLES_FOLDER, LANDING_STYLE_ICONS } from "@/config/landing";
import { judgeAge, parseIsoBirthDate, storeBirthYearAndMonth } from "@/server/accounts/birth-date";
import { type AccountDeletionContext, deleteAccountOf } from "@/server/accounts/deletion";
import { checkProfile, usernameProblem } from "@/server/accounts/profile";
import type { PhotoRejection } from "@/server/consultations/photo-check";
import { consultation, outfit, piece, styleIcon } from "@/server/db/schema";
import type { ResponseCookies } from "@/server/http/cookies";
import { updateProfile } from "@/server/operations/account";
import { startConsultation, storedPiece, storedPieceColumns } from "@/server/operations/consultations";
import type { OperationContext, Result } from "@/server/operations/context";
import type { LandingSample } from "@/server/operations/landing";
import { signIn } from "@/server/operations/sign-in";
import type { StylingRunner } from "@/server/stylings/runner";

// The team's own operations, which its scripts run by hand. There's no request and no sign-in:
// whoever runs a script holds the production credentials. Making a landing sample is the one
// exception: it signs in to a Demo Account of its own, on a fresh app that lives only while it runs.

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
  const pieces = await ctx.db.select(storedPieceColumns).from(piece).where(eq(piece.outfitId, shown.id));
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
      outfit: { styleIconName: shown.styleIconName, pieces: pieces.toSorted(byCategoryOrder).map(storedPiece) },
      images: { photoPath: photo.path, previewPath: preview.path },
    },
    images: [photo, preview],
  };
}

/** One of the landing page's sample photos, to run the pipeline on once and freeze as its Photo Type's sample. */
export interface LandingSampleMaking {
  photoType: PhotoType;
  photo: Blob;
  /** The sample's Style Preference, which decides its Outfits' lines. */
  stylePreference: StylePreference;
  /** A body photo's Budget Tier, No Budget when none is given. A Face Photo has none. */
  budgetTier?: BudgetTier;
  /** Which of its Outfits the sample shows, as "Outfit N" numbers it. The first unless given. */
  outfitPosition?: number;
}

/**
 * What making a landing sample runs on: a fresh app of its own, with no Demo Account in it yet, the
 * Qloo, product search and AI it should call, and Stylings run in this process when it says.
 */
export type LandingSampleApp = Omit<OperationContext, "requestHeaders" | "responseCookies" | "stylings"> & {
  /** Runs Stylings in this process: each one started runs to its end when `runPending()` is called. */
  stylings: StylingRunner & { runPending(): Promise<void> };
};

export type MakeLandingSampleRefusal =
  /** The photo check couldn't read the photo or errored, or it rejected the photo, as it would tell a user. */
  | { refusal: "unusable-file" | "check-errored" }
  | { refusal: "photo-rejected"; rejection: PhotoRejection }
  /** The Styling made no such Outfit, or that Outfit has no Preview. */
  | { refusal: "no-outfit" | "no-preview" };

/**
 * Runs the real pipeline once on one of the landing page's sample photos, and freezes what it makes
 * (spec: "Landing sample"). On its own fresh app it does what the team would do by hand: it creates
 * the Demo Account and signs in to it, sets its Style Preference to the sample's and its Country to
 * the United States, presses "Get my Outfits" with the photo, runs that first Styling to its end, and
 * exports one of its Outfits as `exportLandingSample` does. Every call goes to the Qloo, product
 * search and AI the app was given, as the app's own would. It writes nothing outside the app.
 */
export async function makeLandingSample(
  app: LandingSampleApp,
  { photoType, photo, stylePreference, budgetTier, outfitPosition }: LandingSampleMaking,
): Promise<Result<{ sample: LandingSample; images: LandingSampleImage[] }, MakeLandingSampleRefusal>> {
  // Nobody else ever signs in to the fresh app, so its password is thrown away with it.
  const password = randomBytes(24).toString("base64url");
  const created = await createDemoAccount(app, { password });
  if (!created.ok) throw new Error(`The landing sample's app isn't fresh: its Demo Account couldn't be created (${created.refusal}).`);
  const email = app.auth.demoAccountEmail;
  const judgesRequest = await judgesRequests(app);
  const signedIn = await signIn(judgesRequest(), { identifier: email, password });
  if (!signedIn.ok) throw new Error(`Couldn't sign in to the landing sample's Demo Account (${signedIn.refusal}).`);
  const profile = { username: DEMO_ACCOUNT_PROFILE.username, stylePreference, countryCode: LANDING_SAMPLE_COUNTRY_CODE };
  const profileSet = await updateProfile(judgesRequest(), profile);
  if (!profileSet.ok) throw new Error(`Couldn't set the landing sample's profile (${profileSet.refusal}).`);

  // The team agrees to the photo notice for the AI-generated sample person, as a judge does each time.
  const started = await startConsultation(judgesRequest(), { photo, photoType, budgetTier, consent: { storeAndProcess: true, sendToGemini: true } });
  if (!started.ok) {
    switch (started.refusal) {
      case "unusable-file":
      case "check-errored":
        return { ok: false, refusal: started.refusal };
      case "photo-rejected":
        return { ok: false, refusal: started.refusal, rejection: started.rejection };
      default:
        throw new Error(`The landing sample's app refused to start its Consultation (${started.refusal}).`);
    }
  }
  await app.stylings.runPending();

  const exported = await exportLandingSample(app, { email, consultationId: started.consultationId, outfitPosition });
  if (exported.ok) return exported;
  if (exported.refusal === "no-outfit" || exported.refusal === "no-preview") return { ok: false, refusal: exported.refusal };
  throw new Error(`The landing sample's Consultation couldn't be exported (${exported.refusal}).`);
}

/**
 * The requests the Demo Account's judge's browser makes on the landing sample's app: a context for
 * each next one, from the app's own origin, carrying the cookies Better Auth has set so far.
 */
async function judgesRequests(app: LandingSampleApp): Promise<() => OperationContext> {
  const origin = new URL((await app.auth.$context).baseURL).origin;
  const cookies = new Map<string, string>();
  const responseCookies: ResponseCookies = {
    // A cookie set to expire at once is Better Auth clearing it.
    set: ({ name, value, maxAge }) => (maxAge === 0 ? cookies.delete(name) : cookies.set(name, value)),
  };
  return () => {
    const cookie = [...cookies].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
    return { ...app, requestHeaders: new Headers({ origin, cookie }), responseCookies };
  };
}

/** The account using this email, as Better Auth finds it at sign-in: ignoring case. */
async function findUserIdByEmail(ctx: Pick<TeamContext, "auth">, email: string): Promise<string | null> {
  const { internalAdapter } = await ctx.auth.$context;
  const found = await internalAdapter.findUserByEmail(email.trim());
  return found?.user.id ?? null;
}
