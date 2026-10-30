import { NextResponse } from "next/server";

import { getServices } from "@/server/app/services";
import { secureInProduction } from "@/server/http/cookies";
import { clearDeletedGuestCookie } from "@/server/operations/guest-consultations";

// Clearing a guest cookie whose Guest Consultation has been deleted, which the Guest Page asks for
// in the background once it has said so. It answers the same whether it cleared one or not; the
// page ignores the answer.
export async function DELETE(request: Request): Promise<Response> {
  const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  try {
    await clearDeletedGuestCookie({
      ...(await getServices()),
      requestHeaders: request.headers,
      responseCookies: { set: (cookie) => response.cookies.set(secureInProduction(cookie)) },
    });
  } catch (error) {
    console.error("Couldn't clear a deleted Guest Consultation's guest cookie:", error instanceof Error ? error.message : "unknown error");
    return new NextResponse(null, { status: 500 });
  }
  return response;
}
