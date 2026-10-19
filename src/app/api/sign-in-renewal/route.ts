import { NextResponse } from "next/server";

import { getServices } from "@/server/app/services";
import { refreshSession } from "@/server/operations/session";

// The sign-in renewal, which RenewSignIn asks for in the background. It answers the same whether it
// renewed, found nothing due, or found no sign-in; the page ignores the answer.
export async function POST(request: Request): Promise<Response> {
  const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  try {
    const { auth } = await getServices();
    await refreshSession({
      auth,
      requestHeaders: request.headers,
      responseCookies: { set: (cookie) => response.cookies.set(cookie) },
    });
  } catch (error) {
    console.error("Couldn't refresh the session", error);
    return new NextResponse(null, { status: 500 });
  }
  return response;
}
