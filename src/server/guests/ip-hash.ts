import { getIP } from "better-auth/api";
import { createHmac } from "node:crypto";

import type { OperationContext } from "@/server/operations/context";

// The IP hash: how the Guest Page's daily limit knows an internet address without keeping it. Only
// the hash is stored, never the address, and a hash can't be turned back into one without the salt.

/** The salt local development hashes under without GUEST_IP_SALT. It's in this file, so never for a deployment. */
const DEVELOPMENT_GUEST_IP_SALT = "local-development-guest-ip-salt-not-for-deployed-environments";

/**
 * GUEST_IP_SALT, the secret salt every IP hash is made under. Without it, local development uses a
 * fixed development salt, and a deployment has none, which keeps the Guest Page closed: a hash made
 * under a salt anyone can read here is as good as the address itself.
 */
export function guestIpSaltFromEnvironment(): string | null {
  const salt = process.env.GUEST_IP_SALT;
  if (salt) return salt;
  return process.env.VERCEL ? null : DEVELOPMENT_GUEST_IP_SALT;
}

/**
 * The IP hash of the request's internet address: HMAC-SHA-256 under the salt. The address is read
 * as Better Auth reads it for its rate limits, from x-forwarded-for, an IPv6 address standing for
 * its /64 network, which one connection's devices share. Requests whose address can't be read all
 * share one hash, so they share one limit.
 */
export async function guestIpHashOf(ctx: Pick<OperationContext, "auth" | "requestHeaders">, salt: string): Promise<string> {
  const ip = getIP(ctx.requestHeaders, (await ctx.auth.$context).options) ?? "unknown";
  return createHmac("sha256", salt).update(`guest-ip:${ip}`).digest("base64url");
}
