import { getServices } from "@/server/app/services";

// Better Auth's catch-all. Our forms go through server actions; this serves the username check as
// the user types, and everything Better Auth does over HTTP.
async function handler(request: Request): Promise<Response> {
  const { auth } = await getServices();
  return auth.handler(request);
}

export { handler as GET, handler as POST };
