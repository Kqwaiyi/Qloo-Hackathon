import { and, ne, type SQL, sql } from "drizzle-orm";

import type { Database } from "@/server/db/database";
import { user } from "@/server/db/schema";

import { isDemoAccountEmail } from "./demo-account";

/**
 * Whether an address sent to Better Auth reaches the same Gmail inbox as an existing account's,
 * other than the account changing its own email.
 */
export type GmailInboxCheck = (address: unknown, ownAccountId?: string) => Promise<boolean>;

/**
 * The Gmail inbox an address reaches, worked out by Postgres, or null for an address at any other
 * provider. Gmail ignores case, dots in the part before the @ and everything there from its first
 * +, and googlemail.com is gmail.com.
 */
function gmailInbox(address: SQL): SQL {
  return sql`case when lower(substring(${address} from '[^@]*$')) in ('gmail.com', 'googlemail.com')
    then replace(split_part(lower(substring(${address} from '^(.*)@')), '+', 1), '.', '') end`;
}

/**
 * For the sign-up and email-change hooks, and the email-change links: one Gmail inbox, one account.
 * The stored addresses are reduced in the query itself. The Demo Account's address, at the team's
 * own inbox, is left out on both sides: it neither stops nor is stopped by the team's address or
 * its aliases.
 */
export function gmailInboxCheck({ db, demoAccountEmail }: { db: Database; demoAccountEmail: string }): GmailInboxCheck {
  return async (address, ownAccountId) => {
    if (typeof address !== "string" || isDemoAccountEmail(address, demoAccountEmail)) return false;
    const [match] = await db
      .select({ id: user.id })
      .from(user)
      .where(
        and(
          sql`${gmailInbox(sql`${user.email}`)} = ${gmailInbox(sql`${address}::text`)}`,
          ne(user.email, demoAccountEmail),
          ownAccountId === undefined ? undefined : ne(user.id, ownAccountId),
        ),
      )
      .limit(1);
    return match !== undefined;
  };
}
