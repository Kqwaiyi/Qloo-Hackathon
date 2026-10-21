import { getServices } from "@/server/app/services";
import { refreshPrices } from "@/server/operations/price-refresh";

// The price refresh, which a Consultation's page asks for in the background when one of its
// Products wasn't checked today (see PriceRefresh). It answers once every check has finished, so
// the page then refreshes in place to show what they found.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const result = await refreshPrices({ ...(await getServices()), requestHeaders: request.headers }, id);
  const headers = { "Cache-Control": "no-store" };
  if (!result.ok) return Response.json({ error: "No such Consultation" }, { status: 404, headers });
  return new Response(null, { status: 204, headers });
}
