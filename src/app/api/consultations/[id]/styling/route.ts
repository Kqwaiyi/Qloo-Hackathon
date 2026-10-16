import { getStylingStatus } from "@/server/data/consultations";

// The Styling status poll: a page waiting on a Consultation's Styling asks about once a second.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const status = await getStylingStatus(id);
  if (!status) return Response.json({ error: "No such Consultation" }, { status: 404 });
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
