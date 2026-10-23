import type { NextRequest } from "next/server";

import { NOTES_AFTER_PARAM } from "@/config/routes";
import { getStylingStatus } from "@/server/data/consultations";

// The Styling status poll: a page waiting on a Consultation's Styling asks about once a second,
// saying how many of the Stylist's Notes it has, so it's sent only those after them.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const status = await getStylingStatus(id, Number(request.nextUrl.searchParams.get(NOTES_AFTER_PARAM) ?? 0));
  if (!status) return Response.json({ error: "No such Consultation" }, { status: 404 });
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
