import { verifyJWT } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import * as z from "zod";

import type { EmailChangeStep } from "@/config/accounts";
import { EMAIL_CHANGE_LANDINGS } from "@/config/routes";
import { findPendingEmailChange } from "@/server/accounts/email-change";
import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/database";
import { user } from "@/server/db/schema";
import type { EmailSender } from "@/server/email/send-email";

import { emailRefusalCode } from "./emails";
import type { GmailInboxCheck } from "./gmail-inbox";

/**
 * The step each of Better Auth's email-change links takes, by the request type its token names.
 * Its links are signed tokens holding the change itself (the current address, the new one, both
 * lowercased, and the step), not rows we could cancel. That holds for better-auth 1.7, as the
 * email-change tests check.
 */
const LINK_STEPS: Record<string, EmailChangeStep> = {
  "change-email-confirmation": "approval",
  "change-email-verification": "verification",
};

const changeTokenSchema = z.object({ email: z.string(), updateTo: z.string(), requestType: z.string().optional() });

/** Better Auth's code for a link that doesn't work, which the landing page shows as such. */
const INVALID_LINK = "INVALID_TOKEN";

/**
 * For the `hooks.before` on `/verify-email`: where to send a verified user's email-change link
 * instead of letting it work, or null to let Better Auth go on. A link works only for the user's
 * newest change while its new address is still free, so an older link, or one for an address
 * someone has taken since, changes nothing. So does one for an address whose Gmail inbox another
 * account has reached since (`reachesGmailInboxInUse`). An approval link also stops while the new
 * address's link would be refused, since Better Auth would ignore the refusal and say it was sent.
 * Ordinary verification links, and broken or expired ones, are Better Auth's to answer.
 */
export function emailChangeLinkCheck({
  db,
  clock,
  emailSender,
  secret,
  reachesGmailInboxInUse,
}: {
  db: Database;
  clock: Clock;
  emailSender: EmailSender;
  secret: string;
  reachesGmailInboxInUse: GmailInboxCheck;
}) {
  return async (token: unknown): Promise<string | null> => {
    if (typeof token !== "string") return null;
    const change = changeTokenSchema.safeParse(await verifyJWT(token, secret));
    if (!change.success) return null;
    const { email, updateTo, requestType } = change.data;
    const step = requestType === undefined ? undefined : LINK_STEPS[requestType];
    // Better Auth's links without a step are never sent: they would change the email unverified.
    if (!step) return `${EMAIL_CHANGE_LANDINGS.verification}&error=${INVALID_LINK}`;
    const refused = (code: string) => `${EMAIL_CHANGE_LANDINGS[step]}&error=${code}`;

    const changing = await accountIdWithEmail(db, email);
    // Better Auth refuses a link for an address no account has any more.
    if (!changing) return null;
    const pending = await findPendingEmailChange(db, changing, clock.now());
    const taken = (await accountIdWithEmail(db, updateTo)) || (await reachesGmailInboxInUse(updateTo, changing));
    if (pending?.newEmail !== updateTo || taken) return refused(INVALID_LINK);

    if (step === "approval") {
      const refusal = await emailSender.refusalFor("email-change-verification", changing);
      if (refusal) return refused(emailRefusalCode(refusal));
    }
    return null;
  };
}

/** The account using this address, as Better Auth keeps it (lowercased), if any. */
async function accountIdWithEmail(db: Database, email: string): Promise<string | null> {
  const [account] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return account?.id ?? null;
}
