import "server-only";

import { cookies, headers } from "next/headers";

import { aiForBrowser, FAKE_AI_SCENARIO_COOKIE } from "@/server/ai/fake";
import { getServices } from "@/server/app/services";
import type { OperationContext } from "@/server/operations/context";

/** A server operation's context for the request a server action is handling. */
export async function getOperationContext(): Promise<OperationContext> {
  const [services, requestHeaders, cookieStore] = await Promise.all([getServices(), currentRequestHeaders(), cookies()]);
  return {
    ...services,
    ai: aiForBrowser(services.ai, cookieStore.get(FAKE_AI_SCENARIO_COOKIE)?.value),
    requestHeaders,
    responseCookies: {
      set: (cookie) => cookieStore.set({ ...cookie, secure: cookie.secure ?? process.env.NODE_ENV === "production" }),
    },
  };
}

/** What reads need: the services and the request's headers. Pages can't set cookies. */
export async function getReadContext(): Promise<Pick<OperationContext, "auth" | "db" | "clock" | "blob" | "requestHeaders">> {
  const [services, requestHeaders] = await Promise.all([getServices(), currentRequestHeaders()]);
  return { ...services, requestHeaders };
}

/**
 * The request's headers, carrying its cookies as they stand now. After a server action sets a
 * cookie, Next.js renders the page again in the same request: `cookies()` then holds the new
 * values, but `headers()` still holds what the browser sent. A password change, which replaces
 * the session, would otherwise render the page as signed out.
 */
async function currentRequestHeaders(): Promise<Headers> {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const current = new Headers(requestHeaders);
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) current.set("cookie", cookieHeader);
  else current.delete("cookie");
  return current;
}
