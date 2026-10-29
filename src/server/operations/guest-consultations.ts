import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as z from "zod";

import { isStylePreference, type StylePreference } from "@/config/accounts";
import { findCountry } from "@/config/countries";
import { GUEST_EMAIL_DOMAIN } from "@/config/guests";
import { applyAgeGate, isBlockedByAgeGate } from "@/server/accounts/age-gate";
import { birthDateFieldsSchema, parseBirthDateFields } from "@/server/accounts/birth-date";
import { consultation, user } from "@/server/db/schema";
import { checkGuestLimits, type GuestLimitRefusal, lockGuestLimits } from "@/server/guests/daily-limit";
import { guestCookie } from "@/server/guests/guest-cookie";
import { guestIpHashOf } from "@/server/guests/ip-hash";
import {
  bothPhotoBoxesTicked,
  checkPhoto,
  createConsultation,
  type PhotoCheckRefusal,
  startConsultationInputSchema,
} from "@/server/operations/consultations";
import type { OperationContext, Result } from "@/server/operations/context";
import { readGuestUsageSummary, type UsageSummary } from "@/server/operations/usage";
import { readGuest } from "@/server/operations/viewer";
import { ageGroupAt } from "@/server/outfit-assembly/age-group";
import { ipCountryOf, isFromSupportedRegion } from "@/server/region-gate";
import { type AppWideStylingStartRefusal, checkAppWideStylingStart } from "@/server/stylings/start";
import { recordGuestUsage } from "@/server/usage/guest-records";

/**
 * The shape of what the Guest Page's "Get my Outfits" sends: what a signed-in user's sends, plus
 * the details a Guest has no profile to take them from, and the Terms agreement on the consent
 * sheet. The server action parses its form with this.
 */
export const startGuestConsultationInputSchema = startConsultationInputSchema.extend({
  /** The date of birth fields as the Guest typed them. Only the age group they make is kept. */
  birthDate: birthDateFieldsSchema,
  stylePreference: z.string(),
  countryCode: z.string(),
  /** The consent sheet's third box: the Terms and Privacy Policy. */
  acceptedTerms: z.boolean(),
});
export type StartGuestConsultationInput = z.infer<typeof startGuestConsultationInputSchema>;

/** A detail the Guest gives on the spot, which "Get my Outfits" names when it's missing. */
export type GuestDetailsField = "birthDate" | "stylePreference" | "countryCode";

export type StartGuestConsultationRefusal =
  /** The region gate, the app-wide caps or the backstops, which stop everyone's Stylings. */
  | AppWideStylingStartRefusal
  /** The age gate: the date of birth isn't 18 or more everywhere, or the browser is blocked, as at sign-up. */
  | { refusal: "under-18" }
  /** A detail is missing, or isn't one: not a real date, or not on its list. */
  | { refusal: "invalid"; field: GuestDetailsField }
  /** The consent sheet's two photo boxes weren't both ticked. */
  | { refusal: "photo-consent-needed" }
  /** Its Terms and Privacy Policy box wasn't ticked. */
  | { refusal: "terms-not-accepted" }
  /** The photo wasn't accepted, for the same reasons as anyone's. */
  | PhotoCheckRefusal
  /** The request's internet address can't have a Guest Consultation now. */
  | GuestLimitRefusal
  /** The deployment has no salt to hash internet addresses under, so the Guest Page is closed. */
  | { refusal: "guest-page-unavailable" };

/**
 * The Guest Page's "Get my Outfits": checks the request, has the AI check the photo as for anyone,
 * then creates the guest user who owns the Guest Consultation, the Consultation and its first
 * Styling together, and sets the guest cookie that lets this browser come back to it. Its checks
 * run in the spec's order, every one before the photo is checked: the region gate, the age gate,
 * the details, consent and the Terms, then the app-wide caps and backstops. A refused request
 * stores nothing, and only an accepted photo makes a guest user.
 */
export async function startGuestConsultation(
  ctx: OperationContext,
  input: StartGuestConsultationInput,
): Promise<Result<{ consultationId: string }, StartGuestConsultationRefusal>> {
  // First, so nothing is asked of, or recorded from, where the app isn't available.
  if (!isFromSupportedRegion(ctx.requestHeaders)) return { ok: false, refusal: "unsupported-region" };
  if (!ctx.guestIpSalt) return { ok: false, refusal: "guest-page-unavailable" };
  const ipHash = await guestIpHashOf(ctx, ctx.guestIpSalt);
  const limits = await checkGuestLimits(ctx, ipHash);
  if (!limits.ok) return limits;
  // The age gate holds as at sign-up, and nothing of a date it refuses is kept.
  if (isBlockedByAgeGate(ctx.requestHeaders)) return { ok: false, refusal: "under-18" };
  const birthDate = parseBirthDateFields(input.birthDate);
  if (!birthDate) return invalid("birthDate");
  if (!applyAgeGate(ctx.responseCookies, birthDate, ctx.clock.now())) return { ok: false, refusal: "under-18" };
  if (!isStylePreference(input.stylePreference)) return invalid("stylePreference");
  const stylePreference: StylePreference = input.stylePreference;
  const country = findCountry(input.countryCode);
  if (!country) return invalid("countryCode");
  const countryCode = country.code;
  if (!bothPhotoBoxesTicked(input.consent)) return { ok: false, refusal: "photo-consent-needed" };
  if (!input.acceptedTerms) return { ok: false, refusal: "terms-not-accepted" };
  const stylingStart = await checkAppWideStylingStart(ctx);
  if (!stylingStart.ok) return stylingStart;
  // A Guest's photo checks count against their address, as a user's count against them.
  const checked = await checkPhoto(ctx, input, () => recordGuestUsage(ctx.db, { kind: "photo_check", ipHash, at: ctx.clock.now() }));
  if (!checked.ok) return checked;
  const guestUserId = randomUUID();
  const consentedAt = ctx.clock.now();
  let heldBack: GuestLimitRefusal | undefined;
  const created = await createConsultation(ctx, { ...input, ...checked, outfitsWanted: stylingStart.outfitsWanted }, async (tx, now) => {
    // Another of the address's started while the photo was checked: one at a time.
    const stillAllowed = await lockGuestLimits(tx, ipHash, now);
    if (!stillAllowed.ok) {
      const { ok: _, ...refusal } = stillAllowed;
      heldBack = refusal;
      return null;
    }
    const ageGroup = ageGroupAt(birthDate.year, birthDate.month, now);
    const placeholder = `${guestUserId}@${GUEST_EMAIL_DOMAIN}`;
    await tx.insert(user).values({
      id: guestUserId,
      name: "Guest",
      email: placeholder,
      username: placeholder,
      displayUsername: placeholder,
      stylePreference,
      countryCode,
      isGuest: true,
      ageGroup,
      guestIpHash: ipHash,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    });
    return { userId: guestUserId, isDemoAccount: false, stylePreference, countryCode, ageGroup, photoNoticeAcceptedAt: consentedAt };
  });
  if (!created.ok) {
    if (heldBack) return { ok: false, ...heldBack };
    throw new Error(created.refusal);
  }
  ctx.responseCookies.set(guestCookie(ctx.auth.cookieSecret, guestUserId, consentedAt));
  return created;
}

function invalid(field: GuestDetailsField): { ok: false; refusal: "invalid"; field: GuestDetailsField } {
  return { ok: false, refusal: "invalid", field };
}

/**
 * What the Guest Page opens on: the Guest Consultation of the browser's guest cookie, running or
 * finished, or else the New Consultation steps, with the Country filled in from the request's IP
 * country when it's on the list. In their place, mostly in the order "Get my Outfits" refuses them:
 * - closed, saying why, from a country Gemini doesn't serve, to a browser the age gate has
 *   blocked, which an account can't help, or on a deployment without the salt to hash internet
 *   addresses under;
 * - used up, saying when it lifts, while the internet address's daily limit or one at a time
 *   holds, which an account of the Guest's own, with its own Outfit Allowance, would get round;
 * - closed while an app-wide cap or a backstop stops every Styling.
 *
 * The Guest Consultation comes with the Guest's usage summary, for Try again once its Styling
 * breaks (`readGuestUsageSummary`).
 */
export type GuestPageView =
  | { show: "guest-consultation"; consultationId: string; usage: UsageSummary }
  | { show: "new-consultation"; countryCode: string | null }
  | { show: "used-up"; refusal: GuestLimitRefusal }
  | { show: "closed"; refusal: { refusal: "under-18" } | AppWideStylingStartRefusal | { refusal: "guest-page-unavailable" } };

export async function readGuestPage(
  ctx: Pick<OperationContext, "auth" | "db" | "clock" | "stylings" | "guestIpSalt" | "requestHeaders">,
): Promise<GuestPageView> {
  const guest = await readGuest(ctx);
  // A guest user owns its Guest Consultation alone.
  const [guestConsultation] = guest
    ? await ctx.db.select({ id: consultation.id }).from(consultation).where(eq(consultation.userId, guest.id)).limit(1)
    : [];
  if (guest && guestConsultation) {
    return { show: "guest-consultation", consultationId: guestConsultation.id, usage: await readGuestUsageSummary(ctx, guest) };
  }
  if (!isFromSupportedRegion(ctx.requestHeaders)) return { show: "closed", refusal: { refusal: "unsupported-region" } };
  // Before the address's limits, unlike "Get my Outfits", so a blocked browser isn't offered sign-up, which is closed to it too.
  if (isBlockedByAgeGate(ctx.requestHeaders)) return { show: "closed", refusal: { refusal: "under-18" } };
  if (!ctx.guestIpSalt) return { show: "closed", refusal: { refusal: "guest-page-unavailable" } };
  const limits = await checkGuestLimits(ctx, await guestIpHashOf(ctx, ctx.guestIpSalt));
  if (!limits.ok) {
    const { ok: _, ...refusal } = limits;
    return { show: "used-up", refusal };
  }
  const stylingStart = await checkAppWideStylingStart(ctx);
  if (!stylingStart.ok) {
    const { ok: _, ...refusal } = stylingStart;
    return { show: "closed", refusal };
  }
  return { show: "new-consultation", countryCode: ipCountryOf(ctx.requestHeaders) };
}
