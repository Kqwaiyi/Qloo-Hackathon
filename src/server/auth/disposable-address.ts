import { APIError } from "better-auth/api";

import { COPY } from "@/config/copy";
import { DISPOSABLE_ADDRESS_DOMAINS } from "@/config/denylists";

/** Better Auth's error code when a sign-up or an email change gives a Disposable Address. */
export const DISPOSABLE_ADDRESS = "DISPOSABLE_ADDRESS";

const DOMAINS: ReadonlySet<string> = new Set(DISPOSABLE_ADDRESS_DOMAINS.map((domain) => domain.toLowerCase()));

/**
 * For the sign-up and email-change hooks: refuses an address sent to Better Auth that is a
 * Disposable Address, whether it came from our forms, a direct call or an `auth.api` call.
 */
export function refuseDisposableAddress(address: unknown): void {
  if (isDisposableAddress(address)) {
    throw new APIError("BAD_REQUEST", { code: DISPOSABLE_ADDRESS, message: COPY.disposableAddress });
  }
}

/**
 * Whether its domain, or any parent domain, is on the list, ignoring case. Something that isn't an
 * address isn't one; Better Auth refuses it as malformed on its own.
 */
function isDisposableAddress(address: unknown): boolean {
  if (typeof address !== "string" || !address.includes("@")) return false;
  const labels = address.slice(address.lastIndexOf("@") + 1).trim().toLowerCase().split(".");
  return labels.some((_, start) => DOMAINS.has(labels.slice(start).join(".")));
}
