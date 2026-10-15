import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

import { getServices } from "@/server/app/services";
import { refreshSession } from "@/server/operations/session";

/**
 * Rolls the session forward on page loads, so a 30-day sign-in renews while the app is in use.
 * Pages can't set cookies themselves, so this is where the renewed cookie goes out.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next();
  if (request.method !== "GET" || !getSessionCookie(request)) return response;
  try {
    const { auth } = await getServices();
    await refreshSession({
      auth,
      requestHeaders: request.headers,
      responseCookies: { set: (cookie) => response.cookies.set(cookie) },
    });
  } catch (error) {
    console.error("Couldn't refresh the session", error);
  }
  return response;
}

export const config = {
  // Pages only: not Better Auth's routes, Next.js's own files, or anything with a file extension.
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
