import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as z from "zod";

import { isStylePreference, type StylePreference } from "@/config/accounts";
import { findCountry } from "@/config/countries";
import { GUEST_EMAIL_DOMAIN } from "@/config/guests";
import { applyAgeGate, isBlockedByAgeGate } from "@/server/accounts/age-gate";
import { birthDateFieldsSchema, parseBirthDateFields } from "@/server/accounts/birth-date";
import { consultation, user } from "@/server/db/schema";
import { guestCookie } from "@/server/guests/guest-cookie";
import {
  bothPhotoBoxesTicked,
  checkPhoto,
  createConsultation,
  type PhotoCheckRefusal,
  startConsultationInputSchema,
} from "@/server/operations/consultations";
import type { OperationContext, Result } from "@/server/operations/context";
import { readGuest } from "@/server/operations/viewer";
import { ageGroupAt } from "@/server/outfit-assembly/age-group";
import { ipCountryOf, isFromSupportedRegion } from "@/server/region-gate";
import { type AppWideStylingStartRefusal, checkAppWideStylingStart } from "@/server/stylings/start";

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
  | PhotoCheckRefusal;

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
  const checked = await checkPhoto(ctx, input, async () => {});
  if (!checked.ok) return checked;
  const guestUserId = randomUUID();
  const consentedAt = ctx.clock.now();
  const created = await createConsultation(ctx, { ...input, ...checked, outfitsWanted: stylingStart.outfitsWanted }, async (tx, now) => {
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
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    });
    return { userId: guestUserId, isDemoAccount: false, stylePreference, countryCode, ageGroup, photoNoticeAcceptedAt: consentedAt };
  });
  if (!created.ok) throw new Error(created.refusal);
  ctx.responseCookies.set(guestCookie(ctx.auth.cookieSecret, guestUserId, consentedAt));
  return created;
}

function invalid(field: GuestDetailsField): { ok: false; refusal: "invalid"; field: GuestDetailsField } {
  return { ok: false, refusal: "invalid", field };
}

/**
 * What the Guest Page opens on: the Guest Consultation of the browser's guest cookie, running or
 * finished, or else the New Consultation steps, with the Country filled in from the request's IP
 * country when it's on the list. They're closed, saying why, to a browser the age gate has
 * blocked, and while the region gate, an app-wide cap or a backstop stops every Styling.
 */
export type GuestPageView =
  | { show: "guest-consultation"; consultationId: string }
  | { show: "new-consultation"; countryCode: string | null }
  | { show: "closed"; refusal: { refusal: "under-18" } | AppWideStylingStartRefusal };

export async function readGuestPage(ctx: Pick<OperationContext, "auth" | "db" | "clock" | "requestHeaders">): Promise<GuestPageView> {
  const guest = await readGuest(ctx);
  // A guest user owns its Guest Consultation alone.
  const [guestConsultation] = guest
    ? await ctx.db.select({ id: consultation.id }).from(consultation).where(eq(consultation.userId, guest.id)).limit(1)
    : [];
  if (guestConsultation) return { show: "guest-consultation", consultationId: guestConsultation.id };
  if (isBlockedByAgeGate(ctx.requestHeaders)) return { show: "closed", refusal: { refusal: "under-18" } };
  const stylingStart = await checkAppWideStylingStart(ctx);
  if (!stylingStart.ok) {
    const { ok: _, ...refusal } = stylingStart;
    return { show: "closed", refusal };
  }
  return { show: "new-consultation", countryCode: ipCountryOf(ctx.requestHeaders) };
}
