import "server-only";

import { cookies, headers } from "next/headers";

import { getServices } from "@/server/app/services";
import type { OperationContext } from "@/server/operations/context";

/** A server operation's context for the request a server action is handling. */
export async function getOperationContext(): Promise<OperationContext> {
  const [services, requestHeaders, cookieStore] = await Promise.all([getServices(), headers(), cookies()]);
  return {
    ...services,
    requestHeaders: new Headers(requestHeaders),
    responseCookies: {
      set: (cookie) => cookieStore.set({ ...cookie, secure: cookie.secure ?? process.env.NODE_ENV === "production" }),
    },
  };
}

/** What reads need: the services and the request's headers. Pages can't set cookies. */
export async function getReadContext(): Promise<Pick<OperationContext, "auth" | "db" | "clock" | "blob" | "requestHeaders">> {
  const [services, requestHeaders] = await Promise.all([getServices(), headers()]);
  return { ...services, requestHeaders: new Headers(requestHeaders) };
}
