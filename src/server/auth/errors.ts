import type { APIError } from "better-auth/api";

/**
 * The error code on a Better Auth refusal, upper-cased. Better Auth's codes differ in case between
 * its docs and its code, so always compare through this.
 */
export function authErrorCode(error: APIError): string | undefined {
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code.toUpperCase() : undefined;
}
