import { BASE_ERROR_CODES } from "better-auth";
import { APIError, getSessionFromCtx } from "better-auth/api";

import { DEMO_ACCOUNT_PROFILE } from "@/config/accounts";
import { COPY } from "@/config/copy";
import { AUTH_ENDPOINTS } from "@/config/routes";
import type { ProfileBody } from "@/server/accounts/profile";

import type { HookContext } from "./create-auth";

/** Better Auth's error code when the Demo Account asks for something the team manages. */
export const MANAGED_BY_THE_TEAM = "MANAGED_BY_THE_TEAM";

/**
 * The Better Auth endpoints the Demo Account may never use, since each could lock the other judges
 * out: changing its password or its email, deleting it, or signing out its other devices, all at
 * once or one by one. The team's scripts still can delete it.
 */
const MANAGED_ENDPOINTS = new Set<string>([
  AUTH_ENDPOINTS.changePassword,
  AUTH_ENDPOINTS.changeEmail,
  AUTH_ENDPOINTS.deleteUser,
  AUTH_ENDPOINTS.revokeSessions,
  AUTH_ENDPOINTS.revokeOtherSessions,
  AUTH_ENDPOINTS.revokeSession,
]);

/**
 * What the Demo Account may change through update-user, so judges can see how Outfits change. Any
 * other field sent, such as the username, must be what it already is. Its date of birth changes
 * through an operation of its own, which keeps it 18 or over.
 */
const EDITABLE_PROFILE_FIELDS: ReadonlySet<string> = new Set(["stylePreference", "countryCode"] satisfies (keyof ProfileBody)[]);

/**
 * For the `hooks.before` on every endpoint: refuses the Demo Account what the team manages, for our
 * forms, direct calls and `auth.api` calls alike. Only the team's script, a server call with no
 * request behind it, signs the Demo Account up: a sign-up with its address from anywhere else is
 * refused as taken, so nobody can claim the address before the script runs.
 */
export function demoAccountGuard(demoAccountEmail: string) {
  return async (ctx: HookContext): Promise<void> => {
    if (ctx.path === AUTH_ENDPOINTS.signUp) {
      if (ctx.headers && isDemoAccountEmail(ctx.body?.email, demoAccountEmail)) throw emailTaken();
      return;
    }
    if (!MANAGED_ENDPOINTS.has(ctx.path) && ctx.path !== AUTH_ENDPOINTS.updateUser) return;
    const session = await getSessionFromCtx(ctx);
    if (session?.user.email !== demoAccountEmail) return;
    if (ctx.path === AUTH_ENDPOINTS.updateUser && !changesManagedField(ctx.body, session.user)) return;
    throw new APIError("FORBIDDEN", { code: MANAGED_BY_THE_TEAM, message: COPY.managedByTheTeam });
  };
}

/**
 * Whether the request signs in to the Demo Account, by its email or its username, compared as Better
 * Auth compares them: ignoring case.
 */
export function signsInToDemoAccount(ctx: HookContext, demoAccountEmail: string): boolean {
  if (ctx.path === AUTH_ENDPOINTS.signInEmail) return isDemoAccountEmail(ctx.body?.email, demoAccountEmail);
  if (ctx.path !== AUTH_ENDPOINTS.signInUsername) return false;
  const username: unknown = ctx.body?.username;
  return typeof username === "string" && username.toLowerCase() === DEMO_ACCOUNT_PROFILE.username;
}

/** Whether an address sent to Better Auth is the Demo Account's, ignoring case as Better Auth does. */
export function isDemoAccountEmail(email: unknown, demoAccountEmail: string): boolean {
  return typeof email === "string" && email.toLowerCase() === demoAccountEmail;
}

/** Whether an update-user body would change a field outside the Demo Account's editable ones. */
function changesManagedField(body: unknown, current: Record<string, unknown>): boolean {
  if (typeof body !== "object" || body === null) return false;
  return Object.entries(body).some(([field, value]) => !EDITABLE_PROFILE_FIELDS.has(field) && value !== current[field]);
}

/** Better Auth's own answer to a sign-up with an address an account already uses. */
export function emailTaken(): APIError {
  return APIError.from("UNPROCESSABLE_ENTITY", BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL);
}
