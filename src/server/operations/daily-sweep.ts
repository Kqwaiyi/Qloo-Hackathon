import { and, asc, eq, isNull, lt, lte, ne, type SQL } from "drizzle-orm";

import { INACTIVE_ACCOUNT_LIFETIME_MONTHS, INACTIVITY_WARNING_NOTICE_DAYS, UNVERIFIED_ACCOUNT_LIFETIME_DAYS } from "@/config/accounts";
import { EMAIL_LOG_LIFETIME_DAYS } from "@/config/email";
import type { ExchangeRateSource } from "@/config/currencies";
import { USAGE_RECORD_LIFETIME_DAYS } from "@/config/limits";
import { QLOO_CACHE_LIFETIME_DAYS } from "@/config/qloo";
import { ROUTES } from "@/config/routes";
import { type AccountDeletionContext, deleteAccountOf } from "@/server/accounts/deletion";
import { startOfNextUtcDay } from "@/server/clock";
import { emailLog, qlooCache, usageRecord, user } from "@/server/db/schema";
import { inactivityWarningEmail } from "@/server/email/messages";
import type { EmailSender, SendResult } from "@/server/email/send-email";
import { type ExchangeRateTransport, refreshExchangeRates } from "@/server/exchange-rates/rates";
import type { OperationContext } from "@/server/operations/context";
import { purgeGuestUsageRecords } from "@/server/usage/guest-records";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What the daily sweep needs: an account's deletion, the send-email function for its warnings, and
 * where it fetches exchange rates from.
 */
export type SweepContext = AccountDeletionContext &
  Pick<OperationContext, "auth"> & { emailSender: EmailSender; exchangeRateTransport: ExchangeRateTransport };

/** What the daily sweep did. */
export interface SweepReport {
  unverifiedAccountsDeleted: number;
  inactiveAccountsDeleted: number;
  inactivityWarningsSent: number;
  usageRecordsPurged: number;
  /** The Guest Page's guest usage records, with the IP hashes they hold, once 24 hours old. */
  guestUsageRecordsPurged: number;
  emailLogRowsPurged: number;
  qlooCacheEntriesPurged: number;
  /** Where the day's exchange rates came from, or null when no source answered, so the day before's stay. */
  exchangeRatesFrom: ExchangeRateSource | null;
  /** Accounts it couldn't delete or warn, each logged. They're still due, so the next sweep tries them again. */
  failures: number;
}

/** How many accounts a step dealt with, and how many failed. */
interface Tally {
  done: number;
  failed: number;
}

/**
 * The daily sweep, which Vercel Cron runs once a day: it keeps the Privacy Policy's retention
 * promises, at the clock's current time, and refreshes the exchange rates. An account that fails
 * doesn't stop the rest.
 *
 * An account is deleted on the date its email gave, the verification email's or the inactivity
 * warning's, at whatever time of that UTC day the sweep runs.
 */
export async function runDailySweep(ctx: SweepContext): Promise<SweepReport> {
  const now = ctx.clock.now();
  const unverified = await deleteUnverifiedAccounts(ctx, now);
  const inactive = await deleteWarnedAccounts(ctx, now);
  const warnings = await warnInactiveAccounts(ctx, now);
  return {
    unverifiedAccountsDeleted: unverified.done,
    inactiveAccountsDeleted: inactive.done,
    inactivityWarningsSent: warnings.done,
    ...(await purgeOldRows(ctx, now)),
    exchangeRatesFrom: await refreshExchangeRates(ctx),
    failures: unverified.failed + inactive.failed + warnings.failed,
  };
}

/**
 * Accounts still unverified on their deletion date, 7 days after sign-up, as the verification email
 * and banner give it (`unverifiedAccountDeletionDate`).
 */
function deleteUnverifiedAccounts(ctx: SweepContext, now: Date): Promise<Tally> {
  const signedUpBy = daysBefore(startOfNextUtcDay(now), UNVERIFIED_ACCOUNT_LIFETIME_DAYS);
  return deleteAccountsWhere(ctx, [eq(user.emailVerified, false), lt(user.createdAt, signedUpBy)], "an unverified account");
}

/** Accounts on the deletion date their inactivity warning gave, 30 days after it went. */
function deleteWarnedAccounts(ctx: SweepContext, now: Date): Promise<Tally> {
  const warnedBy = daysBefore(startOfNextUtcDay(now), INACTIVITY_WARNING_NOTICE_DAYS);
  return deleteAccountsWhere(ctx, [lt(user.inactivityWarningSentAt, warnedBy)], "an inactive account");
}

/**
 * Deletes each account that meets every `due` condition, oldest first, as the user's own deletion
 * does. Each is checked again just before, since deleting the ones before it takes a while: one
 * that has verified or become active meanwhile, such as by signing in, stays.
 */
async function deleteAccountsWhere(ctx: SweepContext, due: SQL[], logLabel: string): Promise<Tally> {
  const whereDue = and(...due, notTheDemoAccount(ctx));
  const accounts = await ctx.db.select({ id: user.id }).from(user).where(whereDue).orderBy(asc(user.createdAt));
  const tally = { done: 0, failed: 0 };
  for (const { id } of accounts) {
    try {
      const [stillDue] = await ctx.db.select({ id: user.id }).from(user).where(and(eq(user.id, id), whereDue));
      if (!stillDue) continue;
      await deleteAccountOf(ctx, id);
      tally.done += 1;
    } catch (error) {
      tally.failed += 1;
      logFailure(`delete ${logLabel}`, error);
    }
  }
  return tally;
}

/**
 * Warns each account whose 12 months without activity end within 30 days, and that hasn't been
 * warned since it was last active, that it's deleted in 30 days unless the user signs in. The
 * warning counts only once its email has gone.
 */
async function warnInactiveAccounts(ctx: SweepContext, now: Date): Promise<Tally> {
  const deletionDate = daysAfter(now, INACTIVITY_WARNING_NOTICE_DAYS);
  // Calendar months, counted back from the deletion date.
  const lastActiveBy = new Date(deletionDate);
  lastActiveBy.setUTCMonth(lastActiveBy.getUTCMonth() - INACTIVE_ACCOUNT_LIFETIME_MONTHS);
  const due = await ctx.db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(and(lte(user.lastActiveAt, lastActiveBy), isNull(user.inactivityWarningSentAt), notTheDemoAccount(ctx)))
    .orderBy(asc(user.lastActiveAt));
  // Better Auth's URL is its own path's: the sign-in page sits at the app's root.
  const signInLink = new URL(ROUTES.signIn, (await ctx.auth.$context).baseURL).toString();
  const content = inactivityWarningEmail({ deletionDate, signInLink });
  const tally = { done: 0, failed: 0 };
  for (const account of due) {
    let result: SendResult;
    try {
      result = await ctx.emailSender.send({ kind: "inactivity-warning", userId: account.id, to: account.email, ...content });
    } catch (error) {
      // Such as Gmail refusing this one address: the others may still go.
      tally.failed += 1;
      logFailure("warn an inactive account", error);
      continue;
    }
    // A cap stops every warning after it too: the rest wait for a later sweep, still unwarned.
    if (!result.sent) break;
    // Unless the user became active while the email was on its way, which leaves them unwarned.
    await ctx.db
      .update(user)
      .set({ inactivityWarningSentAt: now })
      .where(and(eq(user.id, account.id), lte(user.lastActiveAt, lastActiveBy)));
    tally.done += 1;
  }
  return tally;
}

/** Usage records and email-log rows older than 35 days, Qloo cache entries older than 30, and guest usage records 24 hours old. */
async function purgeOldRows(
  ctx: SweepContext,
  now: Date,
): Promise<Pick<SweepReport, "usageRecordsPurged" | "guestUsageRecordsPurged" | "emailLogRowsPurged" | "qlooCacheEntriesPurged">> {
  const usage = await ctx.db
    .delete(usageRecord)
    .where(lt(usageRecord.usedAt, daysBefore(now, USAGE_RECORD_LIFETIME_DAYS)))
    .returning({ id: usageRecord.id });
  const emails = await ctx.db
    .delete(emailLog)
    .where(lt(emailLog.sentAt, daysBefore(now, EMAIL_LOG_LIFETIME_DAYS)))
    .returning({ id: emailLog.id });
  const qloo = await ctx.db
    .delete(qlooCache)
    .where(lt(qlooCache.fetchedAt, daysBefore(now, QLOO_CACHE_LIFETIME_DAYS)))
    .returning({ key: qlooCache.requestKey });
  return {
    usageRecordsPurged: usage.length,
    guestUsageRecordsPurged: await purgeGuestUsageRecords(ctx.db, now),
    emailLogRowsPurged: emails.length,
    qlooCacheEntriesPurged: qloo.length,
  };
}

/** The Demo Account is never swept: the team manages it, and the judges share it. */
function notTheDemoAccount(ctx: SweepContext): SQL {
  return ne(user.email, ctx.auth.demoAccountEmail);
}

/** Logs what failed without saying whose account it was. */
function logFailure(action: string, error: unknown): void {
  console.error(`The daily sweep couldn't ${action}:`, error instanceof Error ? error.message : "unknown error");
}

function daysBefore(at: Date, days: number): Date {
  return new Date(at.getTime() - days * DAY_MS);
}

function daysAfter(at: Date, days: number): Date {
  return new Date(at.getTime() + days * DAY_MS);
}
