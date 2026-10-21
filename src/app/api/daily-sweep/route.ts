import { getServices } from "@/server/app/services";
import { isFromVercelCron } from "@/server/http/cron";
import { runDailySweep } from "@/server/operations/daily-sweep";

// The daily sweep, which Vercel Cron calls once a day (vercel.json). Any other request is refused.
export async function GET(request: Request): Promise<Response> {
  if (!isFromVercelCron(request.headers)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const report = await runDailySweep(await getServices());
  console.log("Daily sweep:", JSON.stringify(report));
  // An account it couldn't delete or warn, or exchange rates no source gave, mark the run failed in
  // Vercel's logs. The next sweep tries them again.
  const failed = report.failures > 0 || report.exchangeRatesFrom === null;
  return Response.json(report, { status: failed ? 500 : 200, headers: { "Cache-Control": "no-store" } });
}
