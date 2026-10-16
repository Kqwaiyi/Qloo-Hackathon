import { and, count, eq, gt, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import {
  ALL_EMAILS_CAP,
  EMAIL_CAP_WINDOW_HOURS,
  EMAIL_FROM_NAME,
  type EmailKind,
  INACTIVITY_WARNINGS_CAP,
  PER_ACCOUNT_EMAIL_CAPS,
  SIGN_UP_EMAILS_CAP,
} from "@/config/email";
import type { Clock } from "@/server/clock";
import type { Database, Transaction } from "@/server/db/database";
import { emailLog } from "@/server/db/schema";

/** A plain-text email as it leaves for the transport. */
export interface EmailMessage {
  /** The sender's display name. The transport supplies the address. */
  fromName: string;
  to: string;
  subject: string;
  text: string;
}

/**
 * What actually delivers email: Gmail over SMTP in production, a capturing inbox in local
 * development and tests. Moving to an HTTP email provider later only means a new transport.
 */
export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

/** An email the app wants to send. */
export interface Email {
  kind: EmailKind;
  /** The account it's for, if any. */
  userId: string | null;
  to: string;
  subject: string;
  text: string;
}

/** Why an email can't go out now, one per cap. */
export type EmailRefusal =
  /** Every send has stopped for now: the app-wide cap. */
  | "emails-paused"
  /** New sign-ups have stopped for now. */
  | "sign-ups-paused"
  /** This account has had as many of this kind as it may in 24 hours. */
  | "account-limit"
  /** Today's inactivity warnings have all gone out. */
  | "warnings-paused";

export type SendResult = { sent: true } | { sent: false; refusal: EmailRefusal };

export interface EmailSender {
  /**
   * Sends the email unless a cap stops it, and logs it (kind, account and time, never the address).
   * Every cap is enforced here, so nothing that sends email can get around them. Throws, without the
   * address, if the transport fails; a failed email doesn't count.
   */
  send(email: Email): Promise<SendResult>;
  /** Why an email of this kind for this account would be refused now, or null if it would go. */
  refusalFor(kind: EmailKind, userId: string | null): Promise<EmailRefusal | null>;
}

// Serialises the cap check and the log entry, so emails sent side by side can't all pass the same
// check. The number only has to be unique among the app's advisory locks.
const EMAIL_LOG_LOCK = 1_801_200_018;

export function createEmailSender({ db, clock, transport }: { db: Database; clock: Clock; transport: EmailTransport }): EmailSender {
  return {
    async send(email) {
      const id = randomUUID();
      // The email is logged before it goes, holding its place under the caps, and unlogged if it fails.
      const refusal = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${EMAIL_LOG_LOCK})`);
        const now = clock.now();
        const found = await capRefusal(tx, email.kind, email.userId, now);
        if (found) return found;
        await tx.insert(emailLog).values({ id, kind: email.kind, userId: email.userId, sentAt: now });
        return null;
      });
      if (refusal) return { sent: false, refusal };

      try {
        await transport.send({ fromName: EMAIL_FROM_NAME, to: email.to, subject: email.subject, text: email.text });
      } catch (error) {
        await db.delete(emailLog).where(eq(emailLog.id, id));
        // Only the transport's error code: its message can carry the address.
        const code = (error as { code?: unknown } | null)?.code;
        throw new Error(`The ${email.kind} email couldn't be sent.${typeof code === "string" ? ` (${code})` : ""}`);
      }
      return { sent: true };
    },

    refusalFor(kind, userId) {
      return capRefusal(db, kind, userId, clock.now());
    },
  };
}

async function capRefusal(db: Database | Transaction, kind: EmailKind, userId: string | null, now: Date): Promise<EmailRefusal | null> {
  const windowStart = new Date(now.getTime() - EMAIL_CAP_WINDOW_HOURS * 60 * 60 * 1000);
  const inWindow = and(gt(emailLog.sentAt, windowStart), lte(emailLog.sentAt, now));

  const [all] = await db.select({ sent: count() }).from(emailLog).where(inWindow);
  const sentInWindow = all?.sent ?? 0;
  if (sentInWindow >= ALL_EMAILS_CAP) return "emails-paused";
  if (kind === "verification" && sentInWindow >= SIGN_UP_EMAILS_CAP) return "sign-ups-paused";

  if (kind === "inactivity-warning") {
    const [warnings] = await db.select({ sent: count() }).from(emailLog).where(and(inWindow, eq(emailLog.kind, kind)));
    if ((warnings?.sent ?? 0) >= INACTIVITY_WARNINGS_CAP) return "warnings-paused";
  }

  const accountCap = PER_ACCOUNT_EMAIL_CAPS[kind];
  if (accountCap !== undefined && userId) {
    const [account] = await db
      .select({ sent: count() })
      .from(emailLog)
      .where(and(inWindow, eq(emailLog.kind, kind), eq(emailLog.userId, userId)));
    if ((account?.sent ?? 0) >= accountCap) return "account-limit";
  }
  return null;
}
